// ============================================================
// FIREBASE
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// (Firebase Storage import removed — uploads now go to Cloudinary,
// see CLOUDINARY_* constants and uploadToCloudinary() below.)

// ============================================================
// HELPERS
// ============================================================

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function updateCalendarForRole() {
  const role = sessionStorage.getItem("prolingo_role");

  if (role === "student") {
    setText("viewSubtitle", "View your upcoming lessons.");
    setText("calEmpty", "You have no lessons scheduled yet.");
  } else {
    setText("viewSubtitle", "Manage teacher availability and bookings.");
    setText("calEmpty", "No time slots published yet.");
  }
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
    subtitle:
      window.prolingoRole === "student"
        ? "View your upcoming lessons."
        : "Manage teacher availability and bookings."
  },

  teachers: {
    title: "Teachers",
    subtitle: "Meet your ProLingo Bridge instructors."
  },

  teacherSchedule: {
    title: "Teacher’s Schedule",
    subtitle: "View this teacher’s open and booked lessons."
  },

  classroom: {
    title: "Classroom",
    subtitle: "Live lesson in progress."
  },

  billing: {
    title: "Billing",
    subtitle: "Per-class pay and GCash payouts."
  },

  profile: {
    title: "My Profile",
    subtitle: "Manage your name, photo, contacts, and password."
  }
};

const railLinks = document.querySelectorAll(".rail-link");
const viewTitle = $("viewTitle");
const viewSubtitle = $("viewSubtitle");

function showView(name) {
  const viewId = name === "teacherSchedule"
    ? "view-teacher-schedule"
    : `view-${name}`;

  const targetView = $(viewId);

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

// ============================================================
// FEEDBACK — 1-5 star class ratings (student -> teacher)
// ============================================================

// Falls back to looking the name up in the teachers directory when a
// lesson doc has no stored teacherName (e.g. bookings made before
// that field existed) — so the display is correct for old and new
// data alike, not just anything booked going forward.
function resolveTeacherName(teacherId, storedName) {
  if (storedName) return storedName;

  const match = teachers.find((t) => t.authUid === teacherId);
  return match?.name || "Teacher";
}

function buildFeedbackWidget(lesson) {
  const wrapper = document.createElement("div");
  wrapper.className = "feedback-widget";
  wrapper.style.display = "none";

  const ratingForLabel = document.createElement("p");
  ratingForLabel.className = "feedback-rating-for";
  ratingForLabel.textContent = `Rating: ${resolveTeacherName(lesson.teacherId, lesson.teacherName)}`;
  wrapper.appendChild(ratingForLabel);

  let selectedRating = 0;
  const starButtons = [];

  const starsRow = document.createElement("div");
  starsRow.className = "feedback-stars";

  for (let i = 1; i <= 5; i++) {
    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "star-btn";
    starBtn.textContent = "☆";

    starBtn.addEventListener("click", () => {
      selectedRating = i;
      starButtons.forEach((btn, index) => {
        const filled = index < selectedRating;
        btn.textContent = filled ? "★" : "☆";
        btn.classList.toggle("is-filled", filled);
      });
    });

    starButtons.push(starBtn);
    starsRow.appendChild(starBtn);
  }

  const commentInput = document.createElement("textarea");
  commentInput.className = "feedback-comment";
  commentInput.rows = 2;
  commentInput.placeholder = "Optional comment about this class…";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "solid-btn";
  submitBtn.textContent = "Submit feedback";

  submitBtn.addEventListener("click", async () => {
    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }

    if (selectedRating < 1) {
      alert("Pick a star rating first.");
      return;
    }

    submitBtn.disabled = true;

    try {
      await addDoc(collection(db, "feedback"), {
        teacherId: lesson.teacherId || null,
        studentId: currentUser.uid,
        studentName: sessionStorage.getItem("prolingo_name") || "Student",
        lessonId: lesson.id || null,
        rating: selectedRating,
        comment: commentInput.value.trim(),
        createdAt: Date.now()
      });

      wrapper.replaceChildren();
      const thanks = document.createElement("p");
      thanks.className = "feedback-thanks";
      thanks.textContent = "Thanks for your feedback!";
      wrapper.appendChild(thanks);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      alert("Couldn't submit feedback: " + error.message);
      submitBtn.disabled = false;
    }
  });

  wrapper.append(starsRow, commentInput, submitBtn);
  return wrapper;
}

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

  const role = sessionStorage.getItem("prolingo_role");

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
    details.textContent =
      role === "student"
        ? `${lesson.when} · Teacher: ${resolveTeacherName(lesson.teacherId, lesson.teacherName)}`
        : `${lesson.when} · Student: ${lesson.student}`;

    info.append(title, details);

    if (lesson.teacherId && lesson.studentId) {
      title.style.cursor = "pointer";
      title.title = "Tap to view class details";
      title.addEventListener("click", () => openLessonDetail(lesson));
    }

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

    // Students can rate a class only after it has actually ended —
    // computed from the lesson's real date + slot end time, not just
    // whether it's currently marked "live". Additive: doesn't touch
    // the row's existing elements above.
    const lessonHasEnded =
      lesson.date &&
      Number.isInteger(lesson.slot) &&
      Date.now() >= getSlotEndTimestamp(lesson.date, lesson.slot);

    if (role === "student" && lesson.teacherId && lessonHasEnded) {
      const rateBtn = document.createElement("button");
      rateBtn.type = "button";
      rateBtn.className = "ghost-btn";
      rateBtn.textContent = "Rate class";

      const feedbackWidget = buildFeedbackWidget(lesson);

      rateBtn.addEventListener("click", () => {
        const isHidden = feedbackWidget.style.display === "none";
        feedbackWidget.style.display = isHidden ? "block" : "none";
      });

      li.append(rateBtn, feedbackWidget);
    }

    list.appendChild(li);
  });
}

// ============================================================
// LESSON MATERIALS — UPLOAD (Cloudinary + Firestore)
//
// Flow:
//   teacher/admin picks a file in #pptInput
//     -> uploaded to Cloudinary's free tier (no billing account
//        needed — unlike Firebase Storage, which now requires Blaze)
//     -> on completion, the returned URL + metadata are saved to the
//        "lessonMaterials" Firestore collection
//     -> the live listener below (startMaterialsListener) picks it
//        up for every signed-in user, teacher or student
// ============================================================

// ------------------------------------------------------------
// TODO: fill these in with your own free Cloudinary account:
//   1. Sign up at cloudinary.com (no card required)
//   2. Dashboard shows your "Cloud name" — put it below
//   3. Settings -> Upload -> Add upload preset
//        - Signing Mode: "Unsigned"
//        - (optional but recommended) set an allowed file size /
//          format restriction on the preset itself, since anyone
//          who can see your site's JS can see the preset name
//   4. Put that preset's name below
// ------------------------------------------------------------
const CLOUDINARY_CLOUD_NAME = "ha89kor5";
const CLOUDINARY_UPLOAD_PRESET = "prolingo_lessons";

const pptInput = $("pptInput");
const dropzoneFile = $("dropzoneFile");

function guessMaterialType(file) {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "file";
}

// Cloudinary's "auto" endpoint accepts images, video, and raw files
// (pdf/pptx) all in one place, and reports upload progress the same
// way XMLHttpRequest always has — fetch() doesn't expose progress
// events, which is the one reason this uses XHR instead.
function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME") {
      reject(new Error(
        "Cloudinary isn't configured yet — set CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET in script.js."
      ));
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`
    );

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let detail = xhr.responseText;

        try {
          detail = JSON.parse(xhr.responseText)?.error?.message || detail;
        } catch (parseError) {
          // responseText wasn't JSON — fall back to the raw text above.
        }

        reject(new Error(`Upload failed (${xhr.status}): ${detail}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload."));

    xhr.send(formData);
  });
}

async function handleMaterialUpload(file) {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  const role = sessionStorage.getItem("prolingo_role");

  if (role !== "teacher" && role !== "admin") {
    alert("Only teachers or admins can upload lesson materials.");
    return;
  }

  const materialType = guessMaterialType(file);

  if (dropzoneFile) {
    dropzoneFile.textContent = `Uploading ${file.name}… 0%`;
  }

  try {
    const result = await uploadToCloudinary(file, (percent) => {
      if (dropzoneFile) {
        dropzoneFile.textContent = `Uploading ${file.name}… ${percent}%`;
      }
    });

    await addDoc(collection(db, "lessonMaterials"), {
      teacherId: currentUser.uid,
      teacherName: sessionStorage.getItem("prolingo_name") || "Teacher",
      title: file.name,
      fileType: materialType,
      fileUrl: result.secure_url,
      createdAt: Date.now()
    });

    if (dropzoneFile) {
      dropzoneFile.textContent = `Uploaded: ${file.name}`;
    }
  } catch (error) {
    console.error("Lesson material upload failed:", error);

    if (dropzoneFile) {
      dropzoneFile.textContent = `Upload failed: ${error.message}`;
    }

    alert("Upload failed: " + error.message);
  }
}

if (pptInput) {
  pptInput.addEventListener("change", () => {
    const file = pptInput.files?.[0];

    if (!file) return;

    handleMaterialUpload(file);

    // Reset so selecting the same file again still fires "change"
    pptInput.value = "";
  });
}

// ============================================================
// LESSON MATERIALS — LIVE LIST (Firestore)
//
// Visible to every signed-in role. Renders into #materialsList
// on the dashboard, and mirrors the most recent material into the
// Classroom slide-frame via renderMaterialInStage().
// ============================================================

let materials = [];
let materialsListenerStarted = false;

function renderMaterialPreview(material) {
  if (material.fileType === "video") {
    const video = document.createElement("video");
    video.src = material.fileUrl;
    video.controls = true;
    video.style.maxWidth = "220px";
    video.style.borderRadius = "10px";
    return video;
  }

  if (material.fileType === "image") {
    const img = document.createElement("img");
    img.src = material.fileUrl;
    img.alt = material.title;
    img.style.maxWidth = "220px";
    img.style.borderRadius = "10px";
    return img;
  }

  const link = document.createElement("a");
  link.href = material.fileUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Open file";
  return link;
}

function renderMaterialsList() {
  const list = $("materialsList");

  if (!list) return;

  list.replaceChildren();

  if (materials.length === 0) {
    showElement("materialsEmpty", true);
    return;
  }

  showElement("materialsEmpty", false);

  materials.forEach((material) => {
    const li = document.createElement("li");
    li.className = "lesson-row";

    const info = document.createElement("div");
    info.className = "lesson-info";

    const title = document.createElement("strong");
    title.textContent = material.title;

    const details = document.createElement("span");
    details.textContent = `${material.teacherName} · ${new Date(
      material.createdAt
    ).toLocaleString()}`;

    info.append(title, details);

    li.append(info, renderMaterialPreview(material));
    list.appendChild(li);
  });
}

function renderMaterialInStage() {
  const slideMedia = $("slideMedia");
  const slideArt = $("slideArt");

  if (!slideMedia) return;

  const latest = materials[0];

  if (!latest) {
    slideMedia.replaceChildren();
    slideMedia.style.display = "none";
    if (slideArt) slideArt.style.display = "";
    return;
  }

  setText("slideBadge", "Lesson material");
  setText("slideTitle", latest.title);
  setText("slideBody", `Uploaded by ${latest.teacherName}`);

  slideMedia.replaceChildren(renderMaterialPreview(latest));
  slideMedia.style.display = "flex";
}

function startMaterialsListener() {
  if (materialsListenerStarted) return;
  materialsListenerStarted = true;

  onSnapshot(
    collection(db, "lessonMaterials"),
    (snapshot) => {
      materials = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        materials.push({
          id: docSnap.id,
          teacherId: data.teacherId || null,
          teacherName: data.teacherName || "Teacher",
          title: data.title || "Untitled material",
          fileType: data.fileType || "file",
          fileUrl: data.fileUrl || "",
          createdAt: data.createdAt || 0
        });
      });

      materials.sort((a, b) => b.createdAt - a.createdAt);

      renderMaterialsList();
      renderMaterialInStage();
      updateBoardBackground();
    },
    (error) => {
      console.error("Lesson materials listener error:", error);

      setText(
        "materialsEmpty",
        "Unable to load lesson materials. Check your Firestore rules."
      );
    }
  );
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

let calendarMode = "general";

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

