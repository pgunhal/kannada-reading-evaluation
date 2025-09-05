import React, { useState, useEffect } from "react";
import { ref, uploadBytes } from "firebase/storage";
import {
  db,
  storage
} from "../firebaseConfig";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5050";

export default function AudioRecorder({ refText, storyId, week, user, onScoreSaved }) {
  const [recorder, setRecorder] = useState(null);
  const [blob, setBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [startTime, setStartTime] = useState(null);
  const [durationSec, setDurationSec] = useState(0);

  useEffect(() => {
    let mediaRecorder;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      let chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        chunks.push(e.data);
        if (mediaRecorder.state === "inactive") {
          const fullBlob = new Blob(chunks, { type: "audio/webm" });
          setBlob(fullBlob);
          setAudioUrl(URL.createObjectURL(fullBlob));
          chunks = [];
        }
      };
      setRecorder(mediaRecorder);
    });
    return () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    };
  }, []);

  const startRecording = () => {
    setTranscript("");
    setMetrics(null);
    setErrMsg("");
    if (recorder && recorder.state === "inactive") {
      setStartTime(Date.now());
      recorder.start();
    }
  };

  const stopRecording = () => {
    if (recorder && recorder.state === "recording") {
      recorder.stop();
      if (startTime) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        setDurationSec(elapsed);
      }
    }
  };

  const uploadAndScore = async () => {
    if (!blob) {
      alert("Please record first.");
      return;
    }
    setLoading(true);
    setErrMsg("");
    try {
      const filename = `${user.uid}_week${week}_${Date.now()}.webm`;
      await uploadBytes(ref(storage, filename), blob);

      const formData = new FormData();
      formData.append("audio", blob, filename);
      formData.append("durationSec", durationSec);

      // 🔵 Call backend for STT
      const tr = await axios.post(`${BACKEND}/api/transcribe`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const transcription = tr.data?.transcription || "";
      setTranscript(transcription);

      const payload = {
        transcription,
        ...(refText ? { refText } : {}),
        ...(storyId ? { storyId } : {}),
        ...(week ? { week } : {}),
      };

      // 🔵 Call backend for scoring
      const sc = await axios.post(`${BACKEND}/api/metrics/score-all`, payload, {
        headers: { "Content-Type": "application/json" },
      });

      setMetrics(sc.data || null);

// ✅ Save to Firestore
if (sc.data && user) {
  const scoresRef = collection(db, "scores");
  const q = query(
    scoresRef,
    where("uid", "==", user.uid),
    where("week", "==", week || "NA")
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    const existingDoc = snap.docs[0];
    const existing = existingDoc.data();
    await updateDoc(doc(db, "scores", existingDoc.id), {
      attempts: (existing.attempts || 0) + 1,
      score: Math.max(existing.score || 0, sc.data.combined?.value || 0),
      updatedAt: serverTimestamp(),
      name: user.displayName || "",   // 🔹 store student name
    });
  } else {
    await addDoc(scoresRef, {
      uid: user.uid,
      name: user.displayName || "",   // 🔹 store student name
      week: week || "NA",
      score: sc.data.combined?.value || 0,
      passed: sc.data.combined?.passed || false,
      attempts: 1,
      createdAt: serverTimestamp(),
    });
  }

  if (onScoreSaved) onScoreSaved(); // notify Dashboard to refresh
}

    } catch (e) {
      console.error(e);
      setErrMsg(e?.response?.data?.error || "Upload or scoring failed.");
    } finally {
      setLoading(false);
    }
  };

  const combined = metrics?.combined?.value ?? null;
  const passed = metrics?.combined?.passed ?? null;
  const threshold = metrics?.combined?.threshold ?? 0.7;

  return (
    <div
      style={{
        marginTop: 30,
        background: "#fff",
        padding: 20,
        borderRadius: 12,
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <h3>Record</h3>

      <div
  style={{
    background: "#f9f9f9",
    padding: "16px 20px",
    borderRadius: 8,
    border: "1px solid #eee",
    marginBottom: 16,
    fontSize: 14,
    color: "#444",
    lineHeight: 1.6,
    textAlign: "left", // ✅ force left alignment
  }}
>
  <ul style={{ margin: 0, paddingLeft: "20px", listStyleType: "disc" }}>
    <li><b>Click Record </b> to start recording.</li>
    <li><b>Click Stop </b> to end recording. Your audio will appear below.</li>
    <li><b>Click Upload & Score </b> to submit and see your score.</li>
    <li>A <b>70% score</b> is required to pass.</li>
    <li>Scores are uploaded <b>automatically</b> (reload page to show).</li>
    <li>Re-record attempts are <b>counted</b>, but do not lower the score.</li>
    <li>If there is a technical issue, email <b>kkalisite@gmail.com</b> for support.</li>

  </ul>
</div>



      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button
          type="button"
          onClick={startRecording}
          style={{ flex: 1, background: "#d9534f", color: "#fff", padding: "10px", border: "none", borderRadius: 8 }}
        >
          Record
        </button>
        <button
          type="button"
          onClick={stopRecording}
          style={{ flex: 1, background: "#6c757d", color: "#fff", padding: "10px", border: "none", borderRadius: 8 }}
        >
          Stop
        </button>
        <button
          type="button"
          onClick={uploadAndScore}
          disabled={loading}
          style={{ flex: 1, background: "#5cb85c", color: "#fff", padding: "10px", border: "none", borderRadius: 8 }}
        >
          {loading ? "Scoring..." : "Upload & Score"}
        </button>
      </div>

      {audioUrl && <audio style={{ marginTop: 15, width: "100%" }} controls src={audioUrl} />}
      {errMsg && <div style={{ marginTop: 12, color: "#b00020" }}>{errMsg}</div>}

      {metrics && (
        <div
          style={{
            marginTop: 16,
            background: passed ? "#eaf7ea" : "#fdeaea",
            padding: 12,
            borderRadius: 8,
            border: `1px solid ${passed ? "#5fa85f" : "#d66"}`,
          }}
        >
          <h4 style={{ marginTop: 0 }}>Combined Score</h4>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {combined?.toFixed(3)} {passed ? "✓ Pass" : "✗ Try again"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Threshold: {threshold.toFixed(2)}</div>

          {/* {!passed && transcript && (
            <div style={{ marginTop: 16, background: "#fff3f3", padding: 10, borderRadius: 8 }}>
              <h4>Transcription</h4>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{transcript}</pre>
            </div>
          )} */}
        </div>
      )}
    </div>
  );
}
