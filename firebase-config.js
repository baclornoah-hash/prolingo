import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "REAL_API_KEY_FROM_FIREBASE",
  authDomain: "prolingo-2de9d.firebaseapp.com",
  projectId: "prolingo-2de9d",
  storageBucket: "REAL_STORAGE_BUCKET",
  messagingSenderId: "REAL_MESSAGING_SENDER_ID",
  appId: "REAL_APP_ID"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
