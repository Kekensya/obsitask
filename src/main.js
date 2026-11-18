"use strict";

const POLL_MS = 2000; // seberapa sering daily note dibaca ulang
const SAVE_DELAY_MS = 700; // jeda setelah berhenti mengetik sebelum notes disimpan

const tauri = window.__TAURI__;
const invoke = tauri ? tauri.core.invoke : mockInvoke();
const appWindow = tauri ? tauri.window.getCurrentWindow() : null;

const $ = (id) => document.getElementById(id);
const el = {
  date: $("date"),
  tabs: [...document.querySelectorAll(".segmented button")],
  tasks: $("tasks"),
  empty: $("empty"),
  count: $("count"),
  notes: $("notes"),
  notesStatus: $("notes-status"),
  toast: $("toast"),
  settings: $("settings"),
  form: $("settings-form"),
  formError: $("form-error"),
};

const state = {
  offset: 0, // -1 kemarin, 0 hari ini, 1 besok
  view: null,
  lastJson: "",
  notesDirty: false,
  saveTimer: null,
  busy: false,
};

/* ---------- Rendering ---------- */

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const isoToday = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const parseIso = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Pisahkan teks task jadi judul + keterangan kecil (jam, due date). */
function describeTask(task) {
  let text = task.text;
  const subs = [];
  let overdue = false;

  // Jam di depan: "15:00 Rapat" atau "15:00-16:00 Rapat"
  const time = text.match(/^(\d{1,2}[:.]\d{2})(?:\s*[-–]\s*(\d{1,2}[:.]\d{2}))?\s+/);
  if (time) {
    subs.push(time[2] ? `${time[1]} – ${time[2]}` : time[1]);
    text = text.slice(time[0].length);
  }

  // Due date gaya plugin Tasks: "📅 2026-11-18"
  const due = text.match(/📅\s*(\d{4}-\d{2}-\d{2})/u);
  if (due) {
    text = text.replace(due[0], "");
    if (!task.done && !task.cancelled && due[1] < isoToday()) {
      overdue = true;
      subs.push("Overdue");
    } else {
      subs.push("Due " + parseIso(due[1]).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
  }
  text = text.replace(/[✅➕🛫⏳]\s*\d{4}-\d{2}-\d{2}/gu, "").trim();

  let html = escapeHtml(text)
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1") // [[link|alias]] -> alias
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [teks](url) -> teks
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)(#[^\s#]+)/g, '$1<span class="tag">$2</span>');

  return { html, sub: subs.join(" · "), overdue };
}

function renderTasks(view) {
  const all = view.tasks;
  const shown = view.hide_completed ? all.filter((t) => !t.done && !t.cancelled) : all;
  const doneCount = all.filter((t) => t.done || t.cancelled).length;

  el.count.textContent = all.length ? `${doneCount}/${all.length}` : "";
  el.tasks.replaceChildren(
    ...shown.map((task) => {
      const { html, sub, overdue } = describeTask(task);
      const li = document.createElement("li");
      li.className = "task" + (task.done ? " done" : "") + (task.cancelled ? " cancelled" : "");
      li.style.paddingLeft = 4 + task.level * 18 + "px";
      li.setAttribute("role", "checkbox");
      li.setAttribute("aria-checked", String(task.done));
      li.tabIndex = 0;
      li.innerHTML =
        '<span class="box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
        `<span class="body"><div class="title">${html}</div>` +
        (sub ? `<div class="sub${overdue ? " overdue" : ""}">${escapeHtml(sub)}</div>` : "") +
        "</span>";
      li.addEventListener("click", () => toggleTask(task));
      li.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggleTask(task);
        }
      });
      return li;
    })
  );

  let message = "";
  if (!view.exists) message = "No daily note for this day yet.";
  else if (!all.length) message = "No tasks in this note.";
  else if (!shown.length) message = "All done.";
  el.empty.textContent = message;
  el.empty.hidden = !message;
  el.tasks.hidden = !!message;
}

function applyView(view) {
  state.view = view;
  el.date.textContent = parseIso(view.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  renderTasks(view);

  // Jangan timpa notes yang sedang diketik.
  const editing = state.notesDirty || document.activeElement === el.notes;
  if (!editing && el.notes.value !== view.notes) el.notes.value = view.notes;
}

/* ---------- Data ---------- */

async function refresh(force = false) {
  if (state.busy && !force) return;
  state.busy = true;
  const offset = state.offset;
  try {
    const view = await invoke("get_day", { offset });
    if (offset !== state.offset) return; // hari sudah diganti selagi menunggu
    if (!view.configured) {
      openSettings(true);
      return;
    }
    const json = JSON.stringify(view);
    if (json !== state.lastJson || force) {
      state.lastJson = json;
      applyView(view);
    }
  } catch (err) {
    showToast(String(err));
  } finally {
    state.busy = false;
  }
}

async function toggleTask(task) {
  try {
    const view = await invoke("toggle_task", { offset: state.offset, line: task.line, text: task.text });
    state.lastJson = JSON.stringify(view);
    applyView(view);
  } catch (err) {
    showToast(String(err));
    refresh(true);
  }
}

async function saveNotes() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (!state.notesDirty) return;
  const offset = state.offset;
  const text = el.notes.value;
  el.notesStatus.textContent = "Saving…";
  try {
    const view = await invoke("save_notes", { offset, notes: text });
    if (el.notes.value === text) {
      state.notesDirty = false;
      el.notesStatus.textContent = "Saved";
    }
    if (offset === state.offset) {
      state.lastJson = JSON.stringify(view);
      state.view = view;
      renderTasks(view);
    }
  } catch (err) {
    el.notesStatus.textContent = "Not saved";
    showToast(String(err));
  }
}

