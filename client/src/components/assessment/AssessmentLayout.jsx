import React from "react";
import { Link, NavLink } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import "./assessment.css";

export function BookIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1m0-14c3-2 6-2 9-1v14c-3-1-6-1-9 1V6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}
export default function AssessmentLayout({ children, staff = false }) {
  return <div className="assessment-app">
    <header className="learning-header">
      <Link className="learning-brand" to={staff ? "/admin/stories" : "/app"}><span className="brand-icon"><BookIcon /></span><span>Kannada Kali</span></Link>
      <nav aria-label="Main navigation">
        <NavLink to={staff ? "/admin/stories" : "/app"}>{staff ? "Story studio" : "Dashboard"}</NavLink>
        {staff && <NavLink to="/admin/gradebook">Gradebook</NavLink>}
      </nav>
      <button className="account-button" onClick={() => signOut(auth)}>Sign out</button>
    </header>
    <main className="assessment-shell">{children}</main>
    <footer className="learning-footer">Kannada Kali</footer>
  </div>;
}
export function StoryArt({ theme = "garden" }) {
  return <div className={`story-art theme-${theme}`} aria-hidden="true">
    <span className="art-sun" /><span className="art-hill one" /><span className="art-hill two" />
    <span className="art-book"><BookIcon /></span>

  </div>;
}
