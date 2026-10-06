import React, { useEffect, useState } from "react";
import Layout from "./Layout";
import { call, errorText } from "./api";
export default function Student() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(weekId) {
    setBusy(true);
    setError("");
    try {
      setData(await call("spPortal", { weekId }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <Layout>
      <div className="sp-page-title">
        <h1>My reading</h1>
        {data && <span>{data.name}</span>}
      </div>
      {error && (
        <p role="alert" className="sp-error">
          {error}{" "}
          <button className="sp-secondary" onClick={() => load()}>
            Retry
          </button>
        </p>
      )}
      {!data && busy && <p role="status">Loading reading…</p>}
      {data && (
        <div className="sp-reader">
          <div className="sp-row">
            <span>Week of {data.reading?.week || "—"}</span>
            <button
              className="sp-secondary"
              disabled={busy}
              onClick={() => load()}
            >
              This week
            </button>
          </div>
          {data.reading ? (
            <article aria-busy={busy}>
              <h2 lang="kn">{data.reading.title}</h2>
              <p className="sp-kannada" lang="kn">
                {data.reading.body}
              </p>
              <p className="sp-reading-instruction">
                Read this paragraph and prepare to speak about it in class.
              </p>
            </article>
          ) : (
            <p>Your teacher has not published a reading for you yet.</p>
          )}
          {data.weeks.length > 1 && (
            <details>
              <summary>Previous weeks</summary>
              <ul className="sp-history">
                {data.weeks.slice(1).map((w) => (
                  <li key={w.id}>
                    <button
                      className="sp-secondary"
                      aria-pressed={data.reading?.id === w.id}
                      disabled={busy}
                      onClick={() => load(w.id)}
                    >
                      {w.week} · {w.topic}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Layout>
  );
}
