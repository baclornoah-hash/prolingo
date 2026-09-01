// ============================================================
// FIREBASE — same project as login.html
// This file is loaded as type="module" (see index.html) so it
// can use real import statements like login.html does.
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// Called automatically every time the live lessons data changes —
// see the bottom of the onSnapshot listener below.
function updateStatsFromBookings(){
  const todaysCount = bookings.filter(b => b.day === TODAY_COLUMN).length;
  const uniqueStudents = new Set(
    bookings.map(b => b.label).filter(l => l && l !== "Open slot")
  );
  renderStats({
    today: todaysCount || "—",
    nextIn: todaysCount ? "Today" : "—",
    nextLabel: todaysCount ? `${todaysCount} lesson${todaysCount === 1 ? "" : "s"} today` : "Nothing scheduled yet",
    week: bookings.length || "—",
    students: uniqueStudents.size || "—"
  });
}

// ============================================================
// DASHBOARD — UP NEXT LESSON LIST
// Populated live from Firestore (see LESSONS LIVE SYNC below).
// Shape stored in lesson objects: { level, title, when, student, status: "live" | "wait" }
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
        ${lesson.status === "wait" ? "Scheduled" : "Join classroom"}
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
// "days" is still a fixed demo week (real date navigation is a
// later step) — but the SLOTS shown now come from live Firestore
// data instead of a hardcoded array.
// ============================================================
const days = ["Mon Aug 24","Tue Aug 25","Wed Aug 26","Thu Aug 27","Fri Aug 28","Today Aug 29","Sun Aug 30"];
const TODAY_COLUMN = 5; // index of "Today" in the days array above

const timeSlots = [
  "06:00","06:30","07:00","07:30","08:00","08:30","09:00",
  "09:30","10:00","10:30","11:00","11:30","12:00"
];

let bookings = []; // filled live from Firestore — see LESSONS LIVE SYNC

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
// real week-switching (loading a different date range from Firestore)
// is a later step.
document.getElementById("calPrev").addEventListener("click", () => {
  document.getElementById("calRange").textContent = "Aug 17 – Aug 23";
});
document.getElementById("calNext").addEventListener("click", () => {
  document.getElementById("calRange").textContent = "Aug 31 – Sep 6";
});

// ============================================================
// LESSONS LIVE SYNC
// Listens to the "lessons" collection in real time. Anyone signed
// in can read it (per firestore.rules); only admin/teacher can
// write to it. Every change anyone makes updates everyone's screen
// automatically — no page refresh needed.
// ============================================================
onSnapshot(query(collection(db, "lessons"), orderBy("slot")), (snapshot) => {
  bookings = [];
  lessons = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();

    // Feed the calendar grid
    bookings.push({
      day: data.day,
      slot: data.slot,
      type: data.type || "booked",
      label: data.label || data.studentName || "Booked"
    });

    // Feed the dashboard "Up next" list — only show today's lessons there
    if (data.day === TODAY_COLUMN){
      lessons.push({
        level: data.level || "—",
        title: data.title || "Untitled lesson",
        when: `${days[data.day]} · ${timeSlots[data.slot] || ""}`,
        student: data.studentName || "—",
        status: data.status === "live" ? "live" : "wait"
      });
    }
  });

  buildCalendar();
  renderLessons();
  updateStatsFromBookings();
});

// ============================================================
// ADMIN / TEACHER — ADD A LESSON SLOT
// Simple prompt-based flow for now (fast to use from a phone/
// tablet). This writes directly to Firestore's "lessons"
// collection — every signed-in user's calendar updates instantly.
// ============================================================
const updateCalendarBtn = document.querySelector(".solid-btn[data-requires='manageOwnCalendar']");

if (updateCalendarBtn){
  updateCalendarBtn.addEventListener("click", async () => {
    const dayInput = prompt("Which day? Enter a number:\n0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Today 6=Sun");
    if (dayInput === null) return;

    const timeLabel = timeSlots.map((t, i) => `${i}: ${t}`).join("\n");
    const slotInput = prompt(`Which time slot? Enter the number:\n${timeLabel}`);
    if (slotInput === null) return;

    const studentName = prompt("Student name (or leave blank for an open slot):") || "Open slot";
    const title = prompt("Lesson title (e.g. English Program P2 · Lesson 0):") || "Untitled lesson";
    const level = prompt("Level label (e.g. Lv 6):") || "—";

    try {
      await addDoc(collection(db, "lessons"), {
        day: Number(dayInput),
        slot: Number(slotInput),
        type: "booked",
        label: studentName,
        studentName,
        title,
        level,
        status: "wait",
        createdAt: Date.now()
      });
    } catch (err) {
      alert("Couldn't save that lesson: " + err.message);
    }
  });
}



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
// CLASSROOM — CAMERA PREVIEW
// ============================================================
const cameraToggle = document.getElementById("cameraToggle");
const localVideo = document.getElementById("localVideo");

let localStream = null;

if (cameraToggle && localVideo){
  cameraToggle.addEventListener("click", async () => {

    // CAMERA IS CURRENTLY OFF → TURN IT ON
    if (!localStream){
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });

        localVideo.srcObject = localStream;
        localVideo.style.display = "block";
        cameraToggle.classList.add("is-on");

        document.getElementById("videoLabel").style.display = "none";

      } catch (err) {
        console.error("Camera error:", err);
        alert("Unable to access the camera. Please allow camera permission in your browser.");
        cameraToggle.classList.remove("is-on");
      }

      return;
    }

    // CAMERA IS CURRENTLY ON → TURN IT OFF
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
    localVideo.srcObject = null;

    localVideo.style.display = "none";
    document.getElementById("videoLabel").style.display = "";

    cameraToggle.classList.remove("is-on");
  });
}

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
