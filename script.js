/// ============================================================
// FIREBAS
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  addDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================
// HELPERS
// ============================================================

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function showElement(id, visible) {
  const element = $(id);
  if (element) element.style.display = visible ? "" : "none";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ============================================================
// VIEW SWITCHING
// ============================================================

const views = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Where today's lessons begin."
  },
  calendar: {
    title: "Calendar",
    subtitle: "Publish time, manage bookings."
  },
  teachers: {
    title: "Teachers",
    subtitle: "Meet your ProLingo instructors."
  },
  classroom: {
    title: "Classroom",
    subtitle: "Live lesson in progress."
  }
};

const railLinks = document.querySelectorAll(".rail-link");
const viewTitle = $("viewTitle");
const viewSubtitle = $("viewSubtitle");

function showView(name) {
  const targetView = $(`view-${name}`);

  if (!targetView || !views[name]) {
    console.error(`View not found: view-${name}`);
    return;
  }

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.remove("is-active");
  });

  targetView.classList.add("is-active");

  railLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.view === name);
  });

  if (viewTitle) viewTitle.textContent = views[name].title;
  if (viewSubtitle) viewSubtitle.textContent = views[name].subtitle;
}

railLinks.forEach((link) => {
  link.addEventListener("click", () => {
    showView(link.dataset.view);
  });
});

document.querySelectorAll("[data-goto]").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.goto);
  });
});

// ============================================================
// DASHBOARD STATS
// ============================================================

function renderStats({ today, nextIn, nextLabel, week, students }) {
  setText("statToday", today ?? "—");
  setText("statNext", nextIn ?? "—");
  setText("statNextLabel", nextLabel ?? "Nothing scheduled yet");
  setText("statWeek", week ?? "—");
  setText("statStudents", students ?? "—");
}

function updateStatsFromBookings() {
  const todaysBookings = bookings.filter(
    (booking) => booking.date === getDateKey(currentWeekStart)
  );

  const uniqueStudents = new Set(
    bookings
      .map((booking) => booking.studentName)
      .filter((name) => name && name !== "Open slot")
  );

  renderStats({
    today: todaysBookings.length || "—",
    nextIn: todaysBookings.length ? "Today" : "—",
    nextLabel: todaysBookings.length
      ? `${todaysBookings.length} lesson${todaysBookings.length === 1 ? "" : "s"} today`
      : "Nothing scheduled yet",
    week: bookings.length || "—",
    students: uniqueStudents.size || "—"
  });
}


// ============================================================
// DASHBOARD — UP NEXT LESSON LIST
// ============================================================

let lessons = [];

function renderLessons() {
  const list = $("lessonList");
  const empty = $("lessonEmpty");

  if (!list) return;

  list.replaceChildren();

  if (lessons.length === 0) {
    showElement("lessonEmpty", true);
    return;
  }

  showElement("lessonEmpty", false);

  lessons.forEach((lesson) => {
    const li = document.createElement("li");
    li.className = "lesson-row";

    const stamp = document.createElement("span");
    stamp.className = "stamp";
    stamp.dataset.tone = lesson.status;
    stamp.textContent = lesson.level;

    const info = document.createElement("div");
    info.className = "lesson-info";

    const title = document.createElement("strong");
    title.textContent = lesson.title;

    const details = document.createElement("span");
    details.textContent = `${lesson.when} · Student: ${lesson.student}`;

    info.append(title, details);

    const button = document.createElement("button");
    button.className = "join-btn";

    if (lesson.status === "wait") {
      button.classList.add("join-btn--wait");
      button.textContent = "Scheduled";
      button.disabled = true;
    } else {
      button.textContent = "Join classroom";
      button.addEventListener("click", () => {
        showView("classroom");
      });
    }

    li.append(stamp, info, button);
    list.appendChild(li);
  });
}

// ============================================================
// CALENDAR
// ============================================================

const timeSlots = [
  "06:00", "06:30", "07:00", "07:30",
  "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00"
];

let currentWeekStart = getMonday(new Date());

let bookings = [];
let availability = [];
let availabilityListenerStarted = false;

let selectedTeacherId = null;
let selectedTeacherName = "";

function getMonday(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  const day = result.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + difference);
  return result;
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getWeekDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(currentWeekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
}

