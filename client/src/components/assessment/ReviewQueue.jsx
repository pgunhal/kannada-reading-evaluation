import React, { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Link } from "react-router-dom";
import { auth, db, functions } from "../../firebaseConfig";
import AssessmentLayout from "./AssessmentLayout";

const call = async (name, payload) => (await httpsCallable(functions, name)(payload)).data;
export default function ReviewQueue() {
  const [items, setItems] = useState([]);
  const [review, setReview] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { claims } = await auth.currentUser.getIdTokenResult();
      const filters = [where("needsReview", "==", true)];
      if (claims.role !== "admin") {
        if (!["coordinator", "volunteer"].includes(claims.role) || !claims.centerIds?.length) {
          throw new Error("A CMS staff account is required.");
        }
        // Query each center independently to avoid the Firestore 'in' operand limit.
        const snapshots = await Promise.all(claims.centerIds.map((centerId) => getDocs(query(
          collection(db, "attempts"), ...filters, where("centerId", "==", centerId)))));
        let candidates = snapshots.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        if (claims.role === "volunteer") {
          const classes = await Promise.all([...new Set(candidates.map((a) => a.classId))]
            .map((classId) => getDoc(doc(db, "classes", classId))));
          const assigned = new Set(classes.filter((c) => c.data()?.teacherUids?.includes(auth.currentUser.uid)).map((c) => c.id));
          candidates = candidates.filter((a) => assigned.has(a.classId));
        }
        if (!cancelled) setItems(candidates);
      } else {
        const snap = await getDocs(query(collection(db, "attempts"), ...filters));
        if (!cancelled) setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    })().catch((e) => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, []);
  const run = async (operation) => {
    setBusy(true); setError("");
    try { await operation(); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const open = (attemptId) => run(async () => {
    setReview(await call("getAttemptReview", { attemptId }));
    setDecisions({}); setNote("");
  });
  const save = () => run(async () => {
    await call("reviewAttempt", { attemptId: review.attemptId, note,
      decisions: Object.entries(decisions).map(([questionId, correct]) => ({ questionId, correct })) });
    setItems(items.filter((a) => a.id !== review.attemptId)); setReview(null);
  });
  const pending = review?.answers.filter((a) => a.needsReview) || [];
  return <AssessmentLayout staff>
    <Link to="/admin/stories">← Story studio</Link><h1>Cloze answer review</h1>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Loading…</p>}
    {!busy && !items.length && !review && <p>No answers waiting for review.</p>}
    {!review && items.map((a) => <section className="assessment-card" key={a.id}>
      <h2>{a.story.title}</h2><p>Student: {a.studentId} · Week {a.week}</p>
      <button disabled={busy} onClick={() => open(a.id)}>Review answers</button>
    </section>)}
    {review && <section className="assessment-card">
      <h2>{review.title} · {review.studentId}</h2>
      <p>Paste detected: {review.pasteAttempted ? "Yes" : "No"} (informational only)</p>
      {pending.map((a) => {
        const q = review.questions.find((q) => q.id === a.questionId);
        return <fieldset key={a.questionId}><legend>{q?.prompt}</legend>
          <p>Student response: <span lang="kn">{a.response}</span></p>
          <p>Expected answer: <span lang="kn">{q?.correctAnswer}</span></p>
          {[true, false].map((correct) => <label key={String(correct)}>
            <input type="radio" name={a.questionId} checked={decisions[a.questionId] === correct}
              onChange={() => setDecisions({ ...decisions, [a.questionId]: correct })} />
            {correct ? "Accept" : "Mark incorrect"}
          </label>)}
        </fieldset>;
      })}
      <label>Review note<textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} /></label>
      <button disabled={busy || !note.trim() || pending.some((a) => decisions[a.questionId] === undefined)} onClick={save}>Save review</button>
      <button disabled={busy} onClick={() => setReview(null)}>Back to queue</button>
    </section>}
  </AssessmentLayout>;
}
