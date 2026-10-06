import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebaseConfig";
export const call = async (name, data = {}) =>
  (await httpsCallable(functions, name, { timeout: 200000 })(data)).data;
export function errorText(error) {
  if (error.code === "functions/not-found")
    return "This service is not available yet. Ask the administrator to finish setup.";
  return error.message || "Something went wrong. Please try again.";
}
export function currentWeek() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
