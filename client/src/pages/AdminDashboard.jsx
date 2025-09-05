import React, { useEffect, useState } from "react";
import { db, auth } from "../firebaseConfig";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";

export default function AdminDashboard() {
  const [week, setWeek] = useState("");
  const [stories, setStories] = useState([]);
  const [selectedStory, setSelectedStory] = useState("");
  const [studentScores, setStudentScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  // 🔹 Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (!user) {
        navigate("/admin/login");
        return;
      }
      const token = await user.getIdTokenResult(true);
      if (!token.claims.isAdmin) {
        alert("Access denied: Admins only");
        navigate("/");
      } else {
        setLoading(false);
      }
    };
    checkAdmin();
  }, [navigate]);

  // 🔹 Load stories
  useEffect(() => {
    async function loadStories() {
      const snapshot = await getDocs(collection(db, "stories"));
      const storyList = [];
      snapshot.forEach((doc) => {
        storyList.push({ id: doc.id, title: doc.data().title });
      });
      setStories(storyList);
    }
    loadStories();
  }, []);

  // 🔹 Save story/week via callable function
  const handleSetWeekStory = async () => {
    if (!week || !selectedStory) return alert("Fill both fields");

    try {
      const setStory = httpsCallable(functions, "setWeekStory");
      await setStory({ week, storyName: selectedStory });

      alert("Week and Story updated!");
    } catch (err) {
      console.error("Error setting story:", err);
      alert("Failed to update story: " + err.message);
    }
  };

  // 🔹 Load users + scores and join them
  const fetchData = async () => {
    // load users
    const userSnap = await getDocs(collection(db, "users"));
    const userMap = {};
    userSnap.forEach((doc) => {
      userMap[doc.id] = doc.data(); // { name, parentName, center, email }
    });

    // load scores
    const scoreSnap = await getDocs(collection(db, "scores"));
    const scores = scoreSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const grouped = {};
    scores.forEach((s) => {
      if (!grouped[s.uid])
        grouped[s.uid] = { weeks: {}, attempts: {}, total: 0, count: 0 };
      grouped[s.uid].weeks[s.week] = s.score;
      grouped[s.uid].attempts[s.week] = s.attempts;
      grouped[s.uid].total += s.score;
      grouped[s.uid].count += 1;
    });

    // join with userMap
    const students = Object.entries(grouped).map(([uid, data]) => ({
      uid,
      user: userMap[uid] || null,
      weeks: data.weeks,
      attempts: data.attempts,
      average: data.total / data.count,
      weekCount: Object.keys(data.weeks).length,
    }));

    setStudentScores(students);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return <div>Checking admin permissions...</div>;
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      {/* Title in white card */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          marginBottom: 30,
          boxShadow: "0 3px 10px rgba(0,0,0,0.12)",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: "bold" }}>
          Teacher Dashboard
        </h1>
      </div>

      {/* Manage story */}
      <div
        style={{
          background: "#fff",
          padding: 24,
          borderRadius: 12,
          marginBottom: 30,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <h2 style={{ marginBottom: 20 }}>Set Story</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            type="number"
            placeholder="Week #"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            style={{
              flex: "1",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              minWidth: 120,
            }}
          />
          <select
            onChange={(e) => setSelectedStory(e.target.value)}
            value={selectedStory}
            style={{
              flex: "2",
              padding: "10px 12px",
              border: "1px solid #ccc",
              borderRadius: 8,
              minWidth: 200,
            }}
          >
            <option value="">Select story</option>
            {stories.map((story) => (
              <option key={story.id} value={story.id}>
                {story.title}
              </option>
            ))}
          </select>
          <button
            onClick={handleSetWeekStory}
            style={{
              flexShrink: 0,
              padding: "10px 20px",
              background: "#5cb85c",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Set Week & Story
          </button>
        </div>
      </div>

      {/* Student performance */}
      <div
        style={{
          background: "#fff",
          padding: 24,
          borderRadius: 12,
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <h2 style={{ marginBottom: 20 }}>Student Scores</h2>
        {studentScores.length === 0 ? (
          <p>No scores yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            {studentScores.map((s) => (
              <div
                key={s.uid}
                style={{
                  background: "#fafafa",
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 16,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                }}
              >
                <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: "600" }}>
                  {s.user ? s.user.name : s.uid}
                </h3>
                {s.user && (
                  <p style={{ margin: "2px 0", fontSize: 14, color: "#555" }}>
                    Parent: {s.user.parentName} | Center: {s.user.center}
                  </p>
                )}
                <p style={{ margin: "4px 0" }}>
                  <b>Average:</b> {s.average.toFixed(3)}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <b>Weeks Recorded:</b> {s.weekCount}
                </p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {Object.entries(s.weeks).map(([week, score]) => (
                    <div
                      key={week}
                      style={{
                        flex: "0 0 160px",
                        padding: 14,
                        borderRadius: 8,
                        background: score > 0.7 ? "#eaf7ea" : "#fdeaea",
                        border: "1px solid #ddd",
                        textAlign: "center",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <h4 style={{ margin: 0, fontSize: 16 }}>Week {week}</h4>
                      <p
                        style={{
                          margin: "6px 0",
                          fontWeight: "bold",
                          fontSize: 16,
                        }}
                      >
                        {score.toFixed(3)}
                      </p>
                      <p style={{ fontSize: 12, margin: 0, color: "#555" }}>
                        Attempts: {s.attempts[week]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
