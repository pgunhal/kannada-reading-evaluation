exports.getCurrentStory = async (req, res) => {
//   try {
//     const storyDoc = await admin.firestore().collection("adminSettings").doc("story").get();
//     const prevDoc = await admin.firestore().collection("adminSettings").doc("prev_story").get();

//     console.log("LOOKING");
//     console.log(storyDoc);

//     if (!storyDoc.exists || !prevDoc.exists) {
//       return res.status(404).json({ error: "Story settings not found" });
//     }

//     res.json({
//       current: storyDoc.data(),
//       previous: prevDoc.data(),
//     });
//   } catch (err) {
//     console.error("Error fetching story settings:", err);
//     res.status(500).json({ error: "Failed to fetch story settings" });
//   }
res.json({});
};
