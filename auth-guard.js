import { auth } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const ALLOWED_ROLES = new Set([
  "admin",
  "teacher",
  "student"
]);

function redirectToLogin() {
  sessionStorage.removeItem("prolingo_role");
  sessionStorage.removeItem("prolingo_name");

  if (!window.location.pathname.endsWith("/login.html")) {
    window.location.replace("login.html");
  }
}

function initializeAuthGuard() {
  window.prolingoRole = sessionStorage.getItem("prolingo_role");
  window.prolingoName = sessionStorage.getItem("prolingo_name");

  const role = sessionStorage.getItem("prolingo_role");
  const name = sessionStorage.getItem("prolingo_name");
  console.log("Stored role:", role);
  console.log("Stored name:", name);

  if (!role || !ALLOWED_ROLES.has(role) || !name) {
    console.error("Invalid or missing ProLingo session.");
    redirectToLogin();
    return;
  }

  const userNameElement = document.getElementById("userName");
  const userRoleElement = document.getElementById("userRole");
  const logoutButton = document.getElementById("logoutBtn");

  if (userNameElement) {
    userNameElement.textContent = name;
  }

  if (userRoleElement) {
    userRoleElement.textContent = role;
  }

  // ------------------------------------------------------------
  // data-requires accepts a comma-separated list of roles, e.g.
  // data-requires="teacher,admin". Previously this compared the
  // whole attribute against the single role string, so values like
  // "uploadSlides" or "manageTeachers" never matched "teacher" or
  // "admin" and those elements stayed hidden for everyone. Split
  // and check membership instead.
  // ------------------------------------------------------------
  document.querySelectorAll("[data-requires]").forEach((element) => {
    const requiredRoles = element.dataset.requires
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (!requiredRoles.includes(role)) {
      element.style.display = "none";
    }
  });

  if (!logoutButton) {
    console.error("Logout button not found.");
  } else {
    logoutButton.addEventListener("click", async () => {
      console.log("Logout button clicked.");

      logoutButton.disabled = true;
      logoutButton.textContent = "Logging out...";

      try {
        await signOut(auth);

        console.log("Firebase logout successful.");

        sessionStorage.removeItem("prolingo_role");
        sessionStorage.removeItem("prolingo_name");

        window.location.replace("login.html");
      } catch (error) {
        console.error("Firebase logout failed:", error);

        logoutButton.disabled = false;
        logoutButton.textContent = "Log out";

        alert("Logout failed. Please try again.");
      }
    });
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.log("No authenticated Firebase user.");
    redirectToLogin();
  } else {
    console.log("Authenticated Firebase user:", user.uid);
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAuthGuard);
} else {
  initializeAuthGuard();
}