async function setOffset(offset) {
  if (offset === state.offset) return;
  await saveNotes(); // simpan dulu notes hari sebelumnya
  state.offset = offset;
  state.lastJson = "";
  el.notesStatus.textContent = "";
  el.tabs.forEach((b) => b.setAttribute("aria-selected", String(Number(b.dataset.offset) === offset)));
  el.notes.blur();
  await refresh(true);
}

let toastTimer;
function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), 3500);
}

/* ---------- Settings ---------- */

const field = { vault: $("f-vault"), folder: $("f-folder"), format: $("f-format"), heading: $("f-heading"), hide: $("f-hide") };

async function openSettings(firstRun = false) {
  if (!el.settings.hidden) return;
  const cfg = await invoke("get_config");
  field.vault.value = cfg.vault_path;
  field.folder.value = cfg.daily_folder;
  field.format.value = cfg.date_format;
  field.heading.value = cfg.notes_heading;
  field.hide.checked = cfg.hide_completed;
  $("settings-title").textContent = firstRun ? "Set up ObsiTask" : "Settings";
  $("btn-cancel").hidden = firstRun;
  el.formError.hidden = true;
  el.settings.hidden = false;
}

/** Isi folder + format dari setting Daily notes milik vault, kalau ada. */
async function detectDaily() {
  const path = field.vault.value.trim();
  if (!path) return;
  const found = await invoke("detect_daily", { path });
  if (!found) return;
  field.folder.value = found.folder || "";
  field.format.value = found.format || "YYYY-MM-DD";
}

$("btn-browse").addEventListener("click", async () => {
  const picked = await invoke("pick_folder");
  if (picked) {
    field.vault.value = picked;
    await detectDaily();
  }
});
field.vault.addEventListener("change", detectDaily);

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await invoke("save_config", {
      config: {
        vault_path: field.vault.value.trim(),
        daily_folder: field.folder.value.trim(),
        date_format: field.format.value.trim() || "YYYY-MM-DD",
        notes_heading: field.heading.value.trim() || "## Notes",
        hide_completed: field.hide.checked,
      },
    });
    el.settings.hidden = true;
    await refresh(true);
  } catch (err) {
    el.formError.textContent = String(err);
    el.formError.hidden = false;
  }
});

$("btn-cancel").addEventListener("click", () => (el.settings.hidden = true));
$("btn-settings").addEventListener("click", () => openSettings(false));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.settings.hidden && !$("btn-cancel").hidden) el.settings.hidden = true;
});

/* ---------- Window ---------- */

function readPinned() {
  try {
    return localStorage.getItem("pinned") !== "false";
  } catch {
    return true;
  }
}

async function setPinned(pinned) {
  $("btn-pin").setAttribute("aria-pressed", String(pinned));
  try {
    localStorage.setItem("pinned", String(pinned));
  } catch {}
  if (appWindow) await appWindow.setAlwaysOnTop(pinned);
}

$("btn-pin").addEventListener("click", () => setPinned($("btn-pin").getAttribute("aria-pressed") !== "true"));
$("btn-close").addEventListener("click", async () => {
  await saveNotes();
  if (appWindow) appWindow.close();
});
$("btn-open").addEventListener("click", () =>
  invoke("open_in_obsidian", { offset: state.offset }).catch((err) => showToast(String(err)))
);

el.tabs.forEach((b) => b.addEventListener("click", () => setOffset(Number(b.dataset.offset))));

el.notes.addEventListener("input", () => {
  state.notesDirty = true;
  el.notesStatus.textContent = "";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNotes, SAVE_DELAY_MS);
});
el.notes.addEventListener("blur", saveNotes);

/* ---------- Start ---------- */

setPinned(readPinned());
refresh(true);
setInterval(() => {
  if (el.settings.hidden) refresh();
}, POLL_MS);

/* ---------- Mock (buka index.html langsung di browser untuk utak-atik tampilan) ---------- */

function mockInvoke() {
  const tasks = [
    { line: 3, text: "Kerjain laporan projek akhir IoT 📅 2026-11-10", done: false, cancelled: false, level: 0 },
    { line: 4, text: "Wiring sensor gate", done: true, cancelled: false, level: 1 },
    { line: 5, text: "Review PR **ObsiTask** #dev", done: false, cancelled: false, level: 0 },
    { line: 6, text: "15:00 Rapat asisten praktikum", done: false, cancelled: false, level: 0 },
    { line: 7, text: "Baca [[Paper ICN|paper ICN]] bab 2", done: false, cancelled: false, level: 0 },
    { line: 8, text: "Beli kabel jumper", done: true, cancelled: false, level: 0 },
  ];
  let notes = "Ide: widget cukup baca daily note.\nTanya dosen soal jadwal demo.";
  const view = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const pad = (n) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return {
      configured: true,
      date,
      file: `Daily/${date}.md`,
      exists: offset !== 1,
      tasks: offset === 0 ? tasks.map((t) => ({ ...t })) : [],
      notes: offset === 0 ? notes : "",
      hide_completed: false,
    };
  };
  return async (cmd, args = {}) => {
    switch (cmd) {
      case "get_day":
        return view(args.offset);
      case "toggle_task": {
        const t = tasks.find((x) => x.line === args.line);
        if (t) t.done = !t.done;
        return view(args.offset);
      }
      case "save_notes":
        notes = args.notes;
        return view(args.offset);
      case "get_config":
        return { vault_path: "C:\\Vault", daily_folder: "Daily", date_format: "YYYY-MM-DD", notes_heading: "## Notes", hide_completed: false };
      default:
        return null;
    }
  };
}
