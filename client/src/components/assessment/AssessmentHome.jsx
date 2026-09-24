import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { Link } from "react-router-dom";
import { functions } from "../../firebaseConfig";
import AssessmentLayout, { StoryArt } from "./AssessmentLayout";

export default function AssessmentHome() {
  const [stories, setStories] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const load = () => {
    setError("");
    httpsCallable(functions, "listStudentStories")({})
      .then(({ data }) => setStories(data.sort((a, b) => a.week - b.week)))
      .catch(() => setError("Couldn’t load your stories. Please try again."));
  };
  useEffect(() => { load(); }, []);
  const completed = stories?.filter((s) => s.passed).length || 0;
  const shown = stories?.filter((s) => filter === "all" || (filter === "completed" ? s.passed : !s.passed));
  return <AssessmentLayout>
    <div className="section-heading library-heading"><h1>Dashboard</h1><span className="library-count">{completed} / {stories?.length || 4} stories completed</span></div>
    <div className="filter-tabs shelf-filters" aria-label="Filter stories">{[["all","All stories"],["todo","To read"],["completed","Completed"]].map(([value,label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {error && <div className="notice" role="alert">{error} <button onClick={load}>Try again</button></div>}
    {!stories && !error && <p role="status">Loading stories…</p>}
    {shown?.length === 0 && <div className="empty-state"><h3>{filter === "completed" ? "No completed stories yet" : "All caught up"}</h3><button className="primary-button" onClick={() => setFilter("all")}>All stories</button></div>}
    <div className="story-grid">{shown?.map((story) => <article className={`story-tile status-${story.passed ? "completed" : story.status === "new" ? "new" : "in-progress"}`} key={story.id}>
      <StoryArt theme={story.theme} />
      <div className="story-tile-body"><div className="tile-meta"><span>WEEK {story.week}</span><span className={`status-pill ${story.passed ? "success" : ""}`}>{story.passed ? "Completed" : story.status === "new" ? "New" : story.status === "graded" ? (story.attemptNumber >= 3 ? "Attempts used" : "Try again") : "In progress"}</span></div>
        <h3 lang="kn">{story.title}</h3>
        <div className="story-facts"><span>{Math.max(1,Math.ceil(story.wordCount/120))} min read</span><span>4 questions</span><span>{story.attemptNumber}/3 attempts</span></div>
        <Link className="primary-button tile-link" to={`/app/stories/${story.id}`}>{story.status === "new" ? "Read story" : story.passed ? "Read again" : "Continue"}<span aria-hidden="true">→</span></Link>
      </div>
    </article>)}</div>
  </AssessmentLayout>;
}
