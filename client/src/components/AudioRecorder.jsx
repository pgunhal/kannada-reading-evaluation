import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "../firebaseConfig";
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
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { terminateAsrWorker, transcribeInWorker } from "../lib/asrWorkerClient";
import { combinedTextScore } from "../lib/textScoring";

const LOCAL_ASR_WEIGHT = 0.7;
const ACOUSTIC_WEIGHT = 0.3;
const COMBINED_PASS_THRESHOLD = 0.68;

export default function AudioRecorder({ storyId, week, user, onScoreSaved, refText }) {
  const [recorder, setRecorder] = useState(null);
  const [blob, setBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const audioStreamRef = useRef(null);
  const audioUrlRef = useRef("");

  useEffect(() => {
    if (audioUrlRef.current && audioUrlRef.current !== audioUrl) {
      URL.revokeObjectURL(audioUrlRef.current);
    }
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  // mediarecorder
  useEffect(() => {
    let mediaRecorder;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      audioStreamRef.current = stream;
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
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      terminateAsrWorker();
    };
  }, []);

  const startRecording = () => {
    setMetrics(null);
    setErrMsg("");
    if (recorder && recorder.state === "inactive") recorder.start();
  };

  const stopRecording = () => {
    if (recorder && recorder.state === "recording") recorder.stop();
  };

  //  Silence trimming 
  function trimSilence(data, threshold = 0.01) {
    let start = 0,
      end = data.length - 1;
    while (start < end && Math.abs(data[start]) < threshold) start++;
    while (end > start && Math.abs(data[end]) < threshold) end--;
    return data.slice(start, end + 1);
  }

  //  RMS energy check 
  function rmsEnergy(data) {
    return Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length);
  }

  //  FFT helper 
  function fftMag(signal) {
    const N = signal.length;
    const re = signal.slice();
    const im = new Array(N).fill(0);

    for (let k = 0; k < N; k++) {
      let sumRe = 0,
        sumIm = 0;
      for (let n = 0; n < N; n++) {
        const angle = (-2 * Math.PI * k * n) / N;
        sumRe += signal[n] * Math.cos(angle);
        sumIm += signal[n] * Math.sin(angle);
      }
      re[k] = sumRe;
      im[k] = sumIm;
    }
    return re.map((r, i) => Math.sqrt(r * r + im[i] * im[i]));
  }

async function decodeAudioBlob(sourceBlob) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const ctx = new Context();
  try {
    const arrayBuffer = await sourceBlob.arrayBuffer();
    const decodedAudio = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channelData = decodedAudio.getChannelData(0);

    return {
      sampleRate: decodedAudio.sampleRate,
      duration: decodedAudio.duration,
      audioData: new Float32Array(channelData),
    };
  } finally {
    await ctx.close();
  }
}

async function resampleTo16k(float32Audio, sampleRate) {
  if (sampleRate === 16000) return new Float32Array(float32Audio);

  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) {
    const resampleRatio = sampleRate / 16000;
    const targetLength = Math.max(1, Math.round(float32Audio.length / resampleRatio));
    const output = new Float32Array(targetLength);
    for (let index = 0; index < targetLength; index += 1) {
      output[index] = float32Audio[Math.min(float32Audio.length - 1, Math.round(index * resampleRatio))];
    }
    return output;
  }

  const frameCount = Math.ceil((float32Audio.length * 16000) / sampleRate);
  const offlineContext = new OfflineContext(1, frameCount, 16000);
  const buffer = offlineContext.createBuffer(1, float32Audio.length, sampleRate);
  buffer.copyToChannel(float32Audio, 0);

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineContext.destination);
  source.start(0);

  const renderedBuffer = await offlineContext.startRendering();
  return new Float32Array(renderedBuffer.getChannelData(0));
}

