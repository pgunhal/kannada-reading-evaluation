const functions = require("firebase-functions");
const { generate } = require("./openai");
module.exports = (db, auth) => {
  const service = require("./service")(db, auth, generate);
  const handler = (fn) => async (data, context) => {
    try {
      return await fn(data || {}, context);
    } catch (error) {
      if (error instanceof functions.https.HttpsError) throw error;
      if (error.code === 6) {
        throw new functions.https.HttpsError(
          "already-exists",
          "This record already exists. Refresh and choose a different week or name.",
        );
      }
      if (error.constructor === Error && !error.code) {
        throw new functions.https.HttpsError("invalid-argument", error.message);
      }
      console.error("Speaking request failed", {
        code: error.code || "unknown",
      });
      throw new functions.https.HttpsError(
        "internal",
        "The request could not be completed. Please try again.",
      );
    }
  };
  const callable = functions.runWith({ maxInstances: 10 });
  return {
    spLogin: callable.https.onCall(handler(service.login)),
    spPortal: callable.https.onCall(handler(service.portal)),
    spTeacher: callable.https.onCall(handler(service.teacher)),
    spGenerate: functions
      .runWith({
        secrets:
          process.env.SPEAKING_BIND_OPENAI_SECRET === "true" ?
            ["SPEAKING_OPENAI_API_KEY"] :
            [],
        timeoutSeconds: 180,
        maxInstances: 2,
      })
      .https.onCall(handler(service.generateWeek)),
  };
};
