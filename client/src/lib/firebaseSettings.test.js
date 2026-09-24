import { firebaseSettings } from "./firebaseSettings";
const live = {apiKey:"web-key",authDomain:"school.firebaseapp.com",projectId:"school",appId:"web-app"};
test("emulator mode never inherits live project or bucket", () => {
  const settings = firebaseSettings({...live, storageBucket:"live-bucket",useEmulators:"true"});
  expect(settings.config.projectId).toBe("demo-kkali-quiz");
  expect(settings.config.storageBucket).toBe("demo-kkali-quiz.appspot.com");
});
test("live mode uses the supplied project and rejects incomplete config", () => {
  expect(firebaseSettings(live).config.projectId).toBe("school");
  expect(() => firebaseSettings({})).toThrow("Missing Firebase configuration");
  expect(() => firebaseSettings({...live,projectId:"demo-test"})).toThrow("requires emulator mode");
});
