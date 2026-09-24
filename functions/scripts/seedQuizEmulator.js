const admin = require("firebase-admin");

if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
) {
  throw new Error("Both Firestore and Auth emulator hosts are required.");
}
admin.initializeApp({projectId: "demo-kkali-quiz"});
const db = admin.firestore();
const seed = async () => {
  const users = [
    {
      uid: "demo-student",
      email: "student@example.test",
      claims: {
        role: "student",
        studentId: "demo-student",
        classId: "demo-class",
        centerId: "demo-center",
      },
    },
    {
      uid: "demo-teacher",
      email: "teacher@example.test",
      claims: {
        role: "volunteer",
        centerIds: ["demo-center"],
      },
    },
  ];
  for (const user of users) {
    try {
      await admin
          .auth()
          .createUser({
            uid: user.uid,
            email: user.email,
            password: "local-demo-only",
          });
    } catch (error) {
      if (error.code !== "auth/uid-already-exists") throw error;
    }
    await admin.auth().setCustomUserClaims(user.uid, user.claims);
  }
  await db.doc("centers/demo-center").set({name: "Demo center"});
  await db
      .doc("classes/demo-class")
      .set({
        name: "Demo class",
        centerId: "demo-center",
        teacherUids: ["demo-teacher"],
      });
  await db
      .doc("staffUsers/demo-teacher")
      .set({
        role: "volunteer",
        centerIds: ["demo-center"],
        displayName: "Demo teacher",
      });
  for (const [id, displayName] of [
    ["demo-student", "Demo student"], ["demo-ananya", "Ananya"],
    ["demo-kiran", "Kiran"], ["demo-meera", "Meera"],
  ]) {
    await db.doc(`students/${id}`).set({
      displayName, classId: "demo-class", centerId: "demo-center",
    }, {merge: true});
  }
  const stories = require("./demoStories");
  for (let index = 0; index < stories.length; index++) {
    const {id, questions, ...story} = stories[index];
    await db
        .doc(`stories/${id}`)
        .set({
          ...story,
          week: index + 1,
          status: "published",
          centerIds: ["demo-center"],
          classIds: [],
          version: 2,
          questionCount: 4,
          bankSize: questions.length,
        });
    // Replace only this demo story's authored bank; attempts keep snapshots.
    const old = await db
        .collection("questions")
        .where("storyId", "==", id)
        .get();
    const batch = db.batch();
    old.docs.forEach((doc) => batch.delete(doc.ref));
    questions.forEach((question, i) =>
      batch.set(db.doc(`questions/${id}-q${i}`), {
        ...question,
        storyId: id,
        source: "volunteer_authored",
      }),
    );
    await batch.commit();
  }
  console.log("Demo ready. Password: local-demo-only");
  console.log("Student: student@example.test; staff: teacher@example.test");
  await admin.app().delete();
};
seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
