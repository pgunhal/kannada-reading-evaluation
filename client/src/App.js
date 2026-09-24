// App.js
import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import LoginPage from "./components/LoginPage";
import SignupPage from "./components/SignupPage";

import AdminLogin from "./pages/AdminLogin";
import StoryStudio from "./components/assessment/StoryStudio";
import Gradebook from "./components/assessment/Gradebook";
import Assessment from "./components/assessment/Assessment";
import AssessmentHome from "./components/assessment/AssessmentHome";
import AssessmentLayout from "./components/assessment/AssessmentLayout";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claims, setClaims] = useState({});
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let revision = 0;
    const unsub = onAuthStateChanged(auth, async (u) => {
      const current = ++revision;
      setLoading(true);
      setAuthError("");
      try {
        const nextClaims = u ? (await u.getIdTokenResult(true)).claims : {};
        if (current !== revision) return;
        setUser(u);
        setClaims(nextClaims);
      } catch (error) {
        if (current === revision) setAuthError(error.message);
      } finally {
        if (current === revision) setLoading(false);
      }
    });
    return () => { revision++; unsub(); };
  }, []);

  if (loading) return <div>Loading...</div>;
  if (authError) return <p role="alert">Unable to load your account: {authError}</p>;

  const staff = ["volunteer", "coordinator", "admin"].includes(claims.role);
  const enrolled = claims.role === "student" && claims.studentId && claims.classId && claims.centerId;
  const refreshMembership = async () => {
    try { setClaims((await user.getIdTokenResult(true)).claims); }
    catch (error) { setAuthError(error.message); }
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={user ? <Navigate to={staff ? "/admin/stories" : "/app"} replace /> : <LoginPage />} />
        <Route path="/app" element={!user ? <LoginPage /> : staff ? <Navigate to="/admin/stories" replace /> : enrolled ? <AssessmentHome /> :
          <AssessmentLayout><h1>Dashboard</h1><p>Your account needs a class assignment. Ask your teacher to add you to a class.</p><button className="primary-button" onClick={refreshMembership}>Refresh access</button></AssessmentLayout>} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/app/stories/:storyId" element={user ? <Assessment /> : <LoginPage />} />
        <Route path="/admin/stories" element={user ? <StoryStudio /> : <AdminLogin />} />
        <Route path="/admin/gradebook" element={user ? <Gradebook /> : <AdminLogin />} />
        <Route path="/admin/reviews" element={<Navigate to="/admin/gradebook" replace />} />

        {/* ===== Teacher/Admin routes ===== */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<Navigate to="/admin/stories" replace />} />

        {/* ===== Catch-all redirect ===== */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
