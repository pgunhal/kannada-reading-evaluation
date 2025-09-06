const { SpeechClient } = require("@google-cloud/speech");

let client;

if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  // Use JSON string from env
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  client = new SpeechClient({ credentials });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Fall back to file path if set (for local dev with creds.json)
  client = new SpeechClient({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
} else {
  throw new Error("❌ No Google Cloud credentials found. Set GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS.");
}

module.exports = client;
