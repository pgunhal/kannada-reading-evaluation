const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const admin = require("firebase-admin");
const {
  initializeTestEnvironment,
  assertFails,
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc } = require("firebase/firestore");
const core = require("../speaking/core");
const samples = require("../speaking/samples");
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;
let app;
let db;
let api;
let env;
const teacher = { auth: { uid: "teacher", token: { role: "volunteer" } } };
const classId = "test-speaking";
const id = core.studentId(classId, "Ananya R");
const student = {
  auth: {
    uid: `sp-${id}`,
    token: {
      role: "speaking_student",
      speakingStudentId: id,
      speakingClassId: classId,
      pinVersion: 1,
    },
  },
};
before(async () => {
  if (!enabled) return;
  const projectId = "demo-kkali-speaking-tests";
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync("../firestore.rules", "utf8") },
  });
  await env.clearFirestore();
  app = admin.initializeApp({ projectId }, "speaking-test");
  db = app.firestore();
  api = require("../speaking/service")(
    db,
    { createCustomToken: async (uid, claims) => ({ uid, claims }) },
    async () => samples,
  );
  await db
    .doc("staffUsers/teacher")
    .set({ role: "volunteer", centerIds: ["main"] });
  await db
    .doc(`spClasses/${classId}`)
    .set({ name: "Test Speaking", centerId: "main", teacherUids: ["teacher"] });
});
after(async () => {
  if (env) await env.cleanup();
  if (app) await app.delete();
});
test(
  "speaking flow enforces auth, private drafts, publication, grading and PIN reset",
  { skip: !enabled },
  async () => {
    await api.teacher(
      {
        action: "student",
        classId,
        firstName: "Ananya",
        lastInitial: "R",
        pin: "0042",
      },
      teacher,
    );
    const login = await api.login(
      { className: "Test Speaking", name: "ananya r.", pin: "0042" },
      { rawRequest: { ip: "127.0.0.1" } },
    );
    assert.equal(login.token.claims.role, "speaking_student");
    await assert.rejects(
      api.login(
        { className: "Test Speaking", name: "ananya r", pin: "9999" },
        {},
      ),
      /incorrect/,
    );
    await assert.rejects(
      api.teacher({ action: "load", classId }, student),
      /access/,
    );
    await assert.rejects(
      api.teacher(
        { action: "load", classId },
        { auth: { uid: "outsider", token: { role: "admin" } } },
      ),
      /access/,
    );
    await api.generateWeek(
      { classId, week: "2026-01-05", topic: "Movie stars", count: 10 },
      teacher,
    );
    assert.equal((await api.portal({}, student)).reading, null);
    const wId = core.weekId(classId, "2026-01-05");
    const params = { classId, week: "2026-01-05", revision: 1 };
    await assert.rejects(
      api.teacher({ ...params, action: "publish" }, teacher),
      /Review/,
    );
    await api.teacher(
      { ...params, action: "publish", reviewed: true },
      teacher,
    );
    const result = await api.portal({}, student);
    assert.equal(result.weeks.length, 1);
    assert(result.reading.body);
    assert(!JSON.stringify(result).includes("questions"));
    await assert.rejects(
      api.portal({ weekId: "other" }, student),
      /not available/,
    );
    await assert.rejects(
      api.teacher(
        { ...params, action: "grade", studentId: id, score: 8 },
        teacher,
      ),
      /changed/,
    );
    await assert.rejects(
      api.teacher(
        { ...params, revision: 2, action: "grade", studentId: id, score: 11 },
        teacher,
      ),
      /1 to 10/,
    );
    await api.teacher(
      { ...params, revision: 2, action: "grade", studentId: id, score: 8 },
      teacher,
    );
    assert.equal(
      (await api.teacher({ action: "load", classId }, teacher)).grades[0].score,
      8,
    );
    const week = (await db.doc(`spWeeks/${wId}`).get()).data();
    const other = samples.find((p) => p.id !== week.assignments[id]).id;
    await assert.rejects(
      api.teacher(
        {
          ...params,
          revision: 3,
          action: "assign",
          assignments: { [id]: other },
        },
        teacher,
      ),
      /graded student/,
    );
    await assert.rejects(
      api.teacher(
        { ...params, revision: 3, action: "save", paragraphs: samples },
        teacher,
      ),
      /locked/,
    );
    const client = env
      .authenticatedContext(student.auth.uid, student.auth.token)
      .firestore();
    for (const path of [
      `spWeeks/${wId}`,
      `spPins/${id}`,
      `spStudents/${id}`,
      `spGrades/${wId}_${id}`,
    ]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { score: 10 }));
    }
    await api.teacher(
      { action: "pin", classId, studentId: id, pin: "0123" },
      teacher,
    );
    await assert.rejects(api.portal({}, student), /access changed/);
    const reset = await api.login(
      { className: classId, name: "Ananya R", pin: "0123" },
      {},
    );
    assert.equal(reset.token.claims.pinVersion, 2);
  },
);
test(
  "PIN brute-force attempts are limited even for unknown names",
  { skip: !enabled },
  async () => {
    for (let i = 0; i < 8; i++) {
      await assert.rejects(
        api.login({ className: classId, name: "Unknown X", pin: "1234" }, {}),
        /incorrect/,
      );
    }
    await assert.rejects(
      api.login({ className: classId, name: "Unknown X", pin: "1234" }, {}),
      /Too many attempts/,
    );
  },
);