// Used to gate "Rate class" — a lesson only counts as over once its
// slot's end time has actually passed, not just because it was
// marked "live" at some point.
function getSlotEndTimestamp(dateKey, slotIndex) {
  const endTimeStr = timeSlots[slotIndex + 1] || "12:30";
  const [hours, minutes] = endTimeStr.split(":").map(Number);
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime();
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
  const role = sessionStorage.getItem("prolingo_role");

  weekDays.forEach((date, index) => {
    const header = document.querySelectorAll("[data-calendar-day]")[index];

    if (header) {
      header.textContent = date.toLocaleDateString("en-US", {
        weekday: "short"
      });
    }
  });

  timeSlots.forEach((time, rowIndex) => {
    const tr = document.createElement("tr");

    const timeTd = document.createElement("td");
    timeTd.className = "time-cell";

    const end = timeSlots[rowIndex + 1] || "12:30";
    timeTd.textContent = `${time}–${end}`;

    tr.appendChild(timeTd);

    weekDays.forEach((date, colIndex) => {
      const td = document.createElement("td");
      const dateKey = getDateKey(date);

      // ============================================================
      // GENERAL CALENDAR BOOKINGS
      // ============================================================

      const bookingMatches = bookings.filter(
        (booking) =>
          booking.date === dateKey &&
          booking.slot === rowIndex
      );

      bookingMatches.forEach((match) => {
        const slot = document.createElement("div");

        const isPending =
          match.type === "booking" && match.approvalStatus === "pending";

        slot.className = isPending
          ? "slot slot--pending"
          : `slot slot--${match.type || "booked"}`;
        slot.textContent = isPending
          ? `${match.label || "Booked"} (pending)`
          : match.label || "Booked";

        const canPreview =
          match.type === "booking" &&
          match.studentId &&
          (role === "admin" ||
            (role === "teacher" && match.teacherId === currentUser?.uid) ||
            (role === "student" && match.studentId === currentUser?.uid));

        if (canPreview) {
          slot.style.cursor = "pointer";
          slot.title = "Tap to view class details";
          slot.addEventListener("click", () => openLessonDetail(match));
        }

        td.appendChild(slot);
      });

      // ============================================================
      // GENERAL CALENDAR AVAILABILITY
      //
      // ONLY THE TEACHER'S OWN AVAILABILITY BELONGS HERE.
      //
      // STUDENTS NEVER SEE AVAILABILITY IN THE GENERAL CALENDAR.
      // selectedTeacherId IS NOT USED HERE.
      //
      // One tap does the whole job now instead of the old multi-step
      // prompt() flow: an empty cell (no booking) opens a schedule
      // slot; an already-open slot closes it. A booked cell is
      // already handled above (tap to view — see bookingMatches).
      // ============================================================

      if (role === "teacher" && bookingMatches.length === 0) {
        const ownAvailability = availability.filter(
          (slot) =>
            slot.date === dateKey &&
            slot.slot === rowIndex &&
            slot.teacherId === currentUser?.uid
        );

        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";

        if (ownAvailability.length > 0) {
          const existing = ownAvailability[0];

          toggleBtn.className = "slot slot--available";
          toggleBtn.textContent = existing.label || "Open";
          toggleBtn.title = "Tap to close this schedule";

          toggleBtn.addEventListener("click", async () => {
            toggleBtn.disabled = true;

            try {
              await deleteDoc(doc(db, "availability", existing.id));
            } catch (error) {
              console.error("Failed to close schedule slot:", error);
              alert("Couldn't close this slot: " + error.message);
              toggleBtn.disabled = false;
            }
          });
        } else {
          toggleBtn.className = "slot slot--vacant";
          toggleBtn.textContent = "+";
          toggleBtn.title = "Tap to open this schedule";

          toggleBtn.addEventListener("click", async () => {
            if (!currentUser) {
              alert("Please sign in first.");
              return;
            }

            toggleBtn.disabled = true;

            try {
              await addDoc(collection(db, "availability"), {
                teacherId: currentUser.uid,
                teacherName: sessionStorage.getItem("prolingo_name") || "Teacher",
                date: dateKey,
                day: colIndex,
                slot: rowIndex,
                type: "availability",
                status: "available",
                createdAt: Date.now()
              });
            } catch (error) {
              console.error("Failed to open schedule slot:", error);
              alert("Couldn't open this slot: " + error.message);
              toggleBtn.disabled = false;
            }
          });
        }

        td.appendChild(toggleBtn);
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // ============================================================
  // GENERAL CALENDAR EMPTY STATE
  // ============================================================

  const visibleBookings = bookings.filter((booking) =>
    weekDays.some(
      (date) => getDateKey(date) === booking.date
    )
  );

  let visibleAvailability = [];

  if (role === "teacher") {
    visibleAvailability = availability.filter(
      (slot) =>
        slot.teacherId === currentUser?.uid &&
        weekDays.some(
          (date) => getDateKey(date) === slot.date
        )
    );
  }

  showElement(
    "calEmpty",
    visibleBookings.length === 0 &&
      visibleAvailability.length === 0
  );
  updateCalendarHeader();
}

// ============================================================
// TEACHER SCHEDULE
// ============================================================
        
function buildTeacherSchedule() {
  const tbody = $("teacherScheduleBody");

  if (!tbody) return;

  tbody.replaceChildren();

  // ------------------------------------------------------------
  // The Teacher Schedule must ALWAYS use the selected teacher.
  // It must NEVER use the logged-in user's teacher ID.
  // ------------------------------------------------------------

  if (!selectedTeacherId) {
    setText("teacherScheduleTitle", "Teacher's Schedule");
    setText(
      "teacherScheduleSubtitle",
      "Select a teacher to view their schedule."
    );

    showElement("teacherScheduleEmpty", true);
    return;
  }

  setText(
    "teacherScheduleTitle",
    `${selectedTeacherName || "Teacher"}'s Schedule`
  );

  setText(
    "teacherScheduleSubtitle",
    `View ${selectedTeacherName || "this teacher"}'s open and booked lessons.`
  );

  const weekDays = getWeekDays();

  // ------------------------------------------------------------
  // ONLY DATA BELONGING TO THIS SELECTED TEACHER
  // ------------------------------------------------------------

  const teacherBookings = bookings.filter(
    (booking) =>
      booking.teacherId === selectedTeacherId &&
      weekDays.some(
        (date) => getDateKey(date) === booking.date
      )
  );

  const teacherAvailability = availability.filter(
    (slot) =>
      slot.teacherId === selectedTeacherId &&
      weekDays.some(
        (date) => getDateKey(date) === slot.date
      )
  );

  // ------------------------------------------------------------
  // BUILD CALENDAR
  // ------------------------------------------------------------

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

      // ----------------------------------------------------------
      // BOOKINGS FOR SELECTED TEACHER ONLY
      // ----------------------------------------------------------

      const bookingMatches = teacherBookings.filter(
        (booking) =>
          booking.date === dateKey &&
          booking.slot === rowIndex
      );

      bookingMatches.forEach((match) => {
        const slot = document.createElement("div");

        const isPending =
          match.type === "booking" && match.approvalStatus === "pending";

        slot.className = isPending
          ? "slot slot--pending"
          : `slot slot--${match.type || "booked"}`;
        slot.textContent = isPending
          ? `${match.label || "Booked"} (pending)`
          : match.label || "Booked";

        const viewerRole = sessionStorage.getItem("prolingo_role");
        const canPreview =
          match.type === "booking" &&
          match.studentId &&
          (viewerRole === "admin" ||
            (viewerRole === "teacher" && match.teacherId === currentUser?.uid) ||
            (viewerRole === "student" && match.studentId === currentUser?.uid));

        if (canPreview) {
          slot.style.cursor = "pointer";
          slot.title = "Tap to view class details";
          slot.addEventListener("click", () => openLessonDetail(match));
        }

        td.appendChild(slot);
      });

      // ----------------------------------------------------------
      // AVAILABILITY FOR SELECTED TEACHER ONLY
      // ----------------------------------------------------------

      const availabilityMatches = teacherAvailability.filter(
        (slot) =>
          slot.date === dateKey &&
          slot.slot === rowIndex
      );

      availabilityMatches.forEach((match) => {
        // Don't show an available slot if it is already booked.
        const alreadyBooked = bookingMatches.length > 0;

        if (alreadyBooked) return;

        const slot = document.createElement("button");

        slot.type = "button";
        slot.className = "slot slot--available";
        slot.textContent = match.label || "Open";

        const role = sessionStorage.getItem("prolingo_role");

        if (role === "student") {
          slot.style.cursor = "pointer";

          slot.addEventListener("click", async () => {
            if (!currentUser) {
              alert("You must be signed in to book a lesson.");
              return;
            }

            if (bookingMatches.length > 0) {
              alert("This schedule has already been booked.");
              return;
            }

            // A student can't hold two classes at the same date+slot
            // with two different teachers — bookings for the signed-in
            // student are already loaded across ALL teachers (not just
            // this one), so this check works regardless of which
            // teacher's schedule they're currently viewing.
            const conflictsWithAnotherTeacher = bookings.some(
              (b) =>
                b.type === "booking" &&
                b.studentId === currentUser.uid &&
                b.date === dateKey &&
                b.slot === rowIndex &&
                b.teacherId !== selectedTeacherId
            );

            if (conflictsWithAnotherTeacher) {
              alert(
                "You already have a class booked with another teacher at this date and time."
              );
              return;
            }

            const confirmed = confirm(
              `Request this lesson on ${dateKey} at ${time}? The teacher will need to approve it before it's confirmed.`
            );

            if (!confirmed) return;

            slot.disabled = true;
            slot.textContent = "Booking...";

            try {
              // A room code is reserved up front (same idea as
              // Schedule a Class) so that once the teacher approves,
              // both sides already have a stable call to join — no
              // separate "generate the link" step needed later.
              const roomRef = doc(collection(db, "rooms"));

              await addDoc(collection(db, "lessons"), {
                type: "booking",
                teacherId: selectedTeacherId,
                teacherName: selectedTeacherName || "",
                studentId: currentUser.uid,
                studentName:
                  sessionStorage.getItem("prolingo_name") || "Student",
                studentEnglishName: myProfile.englishName || "",
                date: dateKey,
                day: dateKey,
                slot: rowIndex,
                status: "scheduled",
                approvalStatus: "pending",
                roomId: roomRef.id,
                hasRemark: false,
                createdAt: Date.now()
              });

              alert(
                "Booking request sent! You'll be able to join the call here once the teacher approves it."
              );
            } catch (error) {
              console.error("Booking failed:", error);

              slot.disabled = false;
              slot.textContent = match.label || "Open";

              alert(
                "Booking failed. Please check your Firestore permissions."
              );
            }
          });
        }

        td.appendChild(slot);
      });

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // ------------------------------------------------------------
  // EMPTY STATE
  // ------------------------------------------------------------

  showElement(
    "teacherScheduleEmpty",
    teacherBookings.length === 0 &&
      teacherAvailability.length === 0
  );
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

$("teacherSchedulePrev")?.addEventListener("click", () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  buildTeacherSchedule();
});

$("teacherScheduleNext")?.addEventListener("click", () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  buildTeacherSchedule();
});

// ============================================================
// LESSON DETAIL — tap a booked slot to see the student, their
// course book, lesson history, and remarks left by any teacher who
// has taught them before. A teacher must leave a remark for a class
// before it's marked hasRemark: true — the admin Billing view uses
// that flag to show which of a teacher's classes are still missing
// a remark before they get paid for it.
// ============================================================

function closeLessonDetail() {
  const overlay = $("lessonDetailOverlay");
  if (overlay) overlay.style.display = "none";
}

async function openLessonDetail(lesson) {
  const overlay = $("lessonDetailOverlay");
  const content = $("lessonDetailContent");

  if (!overlay || !content) return;

  content.replaceChildren();

  const role = sessionStorage.getItem("prolingo_role");
  const canEdit =
    role === "admin" ||
    (role === "teacher" && lesson.teacherId === currentUser?.uid);
  const isOwnBookingStudent =
    role === "student" && lesson.studentId === currentUser?.uid;

  const heading = document.createElement("h2");
  heading.textContent = isOwnBookingStudent
    ? `Class with ${resolveTeacherName(lesson.teacherId, lesson.teacherName)}`
    : lesson.studentName || "Student";
  content.appendChild(heading);

  if (!isOwnBookingStudent && lesson.studentEnglishName) {
    const englishNameLine = document.createElement("p");
    englishNameLine.className = "panel-copy";
    englishNameLine.textContent = `English name: ${lesson.studentEnglishName}`;
    content.appendChild(englishNameLine);
  }

  const whenLine = document.createElement("p");
  whenLine.className = "panel-copy";
  whenLine.textContent = `${lesson.date || ""} · ${
    timeSlots[lesson.slot] || ""
  }`;
  content.appendChild(whenLine);

  // ---- Teacher info — especially useful for the student's own view ----
  const teacherRecord = teachers.find((t) => t.authUid === lesson.teacherId);

  if (teacherRecord) {
    const teacherInfoBox = document.createElement("div");
    teacherInfoBox.className = "lesson-detail-teacher";

    if (teacherRecord.photoUrl) {
      const teacherPhoto = document.createElement("img");
      teacherPhoto.src = teacherRecord.photoUrl;
      teacherPhoto.alt = teacherRecord.name || "Teacher";
      teacherPhoto.className = "lesson-detail-teacher-photo";
      teacherInfoBox.appendChild(teacherPhoto);
    }

    const teacherTextBox = document.createElement("div");

    const teacherNameLine = document.createElement("strong");
    teacherNameLine.textContent = teacherRecord.name || lesson.teacherName || "Teacher";
    teacherTextBox.appendChild(teacherNameLine);

    if (teacherRecord.specialization) {
      const specLine = document.createElement("span");
      specLine.className = "teacher-specialization";
      specLine.textContent = teacherRecord.specialization;
      teacherTextBox.appendChild(document.createElement("br"));
      teacherTextBox.appendChild(specLine);
    }

    teacherInfoBox.appendChild(teacherTextBox);
    content.appendChild(teacherInfoBox);
  }

  // ---- Approval status + the call itself ----
  const isPending = lesson.approvalStatus === "pending";

  const statusLine = document.createElement("p");
  statusLine.className = "panel-copy";
  statusLine.textContent = isPending
    ? "Status: Pending teacher approval"
    : "Status: Confirmed";
  content.appendChild(statusLine);

  if (canEdit && isPending) {
    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "solid-btn";
    approveBtn.textContent = "Approve booking";

    approveBtn.addEventListener("click", async () => {
      approveBtn.disabled = true;

      try {
        // Older bookings made before this feature won't have a room
        // reserved yet — reserve one now so approval always leaves
        // both sides with a call ready to join.
        const roomId = lesson.roomId || doc(collection(db, "rooms")).id;

        await updateDoc(doc(db, "lessons", lesson.id), {
          approvalStatus: "confirmed",
          roomId
        });

        lesson.approvalStatus = "confirmed";
        lesson.roomId = roomId;
        closeLessonDetail();
        alert("Booking approved — the student can now join the call here.");
      } catch (error) {
        console.error("Failed to approve booking:", error);
        alert("Couldn't approve: " + error.message);
        approveBtn.disabled = false;
      }
    });

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.className = "ghost-btn";
    declineBtn.textContent = "Decline booking";

    declineBtn.addEventListener("click", async () => {
      const confirmedDecline = confirm(
        `Decline ${lesson.studentName || "this student"}'s request for ${
          lesson.date || ""
        } · ${timeSlots[lesson.slot] || ""}? This frees up the slot again.`
      );

      if (!confirmedDecline) return;

      declineBtn.disabled = true;

      try {
        await deleteDoc(doc(db, "lessons", lesson.id));
        closeLessonDetail();
      } catch (error) {
        console.error("Failed to decline booking:", error);
        alert("Couldn't decline: " + error.message);
        declineBtn.disabled = false;
      }
    });

    content.append(approveBtn, declineBtn);
  }

  if (!isPending && lesson.roomId) {
    const callBtn = document.createElement("button");
    callBtn.type = "button";
    callBtn.className = "solid-btn";
    callBtn.textContent = canEdit ? "Start call" : "Join call";

    callBtn.addEventListener("click", async () => {
      closeLessonDetail();
      showView("classroom");

      try {
        if (canEdit) {
          await createRoom({ explicitRoomId: lesson.roomId });
        } else {
          await joinRoom(lesson.roomId);
        }
      } catch (error) {
        console.error("Failed to join scheduled call:", error);
        alert("Couldn't join the call: " + error.message);
      }
    });

    content.appendChild(callBtn);
  }

  if (canEdit) {
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "ghost-btn";
    cancelBtn.textContent = "Cancel this booking";

    cancelBtn.addEventListener("click", async () => {
      const confirmed = confirm(
        `Cancel ${lesson.studentName || "this student"}'s booking for ${
          lesson.date || ""
        } · ${timeSlots[lesson.slot] || ""}? This can't be undone.`
      );

      if (!confirmed) return;

      cancelBtn.disabled = true;

      try {
        await deleteDoc(doc(db, "lessons", lesson.id));
        closeLessonDetail();
      } catch (error) {
        console.error("Failed to cancel booking:", error);
        alert("Couldn't cancel: " + error.message);
        cancelBtn.disabled = false;
      }
    });

    content.appendChild(cancelBtn);
  }

  // ---- Course book / material (teacher/admin editable) ----
  const bookHeading = document.createElement("h3");
  bookHeading.textContent = "Selected book / material";
  content.appendChild(bookHeading);

  const bookRow = document.createElement("div");
  bookRow.className = "profile-inline-form";

  const bookInput = document.createElement("input");
  bookInput.type = "text";
  bookInput.placeholder = "e.g. New English File — Book 2, Unit 5";
  bookInput.value = lesson.courseBook || "";
  bookInput.disabled = !canEdit;

  bookRow.appendChild(bookInput);

  if (canEdit) {
    const saveBookBtn = document.createElement("button");
    saveBookBtn.type = "button";
    saveBookBtn.className = "solid-btn";
    saveBookBtn.textContent = "Save";

    saveBookBtn.addEventListener("click", async () => {
      saveBookBtn.disabled = true;

      try {
        await updateDoc(doc(db, "lessons", lesson.id), {
          courseBook: bookInput.value.trim()
        });
        lesson.courseBook = bookInput.value.trim();
      } catch (error) {
        console.error("Failed to save course book:", error);
        alert("Couldn't save: " + error.message);
      } finally {
        saveBookBtn.disabled = false;
      }
    });

    bookRow.appendChild(saveBookBtn);
  }

  content.appendChild(bookRow);

  // ---- Lesson history for this student (any teacher) ----
  const historyHeading = document.createElement("h3");
  historyHeading.textContent = "Lesson history";
  content.appendChild(historyHeading);

  const historyList = document.createElement("ul");
  historyList.className = "lesson-list";
  content.appendChild(historyList);

  const historyEmpty = document.createElement("p");
  historyEmpty.className = "empty-state";
  historyEmpty.textContent = "Loading…";
  content.appendChild(historyEmpty);

  try {
    const historySnap = await getDocs(
      query(collection(db, "lessons"), where("studentId", "==", lesson.studentId))
    );

    const historyItems = [];

    historySnap.forEach((docSnap) => {
      const d = docSnap.data();
      if (d.type !== "booking") return;

      historyItems.push({
        date: d.date || "",
        slot: Number(d.slot),
        teacherName: d.teacherName || ""
      });
    });

    historyItems.sort((a, b) => a.date.localeCompare(b.date));

    if (historyItems.length === 0) {
      historyEmpty.textContent = "No previous lessons found.";
    } else {
      historyEmpty.remove();

      historyItems.forEach((item) => {
        const li = document.createElement("li");
        li.className = "lesson-row";
        li.textContent = `${item.date} · ${timeSlots[item.slot] || ""}${
          item.teacherName ? " · " + item.teacherName : ""
        }`;
        historyList.appendChild(li);
      });
    }
  } catch (error) {
    console.error("Failed to load lesson history:", error);
    historyEmpty.textContent = "Couldn't load lesson history.";
  }

  // ---- Previous remarks left by any teacher for this student ----
  // Teacher/admin only — matches the classRemarks Firestore rule, and
  // these are internal instructor notes, not meant for the student.
  if (canEdit) {
    const remarksHeading = document.createElement("h3");
    remarksHeading.textContent = "Previous remarks";
    content.appendChild(remarksHeading);

    const remarksList = document.createElement("ul");
    remarksList.className = "lesson-list";
    content.appendChild(remarksList);

    const remarksEmpty = document.createElement("p");
    remarksEmpty.className = "empty-state";
    remarksEmpty.textContent = "Loading…";
    content.appendChild(remarksEmpty);

    try {
      const remarksSnap = await getDocs(
        query(
          collection(db, "classRemarks"),
          where("studentId", "==", lesson.studentId)
        )
      );

      const remarkItems = [];

      remarksSnap.forEach((docSnap) => {
        const d = docSnap.data();
        remarkItems.push({
          teacherName: d.teacherName || "Teacher",
          remark: d.remark || "",
          createdAt: d.createdAt || 0
        });
      });

      remarkItems.sort((a, b) => b.createdAt - a.createdAt);

      if (remarkItems.length === 0) {
        remarksEmpty.textContent = "No previous remarks yet.";
      } else {
        remarksEmpty.remove();

        remarkItems.forEach((item) => {
          const li = document.createElement("li");
          li.className = "lesson-row";

          const info = document.createElement("div");
          info.className = "lesson-info";

          const title = document.createElement("strong");
          title.textContent = item.teacherName;

          const details = document.createElement("span");
          details.textContent = `${new Date(
            item.createdAt
          ).toLocaleDateString()} — ${item.remark}`;

          info.append(title, details);
          li.appendChild(info);
          remarksList.appendChild(li);
        });
      }
    } catch (error) {
      console.error("Failed to load previous remarks:", error);
      remarksEmpty.textContent = "Couldn't load previous remarks.";
    }
  }

  // ---- Leave a remark for THIS class (required before it's payable) ----
  if (canEdit) {
    const remarkHeading = document.createElement("h3");
    remarkHeading.textContent = lesson.hasRemark
      ? "Your remark for this class"
      : "Leave your remark for this class";
    content.appendChild(remarkHeading);

    if (lesson.hasRemark) {
      const doneP = document.createElement("p");
      doneP.className = "feedback-thanks";
      doneP.textContent = "Remark already submitted for this class.";
      content.appendChild(doneP);
    } else {
      const warnP = document.createElement("p");
      warnP.className = "empty-state";
      warnP.textContent =
        "A remark is required before this class counts toward pay.";
      content.appendChild(warnP);

      const remarkInput = document.createElement("textarea");
      remarkInput.className = "feedback-comment";
      remarkInput.rows = 3;
      remarkInput.placeholder =
        "What did you cover, how did the student do, next steps…";
      content.appendChild(remarkInput);

      const submitRemarkBtn = document.createElement("button");
      submitRemarkBtn.type = "button";
      submitRemarkBtn.className = "solid-btn";
      submitRemarkBtn.textContent = "Submit remark";

      submitRemarkBtn.addEventListener("click", async () => {
        const remarkText = remarkInput.value.trim();

        if (!remarkText) {
          alert("Write a remark first.");
          return;
        }

        submitRemarkBtn.disabled = true;

        try {
          await addDoc(collection(db, "classRemarks"), {
            lessonId: lesson.id,
            teacherId: currentUser.uid,
            teacherName: sessionStorage.getItem("prolingo_name") || "Teacher",
            studentId: lesson.studentId,
            remark: remarkText,
            createdAt: Date.now()
          });

          await updateDoc(doc(db, "lessons", lesson.id), {
            hasRemark: true
          });

          closeLessonDetail();
        } catch (error) {
          console.error("Failed to submit remark:", error);
          alert("Couldn't submit remark: " + error.message);
          submitRemarkBtn.disabled = false;
        }
      });

      content.appendChild(submitRemarkBtn);
    }
  }

  overlay.style.display = "flex";
}

const closeLessonDetailBtn = $("closeLessonDetailBtn");

if (closeLessonDetailBtn) {
  closeLessonDetailBtn.addEventListener("click", closeLessonDetail);
}

const lessonDetailOverlay = $("lessonDetailOverlay");

if (lessonDetailOverlay) {
  lessonDetailOverlay.addEventListener("click", (event) => {
    if (event.target === lessonDetailOverlay) closeLessonDetail();
  });
}

// ============================================================
// LESSONS LIVE SYNC
// ============================================================

let lessonsListenerStarted = false;

function startLessonsListener() {
  const role = sessionStorage.getItem("prolingo_role");
  const userId = auth.currentUser?.uid;

  if (lessonsListenerStarted) return;

  lessonsListenerStarted = true;

  onSnapshot(
    collection(db, "lessons"),
    (snapshot) => {
      bookings = [];
      lessons = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // Student/child should only see their own bookings
        if (role === "student") {
          if (data.type !== "booking") {
            return;
          }

          if (data.studentId !== userId) {
            return;
          }
        }

        // Teacher should only see their own lessons
        if (role === "teacher") {
          if (data.teacherId && data.teacherId !== userId) {
            return;
          }
        }

        const bookingDate =
          data.date ||
          (typeof data.day === "string" ? data.day : null);

        const booking = {
          id: docSnap.id,
          teacherId: data.teacherId || null,
          teacherName: data.teacherName || "",
          studentId: data.studentId || null,
          date: bookingDate,
          day: data.day,
          slot: Number(data.slot),
          type: data.type || "booked",
          label: data.label || data.studentName || "Booked",
          studentName: data.studentName || data.label || "—",
          studentEnglishName: data.studentEnglishName || "",
          courseBook: data.courseBook || "",
          hasRemark: Boolean(data.hasRemark),
          approvalStatus: data.approvalStatus || "pending",
          roomId: data.roomId || null
        };

        bookings.push(booking);

        if (
          bookingDate === getDateKey(currentWeekStart) &&
          Number.isInteger(booking.slot)
        ) {
          lessons.push({
            id: docSnap.id,
            teacherId: data.teacherId || null,
            teacherName: data.teacherName || "",
            studentId: data.studentId || null,
            studentName: data.studentName || "—",
            studentEnglishName: data.studentEnglishName || "",
            courseBook: data.courseBook || "",
            hasRemark: Boolean(data.hasRemark),
            date: bookingDate,
            slot: booking.slot,
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

// ============================================================
// FEEDBACK — live aggregation into per-teacher star ratings
// ============================================================

let feedbackEntries = [];
let feedbackListenerStarted = false;
let teacherRatings = {}; // teacherAuthUid -> { avg, count }

function computeTeacherRatings() {
  const sums = {};

  feedbackEntries.forEach((entry) => {
    if (!entry.teacherId) return;

    if (!sums[entry.teacherId]) {
      sums[entry.teacherId] = { total: 0, count: 0 };
    }

    sums[entry.teacherId].total += entry.rating;
    sums[entry.teacherId].count += 1;
  });

  teacherRatings = {};

  Object.keys(sums).forEach((teacherId) => {
    teacherRatings[teacherId] = {
      avg: sums[teacherId].total / sums[teacherId].count,
      count: sums[teacherId].count
    };
  });
}

function startFeedbackListener() {
  if (feedbackListenerStarted) return;
  feedbackListenerStarted = true;

  onSnapshot(
    collection(db, "feedback"),
    (snapshot) => {
      feedbackEntries = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        feedbackEntries.push({
          teacherId: data.teacherId || null,
          rating: Number(data.rating) || 0,
          comment: data.comment || "",
          studentName: data.studentName || "Student",
          createdAt: data.createdAt || 0
        });
      });

      computeTeacherRatings();
      renderTeachers();
    },
    (error) => {
      console.error("Feedback listener error:", error);
    }
  );
}

let teachers = [];
let teachersListenerStarted = false;

// ============================================================
// TEACHERS — INTRO VIDEO PLAYBACK (in-page, no Cloud Storage)
//
// teacher.introVideoUrl can be a YouTube link, a Vimeo link, or a
// direct video file URL (hosted anywhere — GitHub, Cloudinary's free
// tier, etc). Whichever it is, it plays inline on this page instead
// of sending the visitor to another site.
// ============================================================

function getVideoEmbed(url) {
  if (!url) return null;

  const youtubeMatch = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/
  );

  if (youtubeMatch) {
    return {
      type: "iframe",
      src: `https://www.youtube.com/embed/${youtubeMatch[1]}`
    };
  }

  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);

  if (vimeoMatch) {
    return {
      type: "iframe",
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}`
    };
  }

  const loomMatch = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);

  if (loomMatch) {
    return {
      type: "iframe",
      src: `https://www.loom.com/embed/${loomMatch[1]}`
    };
  }

  // Anything else is treated as a direct, playable video file URL.
  return { type: "file", src: url };
}

function buildIntroVideoBlock(teacher) {
  const embed = getVideoEmbed(teacher.introVideoUrl);

  if (!embed) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "teacher-intro-video";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "ghost-btn intro-video-toggle";
  toggleBtn.textContent = "▶ Watch intro";

  const playerHolder = document.createElement("div");
  playerHolder.className = "intro-video-player";
  playerHolder.style.display = "none";

  let loaded = false;

  toggleBtn.addEventListener("click", () => {
    const isHidden = playerHolder.style.display === "none";

    if (isHidden) {
      if (!loaded) {
        if (embed.type === "iframe") {
          const iframe = document.createElement("iframe");
          iframe.src = embed.src;
          iframe.allow =
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
          iframe.allowFullscreen = true;
          iframe.loading = "lazy";
          playerHolder.appendChild(iframe);
        } else {
          const video = document.createElement("video");
          video.src = embed.src;
          video.controls = true;
          video.playsInline = true;
          playerHolder.appendChild(video);
        }
        loaded = true;
      }

      playerHolder.style.display = "block";
      toggleBtn.textContent = "▲ Hide intro";
    } else {
      // Stop playback rather than just hiding it — reloading an
      // iframe's own src stops YouTube/Vimeo; pausing does it for
      // a native <video>.
      const video = playerHolder.querySelector("video");
      if (video) video.pause();

      const iframe = playerHolder.querySelector("iframe");
      if (iframe) iframe.src = iframe.src;

      playerHolder.style.display = "none";
      toggleBtn.textContent = "▶ Watch intro";
    }
  });

  wrapper.append(toggleBtn, playerHolder);
  return wrapper;
}

// Certificates a teacher uploads themselves (see the "My
// certificates" panel in Profile) show up here automatically —
// they live as a `certificates` array field on the same teachers/{id}
// doc the admin form edits, so this needs no separate listener.
function buildCertificatesBlock(teacher) {
  const certs = teacher.certificates || [];

  if (certs.length === 0) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "teacher-certificates";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "ghost-btn";
  toggleBtn.textContent = `📄 Certificates (${certs.length})`;

  const listHolder = document.createElement("ul");
  listHolder.className = "certificate-links";
  listHolder.style.display = "none";

  certs.forEach((cert) => {
    const li = document.createElement("li");

    const link = document.createElement("a");
    link.href = cert.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = cert.fileName || "View certificate";

    li.appendChild(link);
    listHolder.appendChild(li);
  });

  toggleBtn.addEventListener("click", () => {
    const isHidden = listHolder.style.display === "none";
    listHolder.style.display = isHidden ? "block" : "none";
  });

  wrapper.append(toggleBtn, listHolder);
  return wrapper;
}

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
      selectedTeacherId = teacher.authUid;

      if (!selectedTeacherId) {
        alert("This teacher is missing their Firebase Auth UID.");
        console.error("Missing authUid for teacher:", teacher);
        return;
      }

      selectedTeacherName = teacher.name || "Teacher";

      showView("teacherSchedule");
      buildTeacherSchedule();
    });

    const ratingLine = document.createElement("p");
    ratingLine.className = "teacher-rating";

    const ratingInfo = teacherRatings[teacher.authUid];

    if (ratingInfo) {
      const fullStars = Math.round(ratingInfo.avg);
      ratingLine.textContent = `${"★".repeat(fullStars)}${"☆".repeat(
        5 - fullStars
      )} ${ratingInfo.avg.toFixed(1)} (${ratingInfo.count} rating${
        ratingInfo.count === 1 ? "" : "s"
      })`;
    } else {
      ratingLine.textContent = "☆☆☆☆☆ No ratings yet";
    }

    content.append(
      name,
      specialization,
      ratingLine,
      bio,
      details
    );

    const introVideo = buildIntroVideoBlock(teacher);
    if (introVideo) content.append(introVideo);

    const certificatesBlock = buildCertificatesBlock(teacher);
    if (certificatesBlock) content.append(certificatesBlock);

    content.append(button);

    const role = sessionStorage.getItem("prolingo_role");

    if (role === "admin") {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "ghost-btn teacher-edit-btn";
      editBtn.textContent = "Edit profile";

      editBtn.addEventListener("click", () => {
        showTeacherForm(teacher);
      });

      content.append(editBtn);
    }

    card.append(photo, content);
    teacherGrid.appendChild(card);
  });
}

