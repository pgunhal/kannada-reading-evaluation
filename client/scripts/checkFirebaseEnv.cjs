// Load environment files with the same precedence as CRA's production build.
process.env.NODE_ENV = "production";
require("react-scripts/config/env");
const required = ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "APP_ID"];
const missing = required.filter((key) => {
  const value = process.env[`REACT_APP_FIREBASE_${key}`];
  return !value || /replace-with|your-project-id/.test(value);
});
if (process.env.REACT_APP_USE_FIREBASE_EMULATORS !== "false" || missing.length) {
  throw new Error("Set emulator mode explicitly to false and fill all required Firebase web config values in .env.production.local before building for Firebase Hosting.");
}
const project = process.env.REACT_APP_FIREBASE_PROJECT_ID;
if (project.startsWith("demo-")) throw new Error("Cannot deploy a demo emulator project.");
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== project) {
  throw new Error("Firebase deploy project does not match the frontend Firebase project ID.");
}
console.log(`Building for Firebase project: ${project}`);
