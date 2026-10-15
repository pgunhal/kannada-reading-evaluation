import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Layout from "./Layout";
import { call, currentWeek, errorText } from "./api";

export default function Teacher() {
  const path = useLocation().pathname;
  const mode = path.endsWith("roster")
    ? "roster"
    : path.endsWith("gradebook")
      ? "gradebook"
      : "curriculum";
  const [classes, setClasses] = useState([]);
  const [classId, setClass] = useState("");
  const [data, setData] = useState(null);
  const [weekId, setWeek] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (id) => {
    const result = await call("spTeacher", { action: "load", classId: id });
    setData(result);
    setWeek((old) =>
      result.weeks.some((w) => w.id === old)
        ? old
        : result.weeks.find(
            (w) =>
              w.status === "published" &&
              w.week <= new Date().toISOString().slice(0, 10),
          )?.id ||
          result.weeks[0]?.id ||
          "",
    );
  }, []);
  useEffect(() => {
    let active = true;
    call("spTeacher", { action: "classes" })
      .then((result) => {
        if (active) {
          setClasses(result.classes);
          setClass(result.classes[0]?.id || "");
        }
      })
      .catch((e) => active && setError(errorText(e)));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!classId) return;
    setData(null);
    setBusy(true);
    refresh(classId)
      .catch((e) => setError(errorText(e)))
      .finally(() => setBusy(false));
  }, [classId, refresh]);
  async function run(payload, endpoint = "spTeacher") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await call(endpoint, { classId, ...payload });
      await refresh(classId);
      if (result.id && payload.action !== "student") setWeek(result.id);
      setNotice("Saved.");
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const selected = data?.weeks.find((w) => w.id === weekId);
  return (
    <Layout staff>
      <div className="sp-page-title">
        <h1>
          {
            {
              curriculum: "Curriculum",
              roster: "Roster",
              gradebook: "Gradebook",
            }[mode]
          }
        </h1>
        <label>
          Class
          <select
            aria-label="Class"
            disabled={busy}
            value={classId}
            onChange={(e) => {
              setError("");
              setClass(e.target.value);
            }}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="sp-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="sp-success">
          {notice}
        </p>
      )}
      {!classId && <p>No class is assigned to this teacher.</p>}
      {classId && !data && <p role="status">Loading class…</p>}
      {data && (
        <>
          {mode === "roster" ? (
            <Roster students={data.students} busy={busy} run={run} />
          ) : (
            <>
              <div className="sp-toolbar">
                <label>
                  Week
                  <select
                    aria-label="Week"
                    disabled={busy}
                    value={weekId}
                    onChange={(e) => {
                      setWeek(e.target.value);
                      setNotice("");
                    }}
                  >
                    <option value="">Select a week</option>
                    {data.weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.week} · {w.topic} ·{" "}
                        {w.status === "draft" ? "Draft" : "Published"}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={busy}
                  className="sp-secondary"
                  onClick={() => {
                    setBusy(true);
                    refresh(classId)
                      .catch((e) => setError(errorText(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  Refresh
                </button>
              </div>
              {mode === "curriculum" && (
                <>
                  <NewWeek run={run} busy={busy} />
                  {selected && (
                    <Curriculum
                      key={`${selected.id}:${selected.revision}`}
                      week={selected}
                      students={data.students}
                      run={run}
                      busy={busy}
                    />
                  )}
                </>
              )}
              {mode === "gradebook" && (
                <Gradebook
                  key={weekId}
                  data={data}
                  selected={selected}
                  run={run}
                  busy={busy}
                />
              )}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
function NewWeek({ run, busy }) {
  const [date, setDate] = useState(currentWeek());
  const [topic, setTopic] = useState("Older Kannada film actors (Rajkumar era)");
  const [count, setCount] = useState(10);
  return (
    <details className="sp-panel sp-create">
      <summary>New week</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run({ week: date, topic, count }, "spGenerate");
        }}
      >
        <div className="sp-form-row">
          <label>
            Week of
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label>
            Topic
            <input
              required
              aria-label="Topic"
              list="topics"
              value={topic}
              maxLength={200}
              onChange={(e) => setTopic(e.target.value)}
            />
            <datalist id="topics">
              {[
                "Older Kannada film actors (Rajkumar era)",
                "Poets of Karnataka",
                "Festivals of Karnataka",
                "Navaratri and Mysuru Dasara",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </datalist>
          </label>
          <label>
            Paragraphs
            <select
              aria-label="Paragraphs"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[10, 11, 12, 13, 14, 15].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="sp-actions">
          <button disabled={busy}>
            {busy ? "Working…" : "Generate draft"}
          </button>
          <button
            type="button"
            className="sp-secondary"
            disabled={busy || !date || !topic.trim()}
            onClick={() => run({ action: "create", week: date, topic })}
          >
            Start a blank draft
          </button>
        </div>
      </form>
    </details>
  );
}
function Curriculum({ week, students, run, busy }) {
  const empty = Array.from({ length: 10 }, (_, i) => ({
    id: `p${i + 1}`,
    title: "",
    body: "",
    questions: ["", "", "", ""],
  }));
  const [paragraphs, setParagraphs] = useState(
    week.paragraphs.length ? week.paragraphs : empty,
  );
  const [index, setIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [assignments, setAssignments] = useState(week.assignments);
  const p = paragraphs[index];
  const draft = week.status === "draft";
  const change = (patch) => {
    setParagraphs(
      paragraphs.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
    setDirty(true);
    setReviewed(false);
  };
  const request = (payload) =>
    run({ week: week.week, revision: week.revision, ...payload });
  return (
    <section className="sp-panel">
      <div className="sp-row">
        <h2>{week.topic}</h2>
        <span className={`sp-badge ${draft ? "draft" : "published"}`}>
          {week.source === "hand-authored-preview" ? "Sample · " : ""}
          {draft ? "Draft" : "Published"}
          {dirty ? " · Unsaved" : ""}
        </span>
      </div>
      <div className="sp-editor">
        <aside aria-label="Paragraphs">
          {paragraphs.map((p, i) => (
            <button
              className={i === index ? "selected" : "sp-secondary"}
              key={p.id}
              onClick={() => setIndex(i)}
            >
              {i + 1}. <span lang="kn">{p.title || "Untitled"}</span>
            </button>
          ))}
        </aside>
        <div className="sp-fields">
          {draft ? (
            <fieldset disabled={busy}>
              <label>
                Title
                <input
                  lang="kn"
                  value={p.title}
                  maxLength={150}
                  onChange={(e) => change({ title: e.target.value })}
                />
              </label>
              <label>
                Kannada paragraph
                <textarea
                  lang="kn"
                  rows={7}
                  value={p.body}
                  onChange={(e) => change({ body: e.target.value })}
                />
              </label>
              <h3>Questions to ask in class</h3>
              {p.questions.map((q, i) => (
                <label key={i}>
                  Question {i + 1}
                  <textarea
                    lang="kn"
                    rows={2}
                    value={q}
                    onChange={(e) =>
                      change({
                        questions: p.questions.map((q, j) =>
                          i === j ? e.target.value : q,
                        ),
                      })
                    }
                  />
                </label>
              ))}
              <button
                disabled={!dirty}
                onClick={() => request({ action: "save", paragraphs })}
              >
                Save draft
              </button>
            </fieldset>
          ) : (
            <>
              <h3 lang="kn">{p.title}</h3>
              <p className="sp-kannada" lang="kn">
                {p.body}
              </p>
              <h3>Questions to ask in class</h3>
              <ol lang="kn" className="sp-questions">
                {p.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
      <h3>Assignments</h3>
      <div className="sp-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Paragraph</th>
            </tr>
          </thead>
          <tbody>
            {students
              .filter((s) => s.active)
              .map((s) => (
                <tr key={s.id}>
                  <td>{s.displayName}</td>
                  <td>
                    <select
                      aria-label={`Paragraph for ${s.displayName}`}
                      disabled={busy || dirty}
                      value={assignments[s.id] || ""}
                      onChange={(e) =>
                        setAssignments({
                          ...assignments,
                          [s.id]: e.target.value,
                        })
                      }
                    >
                      <option value="">Not assigned</option>
                      {week.paragraphs.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="sp-actions">
        <button
          className="sp-secondary"
          disabled={busy || dirty || !week.paragraphs.length}
          onClick={() => request({ action: "assign" })}
        >
          Auto-assign
        </button>
        <button
          className="sp-secondary"
          disabled={busy || dirty || !week.paragraphs.length}
          onClick={() => request({ action: "assign", assignments })}
        >
          Save assignments
        </button>
      </div>
      {draft && (
        <div className="sp-publish">
          <label className="sp-checkbox">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I have reviewed every paragraph and question.
          </label>
          <button
            disabled={busy || dirty || !reviewed || !week.paragraphs.length}
            onClick={() =>
              request({
                action: "publish",
                reviewed,
                assignments: Object.keys(assignments).length
                  ? assignments
                  : undefined,
              })
            }
          >
            Publish week
          </button>
        </div>
      )}
    </section>
  );
}
function Roster({ students, run, busy }) {
  const [firstName, setFirst] = useState("");
  const [lastInitial, setLast] = useState("");
  const [pin, setPin] = useState("");
  const [resetId, setReset] = useState("");
  const [newPin, setNewPin] = useState("");
  return (
    <section className="sp-panel">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run({ action: "student", firstName, lastInitial, pin })) {
            setFirst("");
            setLast("");
            setPin("");
          }
        }}
      >
        <h2>Add student</h2>
        <div className="sp-form-row">
          <label>
            First name
            <input
              required
              value={firstName}
              maxLength={60}
              onChange={(e) => setFirst(e.target.value)}
            />
          </label>
          <label>
            Last initial
            <input
              required
              value={lastInitial}
              maxLength={1}
              onChange={(e) => setLast(e.target.value)}
            />
          </label>
          <label>
            4-digit PIN
            <input
              required
              type="password"
              autoComplete="new-password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        </div>
        <button disabled={busy}>Add student</button>
      </form>
      <div className="sp-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td>{s.displayName}</td>
                <td>
                  <button
                    className="sp-secondary"
                    disabled={busy}
                    onClick={() => {
                      setReset(s.id);
                      setNewPin("");
                    }}
                  >
                    Reset PIN
                  </button>
                  {resetId === s.id && (
                    <form
                      className="sp-inline"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                          await run({
                            action: "pin",
                            studentId: s.id,
                            pin: newPin,
                          })
                        ) {
                          setReset("");
                          setNewPin("");
                        }
                      }}
                    >
                      <label>
                        New PIN
                        <input
                          required
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]{4}"
                          maxLength={4}
                          value={newPin}
                          onChange={(e) =>
                            setNewPin(e.target.value.replace(/\D/g, ""))
                          }
                        />
                      </label>
                      <button disabled={busy}>Save PIN</button>
                      <button
                        type="button"
                        className="sp-secondary"
                        onClick={() => setReset("")}
                      >
                        Cancel
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Gradebook({ data, selected, run, busy }) {
  const [studentId, setStudent] = useState("");
  const [score, setScore] = useState("");
  const activeStudent = data.students.find((s) => s.id === studentId);
  const paragraph = selected?.paragraphs.find(
    (p) => p.id === selected.assignments[studentId],
  );
  function open(s) {
    setStudent(s.id);
    setScore(
      String(
        data.grades.find(
          (g) => g.weekId === selected?.id && g.studentId === s.id,
        )?.score || "",
      ),
    );
  }
  return (
    <section className="sp-panel">
      <div className="sp-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Assigned reading</th>
              <th>Grade / 10</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => {
              const p = selected?.paragraphs.find(
                (p) => p.id === selected.assignments[s.id],
              );
              const grade = data.grades.find(
                (g) => g.weekId === selected?.id && g.studentId === s.id,
              );
              return (
                <tr key={s.id}>
                  <td>
                    <button className="sp-link" onClick={() => open(s)}>
                      {s.displayName}
                    </button>
                  </td>
                  <td lang="kn">{p?.title || "Not assigned"}</td>
                  <td>
                    {grade ? (
                      <span className="sp-badge published">{grade.score}</span>
                    ) : (
                      <span className="sp-badge draft">
                        {p && selected.status === "published"
                          ? "Not presented"
                          : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {activeStudent && (
        <section className="sp-student-grade">
          <div className="sp-row">
            <h2>{activeStudent.displayName}</h2>
            <button className="sp-secondary" onClick={() => setStudent("")}>
              Close
            </button>
          </div>
          {paragraph && (
            <>
              <h3 lang="kn">{paragraph.title}</h3>
              <p lang="kn" className="sp-kannada">
                {paragraph.body}
              </p>
              <h3>Questions to ask in class</h3>
              <ol className="sp-questions" lang="kn">
                {paragraph.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ol>
              {selected.status === "published" && (
                <form
                  className="sp-inline"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run({
                      action: "grade",
                      week: selected.week,
                      revision: selected.revision,
                      studentId,
                      score: Number(score),
                    });
                  }}
                >
                  <label>
                    Grade (1–10)
                    <select
                      aria-label="Grade (1–10)"
                      required
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                    >
                      <option value="">Not presented</option>
                      {Array.from({ length: 10 }, (_, i) => (
                        <option key={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy || !score}>Save grade</button>
                </form>
              )}
            </>
          )}
          <h3>Weekly history</h3>
          <ul className="sp-history">
            {data.weeks
              .filter(
                (w) => w.status === "published" && w.assignments[studentId],
              )
              .map((w) => (
                <li key={w.id}>
                  {w.week} · {w.topic} —{" "}
                  <strong>
                    {data.grades.find(
                      (g) => g.weekId === w.id && g.studentId === studentId,
                    )?.score ?? "Not presented"}
                  </strong>
                </li>
              ))}
          </ul>
        </section>
      )}
    </section>
  );
}