// ============================================================
// ADMIN — ADD / EDIT TEACHER PROFILE
//
// The only way teacher profiles (including their directory photo)
// get created or changed. Photo upload reuses the same
// uploadToCloudinary() pipeline as lesson materials and the user
// profile photo — no separate service needed. Firestore already
// restricts all writes to the "teachers" collection to admins
// (see firestore.rules), so no rules change was needed for this.
// ============================================================

const teacherFormPanel = $("teacherFormPanel");
const teacherFormTitle = $("teacherFormTitle");
const teacherFormPhotoInput = $("teacherFormPhotoInput");
const teacherFormPhotoPreview = $("teacherFormPhotoPreview");
const teacherFormPhotoStatus = $("teacherFormPhotoStatus");
const teacherFormName = $("teacherFormName");
const teacherFormAuthUid = $("teacherFormAuthUid");
const teacherFormSpecialization = $("teacherFormSpecialization");
const teacherFormQualifications = $("teacherFormQualifications");
const teacherFormTeachingStyle = $("teacherFormTeachingStyle");
const teacherFormIntroVideoUrl = $("teacherFormIntroVideoUrl");
const teacherFormBio = $("teacherFormBio");
const saveTeacherBtn = $("saveTeacherBtn");
const cancelTeacherFormBtn = $("cancelTeacherFormBtn");
const addTeacherBtn = $("addTeacherBtn");

