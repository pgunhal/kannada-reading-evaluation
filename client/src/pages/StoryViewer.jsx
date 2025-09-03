import React, { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import {
  getDoc,
  doc
} from "firebase/firestore";
import AudioRecorder from "../components/AudioRecorder";
import "../styles/main.css";

export default function StoryViewer() {
  const [activeStory, setActiveStory] = useState("");
  const [prevStory, setPrevStory] = useState("");
  const [activeWeek, setActiveWeek] = useState("");
  const [prevWeek, setPrevWeek] = useState("");
  const [storyHtml, setStoryHtml] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [showingCurrentWeek, setShowingCurrentWeek] = useState(true);

  useEffect(() => {
    const fetchWeekInfo = async () => {
      const storyDoc = await getDoc(doc(db, "adminSettings", "story"));
      const prevDoc = await getDoc(doc(db, "adminSettings", "prev_story"));

      if (storyDoc.exists() && prevDoc.exists()) {
        setActiveWeek(storyDoc.data().week);
        setPrevWeek(prevDoc.data().week);
        setActiveStory(storyDoc.data().storyName);
        setPrevStory(prevDoc.data().storyName);
        loadStoryContent(storyDoc.data().storyName);
      }
    };

    fetchWeekInfo();
  }, []);

  const loadStoryContent = async (storyId) => {
    const storyDoc = await getDoc(doc(db, "stories", storyId));
    if (!storyDoc.exists()) {
      setStoryHtml("Story not found.");
      return;
    }

    const rawText = storyDoc.data().content || "";
    const { html, extractedTitle, extractedAuthor } = formatStory(rawText);
    setStoryHtml(html);
    setTitle(extractedTitle);
    setAuthor(extractedAuthor);
  };

  const formatStory = (text) => {
    const titleMatch = text.match(/^\{(.*?), (.*?)\}\s*/);
    let extractedTitle = "";
    let extractedAuthor = "";

    if (titleMatch) {
      extractedTitle = titleMatch[1];
      extractedAuthor = titleMatch[2];
      text = text.replace(titleMatch[0], ""); // remove title line
    }

    let html = text
      .replace(/\{(.*?), (.*?)\}/g, (_, word, trans) => `<span class="word-tooltip" data-translate="${trans}">${word}</span>`)
      .replace(/\|\|/g, "<br><br>")
      .replace(/\|/g, "<br>");

    return { html, extractedTitle, extractedAuthor };
  };

  const toggleWeek = () => {
    if (showingCurrentWeek) {
      loadStoryContent(prevStory);
    } else {
      loadStoryContent(activeStory);
    }
    setShowingCurrentWeek(!showingCurrentWeek);
  };

  return (
    <div id="mainContent">
      <h1>ಕನ್ನಡ ಕಲಿ</h1>
      <div id="weekDisplay">Week: {showingCurrentWeek ? activeWeek : prevWeek}</div>

      <h2 id="storyTitle">{title}</h2>
      <p id="authorName">{author}</p>
      <div id="storyText" dangerouslySetInnerHTML={{ __html: storyHtml }} />

      <button id="toggleWeekButton" onClick={toggleWeek}>
        {showingCurrentWeek ? "View Previous Week" : "View Current Week"}
      </button>

      <AudioRecorder />
      <button
        onClick={() => (window.location.href = "/admin/login")}
        className="btn-primary"
      >
        Admin Login
      </button>
    </div>
  );
}
