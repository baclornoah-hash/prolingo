// ============================================================
// PROLINGO AUTH GUARD
// Firebase Authentication = source of truth
// Firestore users/{uid} = source of truth for role/name
// ============================================================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

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

// ============================================================
// FIREBASE CONFIG
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBGWM-ac-jKpP1qjW7MBEUAI-Tls7tP_Rk",
  authDomain: "prolingo-2de9d.firebaseapp.com",
  projectId: "prolingo-2de9d",
  storageBucket: "prolingo-2de9d.firebasestorage.app",
  messagingSenderId: "59292786878",
  appId: "1:59292786878:web:bd6e737458fdd8d9aabeef"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================================
// ROLE → PERMISSIONS
// ============================================================

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

// ============================================================
// AUTHENTICATION
// ============================================================

onAuthStateChanged(auth, async (user) => {

  // No Firebase user = not logged in
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  try {

    // Get this user's profile
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      console.error("No user profile found.");

      await signOut(auth);
      window.location.href = "login.html";
      return;
    }

    const userData = userSnap.data();

    const role = String(userData.role || "").toLowerCase();
    const name = userData.name || user.displayName || user.email || "User";

    // Invalid role
    if (!PERMISSIONS[role]) {
      console.error("Invalid Prolingo role:", role);

      await signOut(auth);
      window.location.href = "login.html";
      return;
    }

    // Temporary UI/session cache
    sessionStorage.setItem("prolingo_role", role);
    sessionStorage.setItem("prolingo_name", name);

    // Apply everything after the page exists
    initializeUserInterface(role, name);

  } catch (error) {

    console.error("Authentication guard error:", error);

    if (error.code === "permission-denied") {
      alert("Your account is authenticated, but your Prolingo profile cannot be accessed. Please contact an administrator.");
    }

    await signOut(auth);
    window.location.href = "login.html";
  }

});

// ============================================================
// USER INTERFACE
// ============================================================

function initializeUserInterface(role, name) {

  document.querySelectorAll("[data-requires]").forEach(el => {

    const needed = el.dataset.requires;

    el.style.display = can(role, needed) ? "" : "none";

  });

  const userName = document.getElementById("userName");
  const userMeta = document.getElementById("userMeta");
  const userAvatar = document.querySelector(".user-avatar");

  if (userName) {
    userName.textContent = name;
  }

  if (userMeta) {
    userMeta.textContent = roleLabel(role);
  }

  if (userAvatar) {
    userAvatar.textContent = initials(name);
  }

  // Remove old prototype role switcher if it exists
  const roleSwitch = document.getElementById("roleSwitch");

  if (roleSwitch) {
    roleSwitch.remove();
  }

  // ==========================================================
  // LOGOUT
  // ==========================================================

  const logoutBtn = document.getElementById("logoutBtn");

  if (logoutBtn) {

    logoutBtn.addEventListener("click", async () => {

      logoutBtn.disabled = true;
      logoutBtn.textContent = "Logging out…";

      try {

        await signOut(auth);

        sessionStorage.removeItem("prolingo_role");
        sessionStorage.removeItem("prolingo_name");

        window.location.href = "login.html";

      } catch (error) {

        console.error("Logout failed:", error);

        logoutBtn.disabled = false;
        logoutBtn.textContent = "Log out";

        alert("Unable to log out. Please try again.");

      }

    });

  }

}

// ============================================================
// PERMISSION CHECK
// ============================================================

function can(role, permission) {

  return !!(
    PERMISSIONS[role] &&
    PERMISSIONS[role][permission]
  );

}

// ============================================================
// ROLE LABEL
// ============================================================

function roleLabel(role) {

  return {
    admin: "Admin · Panda English",
    teacher: "Teacher",
    student: "Student"
  }[role] || role;

}

// ============================================================
// AVATAR INITIALS
// ============================================================

function initials(name) {

  if (!name) return "?";

  return name
    .trim()
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

}
