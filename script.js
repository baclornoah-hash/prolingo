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

// NOTE: there is no role-switching code in this file anymore.
// Which account you're signed in as — and what you can see or do —
// is decided once at login and enforced by auth-guard.js. This
// file only renders data and handles UI interactions.

// ============================================================
// DASHBOARD STATS
// Starts at "—" (see index.html). Call renderStats() with real
// numbers once you have a Firestore query wired up, e.g.:
//
//   const snap = await getDocs(collection(db, "lessons"));
//   renderStats({ today: ..., nextLabel: ..., week: ..., students: ... });
// ============================================================
function renderStats({ today, nextIn, nextLabel, week, students }){
  document.getElementById("statToday").textContent = today ?? "—";
  document.getElementById("statNext").textContent = nextIn ?? "—";
  document.getElementById("statNextLabel").textContent = nextLabel ?? "Nothing scheduled yet";
  document.getElementById("statWeek").textContent = week ?? "—";
  document.getElementById("statStudents").textContent = students ?? "—";
}

// ============================================================
// DASHBOARD — UP NEXT LESSON LIST
// lessons starts EMPTY. This is real app state, not a demo array —
// push real lesson objects here once they come from Firestore.
// Shape: { level, title, when, student, status: "live" | "wait", etaLabel }
// ============================================================
let lessons = [];

function renderLessons(){
  const list = document.getElementById("lessonList");
  const empty = document.getElementById("lessonEmpty");
  list.innerHTML = "";

  if (lessons.length === 0){
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  lessons.forEach(lesson => {
    const li = document.createElement("li");
    li.className = "lesson-row";
    li.innerHTML = `
      <span class="stamp" data-tone="${lesson.status}">${lesson.level}</span>
      <div class="lesson-info">
        <strong>${lesson.title}</strong>
        <span>${lesson.when} · Student: ${lesson.student}</span>
      </div>
      <button class="join-btn ${lesson.status === "wait" ? "join-btn--wait" : ""}">
        ${lesson.status === "wait" ? `In ${lesson.etaLabel}` : "Join classroom"}
      </button>
    `;
    if (lesson.status !== "wait"){
      li.querySelector(".join-btn").addEventListener("click", () => showView("classroom"));
    }
    list.appendChild(li);
  });
}

renderLessons();

// ============================================================
// CALENDAR GRID
// bookings starts EMPTY — this used to ship with fake sample
// bookings baked in, which made a brand-new account look already
// full. Real slots should come from Firestore's "lessons"
// collection, keyed by day/time.
//
// To add a slot once you're wired to a backend:
//   bookings.push({ day: 5, slot: 7, type: "booked", label: "Miguel" });
//   buildCalendar();
// ============================================================
const days = ["Mon Aug 24","Tue Aug 25","Wed Aug 26","Thu Aug 27","Fri Aug 28","Today Aug 29","Sun Aug 30"];

const timeSlots = [
  "06:00","06:30","07:00","07:30","08:00","08:30","09:00",
  "09:30","10:00","10:30","11:00","11:30","12:00"
];

let bookings = []; // real data goes here — intentionally empty by default

function buildCalendar(){
  const tbody = document.getElementById("calBody");
  const empty = document.getElementById("calEmpty");
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
      const match = bookings.find(b => b.day === colIndex && b.slot === rowIndex);
      if (match){
        const slot = document.createElement("div");
        slot.className = `slot slot--${match.type}`;
        slot.textContent = match.label;
        td.appendChild(slot);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  empty.style.display = bookings.length === 0 ? "block" : "none";
}

buildCalendar();

// Prev/Next just gives lightweight feedback in this static prototype —
// swap for a real date-range fetch once bookings come from a backend.
document.getElementById("calPrev").addEventListener("click", () => {
  document.getElementById("calRange").textContent = "Aug 17 – Aug 23";
});
document.getElementById("calNext").addEventListener("click", () => {
  document.getElementById("calRange").textContent = "Aug 31 – Sep 6";
});

// ============================================================
// ADMIN / TEACHER UPLOAD — shows the chosen filename
// (no server wired yet — connect to Firebase Storage or your
// own upload endpoint to actually persist the file)
// ============================================================
const pptInput = document.getElementById("pptInput");
const dropzoneFile = document.getElementById("dropzoneFile");

if (pptInput){
  pptInput.addEventListener("change", () => {
    if (pptInput.files.length){
      dropzoneFile.textContent = `Selected: ${pptInput.files[0].name}`;
    }
  });
}

// ============================================================
// CLASSROOM — mic/camera/filter toggles
// ============================================================
document.querySelectorAll(".pill-toggle").forEach(btn => {
  btn.addEventListener("click", () => btn.classList.toggle("is-on"));
});

// ============================================================
// CLASSROOM — CHAT (local echo only, no backend wired yet)
// ============================================================
const chatLog = document.getElementById("chatLog");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");

function addChatMessage(author, text){
  const p = document.createElement("p");
  p.innerHTML = `<strong>${author}:</strong> ${text}`;
  chatLog.appendChild(p);
  chatLog.scrollTop = chatLog.scrollHeight;
}

if (chatSend){
  chatSend.addEventListener("click", () => {
    const text = chatInput.value.trim();
    if (!text) return;
    addChatMessage("You", text);
    chatInput.value = "";
  });
}

// ============================================================
// CLASSROOM — ROOM STATE
// Replace this stub with a real join/room lookup once a backend
// exists (e.g. reading the lesson doc for the room the user tapped
// "Join classroom" on).
// ============================================================
function loadRoom(room){
  document.getElementById("roomCode").textContent = room?.code ?? "—";
  document.getElementById("slideBadge").textContent = room?.levelLabel ?? "No lesson loaded";
  document.getElementById("slideTitle").textContent = room?.title ?? "Waiting for a lesson";
  document.getElementById("slideBody").textContent = room?.body ??
    "Once a teacher starts a class or uploads slides, they'll appear here for everyone in the room.";
  document.getElementById("videoLabel").textContent = room?.teacherName
    ? `Teacher · ${room.teacherName}` : "Waiting to join…";

  const rosterList = document.getElementById("rosterList");
  const rosterEmpty = document.getElementById("rosterEmpty");
  rosterList.innerHTML = "";
  if (room?.roster?.length){
    rosterEmpty.style.display = "none";
    room.roster.forEach(person => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="avatar-dot ${person.away ? "avatar-dot--away" : ""}"></span> ${person.name} <em>${person.role}</em>`;
      rosterList.appendChild(li);
    });
  } else {
    rosterEmpty.style.display = "block";
  }
}

loadRoom(null); // no room joined yet — this is the honest starting state