function formatDay(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function formatRange() {
  const days = getWeekDays();
  const first = days[0];
  const last = days[6];

  const firstText = first.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });

  const lastText = last.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return `${firstText} – ${lastText}`;
}

function updateCalendarHeader() {
  setText("calRange", formatRange());

  const days = getWeekDays();

  document.querySelectorAll("[data-calendar-day]").forEach((element, index) => {
    if (days[index]) {
      element.textContent = formatDay(days[index]);
    }
  });
}

function buildCalendar() {
  const tbody = $("calBody");

  if (!tbody) return;

  tbody.replaceChildren();

  const weekDays = getWeekDays();

  timeSlots.forEach((time, rowIndex) => {
    const tr = document.createElement("tr");

    const timeTd = document.createElement("td");
    timeTd.className = "time-cell";

    const end = timeSlots[rowIndex + 1] || "12:30";
    timeTd.textContent = `${time}–${end}`;

    tr.appendChild(timeTd);

    weekDays.forEach((date) => {
      const td = document.createElement("td");
      const dateKey = getDateKey(date);

      const bookingMatches = bookings.filter(
        (booking) =>
          booking.date === dateKey &&
          booking.slot === rowIndex
      );

      const availabilityMatches = availability.filter(
        (slot) =>
          slot.date === dateKey &&
          slot.slot === rowIndex &&
          (
            !selectedTeacherId ||
            slot.teacherId === selectedTeacherId
          )
      );

      bookingMatches.forEach((match) => {
        const slot = document.createElement("div");

        slot.className = `slot slot--${match.type || "booked"}`;
        slot.textContent = match.label || "Booked";

        td.appendChild(slot);
      });

      availabilityMatches.forEach((match) => {
        const slot = document.createElement("div");

        slot.className = "slot slot--available";
        slot.textContent = match.label || "Open";

        td.appendChild(slot);
      });

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  const visibleBookings = bookings.filter((booking) =>
    weekDays.some(
      (date) => getDateKey(date) === booking.date
    )
  );

  const visibleAvailability = availability.filter((slot) =>
    weekDays.some(
      (date) => getDateKey(date) === slot.date
    )
  );

  showElement(
    "calEmpty",
    visibleBookings.length === 0 &&
      visibleAvailability.length === 0
  );

  updateCalendarHeader();
}

$("calPrev")?.addEventListener("click", () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  buildCalendar();
  updateStatsFromBookings();
});

$("calNext")?.addEventListener("click", () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  buildCalendar();
  updateStatsFromBookings();
});

// ============================================================
// ============================================================
// LESSONS LIVE SYNC
// ============================================================

let lessonsListenerStarted = false;

function startLessonsListener() {
  if (lessonsListenerStarted) return;

  lessonsListenerStarted = true;

  onSnapshot(
    collection(db, "lessons"),
    (snapshot) => {
      bookings = [];
      lessons = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        const bookingDate =
          data.date ||
          (typeof data.day === "string" ? data.day : null);

        const booking = {
          id: docSnap.id,
          teacherId: data.teacherId || null,
          studentId: data.studentId || null,
          date: bookingDate,
          day: data.day,
          slot: Number(data.slot),
          type: data.type || "booked",
          label: data.label || data.studentName || "Booked",
          studentName: data.studentName || data.label || "—"
        };

        bookings.push(booking);

        if (
          bookingDate === getDateKey(currentWeekStart) &&
          Number.isInteger(booking.slot)
        ) {
          lessons.push({
            level: data.level || "—",
            title: data.title || "Untitled lesson",
            when: `${formatDay(currentWeekStart)} · ${
              timeSlots[booking.slot] || ""
            }`,
            student: data.studentName || "—",
            status: data.status === "live" ? "live" : "wait"
          });
        }
      });

      buildCalendar();
      renderLessons();
      updateStatsFromBookings();
    },
    (error) => {
      console.error("Lessons listener error:", error);

      setText(
        "calEmpty",
        "Unable to load lessons. Check your Firestore rules."
      );

      setText(
        "lessonEmpty",
        "Unable to load lessons."
      );
    }
  );
}

// ============================================================
// AVAILABILITY LIVE SYNC
// ============================================================

