import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebaseConfig";
import useReadingProtection from "./useReadingProtection";
import useActiveReading from "./useActiveReading";
import AssessmentLayout from "./AssessmentLayout";

const call = async (name, payload) => (await httpsCallable(functions, name)(payload)).data;
export default function Assessment() {
  const { storyId } = useParams();
  return <AssessmentScreen key={storyId} storyId={storyId} />;
}
function AssessmentScreen({ storyId }) {
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [screen, setScreen] = useState("reading");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pasteLogged = useRef(false);
  const timer = useActiveReading(attempt, screen === "reading" && attempt?.status === "reading");
  const logPaste = useCallback(() => {
    if (!attempt || pasteLogged.current) return;
    pasteLogged.current = true;
    call("logPasteAttempt", { attemptId: attempt.attemptId }).catch(() => { pasteLogged.current = false; });
  }, [attempt]);
  useReadingProtection(Boolean(attempt && screen !== "result"), logPaste);

  useEffect(() => {
    let cancelled = false;
    call("startReading", { storyId }).then((next) => {
      if (cancelled) return;
      setAttempt(next);
      if (["graded", "pending_review"].includes(next.status)) setResult(next);
      try { setAnswers(JSON.parse(sessionStorage.getItem(`quiz-answers:${next.attemptId}`) || "{}")); } catch { setAnswers({}); }
    }).catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [storyId]);
  const run = async (operation) => {
    setBusy(true); setError("");
    try { await operation(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const assign = () => run(async () => {
    const next = await call("assignQuiz", { attemptId: attempt.attemptId });
    setAttempt(next);
    if (["graded", "pending_review"].includes(next.status)) { setResult(next); setScreen("result"); }
    else setScreen("quiz");
  });
  const submit = () => run(async () => {
    const next = await call("submitAttempt", { attemptId: attempt.attemptId,
      answers: attempt.questions.map((q) => ({ questionId: q.id, response: answers[q.id] || "" })) });
    setResult(next); setScreen("result");
    setAttempt({ ...attempt, status: next.needsReview ? "pending_review" : "graded" });
    sessionStorage.removeItem(`quiz-answers:${attempt.attemptId}`);
  });
  const retry = () => run(async () => {
    const next = await call("startReading", { storyId, retryFromAttemptId: attempt.attemptId });
    setAttempt(next); setAnswers({}); setResult(null); setQuestionIndex(0); setScreen("reading"); pasteLogged.current = false;
  });
  const choose = (id, response) => {
    const next = { ...answers, [id]: response }; setAnswers(next);
    sessionStorage.setItem(`quiz-answers:${attempt.attemptId}`, JSON.stringify(next));
  };
  const q = attempt?.questions?.[questionIndex];
  return <AssessmentLayout>
    <Link className="back-link" to="/app">← All stories</Link>
    {error && <p className="notice" role="alert">{error}</p>}
    {!attempt && !error && <section className="reading-paper"><p role="status">Opening story…</p></section>}
    {attempt && <>
      <div className="reading-heading"><div><h1 lang="kn">{attempt.story.title}</h1></div><span className="attempt-badge">Attempt {attempt.attemptNumber} of 3</span></div>
      <nav className="lesson-steps" aria-label="Lesson sections">
        <button aria-current={screen === "reading" ? "step" : undefined} onClick={() => setScreen("reading")}><span>1</span> Read story</button>
        <button aria-current={screen === "quiz" ? "step" : undefined} disabled={busy || !!result || (attempt.status === "reading" && timer.remaining > 0)} onClick={assign}><span>2</span> Quiz</button>
        <button aria-current={screen === "result" ? "step" : undefined} disabled={!result} onClick={() => setScreen("result")}><span>3</span> Results</button>
      </nav>
      {screen === "reading" && <div className="reading-layout reading-view"><article className="reading-paper"><p className="kannada-passage" lang="kn">{attempt.story.body}</p></article>
        <aside className="reading-aside"><h2>{result ? "You’ve read this story" : "After reading"}</h2>
          {attempt.status === "reading" && <><div className="timer-row"><strong>{timer.remaining === 0 ? "Ready for the quiz" : `${timer.remaining} seconds left`}</strong><span className="timer-dot" data-active={timer.active} /></div><progress aria-label="Reading progress" value={attempt.minSeconds - timer.remaining} max={attempt.minSeconds} />{(timer.remaining === 0 || !timer.active) && <p className="muted">{timer.remaining === 0 ? "You can start the quiz now." : "Paused. Return to this page to continue reading."}</p>}{timer.error && <p role="alert">{timer.error}</p>}</>}
          {result ? <><button className="primary-button" onClick={() => setScreen("result")}>View result →</button>{result.canRetry && <button className="secondary-button" disabled={busy} onClick={retry}>Try again</button>}</> : <button className="primary-button" disabled={busy || (attempt.status === "reading" && timer.remaining > 0)} onClick={assign}>{busy ? "Opening…" : attempt.status === "quiz" ? "Resume quiz →" : "Start quiz →"}</button>}
          
        </aside>
      </div>}
      {screen === "quiz" && q && <section className="quiz-panel quiz-view"><div className="quiz-topline"><span className="eyebrow">QUESTION {questionIndex + 1} OF {attempt.questions.length}</span><button className="text-button" onClick={() => setScreen("reading")}>Read the story again</button></div>
        <progress aria-label="Quiz progress" value={Object.keys(answers).length} max={attempt.questions.length} />
        <fieldset className="question-fieldset" disabled={busy}><legend lang="kn">{q.prompt}</legend><div className="answer-options">{(q.type === "true_false" ? ["true", "false"] : q.options || []).map((option, index) => <label className={`answer-option ${answers[q.id] === option ? "selected" : ""}`} key={option}>
          <input type="radio" name={`answer-${q.id}`} value={option} checked={answers[q.id] === option} onChange={() => choose(q.id, option)} /><span className="option-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span className="option-text" lang={q.type === "true_false" ? "en" : "kn"}>{q.type === "true_false" ? (option === "true" ? "True" : "False") : option}</span><span className="option-check" aria-hidden="true">{answers[q.id] === option ? "✓" : ""}</span>
        </label>)}</div></fieldset>
        <div className="quiz-actions"><button className="secondary-button" disabled={busy || questionIndex === 0} onClick={() => setQuestionIndex(questionIndex - 1)}>← Previous</button><span>{Object.keys(answers).length} of {attempt.questions.length} answered</span>{questionIndex < attempt.questions.length - 1 ? <button className="primary-button" disabled={!answers[q.id]} onClick={() => setQuestionIndex(questionIndex + 1)}>Next question →</button> : <button className="primary-button" disabled={busy || attempt.questions.some((item) => !answers[item.id])} onClick={submit}>{busy ? "Checking…" : "Submit answers"}</button>}</div>
      </section>}
      {screen === "result" && result && <section className="result-panel" aria-live="polite"><div className={`result-symbol ${result.passed ? "passed" : ""}`} aria-hidden="true">{result.passed ? "✓" : "↗"}</div><p className="eyebrow">ATTEMPT {result.attemptNumber} OF 3</p><h2>{result.needsReview ? "Your teacher will review this" : result.passed ? "Well done!" : "Let’s try again"}</h2>{!result.needsReview && <div className="result-score">{Math.round(result.score * 100)}<span>%</span></div>}<p>{result.passed ? "You’ve completed this story. Choose another one to read." : result.canRetry ? `Read the story again, then give it another go. You have ${3 - result.attemptNumber} ${result.attemptNumber === 2 ? "attempt" : "attempts"} left.` : result.needsReview ? "Waiting for teacher review." : "You’ve used all 3 attempts. You can still reread the story or choose another one."}</p><div className="result-actions">{result.canRetry && <button className="primary-button" disabled={busy} onClick={retry}>{busy ? "Preparing…" : "Read & try again"}</button>}<button className="secondary-button" onClick={() => setScreen("reading")}>Read the story again</button><Link className="secondary-button" to="/app">All stories</Link></div></section>}
    </>}
  </AssessmentLayout>;
}
