const role = sessionStorage.getItem("prolingo_role");

const name = sessionStorage.getItem("prolingo_name");

console.log("ProLingo role:", role);
console.log("ProLingo name:", name);

if (!role || role === "undefined" || role === "null") {
  console.error("No valid ProLingo session found.");
  window.location.replace("login.html");
} else {

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

  const can = (permission) =>
    !!(PERMISSIONS[role] && PERMISSIONS[role][permission]);

  document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll("[data-requires]").forEach(el => {
      const needed = el.dataset.requires;
      el.style.display = can(needed) ? "" : "none";
    });

    const userName = document.getElementById("userName");
    const userMeta = document.getElementById("userMeta");
    const userAvatar = document.querySelector(".user-avatar");

    if (userName) {
      userName.textContent = name || "Signed in";
    }

    if (userMeta) {
      userMeta.textContent = roleLabel(role);
    }

    if (userAvatar) {
      userAvatar.textContent = initials(name);
    }

    const logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {

        sessionStorage.removeItem("prolingo_role");
        sessionStorage.removeItem("prolingo_name");

        window.location.replace("login.html");

      });
    }

  });

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
    .map(p => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
