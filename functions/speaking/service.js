const { createHash } = require("node:crypto");
const { HttpsError } = require("firebase-functions/v1/https");
const core = require("./core");

module.exports = (db, auth, generate) => {
  const fail = (code, message) => {
    throw new HttpsError(code, message);
  };
  const docData = (s) => ({ ...s.data(), id: s.id });
  const roster = async (classId) =>
    (
      await db.collection("spStudents").where("classId", "==", classId).get()
    ).docs
      .map(docData)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  async function staff(context, classId) {
    if (!context.auth) fail("unauthenticated", "Sign in as a teacher.");
    const [s, c] = await Promise.all([
      db.doc(`staffUsers/${context.auth.uid}`).get(),
      db.doc(`spClasses/${classId}`).get(),
    ]);
    const user = s.data();
    const classroom = c.data();
    if (
      !user ||
      !classroom ||
      !(
        user.role === "admin" ||
        (["coordinator", "volunteer"].includes(user.role) &&
          (user.centerIds || []).includes(classroom.centerId) &&
          (user.role === "coordinator" ||
            (classroom.teacherUids || []).includes(context.auth.uid)))
      )
    ) {
      fail("permission-denied", "You do not have access to this class.");
    }
    return classroom;
  }
  async function limit(key, maximum, milliseconds) {
    const hash = createHash("sha256").update(key).digest("hex");
    const ref = db.doc(`spLimits/${hash}`);
    await db.runTransaction(async (tx) => {
      const old = (await tx.get(ref)).data();
      const now = Date.now();
      const count = old && old.until > now ? old.count : 0;
      if (count >= maximum) {
        fail(
          "resource-exhausted",
          "Too many attempts. Please try again later.",
        );
      }
      tx.set(ref, {
        count: count + 1,
        until: count ? old.until : now + milliseconds,
      });
    });
  }
  async function login(data, context) {
    const classId = core.classCode(data.className);
    core.check(
      typeof data.name === "string" &&
        data.name.length <= 100 &&
        data.name.trim(),
      "Enter your first name and last initial.",
    );
    core.check(
      typeof data.pin === "string" && /^\d{4}$/.test(data.pin),
      "Enter your four-digit PIN.",
    );
    const id = core.studentId(classId, data.name);
    await limit(
      `ip:${(context.rawRequest && context.rawRequest.ip) || "unknown"}`,
      80,
      15 * 60 * 1000,
    );
    await limit(`login:${id}`, 8, 15 * 60 * 1000);
    const [s, p] = await Promise.all([
      db.doc(`spStudents/${id}`).get(),
      db.doc(`spPins/${id}`).get(),
    ]);
    const pin = p.data() || { salt: "missing-student", hash: "0".repeat(64) };
    const matches = core.verifyPin(data.pin, pin);
    if (!s.exists || !s.data().active || !matches) {
      fail("unauthenticated", "Class, name, or PIN is incorrect.");
    }
    const token = await auth.createCustomToken(s.data().authUid, {
      role: "speaking_student",
      speakingStudentId: id,
      speakingClassId: classId,
      pinVersion: pin.version,
    });
    return { token };
  }
  async function portal(data, context) {
    if (!context.auth || context.auth.token.role !== "speaking_student") {
      fail("permission-denied", "Sign in as a student.");
    }
    const claims = context.auth.token;
    const [s, p] = await Promise.all([
      db.doc(`spStudents/${claims.speakingStudentId}`).get(),
      db.doc(`spPins/${claims.speakingStudentId}`).get(),
    ]);
    if (
      !s.exists ||
      !s.data().active ||
      s.data().authUid !== context.auth.uid ||
      s.data().classId !== claims.speakingClassId ||
      !p.exists ||
      p.data().version !== claims.pinVersion
    ) {
      fail("unauthenticated", "Your access changed. Please sign in again.");
    }
    const rows = (
      await db
        .collection("spWeeks")
        .where("classId", "==", s.data().classId)
        .get()
    ).docs
      .map(docData)
      .filter(
        (w) =>
          w.status === "published" &&
          w.week <= new Date().toISOString().slice(0, 10) &&
          w.assignments[s.id],
      )
      .sort((a, b) => b.week.localeCompare(a.week));
    const week = data.weekId ? rows.find((w) => w.id === data.weekId) : rows[0];
    if (data.weekId && !week) {
      fail("not-found", "This reading is not available.");
    }
    return {
      name: s.data().displayName,
      weeks: rows.map((w) => ({ id: w.id, week: w.week, topic: w.topic })),
      reading: week ? core.studentReading(week, s.id) : null,
    };
  }
  async function teacher(data, context) {
    if (data.action === "classes") {
      const all = (await db.collection("spClasses").get()).docs;
      const accessible = [];
      for (const c of all) {
        try {
          await staff(context, c.id);
          accessible.push({ id: c.id, name: c.data().name });
        } catch (e) {
          if (e.code !== "permission-denied") throw e;
        }
      }
      return { classes: accessible };
    }
    const classId = core.classCode(data.classId);
    await staff(context, classId);
    const students = await roster(classId);
    if (data.action === "load") {
      const [weeks, grades] = await Promise.all([
        db.collection("spWeeks").where("classId", "==", classId).get(),
        db.collection("spGrades").where("classId", "==", classId).get(),
      ]);
      return {
        students,
        weeks: weeks.docs
          .map(docData)
          .sort((a, b) => b.week.localeCompare(a.week)),
        grades: grades.docs.map(docData),
      };
    }
    if (data.action === "student") {
      core.check(
        typeof data.firstName === "string" &&
          data.firstName.trim().length >= 1 &&
          data.firstName.length <= 60 &&
          typeof data.lastInitial === "string" &&
          /^\p{L}$/u.test(data.lastInitial.trim()),
        "Enter a first name and one last initial.",
      );
      const displayName = `${data.firstName.trim()} ${data.lastInitial.trim().toUpperCase()}`;
      const id = core.studentId(classId, displayName);
      const pin = core.pinHash(data.pin);
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`spStudents/${id}`);
        const old = await tx.get(ref);
        if (old.exists) {
          fail(
            "already-exists",
            "That name is already on this roster. Use Reset PIN for an existing student.",
          );
        }
        tx.create(ref, {
          classId,
          displayName,
          firstName: data.firstName.trim(),
          lastInitial: data.lastInitial.trim().toUpperCase(),
          authUid: `sp-${id}`,
          active: true,
        });
        tx.create(db.doc(`spPins/${id}`), { ...pin, version: 1 });
      });
      return { id };
    }
    if (data.action === "pin") {
      const student = students.find((s) => s.id === data.studentId);
      if (!student) fail("not-found", "Student not found.");
      const pin = core.pinHash(data.pin);
      await db.runTransaction(async (tx) => {
        const ref = db.doc(`spPins/${student.id}`);
        const old = await tx.get(ref);
        tx.set(ref, { ...pin, version: old.data().version + 1 });
      });
      return { saved: true };
    }
    const id = core.weekId(classId, data.week);
    const ref = db.doc(`spWeeks/${id}`);
    if (data.action === "create") {
      core.check(
        typeof data.topic === "string" &&
          data.topic.trim().length > 0 &&
          data.topic.length <= 200,
        "Enter a topic.",
      );
      await ref.create({
        classId,
        week: data.week,
        topic: data.topic.trim(),
        status: "draft",
        paragraphs: [],
        assignments: {},
        revision: 1,
        source: "manual",
        createdBy: context.auth.uid,
      });
      return { id };
    }
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const week = snap.data();
      if (!week) fail("not-found", "Week not found.");
      if (week.revision !== data.revision) {
        fail("aborted", "This week changed. Refresh before saving.");
      }
      const active = students.filter((s) => s.active);
      const grades = await tx.get(
        db.collection("spGrades").where("weekId", "==", id),
      );
      let changes;
      if (data.action === "save") {
        if (week.status !== "draft") {
          fail(
            "failed-precondition",
            "Published readings are locked. Create a new week to change content.",
          );
        }
        changes = { paragraphs: core.paragraphs(data.paragraphs) };
      } else if (data.action === "assign" || data.action === "publish") {
        const readings = core.paragraphs(week.paragraphs);
        const assignments = core.validateAssignments(
          data.assignments || core.assign(active, readings),
          active,
          readings,
        );
        for (const g of grades.docs) {
          if (
            assignments[g.data().studentId] !==
            week.assignments[g.data().studentId]
          ) {
            fail(
              "failed-precondition",
              "A graded student cannot be reassigned.",
            );
          }
        }
        changes = { assignments };
        if (data.action === "publish") {
          if (data.reviewed !== true) {
            fail(
              "failed-precondition",
              "Review the paragraphs and questions before publishing.",
            );
          }
          core.check(active.length > 0, "Add students before publishing.");
          changes.status = "published";
        }
      } else if (data.action === "grade") {
        core.check(
          week.status === "published" && week.assignments[data.studentId],
          "Choose an assigned student in a published week.",
        );
        const score = core.grade(data.score);
        const g = {
          classId,
          weekId: id,
          week: week.week,
          studentId: data.studentId,
          score,
          paragraphId: week.assignments[data.studentId],
          gradedBy: context.auth.uid,
          updatedAt: new Date().toISOString(),
        };
        tx.set(db.doc(`spGrades/${id}_${data.studentId}`), g);
        tx.create(db.collection("spGradeEvents").doc(), g);
        changes = {};
      } else {
        fail("invalid-argument", "Unknown action.");
      }
      tx.update(ref, {
        ...changes,
        revision: week.revision + 1,
        updatedBy: context.auth.uid,
      });
    });
    return { id, saved: true };
  }
  async function generateWeek(data, context) {
    const classId = core.classCode(data.classId);
    await staff(context, classId);
    const id = core.weekId(classId, data.week);
    core.check(
      typeof data.topic === "string" &&
        data.topic.trim() &&
        data.topic.length <= 200,
      "Enter a topic (200 characters maximum).",
    );
    core.check(
      Number.isInteger(data.count) && data.count >= 10 && data.count <= 15,
      "Choose 10–15 paragraphs.",
    );
    const ref = db.doc(`spWeeks/${id}`);
    if ((await ref.get()).exists) {
      fail("already-exists", "This week already exists. Choose another week.");
    }
    await limit(`generate:${context.auth.uid}`, 5, 60 * 60 * 1000);
    const result = core.paragraphs(
      await generate({ topic: data.topic.trim(), count: data.count }),
    );
    core.check(
      result.length === data.count,
      "Generation returned the wrong number of paragraphs. Try again.",
    );
    await ref.create({
      classId,
      week: data.week,
      topic: data.topic.trim(),
      paragraphs: result,
      assignments: {},
      status: "draft",
      revision: 1,
      source: "openai",
      createdBy: context.auth.uid,
    });
    return { id };
  }
  return { login, portal, teacher, generateWeek };
};
