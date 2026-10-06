import React, { useState } from "react";
import {
  signInWithCustomToken,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { call, errorText } from "./api";
import Layout from "./Layout";
export default function Login() {
  const [className, setClass] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = await call("spLogin", { className, name, pin });
      await setPersistence(auth, browserSessionPersistence);
      await signInWithCustomToken(auth, token);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Layout signedIn={false}>
      <section className="sp-login">
        <h1>Student login</h1>
        <form onSubmit={submit}>
          <label>
            Class
            <input
              required
              autoComplete="organization"
              value={className}
              onChange={(e) => setClass(e.target.value)}
              placeholder="e.g. Speaking Demo"
              maxLength={50}
            />
          </label>
          <label>
            First name + last initial
            <input
              required
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ananya R"
              maxLength={100}
            />
          </label>
          <label>
            4-digit PIN
            <input
              required
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4}"
              autoComplete="current-password"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          {error && (
            <p role="alert" className="sp-error">
              {error}
            </p>
          )}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </Layout>
  );
}
