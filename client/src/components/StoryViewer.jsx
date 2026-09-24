import React, { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import { getDoc, doc } from "firebase/firestore";
import AudioRecorder from "./AudioRecorder";

export default function StoryViewer({ user, onScoreSaved }) {
  const [activeStory, setActiveStory] = useState("");
  const [prevStory, setPrevStory] = useState("");
  const [activeWeek, setActiveWeek] = useState("");
  const [prevWeek, setPrevWeek] = useState("");
  const [storyHtml, setStoryHtml] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [showingCurrentWeek, setShowingCurrentWeek] = useState(true);
  const [rawStory, setRawStory] = useState("");

  useEffect(() => {
    const fetchWeekInfo = async () => {
      try {
        const storyDoc = await getDoc(doc(db, "adminSettings", "story"));
        const prevDoc = await getDoc(doc(db, "adminSettings", "prev_story"));

        if (storyDoc.exists() && prevDoc.exists()) {
          setActiveWeek(storyDoc.data().week);
          setPrevWeek(prevDoc.data().week);
          setActiveStory(storyDoc.data().storyName);
          setPrevStory(prevDoc.data().storyName);
          loadStoryContent(storyDoc.data().storyName);
        } else {
          setStoryHtml("Story not found.");
          setRawStory("");
        }
      } catch (err) {
        console.error("Error fetching story settings", err);
        setStoryHtml("Error loading story.");
      }
    };
    fetchWeekInfo();
  }, []);

  const loadStoryContent = async (storyId) => {
    const storyDoc = await getDoc(doc(db, "stories", storyId));
    if (!storyDoc.exists()) {
      setStoryHtml("Story not found.");
      setRawStory("");
      return;
    }
    const rawText = storyDoc.data().content || "";
    const { html, extractedTitle, extractedAuthor } = formatStory(rawText);
    setStoryHtml(html);
    setTitle(extractedTitle);
    setAuthor(extractedAuthor);
    setRawStory(rawText);
  };

  const formatStory = (text) => {
    const titleMatch = text.match(/^\{(.*?), (.*?)\}\s*/);
    let extractedTitle = "";
    let extractedAuthor = "";
    if (titleMatch) {
      extractedTitle = titleMatch[1];
      extractedAuthor = titleMatch[2];
      text = text.replace(titleMatch[0], "");
    }
    const html = text
      .replace(/\{(.*?), (.*?)\}/g, (_, word, trans) => `<span class="word-tooltip" data-translate="${trans}">${word}</span>`)
      .replace(/\|\|/g, "<br><br>")
      .replace(/\|/g, "<br>");
    return { html, extractedTitle, extractedAuthor };
  };

  const canonicalizeRef = (text) =>
    String(text || "")
      .replace(/^\{[^}]*\}\s*/, "")
      .replace(/\{(.*?),(.*?)\}/g, "$1")
      .replace(/\|\|/g, " ")
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const toggleWeek = () => {
    if (showingCurrentWeek) loadStoryContent(prevStory);
    else loadStoryContent(activeStory);
    setShowingCurrentWeek((v) => !v);
  };

  // ✅ normalize storyId for storage filenames
  const normalizeId = (id) =>
    String(id || "default")
      .toLowerCase()
      .replace(/\s+/g, "_");

  const currentStoryId = showingCurrentWeek ? activeStory : prevStory;
  const currentWeek = showingCurrentWeek ? activeWeek : prevWeek;
  const refText = canonicalizeRef(rawStory);
  const normalizedStoryId = normalizeId(currentStoryId);

  return (
    <div id="mainContent">
      <h1>ಕನ್ನಡ ಕಲಿ</h1>
      <div id="weekDisplay">Week: {currentWeek}</div>

      <h2 id="storyTitle">{title}</h2>
      <p id="authorName">{author}</p>
      <div id="storyText" dangerouslySetInnerHTML={{ __html: storyHtml }} />

      <button id="toggleWeekButton" onClick={toggleWeek}>
        {showingCurrentWeek ? "View Previous Week" : "View Current Week"}
      </button>

      <AudioRecorder
        refText={refText}
        storyId={normalizedStoryId}  // ✅ always normalized
        week={currentWeek}
        user={user}
        onScoreSaved={onScoreSaved}
      />
    </div>
  );
}