function startAvailabilityListener() {
  if (availabilityListenerStarted) return;

  availabilityListenerStarted = true;

  onSnapshot(
    collection(db, "availability"),
    (snapshot) => {
      availability = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        availability.push({
          id: docSnap.id,
          teacherId: data.teacherId || null,
          date: data.date || null,
          slot: Number(data.slot),
          label: data.label || "Open",
          status: data.status || "available",
          createdAt: data.createdAt || null
        });
      });

      buildCalendar();
      updateStatsFromBookings();
    },
    (error) => {
      console.error("Availability listener error:", error);

      setText(
        "calEmpty",
        `Unable to load availability: ${
          error.code || "unknown error"
        }`
      );
    }
  );
}
// ============================================================
// TEACHERS — LOAD TEACHER PROFILES
// ============================================================

let teachers = [];
let teachersListenerStarted = false;

function renderTeachers() {
  const teacherGrid = $("teacherGrid");
  const teacherEmpty = $("teacherEmpty");

  if (!teacherGrid) return;

  teacherGrid.replaceChildren();

  if (teachers.length === 0) {
    showElement("teacherEmpty", true);
    return;
  }

  showElement("teacherEmpty", false);

  teachers.forEach((teacher) => {
    const card = document.createElement("article");
    card.className = "teacher-card";

    const photo = document.createElement("img");
    photo.className = "teacher-photo";
    photo.src = teacher.photoUrl || "default-teacher.png";
    photo.alt = `${teacher.name || "Teacher"} profile picture`;

    photo.onerror = () => {
      photo.src = "default-teacher.png";
    };

    const content = document.createElement("div");
    content.className = "teacher-card-content";

    const name = document.createElement("h3");
    name.textContent = teacher.name || "Unnamed teacher";

    const specialization = document.createElement("p");
    specialization.className = "teacher-specialization";
    specialization.textContent =
      teacher.specialization || "English instruction";

    const bio = document.createElement("p");
    bio.className = "teacher-bio";
    bio.textContent =
      teacher.bio || "No biography has been added yet.";

    const details = document.createElement("div");
    details.className = "teacher-details";

    const qualifications = document.createElement("span");
    qualifications.textContent =
      teacher.qualifications || "Qualifications not listed";

    const teachingStyle = document.createElement("span");
    teachingStyle.textContent =
      teacher.teachingStyle || "Teaching style not listed";

    details.append(qualifications, teachingStyle);

    const button = document.createElement("button");
    button.className = "solid-btn";
    button.type = "button";
    button.textContent = "View availability";

    button.addEventListener("click", () => {
  selectedTeacherId = teacher.id;
  selectedTeacherName = teacher.name || "Teacher";

  showView("calendar");
  buildCalendar();
});

    content.append(
      name,
      specialization,
      bio,
      details,
      button
    );

    card.append(photo, content);
    teacherGrid.appendChild(card);
  });
}

function startTeachersListener() {
  if (teachersListenerStarted) return;
  teachersListenerStarted = true;

  console.log("Starting teachers listener...");

  onSnapshot(
    collection(db, "teachers"),
    (snapshot) => {
      console.log(
        "Teachers collection received:",
        snapshot.size,
        "document(s)"
      );

      teachers = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        console.log("Teacher document:", docSnap.id, data);

        teachers.push({
          id: docSnap.id,
          ...data
        });
      });

      renderTeachers();
    },
    (error) => {
      console.error("Teachers listener error:", error);

      setText(
        "teacherEmpty",
        `Unable to load teachers: ${error.code} — ${error.message}`
      );
    }
  );
}

// ============================================================
// ============================================================
// ADMIN / TEACHER — PUBLISH AVAILABILITY
// ============================================================

const updateCalendarBtn = document.querySelector(
  ".solid-btn[data-requires='manageOwnCalendar']"
);

