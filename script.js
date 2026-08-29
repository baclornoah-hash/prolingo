// ============================================================
// VIEW SWITCHING (Dashboard / Calendar / Classroom)
// ============================================================
const views = {
  dashboard: { title: "Dashboard", subtitle: "Where today's lessons begin." },
  calendar:  { title: "Calendar",  subtitle: "Publish time, manage bookings." },
  classroom: { title: "Classroom", subtitle: "Live lesson in progress." }
};

const railLinks = document.querySelectorAll(".rail-link");
const viewTitle = document.getElementById("viewTitle");
const viewSubtitle = document.getElementById("viewSubtitle");

function showView(name){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("is-active"));
  document.getElementById(`view-${name}`).classList.add("is-active");

  railLinks.forEach(link => {
    link.classList.toggle("is-active", link.dataset.view === name);
  });

  viewTitle.textContent = views[name].title;
  viewSubtitle.textContent = views[name].subtitle;
}

railLinks.forEach(link => {
  link.addEventListener("click", () => showView(link.dataset.view));
});

// "Open calendar →" shortcut button on the dashboard panel
document.querySelectorAll("[data-goto]").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.goto));
});

// ============================================================
// ROLE SWITCH (Teacher / Student) — swaps mock identity + copy
// ============================================================
const roleButtons = document.querySelectorAll(".role-btn");
const userName = document.getElementById("userName");
const userMeta = document.getElementById("userMeta");
const userAvatar = document.querySelector(".user-avatar");

const roleProfiles = {
  teacher: { name: "Lei B.", meta: "Admin · Panda English", initials: "LB" },
  student: { name: "Miguel R.", meta: "Level 6 · P2 Program", initials: "MR" }
};

roleButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    roleButtons.forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    const profile = roleProfiles[btn.dataset.role];
    userName.textContent = profile.name;
    userMeta.textContent = profile.meta;
    userAvatar.textContent = profile.initials;

    // Admin-only upload panel only makes sense for the teacher role
    document.querySelector(".panel--upload").style.display =
      btn.dataset.role === "teacher" ? "block" : "none";
  });
});

// ============================================================
// CALENDAR GRID — generated from mock data
// (mirrors a "Publish Time" style booking board)
// ============================================================
const days = ["Mon Aug 24","Tue Aug 25","Wed Aug 26","Thu Aug 27","Fri Aug 28","Today Aug 29","Sun Aug 30"];

const timeSlots = [
  "06:00","06:30","07:00","07:30","08:00","08:30","09:00",
  "09:30","10:00","10:30","11:00","11:30","12:00"
];

// dayIndex, slotIndex, type ('booked' | 'peak' | 'pending'), label
const mockBookings = [
  [0,7,"booked","Aru · Trial"],  [1,7,"booked","Anna"],      [2,7,"peak","Anna"],
  [3,7,"booked","Anna"],         [4,7,"booked","Selina"],    [5,7,"booked","Leron · Trial"],
  [0,8,"pending","Wei"],         [1,8,"booked","xxaa"],      [2,8,"booked","xxaa"],
  [3,8,"booked","xxaa"],         [4,8,"booked","Anna"],      [5,8,"booked","Miguel"],
  [0,9,"booked","Asher"],        [1,9,"peak","Trial"],       [3,9,"booked","Rain"],
  [4,9,"booked","Ai Chen"],      [5,9,"booked","Li Sh."],
  [3,3,"pending","Trial slot"],
];

function buildCalendar(){
  const thead = document.querySelector(".cal-grid thead tr");
  const tbody = document.getElementById("calBody");
  tbody.innerHTML = "";

  timeSlots.forEach((time, rowIndex) => {
    const tr = document.createElement("tr");

    const timeTd = document.createElement("td");
    timeTd.className = "time-cell";
    const end = timeSlots[rowIndex+1] || "12:30";
    timeTd.textContent = `${time}–${end}`;
    tr.appendChild(timeTd);

    days.forEach((day, colIndex) => {
      const td = document.createElement("td");
      const match = mockBookings.find(b => b[0] === colIndex && b[1] === rowIndex);
      if(match){
        const [,, type, label] = match;
        const slot = document.createElement("div");
        slot.className = `slot slot--${type}`;
        slot.textContent = label;
        td.appendChild(slot);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

buildCalendar();

// Prev/Next just gives lightweight feedback in this static prototype
document.getElementById("calPrev").addEventListener("click", () => {
  document.getElementById("calRange").textContent = "Aug 17 – Aug 23";
});
document.getElementById("calNext").addEventListener("click", () => {
  document.getElementById("calRange").textContent = "Aug 31 – Sep 6";
});

// ============================================================
// DASHBOARD — "Join classroom" jumps straight into the room
// ============================================================
document.querySelectorAll(".join-btn:not(.join-btn--wait)").forEach(btn => {
  btn.addEventListener("click", () => showView("classroom"));
});

// ============================================================
// ADMIN UPLOAD — shows the chosen filename (no server wired yet)
// ============================================================
const pptInput = document.getElementById("pptInput");
const dropzoneFile = document.getElementById("dropzoneFile");

pptInput.addEventListener("change", () => {
  if(pptInput.files.length){
    dropzoneFile.textContent = `Selected: ${pptInput.files[0].name}`;
  }
});

// ============================================================
// CLASSROOM — mic/camera/filter toggles
// ============================================================
document.querySelectorAll(".pill-toggle").forEach(btn => {
  btn.addEventListener("click", () => btn.classList.toggle("is-on"));
});

// Slide pager (static deck of 1 slide in this prototype)
let slideIndex = 1;
const slideCounter = document.querySelector(".slide-controls span");
const slideIconBtns = document.querySelectorAll(".slide-controls .icon-btn");
if(slideIconBtns.length >= 4){
  slideIconBtns[1].addEventListener("click", () => { // prev
    slideIndex = Math.max(1, slideIndex - 1);
    slideCounter.textContent = `${slideIndex} / 37`;
  });
  slideIconBtns[2].addEventListener("click", () => { // next
    slideIndex = Math.min(37, slideIndex + 1);
    slideCounter.textContent = `${slideIndex} / 37`;
  });
}

// Live countdown demo on the classroom stage
const timerEl = document.querySelector(".stage-timer strong");
let secondsLeft = 17;
setInterval(() => {
  if(secondsLeft <= 0) return;
  secondsLeft -= 1;
  const m = String(Math.floor(secondsLeft / 60)).padStart(2,"0");
  const s = String(secondsLeft % 60).padStart(2,"0");
  timerEl.textContent = `00:${m}:${s}`;
}, 1000);
