import React, { useState } from "react";
import { Link } from "react-router-dom";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import Layout from "./Layout";
export default function TeacherLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      const { claims } = await user.getIdTokenResult(true);
      if (!["admin", "coordinator", "volunteer"].includes(claims.role)) {
        await signOut(auth);
        setError("A teacher account is required.");
      }
    } catch {
      setError("Could not sign in. Check your email and password.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout signedIn={false}>
      <section className="sp-login">
        <h1>Teacher login</h1>
        <form onSubmit={login}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="sp-error">
              {error}
            </p>
          )}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          <Link to="/app">Student login</Link>
        </form>
      </section>
    </Layout>
  );
}
