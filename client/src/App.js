import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/speaking/Login";
import Student from "./components/speaking/Student";
import Teacher from "./components/speaking/Teacher";
import TeacherLogin from "./components/speaking/TeacherLogin";
import Layout from "./components/speaking/Layout";
export default function App() {
  const [session, setSession] = useState({ loading: true });
  useEffect(() => {
    let version = 0;
    const unsub = onAuthStateChanged(auth, async (user) => {
      const revision = ++version;
      setSession({ loading: true });
      try {
        const claims = user ? (await user.getIdTokenResult(true)).claims : {};
        if (revision === version) setSession({ user, claims });
      } catch {
        if (revision === version)
          setSession({
            error: "Unable to verify your login. Reload to try again.",
          });
      }
    });
    return () => {
      version++;
      unsub();
    };
  }, []);
  if (session.loading) return <p role="status">Loading…</p>;
  if (session.error) return <p role="alert">{session.error}</p>;
  const staff = ["admin", "coordinator", "volunteer"].includes(
    session.claims.role,
  );
  const student = session.claims.role === "speaking_student";
  const studentPage = staff ? (
    <Navigate to="/admin/curriculum" replace />
  ) : student ? (
    <Student />
  ) : !session.user ? (
    <Login />
  ) : (
    <Layout>
      <h1>Student login required</h1>
      <p>Sign out and use your class, name, and PIN.</p>
    </Layout>
  );
  const teacherPage = staff ? <Teacher /> : <TeacherLogin />;
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={studentPage} />
        <Route path="/app" element={studentPage} />
        <Route
          path="/admin/login"
          element={
            staff ? (
              <Navigate to="/admin/curriculum" replace />
            ) : (
              <TeacherLogin />
            )
          }
        />
        <Route path="/admin/curriculum" element={teacherPage} />
        <Route path="/admin/roster" element={teacherPage} />
        <Route path="/admin/gradebook" element={teacherPage} />
        <Route
          path="/admin/stories"
          element={<Navigate to="/admin/curriculum" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
