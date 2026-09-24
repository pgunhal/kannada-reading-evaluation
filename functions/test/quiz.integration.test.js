const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const admin = require("firebase-admin");
const {Timestamp} = require("firebase-admin/firestore");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
} = require("firebase/firestore");
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let env;
let db;
let api;
let app;
const projectId = "demo-kkali-quiz-tests";
const context = {
  auth: {
    uid: "student-uid",
    token: {
      role: "student",
      studentId: "s1",
      centerId: "c1",
      classId: "class1",
    },
  },
};
before(async () => {
  if (!enabled) return;
  env = await initializeTestEnvironment({
    projectId,
    firestore: {rules: fs.readFileSync("../firestore.rules", "utf8")},
  });
  await env.clearFirestore();
  app = admin.initializeApp({projectId}, "quiz-test");
  db = app.firestore();
  api = require("../quiz")(db);
});
after(async () => {
  if (env) await env.cleanup();
  if (app) await app.delete();
});
const finishReading = async (attemptId) => {
  const ref = db.doc(`attempts/${attemptId}`);
  await api.readingHeartbeat.run(
      {attemptId, sessionId: "focused-session", sequence: 0, activeMs: 0},
      context,
  );
  for (let sequence = 1; sequence <= 7; sequence++) {
    await ref.update({
      lastReadingPing: Timestamp.fromMillis(Date.now() - 3000),
    });
    await api.readingHeartbeat.run(
        {attemptId, sessionId: "focused-session", sequence, activeMs: 3000},
        context,
    );
  }
};
test(
    "active reading, secure assignment, three retries and instructor access",
    {skip: !enabled},
    async () => {
      await db.doc("stories/story1").set({
        title: "Story",
        body: "ಕನ್ನಡ ಕಥೆ",
        status: "published",
        centerIds: ["c1"],
        classIds: [],
        week: 1,
      });
      await db
          .doc("classes/class1")
          .set({centerId: "c1", teacherUids: ["teacher"]});
      for (let i = 0; i < 12; i++) {
        await db.doc(`questions/q${i}`).set({
          storyId: "story1",
          type: i % 4 === 0 ? "cloze" : "mcq",
          difficulty: ["easy", "medium", "hard"][i % 3],
          prompt: `Question ${i}`,
          options: ["a", "b", "c", "d"],
          correctAnswer: "a",
        });
      }
      await assert.rejects(api.startReading.run({storyId: "story1"}, {}), {
        code: "unauthenticated",
      });
      const starts = await Promise.all([
        api.startReading.run({storyId: "story1"}, context),
        api.startReading.run({storyId: "story1"}, context),
      ]);
      let attempt = starts[0];
      assert.equal(starts[1].attemptId, attempt.attemptId);
      const ref = db.doc(`attempts/${attempt.attemptId}`);
      await ref.update({
        readingStartedAt: Timestamp.fromMillis(Date.now() - 100000),
      });
      await assert.rejects(
          api.assignQuiz.run({attemptId: attempt.attemptId}, context),
          {code: "failed-precondition"},
      );
      const heartbeat = {
        attemptId: attempt.attemptId,
        sessionId: "tab1",
        sequence: 0,
        activeMs: 0,
      };
      await api.readingHeartbeat.run(heartbeat, context);
      await ref.update({
        lastReadingPing: Timestamp.fromMillis(Date.now() - 60000),
      });
      await api.readingHeartbeat.run(
          {...heartbeat, sequence: 1, activeMs: 2000},
          context,
      );
      assert.equal((await ref.get()).data().readingActiveMs, 2000);
      await api.readingHeartbeat.run(
          {...heartbeat, sequence: 1, activeMs: 2000},
          context,
      );
      assert.equal((await ref.get()).data().readingActiveMs, 2000);
      await assert.rejects(
          api.readingHeartbeat.run(
              {...heartbeat, sequence: 2, activeMs: 60000},
              context,
          ),
          {code: "invalid-argument"},
      );
      await api.readingHeartbeat.run(
          {...heartbeat, sessionId: "tab2"},
          context,
      );
      await assert.rejects(
          api.readingHeartbeat.run(
              {...heartbeat, sequence: 2, activeMs: 2000},
              context,
          ),
          {code: "failed-precondition"},
      );
      const learner = env
          .authenticatedContext("student-uid", context.auth.token)
          .firestore();
      await assertSucceeds(
          getDoc(doc(learner, `attempts/${attempt.attemptId}`)),
      );
      await assertFails(getDocs(collection(learner, "questions")));
      await assertFails(
          getDoc(doc(learner, `attemptKeys/${attempt.attemptId}`)),
      );
      await assertFails(
          setDoc(doc(learner, "attempts/fake"), {studentId: "s1", score: 1}),
      );
      for (const changes of [
        {score: 1},
        {passed: true},
        {readingActiveMs: 999999},
        {attemptNumber: 1},
        {answers: []},
      ]) {
        await assertFails(
            updateDoc(doc(learner, `attempts/${attempt.attemptId}`), changes),
        );
      }
      await assertFails(
          setDoc(doc(learner, "assessmentProgress/fake"), {attemptNumber: 0}),
      );
      const stranger = env
          .authenticatedContext("other", {
            ...context.auth.token,
            studentId: "s2",
          })
          .firestore();
      await assertFails(
          getDoc(doc(stranger, `attempts/${attempt.attemptId}`)),
      );
      const used = new Set();
      for (let number = 1; number <= 3; number++) {
        assert.equal(attempt.attemptNumber, number);
        await finishReading(attempt.attemptId);
        const quiz = await api.assignQuiz.run(
            {attemptId: attempt.attemptId},
            context,
        );
        assert.equal(quiz.questions.length, 4);
        assert.equal(JSON.stringify(quiz).includes("correctAnswer"), false);
        assert.deepEqual(
            (await api.assignQuiz.run({attemptId: attempt.attemptId}, context))
                .questions,
            quiz.questions,
        );
        quiz.questions.forEach((q) => {
          assert.equal(used.has(q.id), false);
          used.add(q.id);
          assert.equal(q.options.length, 4);
        });
        await assert.rejects(
            api.submitAttempt.run(
                {attemptId: attempt.attemptId, answers: []},
                context,
            ),
            {code: "invalid-argument"},
        );
        const grade = await api.submitAttempt.run(
            {
              attemptId: attempt.attemptId,
              score: 1,
              answers: quiz.questions.map((q) => ({
                questionId: q.id,
                response: "b",
                correct: true,
              })),
            },
            context,
        );
        assert.equal(grade.score, 0);
        assert.equal(grade.canRetry, number < 3);
        assert.deepEqual(
            await api.submitAttempt.run(
                {attemptId: attempt.attemptId, answers: []},
                context,
            ),
            grade,
        );
        const retry = {
          storyId: "story1",
          retryFromAttemptId: attempt.attemptId,
        };
        if (number < 3) {
          const retries = await Promise.all([
            api.startReading.run(retry, context),
            api.startReading.run(retry, context),
          ]);
          assert.equal(retries[0].attemptId, retries[1].attemptId);
          attempt = retries[0];
        } else {
          await assert.rejects(api.startReading.run(retry, context), {
            code: "failed-precondition",
          });
        }
      }
      assert.equal(used.size, 12);
      const stories = await api.listStudentStories.run({}, context);
      assert.equal(stories[0].attemptNumber, 3);
      await assert.rejects(api.listCmsStories.run({}, context), {
        code: "permission-denied",
      });
      await db
          .doc("staffUsers/teacher")
          .set({role: "volunteer", centerIds: ["c1"]});
      const teacher = {
        auth: {uid: "teacher", token: {role: "volunteer", centerIds: ["c1"]}},
      };
      const studio = await api.listCmsStories.run({}, teacher);
      assert.equal(studio[0].questions.length, 12);
      assert.equal(studio[0].questions[0].correctAnswer, "a");
      await assert.rejects(
          api.saveCmsStory.run(
              {
                storyId: "story1",
                title: "Changed",
                body: "New passage",
                status: "draft",
              },
              context,
          ),
          {code: "permission-denied"},
      );
      await api.saveCmsStory.run(
          {
            storyId: "story1",
            title: "Changed",
            body: "New passage",
            status: "draft",
          },
          teacher,
      );
      assert.equal((await api.listStudentStories.run({}, context)).length, 0);
      assert.equal((await ref.get()).data().story.title, "Story");
    },
);
test(
    "small banks permit reuse; passing prevents another attempt",
    {skip: !enabled},
    async () => {
      await db.doc("stories/small").set({
        title: "Small",
        body: "ಕನ್ನಡ ಕಥೆ",
        status: "published",
        centerIds: ["c1"],
        classIds: [],
      });
      for (let i = 0; i < 4; i++) {
        await db.doc(`questions/small${i}`).set({
          storyId: "small",
          type: "mcq",
          difficulty: ["easy", "medium", "hard", "easy"][i],
          prompt: `Small ${i}`,
          options: ["a", "b", "c", "d"],
          correctAnswer: "a",
        });
      }
      let a = await api.startReading.run({storyId: "small"}, context);
      await finishReading(a.attemptId);
      let quiz = await api.assignQuiz.run({attemptId: a.attemptId}, context);
      await api.submitAttempt.run(
          {
            attemptId: a.attemptId,
            answers: quiz.questions.map((q) => ({
              questionId: q.id,
              response: "b",
            })),
          },
          context,
      );
      const firstIds = quiz.questions.map((q) => q.id).sort();
      a = await api.startReading.run(
          {storyId: "small", retryFromAttemptId: a.attemptId},
          context,
      );
      await finishReading(a.attemptId);
      quiz = await api.assignQuiz.run({attemptId: a.attemptId}, context);
      assert.deepEqual(quiz.questions.map((q) => q.id).sort(), firstIds);
      const result = await api.submitAttempt.run(
          {
            attemptId: a.attemptId,
            answers: quiz.questions.map((q) => ({
              questionId: q.id,
              response: "a",
            })),
          },
          context,
      );
      assert.equal(result.passed, true);
      assert.equal(result.canRetry, false);
      await assert.rejects(
          api.startReading.run(
              {storyId: "small", retryFromAttemptId: a.attemptId},
              context,
          ),
          {code: "failed-precondition"},
      );
    },
);
test(
    "teachers create drafts and safely author a question bank",
    {skip: !enabled},
    async () => {
      const teacher = {
        auth: {uid: "teacher", token: {role: "volunteer", centerIds: ["c1"]}},
      };
      await assert.rejects(api.createCmsStory.run({}, context), {
        code: "permission-denied",
      });
      const {storyId} = await api.createCmsStory.run({}, teacher);
      assert.equal(
          (await db.doc(`stories/${storyId}`).get()).data().status,
          "draft",
      );
      let questions = Array.from({length: 4}, (_, i) => ({
        id: i === 0 ? "q0" : `new${i}`,
        type: "mcq",
        difficulty: ["easy", "medium", "hard", "easy"][i],
        prompt: `Authored ${i}`,
        options: ["a", "b", "c", "d"],
        correctAnswer: "b",
      }));
      const payload = {
        storyId,
        title: "ಹೊಸ ಕಥೆ",
        body: "ಕನ್ನಡ ಕಥೆ",
        status: "published",
        questions,
      };
      await api.saveCmsStory.run(payload, teacher);
      assert.equal(
          (await db.doc("questions/q0").get()).data().correctAnswer,
          "a",
      );
      let bank = await db
          .collection("questions")
          .where("storyId", "==", storyId)
          .get();
      assert.equal(bank.size, 4);
      questions = bank.docs.map((d) => ({...d.data(), id: d.id}));
      const retainedId = questions[0].id;
      questions[0].prompt = "Edited question";
      await api.saveCmsStory.run({...payload, questions}, teacher);
      assert.equal(
          (await db.doc(`questions/${retainedId}`).get()).data().prompt,
          "Edited question",
      );
      await assert.rejects(
          api.saveCmsStory.run(
              {...payload, questions: questions.slice(0, 3)},
              teacher,
          ),
          {code: "failed-precondition"},
      );
      await api.saveCmsStory.run(
          {...payload, status: "draft", questions: questions.slice(0, 3)},
          teacher,
      );
      bank = await db
          .collection("questions")
          .where("storyId", "==", storyId)
          .get();
      assert.equal(bank.size, 3);
      assert.equal(
          (await api.listStudentStories.run({}, context)).some(
              (s) => s.id === storyId,
          ),
          false,
      );
    },
);

