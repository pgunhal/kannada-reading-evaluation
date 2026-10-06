const core = require("../speaking/core");
const paragraphs = require("../speaking/samples");
const accounts = [
  ["Ananya", "R", "1042"],
  ["Kiran", "S", "2083"],
  ["Meera", "P", "3194"],
  ["Arjun", "K", "4205"],
  ["Diya", "M", "5316"],
  ["Nikhil", "B", "6427"],
  ["Sahana", "G", "7538"],
  ["Vihaan", "N", "8649"],
];
async function seed(db, teacherUid) {
  if (!teacherUid) throw new Error("A teacher UID is required.");
  const classId = "speaking-demo";
  const c = db.doc(`spClasses/${classId}`);
  if (!(await c.get()).exists) {
    await c.create({
      name: "Speaking Demo",
      centerId: "kkali-main",
      teacherUids: [teacherUid],
      isMock: true,
    });
  }
  const students = [];
  for (const [firstName, lastInitial, pin] of accounts) {
    const displayName = `${firstName} ${lastInitial}`;
    const id = core.studentId(classId, displayName);
    students.push({ id });
    const ref = db.doc(`spStudents/${id}`);
    if (!(await ref.get()).exists) {
      const batch = db.batch();
      batch.create(ref, {
        classId,
        firstName,
        lastInitial,
        displayName,
        authUid: `sp-${id}`,
        active: true,
        isMock: true,
      });
      batch.create(db.doc(`spPins/${id}`), {
        ...core.pinHash(pin),
        version: 1,
      });
      await batch.commit();
    }
  }
  const monday = new Date();
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (const offset of [-7, 0, 7]) {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + offset);
    const week = date.toISOString().slice(0, 10);
    const ref = db.doc(`spWeeks/${core.weekId(classId, week)}`);
    if (!(await ref.get()).exists) {
      await ref.create({
        classId,
        week,
        topic: "Movie stars of Karnataka",
        paragraphs: core.paragraphs(paragraphs),
        assignments: core.assign(students, paragraphs, () => 0),
        revision: 1,
        status: offset > 0 ? "draft" : "published",
        source: "hand-authored-preview",
        createdBy: teacherUid,
      });
    }
  }
  return {
    classId,
    students: accounts.map(([firstName, lastInitial, pin]) => ({
      name: `${firstName} ${lastInitial}`,
      pin,
    })),
  };
}
module.exports = { seed };
if (require.main === module) {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "Use this CLI only with Firestore emulators. Cloud preview seeding requires explicit project verification.",
    );
  }
  const admin = require("firebase-admin");
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || "demo-kkali-speaking",
  });
  seed(admin.firestore(), process.argv[2])
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .finally(() => admin.app().delete());
}
