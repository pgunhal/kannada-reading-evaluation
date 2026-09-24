// Build roster-based results, including students with no attempts.
module.exports = (db, HttpsError) => async (data, context) => {
  if (!context.auth) throw new HttpsError("unauthenticated", "Please sign in.");
  const staff = (await db.doc(`staffUsers/${context.auth.uid}`).get()).data();
  if (!staff || !["admin", "coordinator", "volunteer"].includes(staff.role)) {
    throw new HttpsError("permission-denied", "Staff access required.");
  }
  const classes = (await db.collection("classes").get()).docs.filter((doc) => {
    const c = doc.data();
    return staff.role === "admin" ||
      ((staff.centerIds || []).includes(c.centerId) &&
        (staff.role !== "volunteer" ||
          (c.teacherUids || []).includes(context.auth.uid)));
  });
  const storiesSnap = await db.collection("stories").get();
  const stories = storiesSnap.docs.filter((doc) => {
    const s = doc.data();
    return s.status === "published" && classes.some((c) =>
      (s.centerIds || []).includes(c.data().centerId) &&
      (!(s.classIds || []).length || s.classIds.includes(c.id)));
  }).map((doc) => ({id: doc.id, title: doc.data().title,
    week: doc.data().week || 0, centerIds: doc.data().centerIds || [],
    classIds: doc.data().classIds || []})).sort((a, b) => a.week - b.week);
  const rows = [];
  for (const classroom of classes) {
    const centerId = classroom.data().centerId;
    const [roster, attempts] = await Promise.all([
      db.collection("students").where("classId", "==", classroom.id).get(),
      db.collection("attempts").where("classId", "==", classroom.id).get(),
    ]);
    const members = new Map(roster.docs.filter((doc) =>
      doc.data().centerId === centerId).map((doc) => [doc.id, {
      id: doc.id, name: doc.data().displayName || doc.data().name || doc.id,
    }]));
    // Preserve visibility of historical students not yet in the demo roster.
    const scopedAttempts = attempts.docs.filter((doc) =>
      doc.data().centerId === centerId);
    for (const doc of scopedAttempts) {
      const a = doc.data();
      if (!members.has(a.studentId)) {
        members.set(a.studentId, {id: a.studentId, name: a.studentId});
      }
    }
    for (const member of members.values()) {
      const history = scopedAttempts.filter((doc) =>
        doc.data().studentId === member.id).map((doc) => {
        const a = doc.data();
        return {id: doc.id, storyId: a.storyId,
          title: (a.story && a.story.title) || a.storyId,
          attemptNumber: a.attemptNumber || 1, status: a.status,
          score: a.submittedAt && typeof a.score === "number" ? a.score : null,
          passed: a.passed === true, needsReview: a.needsReview === true,
          startedAt: a.readingStartedAt ? a.readingStartedAt.toMillis() : null,
          submittedAt: a.submittedAt ? a.submittedAt.toMillis() : null};
      }).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0) ||
        b.attemptNumber - a.attemptNumber);
      const results = stories.filter((s) => s.centerIds.includes(centerId) &&
        (!s.classIds.length || s.classIds.includes(classroom.id))).map((s) => {
        const work = history.filter((a) => a.storyId === s.id);
        const scored = work.filter((a) => a.score !== null && !a.needsReview);
        return {storyId: s.id, highestScore: scored.length ?
          Math.max(...scored.map((a) => a.score)) : null,
        missing: !work.some((a) => a.submittedAt),
        status: scored.length ? "submitted" : work.some((a) => a.needsReview) ?
          "pending_review" : work.length ? "in_progress" : "new"};
      });
      rows.push({...member, classId: classroom.id,
        className: classroom.data().name || classroom.id, results, history,
        missingCount: results.filter((r) => r.missing).length});
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return {stories: stories.map(({id, title}) => ({id, title})), students: rows,
    classes: classes.map((doc) => ({id: doc.id,
      name: doc.data().name || doc.id}))};
};