let teacherFormEditingId = null;
let teacherFormPhotoUrl = "";

function showTeacherForm(teacher) {
  teacherFormEditingId = teacher?.id || null;
  teacherFormPhotoUrl = teacher?.photoUrl || "";

  if (teacherFormTitle) {
    teacherFormTitle.textContent = teacher ? "Edit teacher" : "Add teacher";
  }

  if (teacherFormName) teacherFormName.value = teacher?.name || "";
  if (teacherFormAuthUid) teacherFormAuthUid.value = teacher?.authUid || "";
  if (teacherFormSpecialization) {
    teacherFormSpecialization.value = teacher?.specialization || "";
  }
  if (teacherFormQualifications) {
    teacherFormQualifications.value = teacher?.qualifications || "";
  }
  if (teacherFormTeachingStyle) {
    teacherFormTeachingStyle.value = teacher?.teachingStyle || "";
  }
  if (teacherFormIntroVideoUrl) {
    teacherFormIntroVideoUrl.value = teacher?.introVideoUrl || "";
  }
  if (teacherFormBio) teacherFormBio.value = teacher?.bio || "";
  if (teacherFormPhotoPreview) {
    teacherFormPhotoPreview.src = teacherFormPhotoUrl || "default-teacher.png";
  }
  if (teacherFormPhotoStatus) teacherFormPhotoStatus.textContent = "";

  if (teacherFormPanel) teacherFormPanel.style.display = "block";
}

function hideTeacherForm() {
  teacherFormEditingId = null;
  teacherFormPhotoUrl = "";
  if (teacherFormPanel) teacherFormPanel.style.display = "none";
}

if (addTeacherBtn) {
  addTeacherBtn.addEventListener("click", () => {
    showTeacherForm(null);
  });
}

if (cancelTeacherFormBtn) {
  cancelTeacherFormBtn.addEventListener("click", () => {
    hideTeacherForm();
  });
}

if (teacherFormPhotoInput) {
  teacherFormPhotoInput.addEventListener("change", async () => {
    const file = teacherFormPhotoInput.files?.[0];

    if (!file) return;

    if (teacherFormPhotoStatus) {
      teacherFormPhotoStatus.textContent = `Uploading ${file.name}… 0%`;
    }

    try {
      const result = await uploadToCloudinary(file, (percent) => {
        if (teacherFormPhotoStatus) {
          teacherFormPhotoStatus.textContent = `Uploading ${file.name}… ${percent}%`;
        }
      });

      teacherFormPhotoUrl = result.secure_url;

      if (teacherFormPhotoPreview) {
        teacherFormPhotoPreview.src = teacherFormPhotoUrl;
      }

      if (teacherFormPhotoStatus) {
        teacherFormPhotoStatus.textContent = "Photo uploaded!";
      }
    } catch (error) {
      console.error("Teacher photo upload failed:", error);

      if (teacherFormPhotoStatus) {
        teacherFormPhotoStatus.textContent = `Upload failed: ${error.message}`;
      }

      alert("Upload failed: " + error.message);
    } finally {
      teacherFormPhotoInput.value = "";
    }
  });
}

if (saveTeacherBtn) {
  saveTeacherBtn.addEventListener("click", async () => {
    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }

    const name = teacherFormName?.value.trim();

    if (!name) {
      alert("Enter the teacher's name first.");
      return;
    }

    const teacherData = {
      name,
      authUid: teacherFormAuthUid?.value.trim() || "",
      specialization: teacherFormSpecialization?.value.trim() || "",
      qualifications: teacherFormQualifications?.value.trim() || "",
      teachingStyle: teacherFormTeachingStyle?.value.trim() || "",
      introVideoUrl: teacherFormIntroVideoUrl?.value.trim() || "",
      bio: teacherFormBio?.value.trim() || "",
      photoUrl: teacherFormPhotoUrl || ""
    };

    saveTeacherBtn.disabled = true;

    try {
      if (teacherFormEditingId) {
        await updateDoc(doc(db, "teachers", teacherFormEditingId), teacherData);
      } else {
        await addDoc(collection(db, "teachers"), {
          ...teacherData,
          createdAt: Date.now()
        });
      }

      hideTeacherForm();
    } catch (error) {
      console.error("Failed to save teacher:", error);
      alert("Couldn't save teacher: " + error.message);
    } finally {
      saveTeacherBtn.disabled = false;
    }
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
      renderMyCertificates();
      renderLessons();
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
// ADMIN / TEACHER — PUBLISH AVAILABILITY
// ============================================================

const updateCalendarBtn = document.getElementById("updateCalendarBtn");

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
        teacherName: sessionStorage.getItem("prolingo_name") || "Teacher",
        date,
        day,
        slot,
        type: "availability",
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

function getMediaErrorMessage(error) {
  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera/microphone access was blocked. Allow camera and microphone permissions for this site in your browser settings, then try again.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera or microphone was found on this device.";
    case "NotReadableError":
      return "Your camera or microphone is already in use by another application. Close it and try again.";
    case "OverconstrainedError":
      return "No camera/microphone on this device matches the requested settings.";
    default:
      return error.message || "Unable to access the camera and microphone.";
  }
}

async function startCamera() {
  if (!localVideo) {
    throw new Error("Camera preview is unavailable.");
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera is not supported in this browser.");
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

    throw new Error(getMediaErrorMessage(error));
  }
}

function stopCamera() {
  stopMicVisualizer();
  resetPeerConnection();

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
    try {
      if (localStream) {
        stopCamera();
      } else {
        await startCamera();
      }
    } catch (error) {
      alert(error.message);
    }
  });
}

if (cameraToggle) {
  cameraToggle.addEventListener("click", async () => {
    try {
      if (localStream) {
        stopCamera();
      } else {
        await startCamera();
      }
    } catch (error) {
      alert(error.message);
    }
  });
}

// ============================================================
// CLASSROOM — WEBRTC (peer video/audio between two participants)
//
// Firestore is used purely as a signaling channel to exchange the
// SDP offer/answer and ICE candidates — the actual audio/video never
// touches Firestore, it flows peer-to-peer once negotiation is done:
//
//   rooms/{roomId}                          -> { offer, answer, createdBy, ... }
//   rooms/{roomId}/callerCandidates/{auto}  -> ICE candidates from whoever created the room
//   rooms/{roomId}/calleeCandidates/{auto}  -> ICE candidates from whoever joined it
//
// This supports one participant on each side of a room (a single
// teacher/student pair). Whoever clicks "Create room" is the caller;
// whoever enters that code and clicks "Join room" is the callee.
// ============================================================

const createRoomBtn = $("createRoomBtn");
const joinRoomBtn = $("joinRoomBtn");
const leaveRoomBtn = $("leaveRoomBtn");
const roomInput = $("roomInput");
const remoteVideo = $("remoteVideo");

const rtcConfig = {
  iceServers: [
    {
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302"
      ]
    }
  ]
};

let peerConnection = null;
let remoteStream = null;
let activeRoomId = null;
let isRoomHost = false;
let activeScheduledClassId = null;
let unsubscribeRoom = null;
let unsubscribeCandidates = null;
let reconnectAttempted = false;

function setRemoteVisible(visible) {
  if (remoteVideo) remoteVideo.classList.toggle("is-visible", visible);
  showElement("remoteVideoPlaceholder", !visible);
}

// ------------------------------------------------------------
// Connection status pill (#roomStatus, optional element — the
// classroom still works if this isn't present in the markup).
// ------------------------------------------------------------
const ROOM_STATUS_LABELS = {
  idle: "",
  connecting: "Connecting…",
  connected: "Connected",
  reconnecting: "Reconnecting…",
  disconnected: "Disconnected",
  failed: "Connection failed"
};

function updateRoomStatus(state) {
  const el = $("roomStatus");
  if (!el) return;

  el.textContent = ROOM_STATUS_LABELS[state] ?? "";
  el.dataset.state = state;
}

// ------------------------------------------------------------
// Roster — driven by the room document itself (createdByName /
// joinedByName), so both sides see who else is in the room.
// ------------------------------------------------------------
function renderRoomRoster(data) {
  const rosterList = $("rosterList");
  if (!rosterList) return;

  const people = [];

  if (data?.createdByName) {
    people.push({
      name: data.createdByName,
      role: data.createdBy === currentUser?.uid ? "You" : "Host"
    });
  }

  if (data?.joinedByName) {
    people.push({
      name: data.joinedByName,
      role: data.joinedBy === currentUser?.uid ? "You" : "Guest"
    });
  }

  rosterList.replaceChildren();

  if (people.length === 0) {
    showElement("rosterEmpty", true);
    return;
  }

  showElement("rosterEmpty", false);

  people.forEach((person) => {
    const li = document.createElement("li");

    const avatar = document.createElement("span");
    avatar.className = "avatar-dot";

    const name = document.createTextNode(` ${person.name} `);

    const role = document.createElement("em");
    role.textContent = person.role;

    li.append(avatar, name, role);
    rosterList.appendChild(li);
  });
}

function clearRoomRoster() {
  const rosterList = $("rosterList");
  if (!rosterList) return;

  rosterList.replaceChildren();
  showElement("rosterEmpty", true);
}

function resetPeerConnection() {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }

  if (unsubscribeCandidates) {
    unsubscribeCandidates();
    unsubscribeCandidates = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  remoteStream = null;
  activeRoomId = null;
  isRoomHost = false;
  activeScheduledClassId = null;
  reconnectAttempted = false;

  if (remoteVideo) remoteVideo.srcObject = null;
  setRemoteVisible(false);
  updateRoomStatus("idle");
  stopBoardListener();
}

// Best effort only: restartIce() re-negotiates from the caller's
// side. It won't recover every case (e.g. the callee's network
// dropping entirely), but it recovers the common case of a
// temporary ICE hiccup without forcing both sides to re-join.
function attemptReconnect(pc) {
  if (reconnectAttempted) return;
  reconnectAttempted = true;

  updateRoomStatus("reconnecting");

  if (typeof pc.restartIce === "function") {
    try {
      pc.restartIce();
    } catch (error) {
      console.warn("ICE restart failed:", error);
    }
  }

  // If we're not back to a healthy state after a few seconds,
  // give up and tell the user plainly instead of hanging silently.
  setTimeout(() => {
    if (
      peerConnection === pc &&
      (pc.connectionState === "disconnected" || pc.connectionState === "failed")
    ) {
      updateRoomStatus("failed");
      setRemoteVisible(false);
    }
  }, 8000);
}

function createPeerConnection() {
  const pc = new RTCPeerConnection(rtcConfig);

  remoteStream = new MediaStream();
  if (remoteVideo) remoteVideo.srcObject = remoteStream;

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    setRemoteVisible(true);
  };

  pc.onconnectionstatechange = () => {
    console.log("WebRTC connection state:", pc.connectionState);

    switch (pc.connectionState) {
      case "connected":
        reconnectAttempted = false;
        updateRoomStatus("connected");
        break;

      case "disconnected":
        setRemoteVisible(false);
        attemptReconnect(pc);
        break;

      case "failed":
        setRemoteVisible(false);
        updateRoomStatus("failed");
        break;

      case "closed":
        setRemoteVisible(false);
        updateRoomStatus("idle");
        break;
    }
  };

  return pc;
}

async function ensureLocalStream() {
  if (!localStream) {
    await startCamera();
  }

  if (!localStream) {
    throw new Error("Camera/microphone access is required to use the classroom.");
  }
}

// Shared by both host and guest: keeps the roster in sync, applies
// the answer once it arrives, and tells the remaining participant
// plainly if the other side ends the class (the room doc is deleted).
function attachRoomListener(roomRef, pc) {
  unsubscribeRoom = onSnapshot(roomRef, async (snapshot) => {
    const data = snapshot.data();

    if (!data) {
      if (peerConnection === pc) {
        alert("The other participant ended the class.");
        resetPeerConnection();
        setText("roomCode", "—");
        if (roomInput) roomInput.value = "";
        clearRoomRoster();
      }
      return;
    }

    renderRoomRoster(data);
    applyBoardLockState(Boolean(data.boardLocked));

    if (
      data.answer &&
      pc.signalingState !== "closed" &&
      !pc.currentRemoteDescription
    ) {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  });
}

async function createRoom(options = {}) {
  const { explicitRoomId, scheduledClassId } = options;

  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  await ensureLocalStream();

  resetPeerConnection();
  updateRoomStatus("connecting");

  const roomRef = explicitRoomId
    ? doc(db, "rooms", explicitRoomId)
    : doc(collection(db, "rooms"));

  activeRoomId = roomRef.id;
  isRoomHost = true;
  activeScheduledClassId = scheduledClassId || null;

  const pc = createPeerConnection();
  peerConnection = pc;

  const callerCandidates = collection(roomRef, "callerCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(callerCandidates, event.candidate.toJSON());
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await setDoc(roomRef, {
    offer: { type: offer.type, sdp: offer.sdp },
    createdBy: currentUser.uid,
    createdByName: sessionStorage.getItem("prolingo_name") || "Host",
    createdAt: Date.now()
  });

  if (scheduledClassId) {
    try {
      await updateDoc(doc(db, "scheduledClasses", scheduledClassId), {
        status: "live"
      });
    } catch (error) {
      console.error("Failed to mark scheduled class live:", error);
    }
  }

  setText("roomCode", activeRoomId);
  if (roomInput) roomInput.value = activeRoomId;

  attachRoomListener(roomRef, pc);
  startBoardListener(activeRoomId);

  unsubscribeCandidates = onSnapshot(calleeCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      }
    });
  });
}

