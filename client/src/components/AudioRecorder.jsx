import React, { useState, useEffect } from "react";
import { ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebaseConfig";
import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "http://localhost:5050";

export default function AudioRecorder({ refText, storyId, week }) {
  const [recorder, setRecorder] = useState(null);
  const [blob, setBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [studentName, setStudentName] = useState("");
  const [center, setCenter] = useState("");
  const [transcript, setTranscript] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

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
    if (recorder && recorder.state === "inactive") recorder.start();
  };

  const stopRecording = () => {
    if (recorder && recorder.state === "recording") recorder.stop();
  };

  const uploadAndScore = async () => {
    if (!blob || !center || !studentName) {
      alert("Fill name, center, and record audio first.");
      return;
    }
    setLoading(true);
    try {
      const filename = `${center}_${studentName}_week${week || "NA"}_${Date.now()}.webm`;
      await uploadBytes(ref(storage, filename), blob);

      const formData = new FormData();
      formData.append("audio", blob, filename);
      const tr = await axios.post(`${BACKEND}/api/transcribe`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const transcription = tr.data?.transcription || "";
      const confidenceRaw = tr.data?.confidence || "";
      setTranscript(transcription);

      const confidenceArr = String(confidenceRaw)
        .trim()
        .split(/\s+/)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));

      const payload = {
        transcription,
        confidence: confidenceArr,
        ...(refText ? { refText } : {}),
        ...(storyId ? { storyId } : {}),
        ...(week ? { week } : {}),
      };

      const sc = await axios.post(`${BACKEND}/api/metrics/score-all`, payload, {
        headers: { "Content-Type": "application/json" },
      });
      setMetrics(sc.data || null);
    } catch (e) {
      console.error(e);
      alert("Upload or scoring failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="recordForm">
      <h3>Record</h3>

      <label>Name:</label>
      <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} required />

      <div style={{ marginTop: 8 }}>
        <label>Center:</label>{" "}
        <label><input type="radio" value="CUP" onChange={(e) => setCenter(e.target.value)} name="center" /> CUP</label>{" "}
        <label><input type="radio" value="MIL" onChange={(e) => setCenter(e.target.value)} name="center" /> MIL</label>{" "}
        <label><input type="radio" value="FRE" onChange={(e) => setCenter(e.target.value)} name="center" /> FRE</label>
      </div>

      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={startRecording}>Record</button>{" "}
        <button type="button" onClick={stopRecording}>Stop</button>{" "}
        <button type="button" onClick={uploadAndScore} disabled={loading}>
          {loading ? "Scoring..." : "Upload & Score"}
        </button>
      </div>

      {audioUrl && <audio style={{ marginTop: 10 }} controls src={audioUrl} />}

      {transcript && (
        <div style={{ marginTop: 16, background: "#f7f7f7", padding: 10, borderRadius: 8 }}>
          <h4>Transcription</h4>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{transcript}</pre>
        </div>
      )}

      {metrics && (
        <div style={{ marginTop: 16, background: "#eef6ff", padding: 10, borderRadius: 8 }}>
          <h4>Metrics</h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td>NLED</td><td>{metrics.nled?.value?.toFixed(3)}</td></tr>
              <tr><td>LDR</td><td>{metrics.ldr?.value?.toFixed(3)}</td></tr>
              <tr><td>Match Ratio</td><td>{metrics.match_ratio?.value?.toFixed(3)}</td></tr>
              <tr><td>ASR Confidence</td><td>{metrics.asr_confidence?.value?.toFixed(3)}</td></tr>
              <tr><td>Suffix Accuracy</td><td>{metrics.suffix_accuracy?.value?.toFixed(3)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </form>
  );
}
