import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";



const firebaseConfig = {
  apiKey: "AIzaSyDa8GKRuPLjq67gQ9I5EO_YQdW1aA0tM0w",
  authDomain: "kkalisite-4fc4e.firebaseapp.com",
  projectId: "kkalisite-4fc4e",
  storageBucket: "kkalisite-4fc4e.appspot.com",
  messagingSenderId: "1041085614061",
  appId: "1:1041085614061:web:b876df26a5571fb44309e4",
  measurementId: "G-YGWSDLB7HW"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

