import React from "react";
import AudioRecorder from "../components/AudioRecorder";

export default function Home() {
  return (
    <div id="mainContent">
      <h1>ಕನ್ನಡ ಕಲಿ</h1>
      <AudioRecorder />
      <button onClick={() => window.location.href = "/admin/login"}>Admin Login</button>
    </div>
  );
}
