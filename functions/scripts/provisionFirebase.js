const fs = require("node:fs");
const admin = require("firebase-admin");

/**
 * Validate membership references before any writes.
 * @param {object} plan Membership plan.
 * @return {object} Validated plan.
 */
function validate(plan) {
  const validId = (id) => typeof id === "string" && id.length > 0 &&
    id.length <= 128 && !id.includes("/");
  for (const collection of ["centers", "classes", "staff", "students"]) {
    if (!Array.isArray(plan[collection])) {
      throw new Error(`${collection} must be an array.`);
    }
    const ids = plan[collection].map((item) => item.id || item.uid);
    if (ids.some((id) => !validId(id)) || new Set(ids).size !== ids.length) {
      throw new Error(`${collection} IDs must be valid and unique.`);
    }
  }
  const centers = new Set(plan.centers.map((c) => c.id));
  const classes = new Map(plan.classes.map((c) => [c.id, c]));
  const staff = new Map(plan.staff.map((s) => [s.uid, s]));
  for (const c of plan.classes) {
    if (!centers.has(c.centerId) || !Array.isArray(c.teacherUids) ||
      c.teacherUids.some((uid) => !staff.has(uid))) {
      throw new Error("Classes must reference declared centers and staff.");
    }
  }
  for (const s of plan.staff) {
    if (!["admin", "coordinator", "volunteer"].includes(s.role) ||
      !Array.isArray(s.centerIds) ||
      s.centerIds.some((id) => !centers.has(id))) {
      throw new Error("Invalid staff role or center membership.");
    }
  }
  const uids = new Set(plan.staff.map((s) => s.uid));
  for (const s of plan.students) {
    const classroom = classes.get(s.classId);
    if (!validId(s.uid) || uids.has(s.uid) || !classroom ||
      classroom.centerId !== s.centerId) {
      throw new Error("Invalid student Auth UID, class or center membership.");
    }
    uids.add(s.uid);
  }
  for (const item of [...plan.centers, ...plan.classes]) {
    if (typeof item.name !== "string" || !item.name.trim()) {
      throw new Error("Centers and classes require names.");
    }
  }
  for (const item of [...plan.staff, ...plan.students]) {
    if (typeof item.displayName !== "string" || !item.displayName.trim()) {
      throw new Error("Staff and students require display names.");
    }
  }
  return plan;
}

/** Apply an explicit membership plan using server credentials. */
async function main() {
  const args = process.argv.slice(2);
  const value = (flag) => args[args.indexOf(flag) + 1];
  if (!args.includes("--project") || !args.includes("--file")) {
    throw new Error("Usage: node scripts/provisionFirebase.js " +
      "--project PROJECT_ID --file PLAN.json [--apply]");
  }
  const projectId = value("--project");
  const emulated = process.env.FIRESTORE_EMULATOR_HOST &&
    process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (projectId.startsWith("demo-") ? !emulated :
    (process.env.FIRESTORE_EMULATOR_HOST ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error("Use both emulators for demo projects; " +
      "unset emulator variables for live projects.");
  }
  const contents = fs.readFileSync(value("--file"), "utf8");
  const plan = validate(JSON.parse(contents));
  if (!args.includes("--apply")) {
    console.log(`Valid plan for ${projectId}: ` +
      `${plan.centers.length} centers, ` +
      `${plan.classes.length} classes, ${plan.staff.length} staff, ` +
      `${plan.students.length} students. No changes written. Add --apply.`);
    return;
  }
  admin.initializeApp({projectId});
  try {
    const db = admin.firestore();
    // Accounts are created by the operator in Firebase Auth. Check all first.
    const accounts = [...plan.staff, ...plan.students];
    const authUsers = new Map();
    for (const account of accounts) {
      authUsers.set(account.uid, await admin.auth().getUser(account.uid));
    }
    for (const c of plan.centers) {
      await db.doc(`centers/${c.id}`).set({name: c.name}, {merge: true});
    }
    for (const c of plan.classes) {
      await db.doc(`classes/${c.id}`).set({name: c.name,
        centerId: c.centerId, teacherUids: c.teacherUids}, {merge: true});
    }
    for (const s of plan.staff) {
      await db.doc(`staffUsers/${s.uid}`).set({role: s.role,
        centerIds: s.centerIds, displayName: s.displayName}, {merge: true});
    }
    for (const s of plan.students) {
      await db.doc(`students/${s.id}`).set({authUid: s.uid,
        displayName: s.displayName, classId: s.classId,
        centerId: s.centerId}, {merge: true});
    }
    for (const account of accounts) {
      const claims = {...authUsers.get(account.uid).customClaims};
      for (const key of ["role", "isAdmin", "centerIds", "centerId",
        "classId", "studentId"]) delete claims[key];
      const isStudent = plan.students.includes(account);
      await admin.auth().setCustomUserClaims(account.uid, {...claims,
        ...(isStudent ? {role: "student", studentId: account.id,
          classId: account.classId, centerId: account.centerId} :
          {role: account.role, centerIds: account.centerIds})});
    }
    if (args.includes("--with-demo-stories")) {
      if (!plan.centers.length) throw new Error("Demo stories need a center.");
      for (const source of require("./demoStories")) {
        const {id, questions, ...story} = source;
        const ref = db.doc(`stories/sample-${id}`);
        await db.runTransaction(async (tx) => {
          if ((await tx.get(ref)).exists) return;
          tx.create(ref, {...story, status: "published",
            centerIds: [plan.centers[0].id], classIds: [],
            week: require("./demoStories").indexOf(source) + 1,
            questionCount: 4, bankSize: questions.length, version: 1});
          questions.forEach((q, index) => {
            tx.create(db.doc(`questions/${ref.id}-q${index}`),
                {...q, storyId: ref.id, source: "volunteer_authored"});
          });
        });
      }
    }
    console.log(`Membership saved to ${projectId}. Sign in again.`);
  } finally {
    await admin.app().delete();
  }
}
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = {validate};