if (updateCalendarBtn) {
  updateCalendarBtn.addEventListener("click", async () => {
    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }

    const dayInput = prompt(
      "Which day? Enter a number:\n0=Mon 1=Tue 2=Wed 3=Thu 4=Fri 5=Sat 6=Sun"
    );

    if (dayInput === null) return;

    const day = Number(dayInput);

    if (!Number.isInteger(day) || day < 0 || day > 6) {
      alert("Please enter a valid day from 0 to 6.");
      return;
    }

    const timeLabel = timeSlots
      .map((time, index) => `${index}: ${time}`)
      .join("\n");

    const slotInput = prompt(
      `Which time slot? Enter the number:\n${timeLabel}`
    );

    if (slotInput === null) return;

    const slot = Number(slotInput);

    if (
      !Number.isInteger(slot) ||
      slot < 0 ||
      slot >= timeSlots.length
    ) {
      alert("Please enter a valid time slot.");
      return;
    }

    const selectedDate = new Date(currentWeekStart);
    selectedDate.setDate(selectedDate.getDate() + day);

    const date = getDateKey(selectedDate);

    const duplicate = availability.some(
      (item) =>
        item.teacherId === currentUser.uid &&
        item.date === date &&
        item.slot === slot
    );

    if (duplicate) {
      alert("You already published this availability slot.");
      return;
    }

    try {
      await addDoc(collection(db, "availability"), {
        teacherId: currentUser.uid,
        date,
        day,
        slot,
        label: "Open",
        status: "available",
        createdAt: Date.now()
      });

      alert("Availability published successfully.");
    } catch (error) {
      console.error("Unable to publish availability:", error);
      alert("Couldn't publish availability: " + error.message);
    }
  });
}

// ============================================================
// CLASSROOM — JOIN + LIVE CAMERA
// ============================================================

const joinClassBtn = $("joinClassBtn");
const cameraToggle = $("cameraToggle");
const filterToggle = $("filterToggle");
const localVideo = $("localVideo");
const videoLabel = $("videoLabel");

let smoothSkinEnabled = false;

let localStream = null;
let audioContext = null;
let analyser = null;
let waveformAnimation = null;
let micSource = null;

function startMicVisualizer(stream) {
  const canvas = $("micWaveform");

  if (!canvas) return;

  stopMicVisualizer();

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return;

  audioContext = new AudioContextClass();
  analyser = audioContext.createAnalyser();

  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  micSource = audioContext.createMediaStreamSource(stream);
  micSource.connect(analyser);

  drawMicWaveform();
}

function drawMicWaveform() {
  const canvas = $("micWaveform");

  if (!canvas || !analyser) return;

  const ctx = canvas.getContext("2d");
  const bufferLength = analyser.fftSize;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    if (!analyser) return;

    waveformAnimation = requestAnimationFrame(draw);

    analyser.getByteTimeDomainData(dataArray);

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (
      canvas.width !== rect.width * dpr ||
      canvas.height !== rect.height * dpr
    ) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    ctx.beginPath();
    ctx.strokeStyle = "rgba(91, 58, 166, 0.15)";
    ctx.lineWidth = 1;
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "#5b3aa6";
    ctx.lineWidth = 2;

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.stroke();
  }

  draw();
}