async function joinRoom(roomId) {
  if (!currentUser) {
    alert("Please sign in first.");
    return;
  }

  if (!roomId) {
    alert("Enter a room code first.");
    return;
  }

  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    alert("No room found with that code.");
    return;
  }

  await ensureLocalStream();

  resetPeerConnection();
  updateRoomStatus("connecting");
  activeRoomId = roomId;
  isRoomHost = false;

  const pc = createPeerConnection();
  peerConnection = pc;

  const calleeCandidates = collection(roomRef, "calleeCandidates");

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(calleeCandidates, event.candidate.toJSON());
    }
  };

  const offer = roomSnap.data().offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await updateDoc(roomRef, {
    answer: { type: answer.type, sdp: answer.sdp },
    joinedBy: currentUser.uid,
    joinedByName: sessionStorage.getItem("prolingo_name") || "Guest"
  });

  setText("roomCode", roomId);

  attachRoomListener(roomRef, pc);
  startBoardListener(roomId);

  unsubscribeCandidates = onSnapshot(callerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
      }
    });
  });
}

// Leaving always disconnects locally. If you're the host, it also
// deletes the room doc — ending the class for the other side too,
// since without a host there's nothing to reconnect to.
async function leaveRoom() {
  const roomId = activeRoomId;
  const wasHost = isRoomHost;
  const scheduledClassId = activeScheduledClassId;

  resetPeerConnection();

  setText("roomCode", "—");
  if (roomInput) roomInput.value = "";
  clearRoomRoster();

  if (wasHost && roomId) {
    try {
      await deleteDoc(doc(db, "rooms", roomId));
    } catch (error) {
      console.error("Failed to clean up room:", error);
    }
  }

  if (wasHost && scheduledClassId) {
    try {
      await updateDoc(doc(db, "scheduledClasses", scheduledClassId), {
        status: "ended"
      });
    } catch (error) {
      console.error("Failed to mark scheduled class ended:", error);
    }
  }
}

if (createRoomBtn) {
  createRoomBtn.addEventListener("click", async () => {
    createRoomBtn.disabled = true;

    try {
      await createRoom();
    } catch (error) {
      console.error("Failed to create room:", error);
      alert("Couldn't create the room: " + error.message);
      updateRoomStatus("idle");
    } finally {
      createRoomBtn.disabled = false;
    }
  });
}

if (joinRoomBtn) {
  joinRoomBtn.addEventListener("click", async () => {
    const roomId = roomInput?.value.trim();

    joinRoomBtn.disabled = true;

    try {
      await joinRoom(roomId);
    } catch (error) {
      console.error("Failed to join room:", error);
      alert("Couldn't join the room: " + error.message);
      updateRoomStatus("idle");
    } finally {
      joinRoomBtn.disabled = false;
    }
  });
}

if (leaveRoomBtn) {
  leaveRoomBtn.addEventListener("click", async () => {
    if (!activeRoomId) return;

    leaveRoomBtn.disabled = true;

    try {
      await leaveRoom();
    } catch (error) {
      console.error("Failed to leave room:", error);
      alert("Something went wrong leaving the room: " + error.message);
    } finally {
      leaveRoomBtn.disabled = false;
    }
  });
}

// ============================================================
// CLASSROOM — SHARED WHITEBOARD
//
// rooms/{roomId}/boardActions/{id}: one doc per completed action
//   { type: 'stroke'|'text', tool: 'pen'|'eraser' (strokes only),
//     points: [{x,y}] (canvas-pixel coords, strokes only),
//     x, y (text only), text, color, lineWidth, createdAt }
// rooms/{roomId}.boardLocked: bool, host-only to change.
//
// The canvas is never treated as a single persistent bitmap that
// gets patched — it's fully redrawn from the ordered action list on
// every change. That's what makes two different devices converge on
// the same picture: replay the same actions in the same order and
// you get the same result, rather than trying to sync raw pixels.
//
// Two known, deliberate simplifications:
//   - "Fill" is a bucket-fill of a SEED POINT — only strokes/text
//     are individually selectable/deletable, not fills (there's no
//     simple geometric "this click hit that fill" test the way
//     there is for a stroke's path or a text box).
//   - Redo is personal, not shared: undoing removes the action for
//     everyone, but only the person who undid it can redo it back —
//     the same way undo/redo works in every other collaborative app.
// ============================================================

const boardCanvas = $("boardCanvas");
const wbColorRow = $("wbColorRow");
const wbLockedNotice = $("wbLockedNotice");
const wbLockBtn = $("wbLockBtn");
const wbUndoBtn = $("wbUndoBtn");
const wbRedoBtn = $("wbRedoBtn");
const wbFillBtn = $("wbFillBtn");
const wbDeleteBtn = $("wbDeleteBtn");

const WB_TOOL_BUTTON_IDS = [
  "wbSelectBtn",
  "wbPenBtn",
  "wbFillBtn",
  "wbTextBtn",
  "wbEraserBtn"
];

let boardActions = [];
let boardUnsubscribe = null;
let boardLocked = false;
let boardTool = "select";
let boardColor = "#241b38";
let boardSelectedId = null;
let boardRedoStack = []; // {id, data} of actions THIS client undid
let boardDrawing = false;
let boardCurrentStroke = null;
let boardBackgroundImage = null;
let boardBackgroundUrl = null;

function boardCanEdit() {
  if (!activeRoomId || !currentUser) return false;
  if (!boardLocked) return true;
  // Locked: only the host (whoever created this room — normally the
  // teacher) can still edit.
  return isRoomHost;
}

