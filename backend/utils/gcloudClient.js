const { SpeechClient } = require("@google-cloud/speech");
const path = require("path");

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credPath) {
  throw new Error("❌ GOOGLE_APPLICATION_CREDENTIALS not defined in .env");
}

const credentialsPath = path.resolve(__dirname, "../", credPath);

const client = new SpeechClient({
  keyFilename: credentialsPath,
});

module.exports = client;
