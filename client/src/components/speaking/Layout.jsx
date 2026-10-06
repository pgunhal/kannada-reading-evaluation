import React from "react";
import { NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import "./speaking.css";
export default function Layout({ children, staff = false, signedIn = true }) {
  return (
    <div className="speaking-app">
      <header>
        <NavLink className="sp-brand" to={staff ? "/admin/curriculum" : "/app"}>
          ಕನ್ನಡ ಕಲಿ
        </NavLink>
        {staff && (
          <nav aria-label="Teacher navigation">
            <NavLink to="/admin/curriculum">Curriculum</NavLink>
            <NavLink to="/admin/roster">Roster</NavLink>
            <NavLink to="/admin/gradebook">Gradebook</NavLink>
          </nav>
        )}
        {signedIn ? (
          <button className="sp-secondary" onClick={() => signOut(auth)}>
            Sign out
          </button>
        ) : (
          <NavLink to="/admin/login">Teacher login</NavLink>
        )}
      </header>
      <main>{children}</main>
    </div>
  );
}
