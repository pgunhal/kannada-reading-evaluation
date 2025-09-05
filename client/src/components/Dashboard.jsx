import React, { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, query, where, getDocs } from "firebase/firestore";
import StoryViewer from "./StoryViewer";



export default function Dashboard({ user }) {

  const [scores, setScores] = useState([]);

  const fetchScores = async () => {
    if (!user) return;
    const q = query(collection(db, "scores"), where("uid", "==", user.uid));
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setScores(data.sort((a, b) => b.week - a.week)); // newest first
  };

  useEffect(() => {
    fetchScores();
  }, [user]);

  return (
    <div style={{ padding: 20 }}>
<h1 style={{ marginBottom: 20 }}>
  <div
    style={{
      display: "inline-block",
      background: "#fff",
      padding: "12px 24px",
      borderRadius: 12,
      boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
      fontWeight: "600",
      fontSize: "1.5rem",
      color: "#333", // softer text
    }}
  >
    Welcome, {user.displayName || user.email}
  </div>
</h1>

      {/* Reading activity */}
      <StoryViewer user={user} onScoreSaved={fetchScores} />

      {/* Scores Dashboard */}
      <div style={{ marginTop: 40 }}>
        <h2>Your Reading Scores</h2>
        <div
          style={{
            marginTop: 20,
            background: "#fff",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}
        >
          {scores.length === 0 ? (
            <p>No scores yet. Record your first reading!</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 16
              }}
            >
              {scores.map((s) => (
                <div
                  key={s.id}
                  style={{
                    backgroundColor: s.score > 0.7 ? "#eaf7ea" : "#fdeaea", // ✅ dynamic background
                    border: "1px solid #eee",
                    borderRadius: 10,
                    padding: 16,
                    textAlign: "center"
                  }}
                >
                  <h3 style={{ margin: 0 }}>Week {s.week}</h3>
                  <p style={{ fontSize: 18, fontWeight: "bold", margin: "8px 0" }}>
                    {s.score?.toFixed(3)}
                  </p>
                  <p style={{ fontSize: 14, margin: 0, color: "#666" }}>
                    Attempts: {s.attempts}
                  </p>
                  <p style={{ fontSize: 12, opacity: 0.7 }}>
                    Threshold: 0.70
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
