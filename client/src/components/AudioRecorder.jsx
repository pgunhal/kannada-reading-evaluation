import React, { useState, useEffect } from "react";
import { ref, uploadBytes } from "firebase/storage";
import { storage } from "../firebaseConfig";
import axios from "axios";

export default function AudioRecorder() {
  const [recorder, setRecorder] = useState(null);
  const [blob, setBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [studentName, setStudentName] = useState("");
  const [center, setCenter] = useState("");
  const [transcript, setTranscript] = useState("");

  const week = 100;

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm", // Chrome/Edge
      });
      let chunks = [];

      mediaRecorder.ondataavailable = (e) => {
        chunks.push(e.data);
        if (mediaRecorder.state === "inactive") {
          const fullBlob = new Blob(chunks, { type: "audio/webm" });
          setBlob(fullBlob);
          setAudioUrl(URL.createObjectURL(fullBlob));
        }
      };

      setRecorder(mediaRecorder);
    });
  }, []);

  const startRecording = () => {
    setTranscript("");
    recorder.start();
  };

  const stopRecording = () => {
    recorder.stop();
  };

  const uploadAudio = async () => {
    if (!blob || !center || !studentName) {
      alert("Fill out all fields and record audio first.");
      return;
    }

    // Convert audio/webm blob to LINEAR16 WAV using backend or FFmpeg if needed
    // In this case, just send it as webm but tell backend to interpret correctly

    const filename = `${center}_${studentName}_week${week}_${Date.now()}.webm`;
    const audioRef = ref(storage, filename);

    try {
      await uploadBytes(audioRef, blob);
      alert("Uploaded to Firebase!");

      const formData = new FormData();
      formData.append("audio", blob, filename);

      const res = await axios.post("http://localhost:5050/api/transcribe", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setTranscript(res.data.transcription || "No transcription received.");
    } catch (err) {
      console.error("Upload/transcribe failed:", err);
      alert("Upload or transcription failed.");
    }
  };

  return (
    <form id="recordForm">
      <h3>Record</h3>
      <label>Name:</label>
      <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} required />

      <div>
        <label>Center:</label>
        <label>
          <input type="radio" value="CUP" onChange={(e) => setCenter(e.target.value)} name="center" /> CUP
        </label>
        <label>
          <input type="radio" value="MIL" onChange={(e) => setCenter(e.target.value)} name="center" /> MIL
        </label>
        <label>
          <input type="radio" value="FRE" onChange={(e) => setCenter(e.target.value)} name="center" /> FRE
        </label>
      </div>

      <button type="button" onClick={startRecording}>Record</button>
      <button type="button" onClick={stopRecording}>Stop</button>

      {audioUrl && <audio controls src={audioUrl} />}

      <button type="button" onClick={uploadAudio}>Upload</button>

      {transcript && (
        <div style={{ marginTop: "20px", backgroundColor: "#f0f0f0", padding: "10px", borderRadius: "8px" }}>
          <h4>Transcription:</h4>
          <pre style={{ whiteSpace: "pre-wrap" }}>{transcript}</pre>
        </div>
      )}
    </form>
  );
}
