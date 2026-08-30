import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyBGWM-acjKpP1qjW7MBEUAI-Tls7tP_Rk",
  authDomain: "prolingo-2de9d.firebaseapp.com",
  projectId: "prolingo-2de9d",
  storageBucket: "prolingo-2de9d.firebasestorage.app",
  messagingSenderId: "59292786878",
  appId: "1:59292786878:web:bd6e737458fdd8d9aabeef"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


const PERMISSIONS = {

  admin: {
    uploadSlides: true,
    manageOwnCalendar: true,
    manageCalendarTemplate: true,
    manageAccounts: true,
    viewAllClassrooms: true
  },

  teacher: {
    uploadSlides: true,
    manageOwnCalendar: true,
    manageCalendarTemplate: false,
    manageAccounts: false,
    viewAllClassrooms: false
  },

  student: {
    uploadSlides: false,
    manageOwnCalendar: false,
    manageCalendarTemplate: false,
    manageAccounts: false,
    viewAllClassrooms: false
  }

};


onAuthStateChanged(auth, async (user) => {

  console.log("ProLingo Firebase user:", user);

  if (!user) {
    console.log("No Firebase user. Returning to login.");
    window.location.href = "login.html";
    return;
  }


  try {

    console.log("Firebase UID:", user.uid);

    const userRef = doc(db, "users", user.uid);

    console.log("Reading:", `users/${user.uid}`);

    const userSnap = await getDoc(userRef);

    console.log("User document exists:", userSnap.exists());


    if (!userSnap.exists()) {

      console.error(
        "Firebase authentication succeeded, but users/" +
        user.uid +
        " does not exist."
      );

      alert(
        "Your login worked, but your Prolingo user profile was not found.\n\n" +
        "Firebase UID:\n" +
        user.uid
      );

      return;
    }


    const data = userSnap.data();

    console.log("User profile:", data);


    const role = String(data.role || "").toLowerCase();

    const name =
      data.name ||
      user.displayName ||
      user.email ||
      "User";


    if (!PERMISSIONS[role]) {

      console.error("Invalid role:", role);

      alert(
        "Your account has an invalid Prolingo role:\n\n" +
        role
      );

      return;
    }


    sessionStorage.setItem(
      "prolingo_role",
      role
    );

    sessionStorage.setItem(
      "prolingo_name",
      name
    );


    initializeUI(role, name);

  }

  catch (error) {

    console.error(
      "PROLINGO AUTH ERROR:",
      error
    );

    alert(
      "Prolingo authentication error:\n\n" +
      error.code +
      "\n\n" +
      error.message
    );

    // IMPORTANT:
    // Do NOT sign the user out here.
    // We want to see the actual error first.
  }

});


function initializeUI(role, name) {

  console.log(
    "ProLingo initialized:",
    role,
    name
  );


  document
    .querySelectorAll("[data-requires]")
    .forEach(el => {

      const permission =
        el.dataset.requires;

      if (
        PERMISSIONS[role] &&
        PERMISSIONS[role][permission]
      ) {
        el.style.display = "";
      } else {
        el.style.display = "none";
      }

    });


  const userName =
    document.getElementById("userName");

  const userMeta =
    document.getElementById("userMeta");

  const userAvatar =
    document.querySelector(".user-avatar");


  if (userName) {
    userName.textContent = name;
  }


  if (userMeta) {
    userMeta.textContent =
      roleLabel(role);
  }


  if (userAvatar) {
    userAvatar.textContent =
      initials(name);
  }


  const logoutBtn =
    document.getElementById("logoutBtn");


  if (logoutBtn) {

    logoutBtn.addEventListener(
      "click",
      async () => {

        try {

          await signOut(auth);

          sessionStorage.removeItem(
            "prolingo_role"
          );

          sessionStorage.removeItem(
            "prolingo_name"
          );

          window.location.href =
            "login.html";

        }

        catch (error) {

          console.error(
            "Logout error:",
            error
          );

          alert(
            "Logout failed:\n\n" +
            error.message
          );

        }

      }
    );

  }

}


function roleLabel(role) {

  return {
    admin: "Admin · Panda English",
    teacher: "Teacher",
    student: "Student"
  }[role] || role;

}


function initials(name) {

  if (!name) return "?";

  return name
    .trim()
    .split(/\s+/)
    .map(x => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

}
