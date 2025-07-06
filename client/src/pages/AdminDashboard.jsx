import React, { useEffect, useState } from "react";
import { db, storage } from "../firebaseConfig";
import {
  collection,
  getDoc,
  getDocs,
  setDoc,
  doc
} from "firebase/firestore";
import { listAll, getDownloadURL, ref as storageRef } from "firebase/storage";

export default function AdminDashboard() {
  const [week, setWeek] = useState("");
  const [stories, setStories] = useState([]);
  const [selectedStory, setSelectedStory] = useState("");
  const [audios, setAudios] = useState({ CUP: [], MIL: [], FRE: [] });

  useEffect(() => {
    async function loadStories() {
      const snapshot = await getDocs(collection(db, "stories"));
      const storyList = [];
      snapshot.forEach((doc) => {
        storyList.push({ id: doc.id, title: doc.data().title });
      });
      setStories(storyList);
    }

    loadStories();
  }, []);

  const handleSetWeekStory = async () => {
    if (!week || !selectedStory) return alert("Fill both fields");

    const prevDoc = await getDoc(doc(db, "adminSettings", "story"));
    if (prevDoc.exists()) {
      const { storyName, week: prevWeek } = prevDoc.data();
      await setDoc(doc(db, "adminSettings", "prev_story"), {
        storyName,
        week: prevWeek,
      });
    }

    await setDoc(doc(db, "adminSettings", "story"), {
      storyName: selectedStory,
      week,
    });

    alert("Week and Story updated!");
  };

  const handleFilterAudios = async () => {
    if (!week) return alert("Enter a valid week");

    const allFiles = await listAll(storageRef(storage));
    const filtered = { CUP: [], MIL: [], FRE: [] };

    await Promise.all(
      allFiles.items.map(async (itemRef) => {
        const match = itemRef.name.match(/week(\d+)/i);
        const weekFromFile = match ? match[1] : null;

        if (weekFromFile === week) {
          const url = await getDownloadURL(itemRef);
          const prefix = itemRef.name.slice(0, 3).toUpperCase();
          if (filtered[prefix]) filtered[prefix].push({ name: itemRef.name, url });
        }
      })
    );

    setAudios(filtered);
  };

  const renderAudioList = (center) => (
    <div>
      <h3>{center}</h3>
      <ul>
        {audios[center]?.map((file, idx) => (
          <li key={idx}>
            <audio controls src={file.url}></audio>
            <p>{file.name}</p>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="container">
      <h1>Admin Dashboard</h1>

      <h2>Set Story for a Week</h2>
      <input
        type="number"
        placeholder="Enter week number"
        value={week}
        onChange={(e) => setWeek(e.target.value)}
      />
      <select onChange={(e) => setSelectedStory(e.target.value)} value={selectedStory}>
        <option value="">Select story</option>
        {stories.map((story) => (
          <option key={story.id} value={story.id}>
            {story.title}
          </option>
        ))}
      </select>
      <button onClick={handleSetWeekStory}>Set Week & Story</button>

      <h2>Filter Audio Uploads</h2>
      <input
        type="number"
        placeholder="Enter week to filter"
        value={week}
        onChange={(e) => setWeek(e.target.value)}
      />
      <button onClick={handleFilterAudios}>Filter Audios</button>

      <div>
        {renderAudioList("CUP")}
        {renderAudioList("MIL")}
        {renderAudioList("FRE")}
      </div>
    </div>
  );
}
