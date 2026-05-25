import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBsMtl6hO53-G0DU68FZFbiWoUPthiTBcU",
  authDomain: "rhythm-1c56e.firebaseapp.com",
  projectId: "rhythm-1c56e",
  storageBucket: "rhythm-1c56e.firebasestorage.app",
  messagingSenderId: "931924002432",
  appId: "1:931924002432:web:ed40445e62b5f9eb9ac865",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