test("gradebook shows missing work, best scores and scoped history",
    {skip: !enabled}, async () => {
      await db.doc("staffUsers/grade-teacher").set({
        role: "volunteer", centerIds: ["grade-center"],
      });
      await db.doc("classes/grade-class").set({
        name: "Grade 3", centerId: "grade-center",
        teacherUids: ["grade-teacher"],
      });
      await db.doc("classes/other-grade").set({
        centerId: "grade-center", teacherUids: ["other-teacher"],
      });
      for (const [sid, classId] of [
        ["grade-reader", "grade-class"], ["grade-missing", "grade-class"],
        ["grade-private", "other-grade"],
      ]) {
        await db.doc(`students/${sid}`).set({
          displayName: sid, classId, centerId: "grade-center",
          pinHash: "secret",
        });
      }
      await db.doc("stories/grade-story").set({
        title: "Grade story", status: "published",
        centerIds: ["grade-center"], classIds: ["grade-class"],
      });
      await db.doc("stories/grade-draft").set({
        title: "Draft", status: "draft", centerIds: ["grade-center"],
      });
      for (const [number, score] of [[1, .25], [2, .75], [3, .5]]) {
        await db.doc(`attempts/grade-${number}`).set({
          studentId: "grade-reader", classId: "grade-class",
          centerId: "grade-center", storyId: "grade-story",
          story: {title: "Original title"}, score, passed: score >= .7,
          attemptNumber: number, status: "graded",
          submittedAt: Timestamp.now(), readingStartedAt: Timestamp.now(),
        });
      }
      await db.doc("attempts/grade-in-progress").set({
        studentId: "grade-missing", classId: "grade-class",
        centerId: "grade-center", storyId: "grade-story", status: "reading",
      });
      const teacherContext = {auth: {uid: "grade-teacher", token: {}}};
      const book = await api.getGradebook.run({}, teacherContext);
      assert.equal(book.students.length, 2);
      assert.equal(book.stories.length, 1);
      const reader = book.students.find((s) => s.id === "grade-reader");
      assert.equal(reader.results[0].highestScore, .75);
      assert.equal(reader.missingCount, 0);
      assert.equal(reader.history.length, 3);
      assert.equal(reader.history[0].title, "Original title");
      const missing = book.students.find((s) => s.id === "grade-missing");
      assert.equal(missing.missingCount, 1);
      assert.equal(missing.results[0].status, "in_progress");
      await db.doc("students/grade-never-started").set({
        name: "No attempts", classId: "grade-class", centerId: "grade-center",
      });
      const next = await api.getGradebook.run({}, teacherContext);
      const absent = next.students.find((s) => s.id === "grade-never-started");
      assert.equal(absent.missingCount, 1);
      assert.equal(absent.history.length, 0);
      assert.ok(!JSON.stringify(next).includes("pinHash"));
      await assert.rejects(api.getGradebook.run({}, context),
          {code: "permission-denied"});
      await assert.rejects(api.getGradebook.run({}, {}),
          {code: "unauthenticated"});
      await db.doc("classes/grade-class").update({teacherUids: []});
      assert.equal((await api.getGradebook.run({}, teacherContext))
          .students.length, 0);
    });