function stopMicVisualizer() {
  if (waveformAnimation) {
    cancelAnimationFrame(waveformAnimation);
    waveformAnimation = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  analyser = null;
  micSource = null;

  const canvas = $("micWaveform");

  if (canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

async function startCamera() {
  if (!localVideo) {
    alert("Camera preview is unavailable.");
    return;
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera is not supported.");
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    localVideo.srcObject = localStream;

    startMicVisualizer(localStream);

    await new Promise((resolve) => {
      if (localVideo.readyState >= 1) {
        resolve();
      } else {
        localVideo.onloadedmetadata = resolve;
      }
    });

    await localVideo.play();

    localVideo.style.display = "block";
    showElement("videoLabel", false);

    if (joinClassBtn) {
      joinClassBtn.textContent = "Camera on";
    }

    cameraToggle?.classList.add("is-on");
  } catch (error) {
    console.error("Camera error:", error);

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }

    alert("Unable to start the camera: " + error.message);
  }
}

function stopCamera() {
  stopMicVisualizer();

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  if (localVideo) {
    localVideo.srcObject = null;
    localVideo.style.display = "none";
  }

  showElement("videoLabel", true);

  if (joinClassBtn) {
    joinClassBtn.textContent = "Join classroom";
  }

  cameraToggle?.classList.remove("is-on");
}

// ============================================================
// CLASSROOM — MICROPHONE TOGGLE
// ============================================================

const micToggle = $("micToggle");

function setMicrophoneEnabled(enabled) {
  if (!localStream) {
    alert("Join the classroom first.");
    return;
  }

  const audioTrack = localStream.getAudioTracks()[0];

  if (!audioTrack) {
    alert("No microphone was found.");
    return;
  }

  audioTrack.enabled = enabled;

  if (micToggle) {
    micToggle.classList.toggle("is-on", enabled);
    micToggle.textContent = enabled ? "Mic on" : "Mic off";
  }
}

if (micToggle) {
  micToggle.addEventListener("click", () => {
    if (!localStream) {
      alert("Join the classroom first.");
      return;
    }

    const audioTrack = localStream.getAudioTracks()[0];

    if (!audioTrack) {
      alert("No microphone was found.");
      return;
    }

    setMicrophoneEnabled(!audioTrack.enabled);
  });
}

if (joinClassBtn) {
  joinClassBtn.addEventListener("click", async () => {
    if (localStream) {
      stopCamera();
    } else {
      await startCamera();
    }
  });
}

if (cameraToggle) {
  cameraToggle.addEventListener("click", async () => {
    if (localStream) {
      stopCamera();
    } else {
      await startCamera();
    }
  });
}

// ============================================================
// CLASSROOM — CHAT
// ============================================================

const chatLog = $("chatLog");
const chatInput = $("chatInput");
const chatSend = $("chatSend");

function addChatMessage(author, text) {
  if (!chatLog) return;

  const p = document.createElement("p");

  const strong = document.createElement("strong");
  strong.textContent = `${author}: `;

  p.append(strong, document.createTextNode(text));
  chatLog.appendChild(p);

  chatLog.scrollTop = chatLog.scrollHeight;
}

if (chatSend) {
  chatSend.addEventListener("click", () => {
    const text = chatInput?.value.trim();

    if (!text) return;

    addChatMessage("You", text);

    chatInput.value = "";
  });
}

if (chatInput) {
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      chatSend?.click();
    }
  });
}

// ============================================================
// CLASSROOM — SMOOTH SKIN FILTER
// ============================================================

function applySmoothSkin() {
  if (!localVideo) return;

  if (smoothSkinEnabled) {
    // A subtle softening effect.
    localVideo.style.filter =
      "blur(0.7px) brightness(1.03) saturate(1.04)";
  } else {
    localVideo.style.filter = "none";
  }
}

if (filterToggle) {
  filterToggle.addEventListener("click", () => {
    if (!localStream) {
      alert("Join the classroom first.");
      return;
    }

    smoothSkinEnabled = !smoothSkinEnabled;

    filterToggle.classList.toggle("is-on", smoothSkinEnabled);
    filterToggle.textContent = smoothSkinEnabled
      ? "Smooth skin on"
      : "Smooth skin";

    applySmoothSkin();
  });
}

// ============================================================
// CLASSROOM — ROOM STATE
// ============================================================

function loadRoom(room) {
  setText("roomCode", room?.code ?? "—");
  setText("slideBadge", room?.levelLabel ?? "No lesson loaded");
  setText("slideTitle", room?.title ?? "Waiting for a lesson");
  setText(
    "slideBody",
    room?.body ??
      "Once a teacher starts a class or uploads slides, they'll appear here for everyone in the room."
  );

  setText(
    "videoLabel",
    room?.teacherName
      ? `Teacher · ${room.teacherName}`
      : "Waiting to join…"
  );

  const rosterList = $("rosterList");
  const rosterEmpty = $("rosterEmpty");

  if (!rosterList) return;

  rosterList.replaceChildren();

  if (room?.roster?.length) {
    showElement("rosterEmpty", false);

    room.roster.forEach((person) => {
      const li = document.createElement("li");

      const avatar = document.createElement("span");
      avatar.className = "avatar-dot";

      if (person.away) {
        avatar.classList.add("avatar-dot--away");
      }

      const name = document.createTextNode(` ${person.name} `);

      const role = document.createElement("em");
      role.textContent = person.role;

      li.append(avatar, name, role);
      rosterList.appendChild(li);
    });
  } else {
    showElement("rosterEmpty", true);
  }
}

loadRoom(null);

// ============================================================
// AUTH STATE
// ============================================================

let currentUser = null;
let authReady = false;

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  authReady = true;

  if (user) {
    console.log("Signed in:", user.uid);

    const role = sessionStorage.getItem("prolingo_role");
    console.log("Role:", role);

    startLessonsListener();
startAvailabilityListener();
startTeachersListener();
  } else {
    console.log("No signed-in user.");
  }
});
