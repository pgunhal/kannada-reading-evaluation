import React, { useState } from "react";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [parentName, setParentName] = useState("");
  const [center, setCenter] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

const handleSignup = async (e) => {
  e.preventDefault();

  // ✅ Confirmation dialog
  const confirm = window.confirm(
    "By creating an account, you agree that you have signed the waiver and consent to recording and storage as defined in the waiver."
  );

  if (!confirm) {
    return; // stop signup if they click "Cancel"
  }

  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCred.user, { displayName: name });

    // Save extra info to Firestore
    await setDoc(doc(db, "users", userCred.user.uid), {
      name,
      parentName,
      center,
      email,
    });

    alert("Account created successfully!");
    navigate("/"); // redirect to login after signup
  } catch (err) {
    setError(err.message);
  }
};


  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "linear-gradient(95deg, #f3e40eb8 50%, #a10303d5 50%)",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "40px",
          borderRadius: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          width: "100%",
          maxWidth: "450px",
          textAlign: "center",
        }}
      >
        <h2
          style={{
            marginBottom: "20px",
            fontSize: "28px",
            fontWeight: "bold",
            textAlign: "center",
          }}
        >
          Create Account
        </h2>

        {error && <div style={{ color: "red", marginBottom: "10px" }}>{error}</div>}

<form
  onSubmit={handleSignup}
  style={{
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  }}
>
  <input
    type="text"
    placeholder="Student Name"
    value={name}
    onChange={(e) => setName(e.target.value)}
    required
    style={{
      padding: "12px",
      borderRadius: "8px",
      border: "1px solid #ccc",
      width: "100%",
      boxSizing: "border-box",
      display: "block",
    }}
  />

  <input
    type="text"
    placeholder="Parent's Name"
    value={parentName}
    onChange={(e) => setParentName(e.target.value)}
    required
    style={{
      padding: "12px",
      borderRadius: "8px",
      border: "1px solid #ccc",
      width: "100%",
      boxSizing: "border-box",
      display: "block",
    }}
  />

  <select
    value={center}
    onChange={(e) => setCenter(e.target.value)}
    required
    style={{
      padding: "12px",
      borderRadius: "8px",
      border: "1px solid #ccc",
      width: "100%",
      boxSizing: "border-box",
      display: "block",
      backgroundColor: "#fff",
      appearance: "none", // makes dropdown behave more like input
    }}
  >
    <option value="">Select Center</option>
    <option value="Cupertino">Cupertino</option>
    <option value="Milpitas">Milpitas</option>
  </select>

  <input
    type="email"
    placeholder="Email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    required
    style={{
      padding: "12px",
      borderRadius: "8px",
      border: "1px solid #ccc",
      width: "100%",
      boxSizing: "border-box",
      display: "block",
    }}
  />

  <input
    type="password"
    placeholder="Password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    required
    style={{
      padding: "12px",
      borderRadius: "8px",
      border: "1px solid #ccc",
      width: "100%",
      boxSizing: "border-box",
      display: "block",
    }}
  />

  <button
    type="submit"
    style={{
      padding: "12px",
      background: "#5cb85c",
      color: "#fff",
      fontWeight: "bold",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      marginTop: "10px",
      fontSize: "16px",
      width: "100%",
    }}
  >
    Sign Up
  </button>
</form>


        {/* 🔹 Navigation back to login */}
        <p style={{ marginTop: "15px" }}>
          Already have an account?{" "}
          <span
            onClick={() => navigate("/")}
            style={{ color: "#5cb85c", cursor: "pointer", fontWeight: "bold" }}
          >
            Login
          </span>
        </p>
      </div>
    </div>
  );
}
