const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.setWeekStory = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be logged in",
    );
  }

  const {week, storyName} = data;
  if (!week || !storyName) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing week or storyName",
    );
  }

  // Save previous story
  const storyDoc = await db.collection("adminSettings").doc("story").get();
  if (storyDoc.exists) {
    const {storyName: prevStory, week: prevWeek} = storyDoc.data();
    await db.collection("adminSettings").doc("prev_story").set({
      storyName: prevStory,
      week: prevWeek,
    });
  }

  // Save new story
  await db.collection("adminSettings").doc("story").set({
    storyName,
    week,
  });

  return {success: true};
});