function getCanvasPoint(event) {
  const rect = boardCanvas.getBoundingClientRect();
  const scaleX = boardCanvas.width / rect.width;
  const scaleY = boardCanvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function setBoardTool(tool) {
  if (tool !== "select" && !boardCanEdit()) return;

  boardTool = tool;
  boardSelectedId = null;

  WB_TOOL_BUTTON_IDS.forEach((id) => {
    const btn = $(id);
    if (btn) btn.classList.toggle("is-active", btn.dataset.tool === tool);
  });

  if (wbColorRow) {
    wbColorRow.style.display =
      tool === "pen" || tool === "fill" || tool === "text" ? "flex" : "none";
  }

  redrawBoard();
}

WB_TOOL_BUTTON_IDS.forEach((id) => {
  const btn = $(id);
  if (btn) {
    btn.addEventListener("click", () => setBoardTool(btn.dataset.tool));
  }
});

document.querySelectorAll(".wb-color-swatch").forEach((swatch) => {
  swatch.addEventListener("click", () => {
    boardColor = swatch.dataset.color;
    document
      .querySelectorAll(".wb-color-swatch")
      .forEach((s) => s.classList.toggle("is-active", s === swatch));
  });
});

// ---- Rendering ----

function strokeHitTest(action, point, threshold) {
  return action.points.some(
    (p) => Math.hypot(p.x - point.x, p.y - point.y) <= threshold
  );
}

function textHitTest(action, point) {
  const fontSize = action.fontSize || 20;
  const approxWidth = (action.text || "").length * fontSize * 0.55;

  return (
    point.x >= action.x &&
    point.x <= action.x + approxWidth &&
    point.y >= action.y - fontSize &&
    point.y <= action.y
  );
}

function drawStrokeAction(ctx, action) {
  if (!action.points || action.points.length === 0) return;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = action.lineWidth || 3;

  if (action.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = action.color || "#241b38";
  }

  ctx.beginPath();
  ctx.moveTo(action.points[0].x, action.points[0].y);
  action.points.forEach((p) => ctx.lineTo(p.x, p.y));

  if (action.points.length === 1) {
    // A tap with no drag — draw a dot so it's still visible.
    ctx.lineTo(action.points[0].x + 0.1, action.points[0].y + 0.1);
  }

  ctx.stroke();
  ctx.restore();
}

function drawTextAction(ctx, action) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = action.color || "#241b38";
  ctx.font = `${action.fontSize || 20}px 'Inter', system-ui, sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(action.text || "", action.x, action.y);
  ctx.restore();
}

// Flood fill directly on the canvas's live pixel buffer — this only
// works correctly because it runs as part of the ordered replay
// below, so the pixels it reads reflect everything drawn before it
// in the same order on every device.
function applyFloodFill(ctx, seedX, seedY, hex) {
  const width = boardCanvas.width;
  const height = boardCanvas.height;

  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (error) {
    // A cross-origin background image without permissive CORS headers
    // taints the canvas and blocks pixel reads entirely — fail
    // quietly rather than breaking the whole board redraw over it.
    console.error("Flood fill unavailable (canvas may be CORS-tainted):", error);
    return;
  }

  const data = imageData.data;

  const startX = Math.round(seedX);
  const startY = Math.round(seedY);
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;

  const idx = (x, y) => (y * width + x) * 4;
  const startIdx = idx(startX, startY);
  const targetR = data[startIdx];
  const targetG = data[startIdx + 1];
  const targetB = data[startIdx + 2];
  const targetA = data[startIdx + 3];

  const fillColor = hexToRgb(hex);
  const tolerance = 40;

  const matches = (i) =>
    Math.abs(data[i] - targetR) <= tolerance &&
    Math.abs(data[i + 1] - targetG) <= tolerance &&
    Math.abs(data[i + 2] - targetB) <= tolerance &&
    Math.abs(data[i + 3] - targetA) <= tolerance;

  if (
    Math.abs(targetR - fillColor.r) <= tolerance &&
    Math.abs(targetG - fillColor.g) <= tolerance &&
    Math.abs(targetB - fillColor.b) <= tolerance
  ) {
    return; // already effectively this color
  }

  const stack = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;

    const vIndex = y * width + x;
    if (visited[vIndex]) continue;

    const i = idx(x, y);
    if (!matches(i)) continue;

    visited[vIndex] = 1;
    data[i] = fillColor.r;
    data[i + 1] = fillColor.g;
    data[i + 2] = fillColor.b;
    data[i + 3] = 255;

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  ctx.putImageData(imageData, 0, 0);
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16)
  };
}

/// ---- Uploaded lesson material as the board's background ----
//
// The latest uploaded lesson material (from the "Lesson upload"
// dropzone) becomes the board's actual background whenever it's an
// image — students and teacher draw directly on top of it, the same
// way flood fill and everything else already treats "whatever's
// currently on the canvas." Only images can be drawn onto a canvas
// this way; video and PDF/PPTX files stay in their existing preview
// area instead (rasterizing a PDF/PPTX client-side would need a
// separate library like pdf.js, which isn't wired up here).
function drawBoardBackground(ctx, img) {
  const canvasW = boardCanvas.width;
  const canvasH = boardCanvas.height;
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = canvasW / canvasH;

  let drawW, drawH;
  if (imgRatio > canvasRatio) {
    drawW = canvasW;
    drawH = canvasW / imgRatio;
  } else {
    drawH = canvasH;
    drawW = canvasH * imgRatio;
  }

  ctx.drawImage(
    img,
    (canvasW - drawW) / 2,
    (canvasH - drawH) / 2,
    drawW,
    drawH
  );
}

function updateBoardBackground() {
  const latest = materials[0];
  const isImage = latest && latest.fileType === "image" && latest.fileUrl;

  if (!isImage) {
    if (boardBackgroundUrl !== null) {
      boardBackgroundUrl = null;
      boardBackgroundImage = null;
      redrawBoard();
    }
    return;
  }

  if (boardBackgroundUrl === latest.fileUrl) {
    if (boardBackgroundImage) redrawBoard(); // reuse cached image
    return;
  }

  boardBackgroundUrl = latest.fileUrl;

  const img = new Image();
  img.crossOrigin = "anonymous";

  img.onload = () => {
    if (boardBackgroundUrl !== latest.fileUrl) return; // superseded meanwhile
    boardBackgroundImage = img;
    redrawBoard();
  };

  img.onerror = () => {
    console.error("Failed to load lesson material as whiteboard background.");
    if (boardBackgroundUrl === latest.fileUrl) {
      boardBackgroundImage = null;
    }
  };

  img.src = latest.fileUrl;
}

function redrawBoard() {
  if (!boardCanvas) return;
  const ctx = boardCanvas.getContext("2d");

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  if (boardBackgroundImage) {
    drawBoardBackground(ctx, boardBackgroundImage);
  }

  ctx.restore();

  boardActions.forEach((action) => {
    if (action.type === "stroke") {
      drawStrokeAction(ctx, action);
    } else if (action.type === "text") {
      drawTextAction(ctx, action);
    } else if (action.type === "fill") {
      applyFloodFill(ctx, action.x, action.y, action.color || "#241b38");
    }
  });

  if (boardSelectedId) {
    const selected = boardActions.find((a) => a.id === boardSelectedId);
    if (selected) drawSelectionHighlight(ctx, selected);
  }

  if (wbFillBtn) wbFillBtn.disabled = boardActions.length === 0;
  if (wbRedoBtn) wbRedoBtn.disabled = boardRedoStack.length === 0;
}

function drawSelectionHighlight(ctx, action) {
  ctx.save();
  ctx.strokeStyle = "#ff7a2e";
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;

  if (action.type === "stroke") {
    const xs = action.points.map((p) => p.x);
    const ys = action.points.map((p) => p.y);
    const pad = (action.lineWidth || 3) + 6;
    ctx.strokeRect(
      Math.min(...xs) - pad,
      Math.min(...ys) - pad,
      Math.max(...xs) - Math.min(...xs) + pad * 2,
      Math.max(...ys) - Math.min(...ys) + pad * 2
    );
  } else if (action.type === "text") {
    const fontSize = action.fontSize || 20;
    const approxWidth = (action.text || "").length * fontSize * 0.55;
    ctx.strokeRect(
      action.x - 4,
      action.y - fontSize - 2,
      approxWidth + 8,
      fontSize + 10
    );
  }

  ctx.restore();
}

// ---- Firestore sync ----

function startBoardListener(roomId) {
  stopBoardListener();
  updateBoardBackground();

  boardUnsubscribe = onSnapshot(
    query(collection(db, "rooms", roomId, "boardActions"), orderBy("createdAt")),
    (snapshot) => {
      boardActions = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      redrawBoard();
    },
    (error) => console.error("Whiteboard listener error:", error)
  );
}

function stopBoardListener() {
  if (boardUnsubscribe) {
    boardUnsubscribe();
    boardUnsubscribe = null;
  }
  boardActions = [];
  boardRedoStack = [];
  boardSelectedId = null;
  setBoardTool("select");
  if (boardCanvas) {
    const ctx = boardCanvas.getContext("2d");
    ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  }
}

function applyBoardLockState(locked) {
  boardLocked = locked;

  if (wbLockBtn) {
    wbLockBtn.textContent = locked ? "🔒" : "🔓";
    wbLockBtn.disabled = !isRoomHost;
  }

  const editable = boardCanEdit();

  ["wbPenBtn", "wbFillBtn", "wbTextBtn", "wbEraserBtn", "wbUndoBtn", "wbDeleteBtn"].forEach(
    (id) => {
      const btn = $(id);
      if (btn) btn.disabled = !editable || (id === "wbFillBtn" && boardActions.length === 0);
    }
  );

  showElement("wbLockedNotice", locked && !isRoomHost);

  if (!editable && boardTool !== "select") {
    setBoardTool("select");
  }
}

if (wbLockBtn) {
  wbLockBtn.addEventListener("click", async () => {
    if (!isRoomHost || !activeRoomId) return;

    try {
      await updateDoc(doc(db, "rooms", activeRoomId), {
        boardLocked: !boardLocked
      });
    } catch (error) {
      console.error("Failed to toggle board lock:", error);
      alert("Couldn't change the lock: " + error.message);
    }
  });
}

async function addBoardAction(data) {
  if (!activeRoomId || !currentUser) return;

  boardRedoStack = []; // a fresh action invalidates any pending redo

  await addDoc(collection(db, "rooms", activeRoomId, "boardActions"), {
    ...data,
    createdBy: currentUser.uid,
    createdAt: Date.now()
  });
}

if (wbUndoBtn) {
  wbUndoBtn.addEventListener("click", async () => {
    if (!boardCanEdit() || boardActions.length === 0) return;

    const last = boardActions[boardActions.length - 1];
    boardRedoStack.push({ id: last.id, data: { ...last } });

    try {
      await deleteDoc(doc(db, "rooms", activeRoomId, "boardActions", last.id));
    } catch (error) {
      console.error("Failed to undo:", error);
      boardRedoStack.pop();
    }
  });
}

if (wbRedoBtn) {
  wbRedoBtn.addEventListener("click", async () => {
    if (!boardCanEdit() || boardRedoStack.length === 0) return;

    const restore = boardRedoStack.pop();
    const { id, ...data } = restore.data;

    try {
      await setDoc(
        doc(db, "rooms", activeRoomId, "boardActions", restore.id),
        data
      );
    } catch (error) {
      console.error("Failed to redo:", error);
      boardRedoStack.push(restore);
    }
  });
}

if (wbDeleteBtn) {
  wbDeleteBtn.addEventListener("click", async () => {
    if (!boardCanEdit()) return;

    if (boardSelectedId) {
      try {
        await deleteDoc(
          doc(db, "rooms", activeRoomId, "boardActions", boardSelectedId)
        );
        boardSelectedId = null;
      } catch (error) {
        console.error("Failed to delete selection:", error);
      }
      return;
    }

    if (boardActions.length === 0) return;
    if (!confirm("Clear the whole whiteboard for everyone in this class?")) {
      return;
    }

    try {
      await Promise.all(
        boardActions.map((action) =>
          deleteDoc(doc(db, "rooms", activeRoomId, "boardActions", action.id))
        )
      );
    } catch (error) {
      console.error("Failed to clear whiteboard:", error);
    }
  });
}

// ---- Pointer interaction ----

if (boardCanvas) {
  boardCanvas.addEventListener("pointerdown", (event) => {
    if (!boardCanEdit()) return;

    const point = getCanvasPoint(event);

    if (boardTool === "pen" || boardTool === "eraser") {
      boardDrawing = true;
      boardCanvas.setPointerCapture(event.pointerId);
      boardCurrentStroke = {
        type: "stroke",
        tool: boardTool,
        color: boardColor,
        lineWidth: boardTool === "eraser" ? 18 : 3,
        points: [point]
      };
    } else if (boardTool === "fill") {
      addBoardAction({ type: "fill", x: point.x, y: point.y, color: boardColor });
    } else if (boardTool === "text") {
      const text = prompt("Enter text:");
      if (text && text.trim()) {
        addBoardAction({
          type: "text",
          x: point.x,
          y: point.y,
          text: text.trim(),
          color: boardColor,
          fontSize: 20
        });
      }
    } else if (boardTool === "select") {
      const threshold = 10;
      const hit = [...boardActions].reverse().find((action) => {
        if (action.type === "stroke") return strokeHitTest(action, point, threshold);
        if (action.type === "text") return textHitTest(action, point);
        return false;
      });

      boardSelectedId = hit ? hit.id : null;
      redrawBoard();
    }
  });

  boardCanvas.addEventListener("pointermove", (event) => {
    if (!boardDrawing || !boardCurrentStroke) return;

    const point = getCanvasPoint(event);
    const last = boardCurrentStroke.points[boardCurrentStroke.points.length - 1];

    if (Math.hypot(point.x - last.x, point.y - last.y) < 2) return;

    boardCurrentStroke.points.push(point);

    // Live local preview of just this in-progress stroke, drawn on
    // top of the last synced state — cheap, and avoids re-running
    // the whole replay (including flood fills) on every pointermove.
    redrawBoard();
    const ctx = boardCanvas.getContext("2d");
    drawStrokeAction(ctx, boardCurrentStroke);
  });

  const finishStroke = () => {
    if (!boardDrawing || !boardCurrentStroke) return;

    boardDrawing = false;
    const stroke = boardCurrentStroke;
    boardCurrentStroke = null;

    if (stroke.points.length > 0) {
      addBoardAction(stroke);
    }
  };

  boardCanvas.addEventListener("pointerup", finishStroke);
  boardCanvas.addEventListener("pointercancel", finishStroke);
  boardCanvas.addEventListener("pointerleave", finishStroke);
}

// ============================================================
// SCHEDULED CLASSES
//
// Fixes the "the room code only exists if the teacher is online
// right now" problem: a teacher picks a date/time up front, gets a
// stable room ID immediately (stored in Firestore), and everyone —
// teacher included — sees a countdown to it. When the teacher
// actually starts it, createRoom() reuses that same room ID, so
// students who show up expecting to "Join now" always have a valid
// code waiting, instead of one that vanished when the last host left.
// ============================================================

const scheduleTitleInput = $("scheduleTitle");
const scheduleTimeInput = $("scheduleTime");
const scheduleClassBtn = $("scheduleClassBtn");

let scheduledClasses = [];
let scheduledClassesListenerStarted = false;

function formatCountdown(msRemaining) {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function updateScheduledCountdowns() {
  document.querySelectorAll(".schedule-countdown").forEach((el) => {
    const scheduledAt = Number(el.dataset.scheduledAt);
    const remaining = scheduledAt - Date.now();

    el.textContent =
      remaining > 0
        ? `Starts in ${formatCountdown(remaining)}`
        : "Ready to start";
  });
}

setInterval(updateScheduledCountdowns, 1000);

function renderScheduledClasses() {
  const list = $("scheduledList");

  if (!list) return;

  list.replaceChildren();

  if (scheduledClasses.length === 0) {
    showElement("scheduledEmpty", true);
    return;
  }

  showElement("scheduledEmpty", false);

  const role = sessionStorage.getItem("prolingo_role");

  scheduledClasses.forEach((item) => {
    const li = document.createElement("li");
    li.className = "lesson-row";

    const info = document.createElement("div");
    info.className = "lesson-info";

    const title = document.createElement("strong");
    title.textContent = item.title || "Untitled class";

    const details = document.createElement("span");
    details.textContent = `${item.teacherName} · ${new Date(
      item.scheduledAt
    ).toLocaleString()}`;

    const countdown = document.createElement("span");
    countdown.className = "schedule-countdown";
    countdown.dataset.scheduledAt = item.scheduledAt;

    info.append(title, details, countdown);

    const button = document.createElement("button");
    button.className = "join-btn";

    const isOwner = item.teacherId === currentUser?.uid;
    const timeReached = Date.now() >= item.scheduledAt;

    if (item.status === "ended") {
      button.textContent = "Ended";
      button.disabled = true;
      button.classList.add("join-btn--wait");
    } else if (item.status === "live") {
      button.textContent = isOwner ? "Rejoin" : "Join now";
      button.addEventListener("click", () => {
        showView("classroom");

        joinRoom(item.roomId).catch((error) => {
          alert("Couldn't join: " + error.message);
        });
      });
    } else if (isOwner && (role === "teacher" || role === "admin")) {
      button.textContent = timeReached ? "Start class" : "Start early";
      button.addEventListener("click", async () => {
        showView("classroom");

        try {
          await createRoom({
            explicitRoomId: item.roomId,
            scheduledClassId: item.id
          });
        } catch (error) {
          alert("Couldn't start class: " + error.message);
        }
      });
    } else {
      button.textContent = "Scheduled";
      button.disabled = true;
      button.classList.add("join-btn--wait");
    }

    li.append(info, button);
    list.appendChild(li);
  });

  updateScheduledCountdowns();
}

function startScheduledClassesListener() {
  if (scheduledClassesListenerStarted) return;
  scheduledClassesListenerStarted = true;

  onSnapshot(
    collection(db, "scheduledClasses"),
    (snapshot) => {
      const cutoff = Date.now() - 3 * 60 * 60 * 1000;

      scheduledClasses = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        // Keep the list relevant — drop classes that ended more
        // than 3 hours ago instead of showing them forever.
        if (data.status === "ended" && data.scheduledAt < cutoff) {
          return;
        }

        scheduledClasses.push({
          id: docSnap.id,
          teacherId: data.teacherId || null,
          teacherName: data.teacherName || "Teacher",
          title: data.title || "",
          roomId: data.roomId || docSnap.id,
          scheduledAt: data.scheduledAt || 0,
          status: data.status || "scheduled"
        });
      });

      scheduledClasses.sort((a, b) => a.scheduledAt - b.scheduledAt);

      renderScheduledClasses();
    },
    (error) => {
      console.error("Scheduled classes listener error:", error);

      setText(
        "scheduledEmpty",
        "Unable to load scheduled classes. Check your Firestore rules."
      );
    }
  );
}

if (scheduleClassBtn) {
  scheduleClassBtn.addEventListener("click", async () => {
    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }

    const role = sessionStorage.getItem("prolingo_role");

    if (role !== "teacher" && role !== "admin") {
      alert("Only teachers or admins can schedule a class.");
      return;
    }

    const timeValue = scheduleTimeInput?.value;

    if (!timeValue) {
      alert("Pick a date and time first.");
      return;
    }

    const scheduledAt = new Date(timeValue).getTime();

    if (Number.isNaN(scheduledAt)) {
      alert("Please enter a valid date and time.");
      return;
    }

    if (scheduledAt < Date.now() - 60000) {
      alert("Please pick a time in the future.");
      return;
    }

    scheduleClassBtn.disabled = true;

    try {
      const scheduledRef = doc(collection(db, "scheduledClasses"));

      await setDoc(scheduledRef, {
        teacherId: currentUser.uid,
        teacherName: sessionStorage.getItem("prolingo_name") || "Teacher",
        title: scheduleTitleInput?.value.trim() || "",
        roomId: scheduledRef.id,
        scheduledAt,
        status: "scheduled",
        createdAt: Date.now()
      });

      if (scheduleTitleInput) scheduleTitleInput.value = "";
      if (scheduleTimeInput) scheduleTimeInput.value = "";
    } catch (error) {
      console.error("Failed to schedule class:", error);
      alert("Couldn't schedule the class: " + error.message);
    } finally {
      scheduleClassBtn.disabled = false;
    }
  });
}

// ============================================================
// BILLING — per-class pay + GCash payouts
//
// teacherBilling/{teacherAuthUid}: { ratePerClass, gcashNumber }
//   - admin sets/changes ratePerClass
//   - the teacher themself can only change their own gcashNumber
//     (enforced in firestore.rules, not just here)
// payments/{auto}: a payroll log entry admin creates when paying a
//   teacher via GCash — { teacherId, teacherName, classesCount,
//   amount, gcashNumber, note, createdBy, createdByName, createdAt }
// ============================================================

let teacherBillingMap = {}; // authUid -> { ratePerClass, gcashNumber }
let myBilling = { ratePerClass: null, gcashNumber: "" };
let payments = []; // admin: every payment. teacher: only their own.
let billingListenerStarted = false;
let paymentsListenerStarted = false;

function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function startBillingListener() {
  if (billingListenerStarted) return;
  billingListenerStarted = true;

  const role = sessionStorage.getItem("prolingo_role");

  if (role === "admin") {
    onSnapshot(
      collection(db, "teacherBilling"),
      (snapshot) => {
        teacherBillingMap = {};
        snapshot.forEach((docSnap) => {
          teacherBillingMap[docSnap.id] = docSnap.data();
        });
        renderAdminBilling();
      },
      (error) => {
        console.error("Teacher billing listener error:", error);
      }
    );
  } else if (role === "teacher" && currentUser) {
    onSnapshot(
      doc(db, "teacherBilling", currentUser.uid),
      (snapshot) => {
        myBilling = snapshot.exists()
          ? snapshot.data()
          : { ratePerClass: null, gcashNumber: "" };
        renderMyBilling();
      },
      (error) => {
        console.error("My billing listener error:", error);
      }
    );
  }
}

function startPaymentsListener() {
  if (paymentsListenerStarted) return;
  paymentsListenerStarted = true;

  const role = sessionStorage.getItem("prolingo_role");
  let paymentsQuery;

  if (role === "admin") {
    paymentsQuery = collection(db, "payments");
  } else if (role === "teacher" && currentUser) {
    paymentsQuery = query(
      collection(db, "payments"),
      where("teacherId", "==", currentUser.uid)
    );
  } else {
    return; // students don't see billing
  }

  onSnapshot(
    paymentsQuery,
    (snapshot) => {
      payments = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();

        payments.push({
          id: docSnap.id,
          teacherId: data.teacherId || null,
          teacherName: data.teacherName || "Teacher",
          classesCount: Number(data.classesCount) || 0,
          amount: Number(data.amount) || 0,
          gcashNumber: data.gcashNumber || "",
          note: data.note || "",
          createdAt: data.createdAt || 0
        });
      });

      payments.sort((a, b) => b.createdAt - a.createdAt);

      renderMyBilling();
      renderAdminBilling();
    },
    (error) => {
      console.error("Payments listener error:", error);
    }
  );
}

function renderMyBilling() {
  const role = sessionStorage.getItem("prolingo_role");
  if (role !== "teacher") return;

  setText(
    "myRatePerClass",
    myBilling.ratePerClass != null
      ? `${formatCurrency(myBilling.ratePerClass)} / class`
      : "Not set yet"
  );

  const myPayments = payments.filter((p) => p.teacherId === currentUser?.uid);
  const total = myPayments.reduce((sum, p) => sum + p.amount, 0);
  setText("myTotalEarned", formatCurrency(total));

  const gcashInput = $("myGcashNumber");
  if (gcashInput && document.activeElement !== gcashInput) {
    gcashInput.value = myBilling.gcashNumber || "";
  }

  const list = $("myPaymentsList");

  if (list) {
    list.replaceChildren();

    if (myPayments.length === 0) {
      showElement("myPaymentsEmpty", true);
    } else {
      showElement("myPaymentsEmpty", false);

      myPayments.forEach((p) => {
        const li = document.createElement("li");
        li.className = "lesson-row";

        const info = document.createElement("div");
        info.className = "lesson-info";

        const title = document.createElement("strong");
        title.textContent = `${formatCurrency(p.amount)} · ${
          p.classesCount
        } class${p.classesCount === 1 ? "" : "es"}`;

        const details = document.createElement("span");
        details.textContent = `${new Date(
          p.createdAt
        ).toLocaleDateString()}${p.note ? " · " + p.note : ""}`;

        info.append(title, details);
        li.append(info);
        list.appendChild(li);
      });
    }
  }
}

const saveGcashBtn = $("saveGcashBtn");

if (saveGcashBtn) {
  saveGcashBtn.addEventListener("click", async () => {
    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }

    const gcashInput = $("myGcashNumber");
    const value = gcashInput?.value.trim() || "";

    saveGcashBtn.disabled = true;

    try {
      await setDoc(
        doc(db, "teacherBilling", currentUser.uid),
        { gcashNumber: value, updatedAt: Date.now() },
        { merge: true }
      );
      alert("GCash number saved.");
    } catch (error) {
      console.error("Failed to save GCash number:", error);
      alert("Couldn't save: " + error.message);
    } finally {
      saveGcashBtn.disabled = false;
    }
  });
}

function renderAdminBilling() {
  const role = sessionStorage.getItem("prolingo_role");
  if (role !== "admin") return;

  const list = $("adminBillingList");
  if (!list) return;

  list.replaceChildren();

  if (teachers.length === 0) {
    showElement("adminBillingEmpty", true);
    return;
  }

  showElement("adminBillingEmpty", false);

  teachers.forEach((teacher) => {
    if (!teacher.authUid) return;

    const billing = teacherBillingMap[teacher.authUid] || {};
    const teacherPayments = payments.filter(
      (p) => p.teacherId === teacher.authUid
    );
    const totalPaid = teacherPayments.reduce((sum, p) => sum + p.amount, 0);

    const teacherLessons = bookings.filter(
      (b) => b.teacherId === teacher.authUid && b.type === "booking"
    );
    const withRemark = teacherLessons.filter((b) => b.hasRemark).length;
    const missingRemark = teacherLessons.length - withRemark;

    const li = document.createElement("li");
    li.className = "lesson-row billing-row";

    const info = document.createElement("div");
    info.className = "lesson-info";

    const title = document.createElement("strong");
    title.textContent = teacher.name || "Unnamed teacher";

    const details = document.createElement("span");
    details.textContent = `GCash: ${
      billing.gcashNumber || "not set"
    } · Total paid: ${formatCurrency(totalPaid)}`;

    const remarkStatus = document.createElement("span");
    remarkStatus.className =
      missingRemark > 0 ? "billing-remark-warning" : "billing-remark-ok";
    remarkStatus.textContent =
      missingRemark > 0
        ? `⚠ ${missingRemark} class${
            missingRemark === 1 ? "" : "es"
          } missing a remark — not payable yet`
        : `✓ ${withRemark} class${
            withRemark === 1 ? "" : "es"
          } payable (remark submitted)`;

    info.append(title, details, remarkStatus);

    const controls = document.createElement("div");
    controls.className = "billing-controls";

    const rateInput = document.createElement("input");
    rateInput.type = "number";
    rateInput.min = "0";
    rateInput.step = "0.01";
    rateInput.placeholder = "Rate/class";
    rateInput.className = "billing-rate-input";
    rateInput.value = billing.ratePerClass ?? "";

    const saveRateBtn = document.createElement("button");
    saveRateBtn.type = "button";
    saveRateBtn.className = "ghost-btn";
    saveRateBtn.textContent = "Save rate";

    saveRateBtn.addEventListener("click", async () => {
      const rateValue = Number(rateInput.value);

      if (Number.isNaN(rateValue) || rateValue < 0) {
        alert("Enter a valid rate.");
        return;
      }

      saveRateBtn.disabled = true;

      try {
        await setDoc(
          doc(db, "teacherBilling", teacher.authUid),
          { ratePerClass: rateValue, updatedAt: Date.now() },
          { merge: true }
        );
      } catch (error) {
        console.error("Failed to save rate:", error);
        alert("Couldn't save rate: " + error.message);
      } finally {
        saveRateBtn.disabled = false;
      }
    });

    const classesInput = document.createElement("input");
    classesInput.type = "number";
    classesInput.min = "1";
    classesInput.placeholder = "# classes";
    classesInput.className = "billing-classes-input";

    const amountInput = document.createElement("input");
    amountInput.type = "number";
    amountInput.min = "0";
    amountInput.step = "0.01";
    amountInput.placeholder = "Amount (₱)";
    amountInput.className = "billing-amount-input";

    const logPaymentBtn = document.createElement("button");
    logPaymentBtn.type = "button";
    logPaymentBtn.className = "solid-btn";
    logPaymentBtn.textContent = "Log GCash payment";

    logPaymentBtn.addEventListener("click", async () => {
      const classesCount = Number(classesInput.value) || 0;
      const amount = Number(amountInput.value);

      if (Number.isNaN(amount) || amount <= 0) {
        alert("Enter a valid payment amount.");
        return;
      }

      logPaymentBtn.disabled = true;

      try {
        await addDoc(collection(db, "payments"), {
          teacherId: teacher.authUid,
          teacherName: teacher.name || "Teacher",
          classesCount,
          amount,
          gcashNumber: billing.gcashNumber || "",
          note: "",
          createdBy: currentUser.uid,
          createdByName: sessionStorage.getItem("prolingo_name") || "Admin",
          createdAt: Date.now()
        });

        classesInput.value = "";
        amountInput.value = "";
        alert("Payment logged.");
      } catch (error) {
        console.error("Failed to log payment:", error);
        alert("Couldn't log payment: " + error.message);
      } finally {
        logPaymentBtn.disabled = false;
      }
    });

    controls.append(
      rateInput,
      saveRateBtn,
      classesInput,
      amountInput,
      logPaymentBtn
    );

    li.append(info, controls);
    list.appendChild(li);
  });
}

// ============================================================
// PROFILE — name, photo, extra contacts, password
//
// Reuses uploadToCloudinary() (already defined above for lesson
// materials) for the profile photo — same free pipeline, no new
// service needed. Name/photo/contacts live on the user's own
// users/{uid} doc; firestore.rules restricts a self-update to only
// those fields, never role.
// ============================================================

const profileNameInput = $("profileNameInput");
const profileEnglishNameInput = $("profileEnglishNameInput");
const saveProfileNameBtn = $("saveProfileNameBtn");
const profilePhotoInput = $("profilePhotoInput");
const profilePhotoPreview = $("profilePhotoPreview");
const profilePhotoStatus = $("profilePhotoStatus");
const extraEmailsList = $("extraEmailsList");
const newExtraEmailInput = $("newExtraEmail");
const addExtraEmailBtn = $("addExtraEmailBtn");
const extraPhonesList = $("extraPhonesList");
const newExtraPhoneInput = $("newExtraPhone");
const addExtraPhoneBtn = $("addExtraPhoneBtn");
const currentPasswordInput = $("currentPasswordInput");
const newPasswordInput = $("newPasswordInput");
const changePasswordBtn = $("changePasswordBtn");

let myProfile = {
  name: "",
  englishName: "",
  photoUrl: "",
  additionalEmails: [],
  mobileNumbers: []
};
let profileListenerStarted = false;

function renderProfilePhoto() {
  if (profilePhotoPreview) {
    profilePhotoPreview.src = myProfile.photoUrl || "default-teacher.png";
  }

  // Mirror the photo (or fall back to initials) onto the topbar chip
  // too, without touching how auth-guard.js fills in the rest of it.
  const avatarEl = document.querySelector(".user-avatar");

  if (avatarEl) {
    if (myProfile.photoUrl) {
      avatarEl.style.backgroundImage = `url(${myProfile.photoUrl})`;
      avatarEl.style.backgroundSize = "cover";
      avatarEl.style.backgroundPosition = "center";
      avatarEl.textContent = "";
    } else {
      avatarEl.style.backgroundImage = "";
      const initials = (myProfile.name || sessionStorage.getItem("prolingo_name") || "")
        .trim()
        .slice(0, 2)
        .toUpperCase();
      avatarEl.textContent = initials || "--";
    }
  }
}

function renderProfileName() {
  if (profileNameInput && document.activeElement !== profileNameInput) {
    profileNameInput.value = myProfile.name || "";
  }

  if (
    profileEnglishNameInput &&
    document.activeElement !== profileEnglishNameInput
  ) {
    profileEnglishNameInput.value = myProfile.englishName || "";
  }
}

function renderExtraList(listEl, items, onRemove) {
  if (!listEl) return;

  listEl.replaceChildren();

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "lesson-row";

    const info = document.createElement("div");
    info.className = "lesson-info";

    const text = document.createElement("strong");
    text.textContent = item;
    info.appendChild(text);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => onRemove(index));

    li.append(info, removeBtn);
    listEl.appendChild(li);
  });
}

function renderProfileContacts() {
  renderExtraList(
    extraEmailsList,
    myProfile.additionalEmails || [],
    async (index) => {
      const updated = [...(myProfile.additionalEmails || [])];
      updated.splice(index, 1);

      try {
        await saveProfileFields({ additionalEmails: updated });
      } catch (error) {
        console.error("Failed to remove email:", error);
        alert("Couldn't remove that email: " + error.message);
      }
    }
  );

  renderExtraList(
    extraPhonesList,
    myProfile.mobileNumbers || [],
    async (index) => {
      const updated = [...(myProfile.mobileNumbers || [])];
      updated.splice(index, 1);

      try {
        await saveProfileFields({ mobileNumbers: updated });
      } catch (error) {
        console.error("Failed to remove phone number:", error);
        alert("Couldn't remove that number: " + error.message);
      }
    }
  );
}

async function saveProfileFields(fields) {
  if (!currentUser) return;
  await updateDoc(doc(db, "users", currentUser.uid), fields);
}

function startProfileListener() {
  if (profileListenerStarted || !currentUser) return;
  profileListenerStarted = true;

  onSnapshot(
    doc(db, "users", currentUser.uid),
    (snapshot) => {
      const data = snapshot.data() || {};

      myProfile = {
        name: data.name || "",
        englishName: data.englishName || "",
        photoUrl: data.photoUrl || "",
        additionalEmails: data.additionalEmails || [],
        mobileNumbers: data.mobileNumbers || []
      };

      renderProfilePhoto();
      renderProfileName();
      renderProfileContacts();

      // Keep the session cache + topbar name in sync with Firestore.
      if (myProfile.name) {
        sessionStorage.setItem("prolingo_name", myProfile.name);
        setText("userName", myProfile.name);
      }
    },
    (error) => {
      console.error("Profile listener error:", error);
    }
  );
}

if (saveProfileNameBtn) {
  saveProfileNameBtn.addEventListener("click", async () => {
    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }

    const newName = profileNameInput?.value.trim();

    if (!newName) {
      alert("Enter a name first.");
      return;
    }

    saveProfileNameBtn.disabled = true;

    try {
      await saveProfileFields({
        name: newName,
        englishName: profileEnglishNameInput?.value.trim() || ""
      });
    } catch (error) {
      console.error("Failed to save name:", error);
      alert("Couldn't save: " + error.message);
    } finally {
      saveProfileNameBtn.disabled = false;
    }
  });
}

if (profilePhotoInput) {
  profilePhotoInput.addEventListener("change", async () => {
    const file = profilePhotoInput.files?.[0];

    if (!file) return;

    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }

    if (profilePhotoStatus) {
      profilePhotoStatus.textContent = `Uploading ${file.name}… 0%`;
    }

    try {
      const result = await uploadToCloudinary(file, (percent) => {
        if (profilePhotoStatus) {
          profilePhotoStatus.textContent = `Uploading ${file.name}… ${percent}%`;
        }
      });

      await saveProfileFields({ photoUrl: result.secure_url });

      if (profilePhotoStatus) {
        profilePhotoStatus.textContent = "Photo updated!";
      }
    } catch (error) {
      console.error("Profile photo upload failed:", error);

      if (profilePhotoStatus) {
        profilePhotoStatus.textContent = `Upload failed: ${error.message}`;
      }

      alert("Upload failed: " + error.message);
    } finally {
      profilePhotoInput.value = "";
    }
  });
}

if (addExtraEmailBtn) {
  addExtraEmailBtn.addEventListener("click", async () => {
    const value = newExtraEmailInput?.value.trim();

    if (!value) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      alert("Enter a valid email address.");
      return;
    }

    const updated = [...(myProfile.additionalEmails || []), value];

    addExtraEmailBtn.disabled = true;

    try {
      await saveProfileFields({ additionalEmails: updated });
      if (newExtraEmailInput) newExtraEmailInput.value = "";
    } catch (error) {
      console.error("Failed to add email:", error);
      alert("Couldn't add email: " + error.message);
    } finally {
      addExtraEmailBtn.disabled = false;
    }
  });
}

if (addExtraPhoneBtn) {
  addExtraPhoneBtn.addEventListener("click", async () => {
    const value = newExtraPhoneInput?.value.trim();

    if (!value) return;

    const updated = [...(myProfile.mobileNumbers || []), value];

    addExtraPhoneBtn.disabled = true;

    try {
      await saveProfileFields({ mobileNumbers: updated });
      if (newExtraPhoneInput) newExtraPhoneInput.value = "";
    } catch (error) {
      console.error("Failed to add phone number:", error);
      alert("Couldn't add phone number: " + error.message);
    } finally {
      addExtraPhoneBtn.disabled = false;
    }
  });
}

if (changePasswordBtn) {
  changePasswordBtn.addEventListener("click", async () => {
    if (!currentUser || !currentUser.email) {
      alert("Please sign in first.");
      return;
    }

    const currentPassword = currentPasswordInput?.value || "";
    const newPassword = newPasswordInput?.value || "";

    if (!currentPassword || !newPassword) {
      alert("Fill in both your current and new password.");
      return;
    }

    if (newPassword.length < 6) {
      alert("New password must be at least 6 characters.");
      return;
    }

    changePasswordBtn.disabled = true;

    try {
      const credential = EmailAuthProvider.credential(
        currentUser.email,
        currentPassword
      );

      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);

      if (currentPasswordInput) currentPasswordInput.value = "";
      if (newPasswordInput) newPasswordInput.value = "";

      alert("Password changed successfully.");
    } catch (error) {
      console.error("Failed to change password:", error);

      let message = error.message;

      if (
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
      ) {
        message = "Your current password is incorrect.";
      } else if (error.code === "auth/weak-password") {
        message = "Please choose a stronger password.";
      } else if (error.code === "auth/requires-recent-login") {
        message = "Please log out and log back in, then try again.";
      }

      alert("Couldn't change password: " + message);
    } finally {
      changePasswordBtn.disabled = false;
    }
  });
}

// ============================================================
// PROFILE — MY CERTIFICATES (teacher-only, self-service)
//
// Stored as a `certificates` array field directly on the teacher's
// own document in the "teachers" collection — the same doc the
// admin's Add/Edit form edits, and the same one buildCertificatesBlock()
// reads from to show them publicly on the Teachers directory card.
// firestore.rules restricts a teacher to only touching this one
// field on only their own doc (matched by authUid), never anything
// else the admin controls.
// ============================================================

const certificateInput = $("certificateInput");
const certificateStatus = $("certificateStatus");

function findMyTeacherDoc() {
  return teachers.find((t) => t.authUid === currentUser?.uid) || null;
}

function renderMyCertificates() {
  const role = sessionStorage.getItem("prolingo_role");
  const list = $("myCertificatesList");

  if (role !== "teacher" || !list) return;

  const myTeacherDoc = findMyTeacherDoc();
  const certs = myTeacherDoc?.certificates || [];

  list.replaceChildren();

  if (certs.length === 0) {
    showElement("myCertificatesEmpty", true);
    return;
  }

  showElement("myCertificatesEmpty", false);

  certs.forEach((cert, index) => {
    const li = document.createElement("li");
    li.className = "lesson-row";

    const info = document.createElement("div");
    info.className = "lesson-info";

    const title = document.createElement("strong");
    title.textContent = cert.fileName || "Certificate";

    const details = document.createElement("span");
    details.textContent = cert.uploadedAt
      ? new Date(cert.uploadedAt).toLocaleDateString()
      : "";

    info.append(title, details);

    const viewLink = document.createElement("a");
    viewLink.href = cert.url;
    viewLink.target = "_blank";
    viewLink.rel = "noopener";
    viewLink.className = "ghost-btn";
    viewLink.textContent = "View";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost-btn";
    removeBtn.textContent = "Remove";

    removeBtn.addEventListener("click", async () => {
      if (!myTeacherDoc) return;

      const updated = certs.filter((_, i) => i !== index);

      removeBtn.disabled = true;

      try {
        await updateDoc(doc(db, "teachers", myTeacherDoc.id), {
          certificates: updated
        });
      } catch (error) {
        console.error("Failed to remove certificate:", error);
        alert("Couldn't remove that certificate: " + error.message);
        removeBtn.disabled = false;
      }
    });

    li.append(info, viewLink, removeBtn);
    list.appendChild(li);
  });
}

if (certificateInput) {
  certificateInput.addEventListener("change", async () => {
    const file = certificateInput.files?.[0];

    if (!file) return;

    if (!currentUser) {
      alert("Please sign in first.");
      certificateInput.value = "";
      return;
    }

    const myTeacherDoc = findMyTeacherDoc();

    if (!myTeacherDoc) {
      alert(
        "Your teacher profile hasn't been created in the directory yet — ask an admin to add you first."
      );
      certificateInput.value = "";
      return;
    }

    if (certificateStatus) {
      certificateStatus.textContent = `Uploading ${file.name}… 0%`;
    }

    try {
      const result = await uploadToCloudinary(file, (percent) => {
        if (certificateStatus) {
          certificateStatus.textContent = `Uploading ${file.name}… ${percent}%`;
        }
      });

      const updatedCertificates = [
        ...(myTeacherDoc.certificates || []),
        {
          url: result.secure_url,
          fileName: file.name,
          uploadedAt: Date.now()
        }
      ];

      await updateDoc(doc(db, "teachers", myTeacherDoc.id), {
        certificates: updatedCertificates
      });

      if (certificateStatus) {
        certificateStatus.textContent = "Certificate uploaded!";
      }
    } catch (error) {
      console.error("Certificate upload failed:", error);

      if (certificateStatus) {
        certificateStatus.textContent = `Upload failed: ${error.message}`;
      }

      alert("Upload failed: " + error.message);
    } finally {
      certificateInput.value = "";
    }
  });
}

// ============================================================
// LIVE CHAT / SUPPORT QUEUE — global floating widget
//
// supportSessions/{id}: { studentId, studentName, teacherId,
//   teacherName, status: waiting|active|ended, createdAt, assignedAt }
// supportSessions/{id}/messages/{id}: { senderId, senderName,
//   senderRole, text, createdAt }
// teacherAvailability/{teacherUid}: { available, teacherName, updatedAt }
//
// Matching rule: a teacher only gets connected when they actually
// open the widget (or flip "Available" on) — at that moment they
// atomically claim the OLDEST still-"waiting" session via a Firestore
// transaction, so two teachers opening at once can't grab the same
// student. If the claim loses the race, it immediately retries on
// the next-oldest waiting session. This is what gives "first student
// to chat gets the first teacher to open, second gets the second."
// ============================================================

const chatWidget = $("chatWidget");
const chatBubbleBtn = $("chatBubbleBtn");
const chatBadge = $("chatBadge");
const chatPanel = $("chatPanel");
const chatPanelTitle = $("chatPanelTitle");
const chatAvailableToggle = $("chatAvailableToggle");
const chatPanelStatus = $("chatPanelStatus");
const chatPanelMessages = $("chatPanelMessages");
const chatPanelInput = $("chatPanelInput");
const chatPanelSendBtn = $("chatPanelSendBtn");
const chatEndBtn = $("chatEndBtn");

let myChatSessionId = null;
let isChatAvailable = false;
let chatSessionUnsubscribe = null;
let chatMessagesUnsubscribe = null;

function setChatPanelStatus(text) {
  if (chatPanelStatus) chatPanelStatus.textContent = text;
}

function renderChatMessages(messages) {
  if (!chatPanelMessages) return;

  chatPanelMessages.replaceChildren();

  messages.forEach((msg) => {
    const bubble = document.createElement("div");
    bubble.className = "chat-message";
    bubble.classList.add(
      msg.senderId === currentUser?.uid
        ? "chat-message--mine"
        : "chat-message--theirs"
    );

    const senderLabel = document.createElement("strong");
    senderLabel.textContent =
      msg.senderName || (msg.senderRole === "teacher" ? "Teacher" : "Student");

    const text = document.createElement("p");
    text.textContent = msg.text;

    bubble.append(senderLabel, text);
    chatPanelMessages.appendChild(bubble);
  });

  chatPanelMessages.scrollTop = chatPanelMessages.scrollHeight;
}

function watchChatMessages(sessionId) {
  if (chatMessagesUnsubscribe) chatMessagesUnsubscribe();

  chatMessagesUnsubscribe = onSnapshot(
    query(
      collection(db, "supportSessions", sessionId, "messages"),
      orderBy("createdAt")
    ),
    (snapshot) => {
      const messages = [];
      snapshot.forEach((docSnap) => messages.push(docSnap.data()));
      renderChatMessages(messages);
    },
    (error) => console.error("Chat messages listener error:", error)
  );
}

function watchChatSession(sessionId) {
  if (chatSessionUnsubscribe) chatSessionUnsubscribe();

  chatSessionUnsubscribe = onSnapshot(
    doc(db, "supportSessions", sessionId),
    (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      const role = sessionStorage.getItem("prolingo_role");

      if (data.status === "waiting") {
        setChatPanelStatus("Waiting for a teacher to connect…");
        showElement("chatPanelInputRow", true);
        showElement("chatEndBtn", true);
      } else if (data.status === "active") {
        const otherName =
          role === "student" ? data.teacherName : data.studentName;
        setChatPanelStatus(`Connected to ${otherName || "—"}`);
        showElement("chatPanelInputRow", true);
        showElement("chatEndBtn", true);
      } else if (data.status === "ended") {
        setChatPanelStatus("This chat has ended.");
        showElement("chatPanelInputRow", false);
        showElement("chatEndBtn", false);
      }
    },
    (error) => console.error("Chat session listener error:", error)
  );
}

// Student side: find their own open session, or start a new one.
async function ensureStudentSession() {
  if (myChatSessionId) return myChatSessionId;

  const snap = await getDocs(
    query(collection(db, "supportSessions"), where("studentId", "==", currentUser.uid))
  );

  let existing = null;

  snap.forEach((docSnap) => {
    const d = docSnap.data();
    if (d.status === "waiting" || d.status === "active") {
      existing = docSnap.id;
    }
  });

  if (existing) {
    myChatSessionId = existing;
    return existing;
  }

  const ref = await addDoc(collection(db, "supportSessions"), {
    studentId: currentUser.uid,
    studentName: sessionStorage.getItem("prolingo_name") || "Student",
    teacherId: null,
    teacherName: null,
    status: "waiting",
    createdAt: Date.now()
  });

  myChatSessionId = ref.id;
  return ref.id;
}

// Teacher side: atomically claim the oldest waiting session. Retries
// on the next-oldest one if another teacher wins the race.
async function tryClaimWaitingSession() {
  const waitingSnap = await getDocs(
    query(
      collection(db, "supportSessions"),
      where("status", "==", "waiting"),
      orderBy("createdAt"),
      limit(1)
    )
  );

  if (waitingSnap.empty) {
    setChatPanelStatus("No students waiting right now.");
    return;
  }

  const sessionRef = waitingSnap.docs[0].ref;
  const myName = sessionStorage.getItem("prolingo_name") || "Teacher";

  try {
    const studentName = await runTransaction(db, async (transaction) => {
      const freshSnap = await transaction.get(sessionRef);
      const data = freshSnap.data();

      if (!data || data.status !== "waiting") {
        throw new Error("ALREADY_CLAIMED");
      }

      transaction.update(sessionRef, {
        teacherId: currentUser.uid,
        teacherName: myName,
        status: "active",
        assignedAt: Date.now()
      });

      return data.studentName || "Student";
    });

    myChatSessionId = sessionRef.id;
    watchChatSession(myChatSessionId);
    watchChatMessages(myChatSessionId);

    await addDoc(collection(db, "supportSessions", myChatSessionId, "messages"), {
      senderId: currentUser.uid,
      senderName: myName,
      senderRole: "teacher",
      text: `Hello, this is ${myName}. How may I help you today?`,
      createdAt: Date.now()
    });

    alert(`You will be connected to a student named ${studentName}.`);
  } catch (error) {
    if (error.message === "ALREADY_CLAIMED") {
      tryClaimWaitingSession();
    } else {
      console.error("Failed to claim chat session:", error);
    }
  }
}

async function resumeActiveTeacherSession() {
  if (!currentUser) return;

  try {
    const snap = await getDocs(
      query(
        collection(db, "supportSessions"),
        where("teacherId", "==", currentUser.uid),
        where("status", "==", "active")
      )
    );

    if (!snap.empty) {
      myChatSessionId = snap.docs[0].id;
      watchChatSession(myChatSessionId);
      watchChatMessages(myChatSessionId);
    }
  } catch (error) {
    console.error("Failed to resume active chat session:", error);
  }
}

async function loadMyAvailability() {
  if (!currentUser) return;

  try {
    const snap = await getDoc(doc(db, "teacherAvailability", currentUser.uid));
    isChatAvailable = snap.exists() ? Boolean(snap.data().available) : false;
    if (chatAvailableToggle) chatAvailableToggle.checked = isChatAvailable;
  } catch (error) {
    console.error("Failed to load chat availability:", error);
  }
}

function startWaitingBadgeListener() {
  onSnapshot(
    query(collection(db, "supportSessions"), where("status", "==", "waiting")),
    (snapshot) => {
      const count = snapshot.size;

      if (chatBadge) {
        chatBadge.textContent = String(count);
        chatBadge.style.display = count > 0 ? "flex" : "none";
      }
    },
    (error) => console.error("Waiting-chat badge listener error:", error)
  );
}

function initChatWidget() {
  const role = sessionStorage.getItem("prolingo_role");

  if (!currentUser || (role !== "student" && role !== "teacher")) {
    if (chatWidget) chatWidget.style.display = "none";
    return;
  }

  if (chatWidget) chatWidget.style.display = "block";

  if (role === "teacher") {
    showElement("chatAvailabilityRow", true);
    loadMyAvailability();
    startWaitingBadgeListener();
    resumeActiveTeacherSession();
  }
}

if (chatBubbleBtn) {
  chatBubbleBtn.addEventListener("click", async () => {
    if (!currentUser) {
      alert("Please sign in first.");
      return;
    }

    const isOpening = chatPanel && chatPanel.style.display === "none";

    if (chatPanel) chatPanel.style.display = isOpening ? "flex" : "none";
    if (!isOpening) return;

    const role = sessionStorage.getItem("prolingo_role");

    if (role === "student") {
      if (chatPanelTitle) chatPanelTitle.textContent = "Live Chat Support";

      try {
        const sessionId = await ensureStudentSession();
        watchChatSession(sessionId);
        watchChatMessages(sessionId);
      } catch (error) {
        console.error("Failed to start chat session:", error);
        setChatPanelStatus("Couldn't start a chat right now.");
      }
    } else if (role === "teacher") {
      if (chatPanelTitle) chatPanelTitle.textContent = "Student Support Queue";

      if (myChatSessionId) return; // already connected — just show it

      if (isChatAvailable) {
        await tryClaimWaitingSession();
      } else {
        setChatPanelStatus("Turn on availability to help waiting students.");
      }
    }
  });
}

if (chatAvailableToggle) {
  chatAvailableToggle.addEventListener("change", async () => {
    isChatAvailable = chatAvailableToggle.checked;

    if (!currentUser) return;

    try {
      await setDoc(doc(db, "teacherAvailability", currentUser.uid), {
        available: isChatAvailable,
        teacherName: sessionStorage.getItem("prolingo_name") || "Teacher",
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error("Failed to update availability:", error);
    }

    if (isChatAvailable && !myChatSessionId) {
      tryClaimWaitingSession();
    }
  });
}

if (chatPanelSendBtn) {
  chatPanelSendBtn.addEventListener("click", async () => {
    const text = chatPanelInput?.value.trim();

    if (!text || !myChatSessionId || !currentUser) return;

    chatPanelInput.value = "";

    try {
      await addDoc(
        collection(db, "supportSessions", myChatSessionId, "messages"),
        {
          senderId: currentUser.uid,
          senderName: sessionStorage.getItem("prolingo_name") || "",
          senderRole: sessionStorage.getItem("prolingo_role"),
          text,
          createdAt: Date.now()
        }
      );
    } catch (error) {
      console.error("Failed to send chat message:", error);
      alert("Couldn't send message: " + error.message);
    }
  });
}

if (chatPanelInput) {
  chatPanelInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      chatPanelSendBtn?.click();
    }
  });
}

if (chatEndBtn) {
  chatEndBtn.addEventListener("click", async () => {
    if (!myChatSessionId) return;

    try {
      await updateDoc(doc(db, "supportSessions", myChatSessionId), {
        status: "ended",
        endedAt: Date.now()
      });
    } catch (error) {
      console.error("Failed to end chat:", error);
    }

    if (chatSessionUnsubscribe) {
      chatSessionUnsubscribe();
      chatSessionUnsubscribe = null;
    }

    if (chatMessagesUnsubscribe) {
      chatMessagesUnsubscribe();
      chatMessagesUnsubscribe = null;
    }

    myChatSessionId = null;
    if (chatPanelMessages) chatPanelMessages.replaceChildren();
    setChatPanelStatus("Chat ended.");
    showElement("chatPanelInputRow", false);
    showElement("chatEndBtn", false);
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

  // Don't stomp on the lesson-material title/body if a material is
  // currently being shown in the stage — renderMaterialInStage()
  // owns those fields whenever materials.length > 0.
  if (materials.length === 0) {
    setText("slideBadge", room?.levelLabel ?? "No lesson loaded");
    setText("slideTitle", room?.title ?? "Waiting for a lesson");
    setText(
      "slideBody",
      room?.body ??
        "Once a teacher starts a class or uploads slides, they'll appear here for everyone in the room."
    );
  }

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
    startMaterialsListener();
    startScheduledClassesListener();
    startFeedbackListener();
    startBillingListener();
    startPaymentsListener();
    startProfileListener();
    initChatWidget();
  } else {
    console.log("No signed-in user.");
    if (chatWidget) chatWidget.style.display = "none";
  }
});