test("direct staff reads enforce classes; authoring uses functions",
    {skip: !enabled}, async () => {
      await db.doc("staffUsers/rule-teacher").set({
        role: "volunteer", centerIds: ["rule-center"],
      });
      await db.doc("classes/rule-class").set({
        centerId: "rule-center", teacherUids: ["rule-teacher"],
      });
      const membership = {classId: "rule-class", centerId: "rule-center"};
      await db.doc("students/rule-student").set(membership);
      await db.doc("attempts/rule-attempt").set(membership);
      await db.doc("stories/rule-story").set({
        title: "Story", centerIds: ["rule-center"], status: "published",
      });
      const sdk = env.authenticatedContext("rule-teacher", {
        role: "volunteer", centerIds: ["rule-center"],
      }).firestore();
      await assertSucceeds(getDoc(doc(sdk, "students/rule-student")));
      await assertSucceeds(getDoc(doc(sdk, "attempts/rule-attempt")));
      await assertFails(updateDoc(doc(sdk, "stories/rule-story"),
          {title: "X"}));
      await assertFails(setDoc(doc(sdk, "questions/rule-question"), {
        storyId: "rule-story", correctAnswer: "X",
      }));
      await db.doc("classes/rule-class").update({teacherUids: []});
      await assertFails(getDoc(doc(sdk, "students/rule-student")));
      await assertFails(getDoc(doc(sdk, "attempts/rule-attempt")));
    });
