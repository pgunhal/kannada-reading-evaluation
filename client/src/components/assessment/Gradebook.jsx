import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebaseConfig";
import AssessmentLayout from "./AssessmentLayout";

const percent = (score) => score === null ? "—" : `${Math.round(score * 100)}%`;
const status = (attempt) => attempt.needsReview ? "Pending" : attempt.score !== null ? (attempt.passed ? "Passed" : "Not passed") : attempt.status === "quiz" ? "Taking quiz" : "Reading";
export default function Gradebook() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [classId, setClassId] = useState("");
  const [selected, setSelected] = useState(null);
  const load = async () => {
    setBusy(true); setError("");
    try { setData((await httpsCallable(functions, "getGradebook")({})).data); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  const student = data?.students.find((s) => `${s.classId}:${s.id}` === selected);
  return <AssessmentLayout staff>
    {selected && <button className="text-button back-link" onClick={() => setSelected(null)}>← Gradebook</button>}
    <div className="section-heading studio-heading"><h1>{student ? student.name : "Gradebook"}</h1><button className="secondary-button" disabled={busy} onClick={load}>{busy ? "Refreshing…" : "Refresh"}</button></div>
    {error && <p role="alert" className="notice">{error}</p>}
    {!data && !error && <p role="status">Loading gradebook…</p>}
    {data && (student ? <section className="class-gradebook">
      <div className="section-heading library-heading"><h2>Attempt history</h2><span className="library-count">{student.className} · {student.missingCount} missing</span></div>
      {!student.history.length ? <p>No attempts yet.</p> : <div className="gradebook-wrap"><table className="gradebook"><thead><tr><th>Story</th><th>Attempt</th><th>Status</th><th>Score</th><th>Submitted</th></tr></thead><tbody>{student.history.map((a) => <tr key={a.id}><td lang="kn">{a.title}</td><td>{a.attemptNumber} / 3</td><td>{status(a)}</td><td>{percent(a.score)}</td><td>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>}
    </section> : <>
      {data.classes.length > 1 && <label className="gradebook-filter">Class<select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">All classes</option>{data.classes.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}
      <section className="class-gradebook">{!data.students.length ? <p>No students yet.</p> : <div className="gradebook-wrap"><table className="gradebook"><caption className="gradebook-caption">Highest score per story</caption><thead><tr><th>Student</th><th>Missing</th>{data.stories.map((s) => <th lang="kn" key={s.id}>{s.title}</th>)}</tr></thead><tbody>{data.students.filter((s) => !classId || s.classId === classId).map((s) => <tr key={`${s.classId}:${s.id}`}><td><button className="text-button student-link" onClick={() => setSelected(`${s.classId}:${s.id}`)}>{s.name}</button>{data.classes.length > 1 && <small>{s.className}</small>}</td><td>{s.missingCount}</td>{data.stories.map((story) => {const result = s.results.find((r) => r.storyId === story.id);return <td key={story.id}>{!result ? <span aria-label="Not assigned">—</span> : result.highestScore !== null ? <span className={result.highestScore >= .7 ? "score-passed" : "score-failed"}>{percent(result.highestScore)}</span> : <span className={result.missing ? "missing" : ""}>{result.missing ? "Missing" : "Pending"}{result.status === "in_progress" && <small>In progress</small>}</span>}</td>;})}</tr>)}</tbody></table></div>}</section>
    </>)}
  </AssessmentLayout>;
}
