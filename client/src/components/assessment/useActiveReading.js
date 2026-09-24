import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebaseConfig";

export default function useActiveReading(attempt, enabled) {
  const [remaining, setRemaining] = useState(attempt?.remainingSeconds || 0);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const attemptId = attempt?.attemptId;
  const initialRemaining = attempt?.remainingSeconds || 0;
  useEffect(() => {
    setRemaining(initialRemaining);
    setError("");
    if (!attemptId || !enabled || initialRemaining === 0) {
      setActive(false);
      return undefined;
    }
    let alive = true;
    let session = null;
    let chain = Promise.resolve();
    let confirmed = initialRemaining;
    const send = (current, activeMs, sequence) => {
      chain = chain.then(async () => {
        const { data } = await httpsCallable(functions, "readingHeartbeat")({
          attemptId, sessionId: current.id, sequence, activeMs,
        });
        if (alive && session === current) {
          confirmed = data.remainingSeconds;
          setRemaining(confirmed);
          setError("");
          if (confirmed === 0) session = null;
        }
      }).catch((err) => {
        if (alive) setError("Couldn’t save reading progress. Check your connection and reopen this page.");
      });
    };
    const collect = () => {
      if (!session) return;
      const now = performance.now();
      // Long scheduling gaps (sleep/suspended device) never count as reading.
      const elapsed = now - session.last;
      if (elapsed < 1500) session.pending += elapsed;
      session.last = now;
    };
    const flush = () => {
      if (!session || session.pending <= 0) return;
      const ms = Math.min(3000, Math.floor(session.pending));
      session.pending = 0;
      send(session, ms, ++session.sequence);
    };
    const updateFocus = () => {
      const visible = document.visibilityState === "visible" && document.hasFocus();
      if (visible && !session && confirmed > 0) {
        session = { id: crypto.randomUUID(), sequence: 0, pending: 0, last: performance.now() };
        send(session, 0, 0);
      } else if (!visible && session) {
        collect(); flush(); session = null;
      }
      if (alive) setActive(visible);
    };
    updateFocus();
    const tick = setInterval(() => {
      if (!session || document.visibilityState !== "visible" || !document.hasFocus()) return;
      collect();
      if (session.pending >= 1900) flush();
    }, 250);
    document.addEventListener("visibilitychange", updateFocus);
    window.addEventListener("focus", updateFocus);
    window.addEventListener("blur", updateFocus);
    return () => {
      collect(); flush(); alive = false; session = null;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", updateFocus);
      window.removeEventListener("focus", updateFocus);
      window.removeEventListener("blur", updateFocus);
    };
  }, [attemptId, initialRemaining, enabled]);
  return { remaining, active, error };
}
