import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBGWM-ac-jKpP1qjW7MBEUAI-Tls7tP_Rk",
  authDomain: "prolingo-2de9d.firebaseapp.com",
  projectId: "prolingo-2de9d",
  storageBucket: "prolingo-2de9d.firebasestorage.app",
  messagingSenderId: "59292786878",
  appId: "1:59292786878:web:bd6e737458fdd8d9aabeef",
  measurementId: "G-EK8Z4S668T"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
// Lesson material files are hosted on Cloudinary instead of Firebase
// Storage (which now requires the paid Blaze plan) — see the
// CLOUDINARY_* constants and uploadToCloudinary() in script.js.
