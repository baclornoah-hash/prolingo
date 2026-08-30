// ============================================================
// AUTH GUARD
// Include this BEFORE script.js on every page that needs a
// logged-in user (index.html / dashboard, calendar, classroom).
//
// It does three things:
//   1. Kicks anyone with no session back to login.html
//   2. Shows/hides UI based on role (admin / teacher / student)
//   3. Wires up a logout button (id="logoutBtn", add one to topbar)
// ============================================================

const role = sessionStorage.getItem("prolingo_role");
const name = sessionStorage.getItem("prolingo_name");

if (!role) {
  window.location.href = "login.html";
}

// ------------------------------------------------------------
// ROLE → PERMISSIONS MAP
// Add/remove capabilities here as the app grows — everything
// else reads from this single source of truth.
// ------------------------------------------------------------
const PERMISSIONS = {
  admin:   { uploadSlides: true,  manageCalendarTemplate: true, manageAccounts: true, viewAllClassrooms: true },
  teacher: { uploadSlides: true,  manageCalendarTemplate: false, manageAccounts: false, viewAllClassrooms: false },
  student: { uploadSlides: false, manageCalendarTemplate: false, manageAccounts: false, viewAllClassrooms: false }
};

const can = (permission) => !!(PERMISSIONS[role] && PERMISSIONS[role][permission]);

// ------------------------------------------------------------
// APPLY VISIBILITY ONCE THE DOM IS READY
// Elements are hidden by data attribute rather than JS class
// names, so designers can find them without reading this file:
//   <div data-requires="uploadSlides"> ... </div>
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {

  document.querySelectorAll("[data-requires]").forEach(el => {
    const needed = el.dataset.requires;
    el.style.display = can(needed) ? "" : "none";
  });

  // Fill in the user chip with the real logged-in name/role
  const userName = document.getElementById("userName");
  const userMeta = document.getElementById("userMeta");
  const userAvatar = document.querySelector(".user-avatar");

  if (userName) userName.textContent = name || "Signed in";
  if (userMeta) userMeta.textContent = roleLabel(role);
  if (userAvatar) userAvatar.textContent = initials(name);

  // The manual "Teacher / Student" toggle from the prototype is no
  // longer needed now that role comes from a real login — remove it.
  const roleSwitch = document.getElementById("roleSwitch");
  if (roleSwitch) roleSwitch.remove();

  // Logout button — add <button id="logoutBtn">Log out</button> to topbar
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      sessionStorage.removeItem("prolingo_role");
      sessionStorage.removeItem("prolingo_name");
      window.location.href = "login.html";
    });
  }
});

function roleLabel(r){
  return { admin: "Admin · Panda English", teacher: "Teacher", student: "Student" }[r] || r;
}

function initials(n){
  if (!n) return "?";
  return n.split(" ").map(p => p[0]).join("").slice(0,2).toUpperCase();
}
