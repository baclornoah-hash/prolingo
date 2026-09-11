// ============================================================
// FIREBASE
// ============================================================

import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where
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
    subtitle: "Meet your ProLingo instructors."
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

function buildFeedbackWidget(lesson) {
  const wrapper = document.createElement("div");
  wrapper.className = "feedback-widget";
  wrapper.style.display = "none";

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

    // Students can rate any of their own booked classes — additive,
    // doesn't touch the row's existing elements above.
    if (role === "student" && lesson.teacherId) {
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

    weekDays.forEach((date) => {
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

        slot.className = `slot slot--${match.type || "booked"}`;
        slot.textContent = match.label || "Booked";

        td.appendChild(slot);
      });

      // ============================================================
      // GENERAL CALENDAR AVAILABILITY
      //
      // ONLY THE TEACHER'S OWN AVAILABILITY BELONGS HERE.
      //
      // STUDENTS NEVER SEE AVAILABILITY IN THE GENERAL CALENDAR.
      // selectedTeacherId IS NOT USED HERE.
      // ============================================================

      if (role === "teacher") {
        const ownAvailability = availability.filter(
          (slot) =>
            slot.date === dateKey &&
            slot.slot === rowIndex &&
            slot.teacherId === currentUser?.uid
        );

        ownAvailability.forEach((match) => {
          const slot = document.createElement("div");

          slot.className = "slot slot--available";
          slot.textContent = match.label || "Open";

          td.appendChild(slot);
        });
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

        slot.className = `slot slot--${match.type || "booked"}`;
        slot.textContent = match.label || "Booked";

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

            const confirmed = confirm(
              `Book this lesson on ${dateKey} at ${time}?`
            );

            if (!confirmed) return;

            slot.disabled = true;
            slot.textContent = "Booking...";

            try {
              await addDoc(collection(db, "lessons"), {
                type: "booking",
                teacherId: selectedTeacherId,
                studentId: currentUser.uid,
                studentName:
                  sessionStorage.getItem("prolingo_name") || "Student",
                date: dateKey,
                day: dateKey,
                slot: rowIndex,
                status: "scheduled",
                createdAt: Date.now()
              });

              alert("Lesson booked successfully!");
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
            id: docSnap.id,
            teacherId: data.teacherId || null,
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
      )} ${ratingInfo.avg.toFixed(1)} (${ratingInfo.count} review${
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

    content.append(button);

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

  const calleeCandidates = collection(roomRef, "calleeCandidates");

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

  const callerCandidates = collection(roomRef, "callerCandidates");

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

    info.append(title, details);

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
  } else {
    console.log("No signed-in user.");
  }
});
