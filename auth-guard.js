// ============================================================
// PROLINGO AUTH GUARD
// ============================================================

import { auth } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const role = sessionStorage.getItem("prolingo_role");
const name = sessionStorage.getItem("prolingo_name");

const ALLOWED_ROLES = new Set([
  "admin",
  "teacher",
  "student"
]);

function redirectToLogin() {
  sessionStorage.removeItem("prolingo_role");
  sessionStorage.removeItem("prolingo_name");

  window.location.replace("login.html");
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
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// First check the stored session information.
if (
  !role ||
  !name ||
  !ALLOWED_ROLES.has(role)
) {
  redirectToLogin();
} else {

  // Then verify that the Firebase account is still signed in.
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      redirectToLogin();
    }
  });

  const PERMISSIONS = {
    admin: {
      uploadSlides: true,
      manageOwnCalendar: true,
      manageCalendarTemplate: true,
      manageAccounts: true,
      viewAllClassrooms: true
    },

    teacher: {
  uploadSlides: false,
  manageOwnCalendar: true,
  manageCalendarTemplate: false,
  manageAccounts: false,
  viewAllClassrooms: false
}
      
    student: {
      uploadSlides: false,
      manageOwnCalendar: false,
      manageCalendarTemplate: false,
      manageAccounts: false,
      viewAllClassrooms: false
    }
  };

  const can = (permission) => {
    return !!(
      PERMISSIONS[role] &&
      PERMISSIONS[role][permission]
    );
  };

  document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll("[data-requires]").forEach((element) => {
      const neededPermission = element.dataset.requires;

      element.style.display = can(neededPermission)
        ? ""
        : "none";
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

    const logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          await signOut(auth);
        } catch (error) {
          console.error("Logout failed:", error);
        } finally {
          sessionStorage.removeItem("prolingo_role");
          sessionStorage.removeItem("prolingo_name");

          window.location.replace("login.html");
        }
      });
    }

  });

}
