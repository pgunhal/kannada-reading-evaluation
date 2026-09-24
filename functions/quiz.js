const functions = require("firebase-functions");
const {Timestamp} = require("firebase-admin/firestore");
const {createHash} = require("node:crypto");
const {
  assignQuestions,
  publicQuestion,
  gradeAnswers,
  summarize,
  validateQuestion,
} = require("./quizCore");
const HttpsError = functions.https.HttpsError;

module.exports = (db) => {
  const fail = (code, message) => {
    throw new HttpsError(code, message);
  };
  const id = (value) => {
    if (
      typeof value !== "string" ||
      !value ||
      value.length > 200 ||
      value.includes("/")
    ) {
      fail("invalid-argument", "A valid document ID is required.");
    }
    return value;
  };
  const student = (context) => {
    if (!context.auth) fail("unauthenticated", "Please sign in.");
    const claims = context.auth.token;
    if (
      claims.role !== "student" ||
      !claims.studentId ||
      !claims.classId ||
      !claims.centerId
    ) {
      fail(
          "permission-denied",
          "A student account with class membership is required.",
      );
    }
    return claims;
  };
  const owner = (attempt, context) => {
    const claims = student(context);
    if (
      attempt.studentId !== claims.studentId ||
      attempt.authUid !== context.auth.uid
    ) {
      fail("permission-denied", "This attempt belongs to another student.");
    }
  };
  const staff = async (context, attempt) => {
    if (!context.auth) fail("unauthenticated", "Please sign in.");
    const snapshot = await db.doc(`staffUsers/${context.auth.uid}`).get();
    const user = snapshot.data();
    if (
      !user ||
      !["admin", "coordinator", "volunteer"].includes(user.role)
    ) {
      fail("permission-denied", "Staff access required.");
    }
    if (user.role === "admin") return;
    if (!(user.centerIds || []).includes(attempt.centerId)) {
      fail("permission-denied", "This center is outside your access.");
    }
    if (user.role === "volunteer") {
      const classroom = await db.doc(`classes/${attempt.classId}`).get();
      if (
        !classroom.exists ||
        !(classroom.data().teacherUids || []).includes(context.auth.uid)
      ) {
        fail("permission-denied", "You are not assigned to this class.");
      }
    }
  };
  const refFor = (data) => db.doc(`attempts/${id(data.attemptId)}`);
  const privateFor = (ref) => db.doc(`attemptKeys/${ref.id}`);
  const getAttempt = async (tx, ref) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) fail("not-found", "Attempt not found.");
    return snapshot.data();
  };
  const progressId = (studentId, storyId) =>
    createHash("sha256")
        .update(JSON.stringify([studentId, storyId]))
        .digest("hex");
  const result = (a) => ({
    attemptNumber: a.attemptNumber || 1,
    maxAttempts: 3,
    canRetry:
      a.passed === false && !a.needsReview && (a.attemptNumber || 1) < 3,
    score: a.score,
    passed: a.passed,
    needsReview: a.needsReview,
  });
  const view = (ref, a) => ({
    attemptId: ref.id,
    status: a.status,
    story: a.story,
    attemptNumber: a.attemptNumber || 1,
    maxAttempts: 3,
    minSeconds: a.minSeconds,
    readingActiveMs: a.readingActiveMs || 0,
    remainingSeconds: Math.max(
        0,
        Math.ceil((a.minSeconds * 1000 - (a.readingActiveMs || 0)) / 1000),
    ),
    questions: a.questions || [],
    ...(a.submittedAt ? result(a) : {}),
  });
  const callable = (handler) =>
    functions.https.onCall(async (data, context) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        fail("invalid-argument", "An object payload is required.");
      }
      return handler(data, context);
    });

  return {
    getGradebook: callable(require("./gradebook")(db, HttpsError)),
    listCmsStories: callable(async (data, context) => {
      if (!context.auth) fail("unauthenticated", "Please sign in.");
      const staffDoc = await db.doc(`staffUsers/${context.auth.uid}`).get();
      const user = staffDoc.data();
      if (
        !user ||
        !["admin", "coordinator", "volunteer"].includes(user.role)
      ) {
        fail("permission-denied", "Staff access required.");
      }
      const stories = await db.collection("stories").get();
      const visible = stories.docs.filter(
          (doc) =>
            user.role === "admin" ||
          ((doc.data().centerIds || []).length &&
            doc
                .data()
                .centerIds.every((center) =>
                  (user.centerIds || []).includes(center),
                )),
      );
      return Promise.all(
          visible.map(async (doc) => {
            const bank = await db
                .collection("questions")
                .where("storyId", "==", doc.id)
                .get();
            const story = doc.data();
            const attemptsSnap = await db
                .collection("attempts")
                .where("storyId", "==", doc.id)
                .get();
            const attempts = [];
            for (const snapshot of attemptsSnap.docs) {
              const a = snapshot.data();
              try {
                await staff(context, a);
              } catch (error) {
                if (error.code === "permission-denied") continue;
                throw error;
              }
              attempts.push({
                id: snapshot.id,
                studentId: a.studentId,
                attemptNumber: a.attemptNumber || 1,
                status: a.status,
                score: a.score === undefined ? null : a.score,
                passed: a.passed === true,
              });
            }
            return {
              id: doc.id,
              title: story.title,
              body: story.body || "",
              subtitle: story.subtitle || "",
              status: story.status || "draft",
              week: story.week || 0,
              theme: story.theme || "garden",
              questions: bank.docs.map((q) => ({...q.data(), id: q.id})),
              attempts,
            };
          }),
      );
    }),
    createCmsStory: callable(async (data, context) => {
      if (!context.auth) fail("unauthenticated", "Please sign in.");
      const staffDoc = await db.doc(`staffUsers/${context.auth.uid}`).get();
      const user = staffDoc.data();
      if (
        !user ||
        !["admin", "coordinator", "volunteer"].includes(user.role)
      ) {
        fail("permission-denied", "Staff access required.");
      }
      let centerId = (user.centerIds || [])[0];
      if (!centerId && user.role === "admin") {
        const centers = await db.collection("centers").limit(1).get();
        centerId = centers.empty ? null : centers.docs[0].id;
      }
      if (!centerId) fail("failed-precondition", "Assign a center first.");
      const existing = await db
          .collection("stories")
          .where("centerIds", "array-contains", centerId)
          .get();
      const week =
        Math.max(0, ...existing.docs.map((d) => d.data().week || 0)) + 1;
      const ref = db.collection("stories").doc();
      await ref.create({
        title: "ಹೊಸ ಕಥೆ",
        body: "",
        subtitle: "",
        theme: "garden",
        week,
        status: "draft",
        centerIds: [centerId],
        classIds: [],
        questionCount: 4,
        version: 1,
        bankSize: 0,
        createdBy: context.auth.uid,
        createdAt: Timestamp.now(),
      });
      return {storyId: ref.id};
    }),
    saveCmsStory: callable(async (data, context) => {
      if (!context.auth) fail("unauthenticated", "Please sign in.");
      if (
        typeof data.title !== "string" ||
        !data.title.trim() ||
        data.title.length > 200 ||
        typeof data.body !== "string" ||
        !data.body.trim() ||
        data.body.length > 20000 ||
        !["draft", "published"].includes(data.status)
      ) {
        fail(
            "invalid-argument",
            "Enter a title, passage and publication status.",
        );
      }
      const ref = db.doc(`stories/${id(data.storyId)}`);
      return db.runTransaction(async (tx) => {
        const staffDoc = await tx.get(
            db.doc(`staffUsers/${context.auth.uid}`),
        );
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) fail("not-found", "Story not found.");
        const user = staffDoc.data();
        const story = snapshot.data();
        if (
          !user ||
          !["admin", "coordinator", "volunteer"].includes(user.role) ||
          (user.role !== "admin" &&
            (!(story.centerIds || []).length ||
              !story.centerIds.every((center) =>
                (user.centerIds || []).includes(center),
              )))
        ) {
          fail("permission-denied", "This story is outside your access.");
        }
        const bankSnap = await tx.get(
            db.collection("questions").where("storyId", "==", ref.id),
        );
        const questions =
          data.questions === undefined ?
            bankSnap.docs.map((q) => ({...q.data(), id: q.id})) :
            data.questions;
        if (!Array.isArray(questions)) {
          fail("invalid-argument", "Questions must be a list.");
        }
        if (data.status === "published" && questions.length < 4) {
          fail(
              "failed-precondition",
              "Add at least 4 questions before publishing.",
          );
        }
        questions.forEach((q, index) => {
          try {
            validateQuestion(q);
            if (q.type === "cloze" && !Array.isArray(q.options)) {
              throw new Error(
                  "Fill-in-the-blank questions need answer choices.",
              );
            }
          } catch (error) {
            fail(
                "invalid-argument",
                `Question ${index + 1}: ${error.message}`,
            );
          }
        });
        if (new Set(questions.map((q) => q.id)).size !== questions.length) {
          fail("invalid-argument", "Question IDs must be distinct.");
        }
        if (data.questions !== undefined) {
          const ownIds = new Set(bankSnap.docs.map((q) => q.id));
          bankSnap.docs.forEach((q) => tx.delete(q.ref));
          questions.forEach((q) => {
            const qRef = ownIds.has(q.id) ?
              db.doc(`questions/${q.id}`) :
              db.collection("questions").doc();
            const fields = {
              storyId: ref.id,
              type: q.type,
              difficulty: q.difficulty,
              prompt: q.prompt,
              correctAnswer: q.correctAnswer,
              source: "volunteer_authored",
            };
            if (q.type !== "true_false") fields.options = q.options;
            tx.set(qRef, fields);
          });
        }
        tx.update(ref, {
          title: data.title.trim(),
          body: data.body.trim(),
          status: data.status,
          bankSize: questions.length,
          updatedAt: Timestamp.now(),
          updatedBy: context.auth.uid,
        });
        return {success: true};
      });
    }),
    listStudentStories: callable(async (data, context) => {
      const claims = student(context);
      const snapshot = await db
          .collection("stories")
          .where("status", "==", "published")
          .where("centerIds", "array-contains", claims.centerId)
          .get();
      const stories = snapshot.docs.filter(
          (doc) =>
            !(doc.data().classIds || []).length ||
          doc.data().classIds.includes(claims.classId),
      );
      return Promise.all(
          stories.map(async (doc) => {
            const key = progressId(claims.studentId, doc.id);
            const progress = await db.doc(`assessmentProgress/${key}`).get();
            const currentId = progress.exists ?
            progress.data().attemptId :
            key;
            const attempt = await db.doc(`attempts/${currentId}`).get();
            const a = attempt.data();
            return {
              id: doc.id,
              title: doc.data().title || "Reading",
              subtitle: doc.data().subtitle || "Kannada reading practice",
              theme: doc.data().theme || "garden",
              summary:
              doc.data().summary ||
              "Read, discover, and check your understanding.",
              week: doc.data().week || 0,
              wordCount: doc.data().body.trim().split(/\s+/u).length,
              status: a ? a.status : "new",
              attemptNumber: a ? a.attemptNumber || 1 : 0,
              score: a && a.score !== undefined ? a.score : null,
              passed: a ? a.passed === true : false,
            };
          }),
      );
    }),
    startReading: callable(async (data, context) => {
      const claims = student(context);
      const storyId = id(data.storyId);
      const key = progressId(claims.studentId, storyId);
      const progressRef = db.doc(`assessmentProgress/${key}`);
      return db.runTransaction(async (tx) => {
        const progress = await tx.get(progressRef);
        const currentId = progress.exists ? progress.data().attemptId : key;
        const currentRef = db.doc(`attempts/${currentId}`);
        const existing = await tx.get(currentRef);
        let attemptNumber = 1;
        if (existing.exists) {
          const previous = existing.data();
          owner(previous, context);
          if (
            !data.retryFromAttemptId ||
            data.retryFromAttemptId !== currentId
          ) {
            return view(currentRef, previous);
          }
          if (
            !previous.submittedAt ||
            previous.passed !== false ||
            previous.needsReview ||
            (previous.attemptNumber || 1) >= 3
          ) {
            fail(
                "failed-precondition",
                "Retries require a failed quiz, with a limit of 3 attempts.",
            );
          }
          attemptNumber = (previous.attemptNumber || 1) + 1;
        } else if (data.retryFromAttemptId) {
          fail(
              "failed-precondition",
              "Start your first reading before retrying.",
          );
        }
        const ref = db.doc(
            `attempts/${attemptNumber === 1 ? key : `${key}-${attemptNumber}`}`,
        );
        const priorIds = Array.from({length: attemptNumber - 1}, (_, i) =>
          i === 0 ? key : `${key}-${i + 1}`,
        );
        const priorAttempts = await Promise.all(
            priorIds.map((priorId) => tx.get(db.doc(`attempts/${priorId}`))),
        );
        const usedQuestionIds = priorAttempts.flatMap((snap) =>
          snap.exists ? snap.data().assignedQuestionIds || [] : [],
        );
        const storySnap = await tx.get(db.doc(`stories/${storyId}`));
        if (!storySnap.exists) fail("not-found", "Story not found.");
        const story = storySnap.data();
        if (
          story.status !== "published" ||
          !(story.centerIds || []).includes(claims.centerId) ||
          ((story.classIds || []).length &&
            !story.classIds.includes(claims.classId))
        ) {
          fail(
              "permission-denied",
              "This story is not assigned to your class.",
          );
        }
        if (typeof story.body !== "string" || !story.body.trim()) {
          fail("failed-precondition", "The story has no reading passage.");
        }
        const bankSnap = await tx.get(
            db.collection("questions").where("storyId", "==", storyId),
        );
        const bank = bankSnap.docs
            .map((q) => ({...q.data(), id: q.id}))
            .filter((q) => q.type !== "cloze" || Array.isArray(q.options));
        const questionCount =
          story.questionCount === undefined ? 4 : story.questionCount;
        try {
          assignQuestions(bank, questionCount);
        } catch (error) {
          fail("failed-precondition", error.message);
        }
        const threshold =
          story.threshold === undefined ? 0.7 : story.threshold;
        if (
          typeof threshold !== "number" ||
          !Number.isFinite(threshold) ||
          threshold < 0 ||
          threshold > 1
        ) {
          fail("failed-precondition", "Invalid passing threshold.");
        }
        const attempt = {
          studentId: claims.studentId,
          authUid: context.auth.uid,
          centerId: claims.centerId,
          classId: claims.classId,
          storyId,
          week: story.week || 0,
          storyVersion: story.version || 1,
          story: {
            title: story.title || "Reading",
            body: story.body,
            subtitle: story.subtitle || "Reading practice",
            theme: story.theme || "garden",
          },
          attemptNumber,
          readingActiveMs: 0,
          readingStartedAt: Timestamp.now(),
          minSeconds: Math.max(
              20,
              Math.min(
                  180,
                  Math.ceil(story.body.trim().split(/\s+/u).length / 2),
              ),
          ),
          status: "reading",
          threshold,
          questionCount,
          pasteAttempted: false,
        };
        tx.create(ref, attempt);
        tx.set(progressRef, {
          attemptId: ref.id,
          attemptNumber,
          studentId: claims.studentId,
          storyId,
        });
        // Private snapshot protects in-flight attempts from question edits.
        tx.create(privateFor(ref), {bank, usedQuestionIds});
        return view(ref, attempt);
      });
    }),

    readingHeartbeat: callable(async (data, context) => {
      const ref = refFor(data);
      const sessionId = id(data.sessionId);
      if (
        !Number.isInteger(data.sequence) ||
        data.sequence < 0 ||
        !Number.isFinite(data.activeMs) ||
        data.activeMs < 0 ||
        data.activeMs > 3000
      ) {
        fail("invalid-argument", "Invalid reading heartbeat.");
      }
      return db.runTransaction(async (tx) => {
        const attempt = await getAttempt(tx, ref);
        owner(attempt, context);
        if (attempt.status !== "reading") return view(ref, attempt);
        const now = Timestamp.now();
        if (data.sequence === 0) {
          // Start or resume a foreground session without crediting time away.
          if (attempt.readingSessionId === sessionId) {
            return view(ref, attempt);
          }
          const changes = {
            readingSessionId: sessionId,
            readingSequence: 0,
            lastReadingPing: now,
          };
          tx.update(ref, changes);
          return view(ref, {...attempt, ...changes});
        }
        if (attempt.readingSessionId !== sessionId) {
          fail(
              "failed-precondition",
              "Reading is active elsewhere. Reopen this tab to continue.",
          );
        }
        if (data.sequence <= attempt.readingSequence) {
          return view(ref, attempt);
        }
        const elapsed = Math.max(
            0,
            now.toMillis() - attempt.lastReadingPing.toMillis(),
        );
        const changes = {
          readingSequence: data.sequence,
          lastReadingPing: now,
          readingActiveMs: Math.min(
              attempt.minSeconds * 1000,
              (attempt.readingActiveMs || 0) +
              Math.min(data.activeMs, elapsed, 3000),
          ),
        };
        tx.update(ref, changes);
        return view(ref, {...attempt, ...changes});
      });
    }),

    assignQuiz: callable(async (data, context) => {
      const ref = refFor(data);
      return db.runTransaction(async (tx) => {
        const attempt = await getAttempt(tx, ref);
        owner(attempt, context);
        if (attempt.status !== "reading") return view(ref, attempt);
        if ((attempt.readingActiveMs || 0) < attempt.minSeconds * 1000) {
          fail(
              "failed-precondition",
              "Finish reading with this page open before starting the quiz.",
          );
        }
        const keySnap = await tx.get(privateFor(ref));
        let assigned;
        try {
          assigned = assignQuestions(
              keySnap.data().bank,
              attempt.questionCount,
              keySnap.data().usedQuestionIds || [],
          );
        } catch (error) {
          fail("failed-precondition", error.message);
        }
        const changes = {
          status: "quiz",
          assignedQuestionIds: assigned.map((q) => q.id),
          questions: assigned.map(publicQuestion),
          readingCompletedAt: Timestamp.now(),
        };
        tx.set(privateFor(ref), {questions: assigned});
        tx.update(ref, changes);
        return view(ref, {...attempt, ...changes});
      });
    }),

    submitAttempt: callable(async (data, context) => {
      const ref = refFor(data);
      return db.runTransaction(async (tx) => {
        const attempt = await getAttempt(tx, ref);
        owner(attempt, context);
        if (attempt.submittedAt) return result(attempt);
        if (attempt.status !== "quiz") {
          fail("failed-precondition", "Start the quiz first.");
        }
        const keys = await tx.get(privateFor(ref));
        let grade;
        try {
          grade = gradeAnswers(
              keys.data().questions,
              data.answers,
              attempt.threshold,
          );
        } catch (error) {
          fail("invalid-argument", error.message);
        }
        tx.update(ref, {
          ...grade,
          status: grade.needsReview ? "pending_review" : "graded",
          reviewedBy: null,
          submittedAt: Timestamp.now(),
        });
        return result({...attempt, ...grade});
      });
    }),

    logPasteAttempt: callable(async (data, context) => {
      const ref = refFor(data);
      return db.runTransaction(async (tx) => {
        const attempt = await getAttempt(tx, ref);
        owner(attempt, context);
        if (!attempt.pasteAttempted) tx.update(ref, {pasteAttempted: true});
        return {success: true};
      });
    }),

    getAttemptReview: callable(async (data, context) => {
      const ref = refFor(data);
      const snapshot = await ref.get();
      if (!snapshot.exists) fail("not-found", "Attempt not found.");
      const attempt = snapshot.data();
      await staff(context, attempt);
      const keys = await privateFor(ref).get();
      return {
        attemptId: ref.id,
        studentId: attempt.studentId,
        title: attempt.story.title,
        pasteAttempted: attempt.pasteAttempted,
        answers: attempt.answers || [],
        questions: keys.data().questions || [],
      };
    }),

    reviewAttempt: callable(async (data, context) => {
      const ref = refFor(data);
      const snapshot = await ref.get();
      if (!snapshot.exists) fail("not-found", "Attempt not found.");
      await staff(context, snapshot.data());
      if (
        typeof data.note !== "string" ||
        !data.note.trim() ||
        data.note.length > 2000
      ) {
        fail(
            "invalid-argument",
            "Include a review note (maximum 2000 characters).",
        );
      }
      return db.runTransaction(async (tx) => {
        const attempt = await getAttempt(tx, ref);
        if (!attempt.needsReview) {
          fail(
              "failed-precondition",
              "This attempt has no pending answers.",
          );
        }
        const pending = attempt.answers.filter((a) => a.needsReview);
        const decisions = data.decisions;
        if (
          !Array.isArray(decisions) ||
          decisions.length !== pending.length ||
          new Set(decisions.map((d) => d && d.questionId)).size !==
            pending.length ||
          decisions.some(
              (d) =>
                !d ||
              typeof d.correct !== "boolean" ||
              !pending.some((a) => a.questionId === d.questionId),
          )
        ) {
          fail(
              "invalid-argument",
              "Review each pending answer exactly once.",
          );
        }
        const answers = attempt.answers.map((a) => {
          const decision = decisions.find(
              (d) => d.questionId === a.questionId,
          );
          return decision ?
            {...a, correct: decision.correct, needsReview: false} :
            a;
        });
        const grade = summarize(answers, attempt.threshold);
        tx.update(ref, {
          ...grade,
          answers,
          status: "graded",
          reviewedBy: context.auth.uid,
          reviewNote: data.note.trim(),
          reviewedAt: Timestamp.now(),
        });
        return result({...attempt, ...grade});
      });
    }),
  };
};
