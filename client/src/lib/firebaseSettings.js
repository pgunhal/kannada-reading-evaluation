export function firebaseSettings(values) {
  if (values.useEmulators === "true") {
    return { useEmulators: true, region: "us-central1", config: {
      apiKey: "demo-api-key", projectId: "demo-kkali-quiz",
      authDomain: "demo-kkali-quiz.firebaseapp.com",
      storageBucket: "demo-kkali-quiz.appspot.com",
    } };
  }
  const required = ["apiKey", "authDomain", "projectId", "appId"];
  const missing = required.filter((key) => !values[key]?.trim());
  if (missing.length) throw new Error(`Missing Firebase configuration: ${missing.join(", ")}. Set the REACT_APP_FIREBASE_* values or enable local emulators.`);
  if (values.projectId.startsWith("demo-")) throw new Error("A demo Firebase project requires emulator mode.");
  const config = {};
  [...required, "storageBucket", "messagingSenderId", "measurementId"].forEach((key) => {
    if (values[key]?.trim()) config[key] = values[key].trim();
  });
  return { useEmulators: false, config, region: "us-central1" };
}