//  crude MFCC extractor with checks + explicit cleanup
async function extractMFCC(blob) {
  const { duration, audioData } = await decodeAudioBlob(blob);
  let data = audioData;

  // reject too short recordings
  if (duration < 1.0) {
    throw new Error("Recording too short. Please try again.");
  }

  // trim silence
  data = trimSilence(data);

  // reject silent recordings
  const energy = rmsEnergy(data);
  if (energy < 0.01) {
    throw new Error("Recording contains no speech.");
  }

  const frameSize = 512, hop = 256;
  const mfccs = [];
  for (let i = 0; i + frameSize < data.length; i += hop) {
    const frame = data.slice(i, i + frameSize);
    const mags = fftMag(frame);

    // take log energies of first 20 bins, then crude DCT
    const logBins = mags.slice(0, 20).map((x) => Math.log(1 + x));
    const coeffs = new Array(13).fill(0);
    for (let k = 0; k < 13; k++) {
      coeffs[k] = logBins.reduce(
        (a, b, n) => a + b * Math.cos((Math.PI * k * n) / 20),
        0
      );
    }
    mfccs.push(coeffs);
  }

  // ✅ explicit cleanup
  data = null;

  return mfccs;
}



  //  Euclidean distance 
  function euclidean(a, b) {
    let s = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return Math.sqrt(s);
  }

  //  DTW with normalized cost 
  function dtwDistance(seq1, seq2) {
    const n = seq1.length,
      m = seq2.length;
    const dp = Array.from({ length: n + 1 }, () =>
      Array(m + 1).fill(Infinity)
    );
    dp[0][0] = 0;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const dist = euclidean(seq1[i - 1], seq2[j - 1]);
        dp[i][j] =
          dist + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }

    const rawCost = dp[n][m];
    const avgLen = (n + m) / 2;
    return rawCost / avgLen;
  }

  //  compare & score 
  const compareAndScore = async () => {
    if (!blob) {
      alert("Please record first.");
      return;
    }
    setLoading(true);
    setErrMsg("");
    let studentPcm = null;
    let transcriptText = "";
    let previewUrl = audioUrl;
    try {
      // 1. get reference audio from Firebase
      const refPath = `references/${storyId || "default"}.webm`;
      const refUrl = await getDownloadURL(storageRef(storage, refPath));
      const refResp = await fetch(refUrl);
      const refBlob = await refResp.blob();

      const decodedStudent = await decodeAudioBlob(blob);
      studentPcm = await resampleTo16k(decodedStudent.audioData, decodedStudent.sampleRate);

      // 2. MFCCs (with checks)
      const studentMFCC = await extractMFCC(blob);
      if (studentMFCC.length < 5) {
        throw new Error("Recording too short or invalid.");
      }
      const refMFCC = await extractMFCC(refBlob);

      // enforce relative length requirement
      if (studentMFCC.length < 0.7 * refMFCC.length) {
        throw new Error("Recording too short compared to reference.");
      }

      // 3. DTW + stricter similarity
      const normCost = dtwDistance(studentMFCC, refMFCC);
      const alpha = 0.02; // stricter
      const similarity = Math.exp(-alpha * normCost);

      // penalize by length ratio
      const lenRatio =
        Math.min(studentMFCC.length, refMFCC.length) /
        Math.max(studentMFCC.length, refMFCC.length);
      const acousticScore = similarity * lenRatio;

      let textScore = null;
      let transcriptMode = "acoustic_only";

      try {
        const workerInput = new Float32Array(studentPcm);
        const transcription = await transcribeInWorker(workerInput);
        transcriptText = transcription?.text || "";
        if (transcriptText && refText) {
          textScore = combinedTextScore({
            hypothesis: transcriptText,
            reference: refText,
            avgLogProb: transcription?.avgLogProb,
          });
          transcriptMode = "local_asr";
        }
      } catch (error) {
        textScore = null;
      }

      const combinedScore = textScore
        ? (textScore.value * LOCAL_ASR_WEIGHT) + (acousticScore * ACOUSTIC_WEIGHT)
        : acousticScore;
      const threshold = textScore ? COMBINED_PASS_THRESHOLD : 0.7;
      const passed = combinedScore >= threshold;

      setMetrics({
        combined: { value: combinedScore, passed, threshold },
        acoustic: { value: acousticScore },
        text: textScore,
        mode: transcriptMode,
      });

      // 4. Save only anonymized score data
      if (user) {
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
            score: Math.max(existing.score || 0, combinedScore),
            updatedAt: serverTimestamp(),
          });
        } else {
          await addDoc(scoresRef, {
            uid: user.uid,            // only UID stored
            week: week || "NA",
            score: combinedScore,
            passed,
            attempts: 1,
            createdAt: serverTimestamp(),
          });
        }

        if (onScoreSaved) onScoreSaved();
      }


      // cleanup
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setBlob(null); 
      setAudioUrl("");
    } catch (e) {
      setErrMsg(e.message || "Scoring failed.");
    } finally {
      if (studentPcm && studentPcm.buffer.byteLength > 0) studentPcm.fill(0);
      studentPcm = null;
      transcriptText = "";
      previewUrl = "";
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
    <li><b>Click Compare & Score </b> to process speech on this device and see your score.</li>
    <li>A <b>70% score</b> is required to pass.</li>
    <li>Only your score is saved. The recording stays on this device and is deleted after scoring.</li>
    <li>Re-record attempts are <b>counted</b>, but do not lower the score.</li>
    <li>If there is a technical issue, email <b>kkalisite@gmail.com</b> for support.</li>

  </ul>
</div>      <div style={{ marginBottom: 12 }}>
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
        {/* <button onClick={startRecording}>Record</button>
        <button onClick={stopRecording}>Stop</button> */}
        <button onClick={compareAndScore} disabled={loading}>
          {loading ? "Scoring..." : "Compare & Score"}
        </button>
      </div>
      {audioUrl && (
        <audio style={{ marginTop: 15, width: "100%" }} controls src={audioUrl} />
      )}
      {errMsg && (
        <div style={{ marginTop: 12, color: "#b00020" }}>{errMsg}</div>
      )}
      {metrics && (
        <div
          style={{
            marginTop: 16,
            background: passed ? "#eaf7ea" : "#fdeaea",
            padding: 12,
            borderRadius: 8,
          }}
        >
          <h4>Combined Score</h4>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {combined?.toFixed(3)} {passed ? "✓ Pass" : "✗ Try again"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Threshold: {threshold.toFixed(2)}
          </div>
          {metrics.text && (
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
              Text score {metrics.text.value.toFixed(3)} + acoustic score {metrics.acoustic.value.toFixed(3)}
            </div>
          )}
          {!metrics.text && (
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
              Device ASR unavailable, using acoustic-only fallback for this attempt.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
