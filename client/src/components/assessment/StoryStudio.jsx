import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebaseConfig";
import AssessmentLayout from "./AssessmentLayout";
const call = async (name, payload = {}) => (await httpsCallable(functions, name)(payload)).data;
const statusLabel = (status) => ({published:"Published",draft:"Draft",reading:"Reading",quiz:"Taking quiz",graded:"Completed",pending_review:"Needs review"})[status] || status;

export default function StoryStudio() {
  const [stories, setStories] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("passage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const load = async () => { const data = await call("listCmsStories"); data.sort((a,b) => a.week-b.week); setStories(data); return data; };
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  const run = async (operation) => {
    setBusy(true); setError(""); setSaved(false);
    try { await operation(); } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const edit = (changes) => { setSelected({...selected,...changes}); setSaved(false);setDirty(true); };
  const switchStory = (story) => {
    if (dirty && !window.confirm("Discard unsaved changes and open another story?")) return;
    setSelected({...story}); setSaved(false);setDirty(false);setTab("passage");setError("");
  };
  const save = () => run(async () => {
    await call("saveCmsStory", {storyId:selected.id,title:selected.title,body:selected.body,status:selected.status,questions:selected.questions});
    const all = await load(); setSelected(all.find((s) => s.id === selected.id)); setSaved(true); setDirty(false);
  });
  const create = () => {
    if (dirty && !window.confirm("Discard unsaved changes and create a new story?")) return;
    run(async () => { const {storyId} = await call("createCmsStory"); const all = await load(); setSelected(all.find((s) => s.id === storyId));setTab("passage");setDirty(false); });
  };
  const updateQuestion = (index, changes) => edit({questions:selected.questions.map((q,i) => i === index ? {...q,...changes} : q)});
  const addQuestion = () => edit({questions:[...selected.questions,{id:`new-${crypto.randomUUID()}`,type:"mcq",difficulty:"easy",prompt:"",options:["","","",""],correctAnswer:""}]});
  const refresh = () => run(async () => {
    const all = await load(); const current = all.find((s) => s.id === selected.id);
    // Preserve unsaved authoring while refreshing only attempt history.
    setSelected({...selected,attempts:current.attempts});
  });
  return <AssessmentLayout staff>
    <div className="section-heading studio-heading"><h1>Story studio</h1><button className="primary-button" disabled={busy} onClick={create}>+ New story</button></div>
    {error && <p role="alert" className="notice">{error}</p>}
    {!stories && !error && <p role="status">Loading stories…</p>}
    <div className="studio-layout"><aside className="studio-list" aria-label="Stories">{stories?.map((s) => <button disabled={busy} key={s.id} className={selected?.id === s.id ? "chosen" : ""} onClick={() => switchStory(s)}><span className="eyebrow">WEEK {s.week} · {statusLabel(s.status)}</span><strong lang="kn">{s.title}</strong><small>{s.questions.length} questions</small></button>)}</aside>
      <section className="studio-editor" aria-busy={busy}><fieldset className="studio-disabled-group" disabled={busy}>{!selected ? <div className="empty-state"><h2>Select a story</h2></div> : <>
        <div className="studio-toolbar"><div className="filter-tabs"><button aria-pressed={tab === "passage"} onClick={() => setTab("passage")}>Passage</button><button aria-pressed={tab === "questions"} onClick={() => setTab("questions")}>Questions ({selected.questions.length})</button><button aria-pressed={tab === "progress"} onClick={() => setTab("progress")}>Student progress</button></div><span className="status-pill">{dirty ? "Unsaved changes" : statusLabel(selected.status)}</span></div>
        {saved && <p role="status" className="save-confirmation">Changes saved.</p>}
        {tab === "passage" ? <div className="studio-form"><label>Title<input lang="kn" value={selected.title} onChange={(e) => edit({title:e.target.value})} /></label><label>Passage<textarea lang="kn" rows={12} value={selected.body} onChange={(e) => edit({body:e.target.value})} /></label><label>Publication<select aria-label="Publication" value={selected.status} onChange={(e) => edit({status:e.target.value})}><option value="published">Published — visible to students</option><option value="draft">Draft — hidden from students</option></select></label><button className="primary-button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button></div>
          : tab === "progress" ? <><button className="secondary-button" disabled={busy} onClick={refresh}>Refresh progress</button>{!selected.attempts?.length ? <p className="muted">No attempts yet.</p> : <div className="gradebook-wrap"><table className="gradebook"><thead><tr><th>Student</th><th>Attempt</th><th>Status</th><th>Score</th></tr></thead><tbody>{selected.attempts.map((a) => <tr key={a.id}><td>{a.studentId === "demo-student" ? "Demo student" : a.studentId}</td><td>{a.attemptNumber} / 3</td><td>{a.passed ? "Passed" : a.status === "graded" ? "Not passed" : statusLabel(a.status)}</td><td>{a.score === null ? "—" : `${Math.round(a.score * 100)}%`}</td></tr>)}</tbody></table></div>}</>
          : <>{selected.questions.map((q,i) => <article className="bank-question studio-form" key={q.id}><div className="question-editor-top"><strong>Question {i+1}</strong><button className="text-button" disabled={busy} onClick={() => {if(window.confirm("Remove this question? The change takes effect when saved.")) edit({questions:selected.questions.filter((_,index) => index !== i)});}}>Remove</button></div><div className="question-settings"><label>Type<select aria-label="Type" value={q.type} onChange={(e) => updateQuestion(i,e.target.value === "true_false" ? {type:e.target.value,correctAnswer:"true",options:undefined} : {type:e.target.value,options:q.options || ["","","",""],correctAnswer:q.options ? q.correctAnswer : ""})}><option value="mcq">Multiple choice</option><option value="true_false">True / false</option><option value="cloze">Choose the missing word</option></select></label><label>Difficulty<select aria-label="Difficulty" value={q.difficulty} onChange={(e) => updateQuestion(i,{difficulty:e.target.value})}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></div><label>Question<textarea rows={2} lang="kn" value={q.prompt} onChange={(e) => updateQuestion(i,{prompt:e.target.value})} /></label>{q.type !== "true_false" && <div className="question-settings">{(q.options || []).map((option,j) => <label key={j}>Choice {j+1}<input value={option} lang="kn" onChange={(e) => updateQuestion(i,{options:q.options.map((o,index) => index === j ? e.target.value : o),correctAnswer:q.correctAnswer === option ? e.target.value : q.correctAnswer})} /></label>)}</div>}<label>Correct answer<select aria-label="Correct answer" value={q.correctAnswer} onChange={(e) => updateQuestion(i,{correctAnswer:e.target.value})}>{q.type === "true_false" ? <><option value="true">True</option><option value="false">False</option></> : <><option value="">Select the answer</option>{(q.options || []).filter(Boolean).map((option,j) => <option key={j} value={option}>{option}</option>)}</>}</select></label></article>)}<div className="studio-savebar"><button className="secondary-button" disabled={busy} onClick={addQuestion}>+ Add question</button><button className="primary-button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save changes"}</button></div></>}
      </>}</fieldset></section>
    </div>
  </AssessmentLayout>;
}
