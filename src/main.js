"use strict";

const POLL_MS = 2000; // seberapa sering daily note dibaca ulang
const SAVE_DELAY_MS = 700; // jeda setelah berhenti mengetik sebelum notes disimpan
const UNDO_MS = 6000; // lama tombol Undo tampil setelah menghapus task

/* ---------- Tanggal ---------- */

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoToday = () => isoOf(new Date());
const isoPlus = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoOf(d);
};

const parseIso = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

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
  showDone: $("btn-completed"),
  addForm: $("add-form"),
  addInput: $("add-input"),
  addPriority: $("add-priority"),
  addDue: $("add-due"),
  addDueLabel: $("add-due-label"),
  popover: $("popover"),
  notes: $("notes"),
  notesStatus: $("notes-status"),
  toast: $("toast"),
  settings: $("settings"),
  form: $("settings-form"),
  formError: $("form-error"),
};

const state = {
  tab: "day", // "day" = daily note hari `offset`; "all" = semua list di Tasks.md
  offset: 0, // -1 kemarin, 0 hari ini, 1 besok (tab All memakai 0 untuk Notes)
  view: null,
  lastJson: "",
  notesDirty: false,
  saveTimer: null,
  busy: false,
  editing: false, // judul task sedang diedit inline
  stale: false, // ada data baru yang belum digambar (ditahan selama edit/popover)
  draft: { priority: null, due: null }, // pilihan tombol di kotak "Add a task"
};

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};

/* ---------- Preferensi tampilan (per perangkat; bukan data task) ---------- */

function readPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const sameList = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
const isListCollapsed = (name) => readPref("collapsedLists", []).some((n) => sameList(n, name));
function toggleListCollapsed(name) {
  const list = readPref("collapsedLists", []).filter((n) => !sameList(n, name));
  if (!isListCollapsed(name)) list.push(name);
  writePref("collapsedLists", list);
}

/** Sama seperti resolve_list di tasks.rs: persis dulu, lalu awalan unik. */
function resolveList(names, query) {
  const q = query.trim().toLowerCase();
  const exact = names.find((n) => n.toLowerCase() === q);
  if (exact) return exact;
  const hits = names.filter((n) => q && n.toLowerCase().startsWith(q));
  return hits.length === 1 ? hits[0] : null;
}

const PRIORITIES = [
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "none", label: "None" },
];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2, none: 3 };

/** "today" / "tomorrow" / "yesterday" / "Nov 18" / "Jan 3, 2027". */
function dayLabel(iso) {
  if (iso === isoToday()) return "today";
  if (iso === isoPlus(1)) return "tomorrow";
  if (iso === isoPlus(-1)) return "yesterday";
  const d = parseIso(iso);
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/* ---------- Rendering ---------- */

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Buat elemen: h("button", { class: "x", onclick: fn }, "teks", anak...) */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "html") node.innerHTML = value;
    else if (value !== false && value != null) node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

const isClosed = (task) => task.done || task.cancelled;

/** Judul (HTML) + keterangan kecil (jam, deadline) dari sebuah task. */
function describeTask(task) {
  let text = task.title;
  const subs = [];
  let overdue = false;

  // Jam di depan: "15:00 Rapat" atau "15:00-16:00 Rapat"
  const time = text.match(/^(\d{1,2}[:.]\d{2})(?:\s*[-–]\s*(\d{1,2}[:.]\d{2}))?\s+/);
  if (time) {
    subs.push(time[2] ? `${time[1]} – ${time[2]}` : time[1]);
    text = text.slice(time[0].length);
  }

  if (task.due) {
    overdue = !isClosed(task) && task.due < isoToday();
    subs.push((overdue ? "Overdue · " : "Due ") + dayLabel(task.due));
  }
  // Task dari daily note lain (bagian "Overdue & due"): sebut asalnya.
  if (task.date) subs.push("from " + dayLabel(task.date));

  const html = escapeHtml(text)
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1") // [[link|alias]] -> alias
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [teks](url) -> teks
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)(#[^\s#]+)/g, '$1<span class="tag">$2</span>');

  return { html, sub: subs.join(" · "), overdue };
}

/**
 * Urutan tampil: belum selesai dulu, lalu prioritas, lalu deadline, lalu urutan
 * di file. Subtask diurutkan di antara saudaranya dan tetap di bawah induknya.
 * File tidak pernah diurutkan — ini hanya tampilan.
 */
function sortTasks(tasks) {
  const roots = [];
  const stack = [];
  for (const task of tasks) {
    const node = { task, kids: [] };
    stack.length = Math.min(stack.length, task.level);
    (stack.length ? stack[stack.length - 1].kids : roots).push(node);
    stack.push(node);
  }
  const key = ({ task }) => [isClosed(task) ? 1 : 0, PRIORITY_RANK[task.priority] ?? 3, task.due || "9999-99-99", task.line];
  const compare = (a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
  };
  const flatten = (nodes) => nodes.sort(compare).flatMap((n) => [n.task, ...flatten(n.kids)]);
  return flatten(roots);
}

function renderTask(task) {
  const { html, sub, overdue } = describeTask(task);
  const box = h("button", {
    class: "box",
    role: "checkbox",
    "aria-checked": String(task.done),
    "aria-label": task.done ? "Mark as not done" : "Mark as done",
    html: ICON.check,
    onclick: () => toggleTask(task),
  });
  const title = h("div", {
    class: "title",
    tabindex: "0",
    title: "Click to edit",
    html: html || '<span class="untitled">Untitled</span>',
    onclick: () => startEdit(task, title),
    onkeydown: (e) => {
      if (e.key === "Enter" || e.key === "F2") {
        e.preventDefault();
        startEdit(task, title);
      }
    },
  });
  const more = h("button", {
    class: "more",
    title: "Priority, due date, delete",
    "aria-label": "Task options",
    html: ICON.more,
    onclick: () => openTaskMenu(task, more),
  });
  const li = h(
    "li",
    {
      class: `task p-${task.priority}` + (task.done ? " done" : "") + (task.cancelled ? " cancelled" : ""),
      // Task dari note lain tampil rata, tanpa indentasi asalnya.
      style: `padding-left:${4 + (task.date ? 0 : task.level) * 18}px`,
      oncontextmenu: (e) => {
        e.preventDefault();
        openTaskMenu(task, more);
      },
    },
    box,
    h("div", { class: "body" }, title, sub && h("div", { class: "sub" + (overdue ? " overdue" : "") }, sub)),
    more
  );
  return li;
}

/** Task "Overdue & due": prioritas, lalu deadline, lalu note asal yang lebih lama. */
function sortDue(tasks) {
  const key = (t) => [PRIORITY_RANK[t.priority] ?? 3, t.due, t.date, t.line];
  return [...tasks].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
  });
}

function readDueCollapsed() {
  try {
    return localStorage.getItem("dueCollapsed") === "true";
  } catch {
    return false;
  }
}

/**
 * Label kecil pemisah grup di daftar. Dengan `onToggle`, label bisa dilipat.
 * `kind: "list"` = judul list di tab All (lebih menonjol, jumlah netral).
 */
function groupLabel(text, { count, collapsed, onToggle, kind } = {}) {
  const inner = [
    onToggle && h("span", { class: "chev", html: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>' }),
    h("span", {}, text),
    count != null && h("span", { class: "group-count" }, String(count)),
  ];
  return h(
    "li",
    { class: "group" + (kind ? ` ${kind}` : "") + (collapsed ? " collapsed" : "") },
    onToggle ? h("button", { type: "button", "aria-expanded": String(!collapsed), onclick: onToggle }, ...inner) : h("span", {}, ...inner)
  );
}

/** Urutkan (subtask tetap di bawah induknya), lalu buang yang selesai kalau perlu. */
const visible = (tasks, hideDone) => sortTasks(tasks).filter((t) => !hideDone || !isClosed(t));

/** Input kecil "Add to <list>…" di akhir tiap list pada tab All. */
function listAddRow(name) {
  const input = h("input", {
    class: "list-add",
    type: "text",
    spellcheck: "false",
    placeholder: `Add to ${name}…`,
    "aria-label": `Add a task to ${name}`,
    "data-list": name,
    title: "Enter to add. Tokens like !high and @tomorrow work here too.",
  });
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
      input.value = "";
      input.blur();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = ""; // supaya daftar boleh digambar ulang
    const result = await mutate("add_task", { text, list: name });
    // Daftar sudah digambar ulang: fokuskan input list yang sama lagi.
    const again = [...el.tasks.querySelectorAll(".list-add")].find((i) => i.dataset.list === name) || input;
    if (!result) again.value = text; // gagal: kembalikan teksnya
    again.focus();
  });
  input.addEventListener("blur", () => setTimeout(releaseHold));
  return h("li", { class: "list-add-row" }, h("span", { class: "plus", html: ICON.plus }), input);
}

/** Tab All: semua list di Tasks.md, sesuai urutan heading di file. */
function renderLists(view) {
  const showDone = readPref("showCompleted", false);
  const lists = view.lists || [];
  const open = lists.reduce((n, l) => n + l.tasks.filter((t) => !isClosed(t)).length, 0);
  el.count.textContent = `${open} open`;
  el.showDone.hidden = false;
  el.showDone.textContent = showDone ? "Hide completed" : "Show completed";
  el.showDone.setAttribute("aria-pressed", String(showDone));

  const rows = [];
  for (const list of lists) {
    // Task dari Tasks.md membawa sumber + nama list-nya, untuk command tulis.
    const tasks = list.tasks.map((t) => ({ ...t, source: "tasks", list: list.name }));
    const collapsed = isListCollapsed(list.name);
    rows.push(
      groupLabel(list.name, {
        kind: "list",
        count: tasks.filter((t) => !isClosed(t)).length,
        collapsed,
        onToggle: () => {
          toggleListCollapsed(list.name);
          renderTasks(state.view);
        },
      })
    );
    if (collapsed) continue;
    rows.push(...visible(tasks, !showDone).map(renderTask));
    rows.push(listAddRow(list.name));
  }
  el.tasks.replaceChildren(...rows);
  el.empty.hidden = true;
  el.tasks.hidden = false;
  state.stale = false;
}

function renderTasks(view) {
  if (state.tab === "all") return renderLists(view);
  el.showDone.hidden = true;
  const all = view.tasks;
  const shown = visible(all, view.hide_completed);
  const doneCount = all.filter(isClosed).length;
  const due = sortDue(view.due || []);

  el.count.textContent = all.length ? `${doneCount}/${all.length}` : "";

  let message = "";
  if (!view.exists) message = "No daily note for this day yet. Add a task to create it.";
  else if (!all.length) message = "No tasks in this note.";
  else if (!shown.length) message = "All done.";

  const rows = [];
  if (due.length) {
    const collapsed = readDueCollapsed();
    rows.push(
      groupLabel("Overdue & due", {
        count: due.length,
        collapsed,
        onToggle: () => {
          try {
            localStorage.setItem("dueCollapsed", String(!collapsed));
          } catch {}
          renderTasks(state.view);
        },
      })
    );
    if (!collapsed) rows.push(...due.map(renderTask));
    const tab = el.tabs.find((b) => b.getAttribute("aria-selected") === "true");
    rows.push(groupLabel(tab ? tab.textContent : "This note"));
    if (message) rows.push(h("li", { class: "group-empty" }, message));
  }
  rows.push(...shown.map(renderTask));
  el.tasks.replaceChildren(...rows);

  // Pesan besar di tengah hanya kalau tidak ada apa pun untuk ditampilkan.
  const nothing = !due.length && !!message;
  el.empty.textContent = message;
  el.empty.hidden = !nothing;
  el.tasks.hidden = nothing;
  state.stale = false;
}

/**
 * Selama judul diedit, popover terbuka, atau input "Add to <list>" sedang
 * diisi, daftar tidak digambar ulang (supaya ketikan tidak hilang).
 */
const isHeld = () => {
  const a = document.activeElement;
  const typing = !!a && a.classList.contains("list-add") && a.value.trim() !== "";
  return state.editing || !el.popover.hidden || typing;
};

function releaseHold() {
  if (state.stale && !isHeld() && state.view) renderTasks(state.view);
}

function applyView(view) {
  state.view = view;
  state.lastJson = JSON.stringify(view);
  el.date.textContent =
    state.tab === "all"
      ? "All lists"
      : parseIso(view.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  el.addInput.placeholder = state.tab === "all" ? `Add to ${view.default_list}…` : "Add a task…";
  if (isHeld()) state.stale = true;
  else renderTasks(view);

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
    if (JSON.stringify(view) !== state.lastJson || force) applyView(view);
  } catch (err) {
    showToast(String(err));
  } finally {
    state.busy = false;
  }
}

/**
 * Jalankan command yang mengubah file `src` (default: daily note hari yang
 * sedang tampil), lalu gambar tampilan yang sedang dibuka. Mengembalikan hasil
 * command, atau null kalau gagal.
 */
async function mutate(cmd, args, src = { offset: state.offset }) {
  const show = state.offset;
  const tab = state.tab;
  try {
    const result = await invoke(cmd, { offset: src.offset, source: src.source, show, ...args });
    if (show === state.offset && tab === state.tab) applyView(result.view || result);
    return result;
  } catch (err) {
    showToast(String(err));
    refresh(true);
    return null;
  }
}

const target = (task) => ({ line: task.line, text: task.text });
/**
 * File asal task: task "Overdue & due" membawa `offset` daily note asalnya;
 * task list membawa `source: "tasks"` (Tasks.md).
 */
const srcOf = (task) => ({ offset: task.offset ?? state.offset, source: task.source });

const toggleTask = (task) => mutate("toggle_task", target(task), srcOf(task));

async function deleteTask(task) {
  const src = srcOf(task);
  const show = state.offset;
  const tab = state.tab;
  const result = await mutate("delete_task", target(task), src);
  if (!result) return;
  showToast("Task deleted", {
    ms: UNDO_MS,
    action: "Undo",
    run: async () => {
      try {
        const view = await invoke("restore_task", { offset: src.offset, source: src.source, list: task.list, show, ...result.removed });
        if (show === state.offset && tab === state.tab) applyView(view);
      } catch (err) {
        showToast(String(err));
      }
    },
  });
}

/* ---------- Edit judul inline ---------- */

function startEdit(task, titleEl) {
  if (state.editing) return;
  closePopover();
  state.editing = true;
  const input = h("input", { class: "title-edit", type: "text", spellcheck: "false", "aria-label": "Task title" });
  input.value = task.title;
  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    state.editing = false;
    const value = input.value.trim();
    if (save && value && value !== task.title) {
      state.stale = true; // gambar ulang walau command gagal
      await mutate("update_task", { ...target(task), title: value }, srcOf(task));
    } else {
      state.stale = true;
    }
    releaseHold();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
  titleEl.replaceWith(input);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

/* ---------- Popover (prioritas, deadline, hapus) ---------- */

let popoverAnchor = null;

function closePopover() {
  if (el.popover.hidden) return;
  el.popover.hidden = true;
  el.popover.replaceChildren();
  if (popoverAnchor) popoverAnchor.setAttribute("aria-expanded", "false");
  popoverAnchor = null;
  releaseHold();
}

function openPopover(anchor, ...sections) {
  const reopen = popoverAnchor !== anchor;
  closePopover();
  if (!reopen) return; // klik tombol yang sama = tutup
  popoverAnchor = anchor;
  anchor.setAttribute("aria-expanded", "true");
  el.popover.replaceChildren(...sections.filter(Boolean));
  el.popover.hidden = false;

  // Tempel di bawah tombol, rata kanan; pindah ke atas kalau tidak muat.
  const a = anchor.getBoundingClientRect();
  const p = el.popover.getBoundingClientRect();
  const margin = 8;
  const left = Math.max(margin, Math.min(a.right - p.width, window.innerWidth - p.width - margin));
  let top = a.bottom + 4;
  if (top + p.height > window.innerHeight - margin) top = Math.max(margin, a.top - p.height - 4);
  el.popover.style.left = left + "px";
  el.popover.style.top = top + "px";
  const first = el.popover.querySelector("[aria-pressed='true']") || el.popover.querySelector("button");
  if (first) first.focus();
}

function prioritySection(current, pick) {
  return h(
    "div",
    { class: "pop-section" },
    h("div", { class: "pop-label" }, "Priority"),
    h(
      "div",
      { class: "pop-row" },
      ...PRIORITIES.map((p) =>
        h(
          "button",
          { type: "button", class: `pop-chip p-${p.id}`, "aria-pressed": String(p.id === current), onclick: () => pick(p.id) },
          h("span", { class: "dot" }),
          p.label
        )
      )
    )
  );
}

function dueSection(current, pick) {
  const quick = [
    ["Today", isoToday()],
    ["Tomorrow", isoPlus(1)],
    ["Next week", isoPlus(7)],
  ];
  const input = h("input", { type: "date", class: "pop-date", "aria-label": "Pick a date" });
  input.value = current || "";
  input.addEventListener("change", () => input.value && pick(input.value));
  return h(
    "div",
    { class: "pop-section" },
    h("div", { class: "pop-label" }, "Due date"),
    h(
      "div",
      { class: "pop-row" },
      ...quick.map(([label, iso]) =>
        h("button", { type: "button", class: "pop-chip", "aria-pressed": String(iso === current), onclick: () => pick(iso) }, label)
      )
    ),
    h(
      "div",
      { class: "pop-row" },
      input,
      current && h("button", { type: "button", class: "pop-chip", onclick: () => pick("") }, "Clear")
    )
  );
}

/** Pilihan "Move to list": semua list di Tasks.md kecuali list task itu sendiri. */
function moveSection(task) {
  const names = (state.view?.lists || [])
    .map((l) => l.name)
    .filter((n) => !(task.source === "tasks" && sameList(n, task.list)));
  if (!names.length) return null;
  const move = async (name) => {
    closePopover();
    const result = await mutate("move_task", { ...target(task), list: name }, srcOf(task));
    if (result) showToast(`Moved to ${name}`, { info: true, ms: 2200 });
  };
  return h(
    "div",
    { class: "pop-section" },
    h("div", { class: "pop-label" }, "Move to list"),
    h("div", { class: "pop-row wrap" }, ...names.map((n) => h("button", { type: "button", class: "pop-chip", onclick: () => move(n) }, n)))
  );
}

function openTaskMenu(task, anchor) {
  const change = (patch) => {
    closePopover();
    mutate("update_task", { ...target(task), ...patch }, srcOf(task));
  };
  openPopover(
    anchor,
    prioritySection(task.priority, (priority) => change({ priority })),
    dueSection(task.due, (due) => change({ due })),
    moveSection(task),
    h(
      "button",
      {
        type: "button",
        class: "pop-danger",
        onclick: () => {
          closePopover();
          deleteTask(task);
        },
      },
      h("span", { html: ICON.trash }),
      "Delete task"
    )
  );
}

document.addEventListener("pointerdown", (e) => {
  if (el.popover.hidden) return;
  if (el.popover.contains(e.target) || (popoverAnchor && popoverAnchor.contains(e.target))) return;
  closePopover();
});
el.tasks.addEventListener("scroll", closePopover);
window.addEventListener("resize", closePopover);

/* ---------- Tambah task ---------- */

/**
 * Baca token quick-add (!high, @tomorrow, ...) dari input. Hanya untuk pratinjau
 * di tombol dan untuk mode contoh; yang berlaku tetap parser di tasks.rs.
 */
function quickTokens(text) {
  const out = { title: [], priority: null, due: null, list: null };
  const names = { "!high": "high", "!med": "medium", "!medium": "medium", "!low": "low", "!none": "none" };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.toLowerCase();
    if (names[w]) out.priority = names[w];
    else if (w === "@today") out.due = isoToday();
    else if (w === "@tomorrow") out.due = isoPlus(1);
    else if (/^@\d{4}-\d{2}-\d{2}$/.test(w) && isoOf(parseIso(w.slice(1))) === w.slice(1)) out.due = w.slice(1);
    else if (/^~\p{L}/u.test(word)) out.list = word.slice(1);
    else out.title.push(word);
  }
  out.title = out.title.join(" ");
  return out;
}

/** Tombol prioritas/tanggal mencerminkan pilihan tombol atau token yang diketik. */
function renderDraft() {
  const typed = quickTokens(el.addInput.value);
  const priority = state.draft.priority || typed.priority || "none";
  const due = state.draft.due || typed.due;
  el.addPriority.className = `mini-btn p-${priority}`;
  el.addPriority.title = priority === "none" ? "Priority" : `Priority: ${priority}`;
  el.addDue.classList.toggle("set", !!due);
  el.addDue.title = due ? `Due ${dayLabel(due)}` : "Due date";
  el.addDueLabel.textContent = due ? dayLabel(due).replace(/^t/, "T") : "";
}

el.addInput.addEventListener("input", renderDraft);

el.addPriority.addEventListener("click", () =>
  openPopover(
    el.addPriority,
    prioritySection(state.draft.priority || quickTokens(el.addInput.value).priority || "none", (priority) => {
      state.draft.priority = priority;
      closePopover();
      renderDraft();
      el.addInput.focus();
    })
  )
);

el.addDue.addEventListener("click", () =>
  openPopover(
    el.addDue,
    dueSection(state.draft.due || quickTokens(el.addInput.value).due, (due) => {
      state.draft.due = due || null;
      closePopover();
      renderDraft();
      el.addInput.focus();
    })
  )
);

el.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el.addInput.value.trim();
  if (!text) return;
  const args = { text };
  if (state.draft.priority) args.priority = state.draft.priority;
  if (state.draft.due) args.due = state.draft.due;
  // Tab All: task baru masuk ke list default. Token ~list tetap menang.
  if (state.tab === "all" && state.view) args.list = state.view.default_list;
  const typedList = quickTokens(text).list;
  const names = (state.view?.lists || []).map((l) => l.name);
  const result = await mutate("add_task", args);
  if (!result) return; // gagal: biarkan teksnya supaya bisa diperbaiki
  el.addInput.value = "";
  state.draft = { priority: null, due: null };
  renderDraft();
  el.tasks.scrollTop = 0;
  // Dari tab hari, ~list mengirim task ke Tasks.md: beri tahu ke mana perginya.
  if (typedList && state.tab !== "all") showToast(`Added to ${resolveList(names, typedList) || typedList}`, { info: true, ms: 2200 });
});

el.addInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    el.addInput.value = "";
    state.draft = { priority: null, due: null };
    renderDraft();
    el.addInput.blur();
  }
});

/* ---------- Notes ---------- */

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
    if (offset === state.offset) applyView(view);
  } catch (err) {
    el.notesStatus.textContent = "Not saved";
    showToast(String(err));
  }
}

/** Pindah tab: angka = daily note hari `offset`, "all" = semua list. */
async function selectTab(key) {
  const tab = key === "all" ? "all" : "day";
  const offset = key === "all" ? 0 : Number(key);
  if (tab === state.tab && offset === state.offset) return;
  closePopover();
  await saveNotes(); // simpan dulu notes hari sebelumnya
  state.tab = tab;
  state.offset = offset;
  state.lastJson = "";
  el.notesStatus.textContent = "";
  el.tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === String(key))));
  el.notes.blur();
  el.tasks.scrollTop = 0;
  await refresh(true);
}

/* ---------- Toast ---------- */

let toastTimer;
/** Pesan singkat di bawah. Dengan `action` + `run`, tampil netral dengan tombol (mis. Undo). */
function showToast(message, { action, run, ms = 3500, info = false } = {}) {
  const hide = () => (el.toast.hidden = true);
  el.toast.className = "toast" + (action || info ? " info" : "");
  const button =
    action &&
    h(
      "button",
      {
        type: "button",
        onclick: () => {
          hide();
          run();
        },
      },
      action
    );
  el.toast.replaceChildren(h("span", {}, message, button));
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, ms);
}

/* ---------- Settings ---------- */

const field = {
  vault: $("f-vault"),
  folder: $("f-folder"),
  format: $("f-format"),
  tasksHeading: $("f-tasks-heading"),
  heading: $("f-heading"),
  hide: $("f-hide"),
  scan: $("f-scan"),
  tasksFile: $("f-tasks-file"),
  defaultList: $("f-default-list"),
};

async function openSettings(firstRun = false) {
  if (!el.settings.hidden) return;
  closePopover();
  const cfg = await invoke("get_config");
  field.vault.value = cfg.vault_path;
  field.folder.value = cfg.daily_folder;
  field.format.value = cfg.date_format;
  field.tasksHeading.value = cfg.tasks_heading;
  field.heading.value = cfg.notes_heading;
  field.hide.checked = cfg.hide_completed;
  field.scan.value = cfg.scan_days;
  field.tasksFile.value = cfg.tasks_file;
  field.defaultList.value = cfg.default_list;
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
        tasks_heading: field.tasksHeading.value.trim() || "## Tasks",
        notes_heading: field.heading.value.trim() || "## Notes",
        hide_completed: field.hide.checked,
        scan_days: Math.max(0, Math.min(365, Math.round(Number(field.scan.value) || 0))),
        tasks_file: field.tasksFile.value.trim() || "Tasks.md",
        default_list: field.defaultList.value.trim() || "Inbox",
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
  if (e.key !== "Escape") return;
  if (!el.popover.hidden) {
    const anchor = popoverAnchor;
    closePopover();
    if (anchor && anchor.isConnected) anchor.focus();
  } else if (!el.settings.hidden && !$("btn-cancel").hidden) {
    el.settings.hidden = true;
  }
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
// Tombol hijau: daily note hari itu, atau Tasks.md di tab All.
$("btn-open").addEventListener("click", () =>
  invoke("open_in_obsidian", { offset: state.offset, source: state.tab === "all" ? "tasks" : undefined }).catch((err) =>
    showToast(String(err))
  )
);

el.showDone.addEventListener("click", () => {
  writePref("showCompleted", !readPref("showCompleted", false));
  if (state.view) renderTasks(state.view);
});

el.tabs.forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));

el.notes.addEventListener("input", () => {
  state.notesDirty = true;
  el.notesStatus.textContent = "";
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNotes, SAVE_DELAY_MS);
});
el.notes.addEventListener("blur", saveNotes);

/* ---------- Start ---------- */

setPinned(readPinned());
renderDraft();
refresh(true);
setInterval(() => {
  if (el.settings.hidden) refresh();
}, POLL_MS);

/* ---------- Mock (buka index.html langsung di browser untuk utak-atik tampilan) ---------- */

function mockInvoke() {
  const EMOJI = { high: "⏫", medium: "🔼", low: "🔽" };
  /** Susun `text` seperti yang akan tertulis di file. */
  const sync = (t) => {
    t.text = [t.title, EMOJI[t.priority], t.due && `📅 ${t.due}`, t.done_date && `✅ ${t.done_date}`].filter(Boolean).join(" ");
    return t;
  };
  const make = (level, title, extra = {}) =>
    sync({ line: 0, level, title, done: false, cancelled: false, priority: "none", due: null, done_date: null, ...extra });

  // Daily note contoh per offset hari (0 = hari ini). Nomor baris diurutkan ulang.
  const days = {
    "-6": [make(0, "Kirim revisi proposal", { priority: "high", due: isoPlus(-2) }), make(0, "Sudah beres", { due: isoPlus(-3), done: true, done_date: isoPlus(-3) })],
    "-3": [make(0, "Bayar tagihan internet", { due: isoToday() }), make(0, "Tanpa deadline")],
    0: [
      make(0, "Kerjain laporan projek akhir IoT", { priority: "high", due: isoPlus(-7) }),
      make(1, "Wiring sensor gate", { done: true, done_date: isoPlus(-1) }),
      make(1, "Tulis bab pengujian", { priority: "medium" }),
      make(0, "Review PR **ObsiTask** #dev", { priority: "low" }),
      make(0, "15:00 Rapat asisten praktikum", { due: isoToday() }),
      make(0, "Baca [[Paper ICN|paper ICN]] bab 2", { due: isoPlus(3) }),
      make(0, "Beli kabel jumper", { done: true, done_date: isoToday() }),
    ],
  };
  // Tasks.md contoh: satu list per heading "## Nama".
  const lists = [
    { name: "Inbox", heading: true, tasks: [make(0, "Cari referensi skripsi"), make(0, "Balas email dosen", { priority: "medium", due: isoPlus(1) })] },
    {
      name: "Kuliah",
      heading: true,
      tasks: [
        make(0, "Laporan praktikum jaringan", { priority: "high", due: isoPlus(2) }),
        make(1, "Ambil data Wireshark"),
        make(1, "Tulis analisis", { done: true, done_date: isoPlus(-1) }),
        make(0, "Belajar untuk kuis basis data", { due: isoPlus(5) }),
      ],
    },
    { name: "Personal", heading: true, tasks: [make(0, "Perpanjang SIM", { priority: "low" }), make(0, "Gym", { done: true, done_date: isoToday() })] },
    { name: "Someday", heading: true, tasks: [] },
  ];
  const notes = { 0: "Ide: widget cukup baca daily note.\nTanya dosen soal jadwal demo." };
  const renumber = (offset) => (days[offset] || []).forEach((t, i) => (t.line = 3 + i));
  Object.keys(days).forEach(renumber);
  /** Nomor baris Tasks.md: tiap heading satu baris, lalu task-tasknya. */
  const renumberLists = () => {
    let line = 0;
    for (const l of lists) {
      line++;
      for (const t of l.tasks) t.line = line++;
    }
  };
  renumberLists();

  const view = (offset) => {
    const date = isoPlus(offset);
    const due = [];
    for (let back = 1; back <= 30; back++) {
      for (const t of days[offset - back] || []) {
        if (!t.done && !t.cancelled && t.due && t.due <= date) due.push({ ...t, offset: offset - back, date: isoPlus(offset - back) });
      }
    }
    return {
      configured: true,
      date,
      file: `Daily/${date}.md`,
      exists: offset in days,
      tasks: (days[offset] || []).map((t) => ({ ...t })),
      notes: notes[offset] || "",
      hide_completed: false,
      due,
      lists: lists.map((l) => ({ ...l, tasks: l.tasks.map((t) => ({ ...t })) })),
      default_list: "Inbox",
      tasks_file: "Tasks.md",
    };
  };
  /** Array tempat task itu tinggal (daily note atau list di Tasks.md). */
  const holderOf = (args) => {
    if (args.source === "tasks") return lists.find((l) => l.tasks.some((t) => t.line === args.line))?.tasks || [];
    return days[args.offset] || [];
  };
  const find = (args) => {
    const t = holderOf(args).find((x) => x.line === args.line);
    if (!t || t.text !== args.text) throw "That task has changed in the note.";
    return t;
  };
  const renumberAll = () => {
    Object.keys(days).forEach(renumber);
    renumberLists();
  };
  /** Ambil task + subtask-nya dari tempatnya. */
  const takeBlock = (args) => {
    const holder = holderOf(args);
    const t = find(args);
    const at = holder.indexOf(t);
    let end = at + 1;
    while (end < holder.length && holder[end].level > t.level) end++;
    return { holder, at, block: holder.splice(at, end - at) };
  };
  const listNamed = (query) => {
    const name = resolveList(lists.map((l) => l.name), query);
    if (!name) throw `No list named "${query}".`;
    return lists.find((l) => l.name === name);
  };
  /** Terapkan judul (boleh berisi token), prioritas, dan deadline ke task. */
  const apply = (t, { title, priority, due }) => {
    if (title != null) {
      const q = quickTokens(title);
      if (!q.title) throw "A task needs a title.";
      t.title = q.title;
      if (q.priority) t.priority = q.priority;
      if (q.due) t.due = q.due;
    }
    if (priority != null) t.priority = priority;
    if (due != null) t.due = due || null;
    return sync(t);
  };
  const shown = (args) => view(args.show ?? args.offset);
  return async (cmd, args = {}) => {
    switch (cmd) {
      case "get_day":
        return view(args.offset);
      case "toggle_task": {
        const t = find(args);
        t.done = !t.done && !t.cancelled;
        t.cancelled = false;
        t.done_date = t.done ? isoToday() : null;
        sync(t);
        return shown(args);
      }
      case "add_task": {
        const wanted = quickTokens(args.text).list || args.list;
        const target = wanted ? listNamed(wanted).tasks : (days[args.offset] ||= []);
        target.push(apply(make(0, ""), { title: args.text, priority: args.priority, due: args.due }));
        renumberAll();
        return view(args.offset);
      }
      case "update_task":
        if (args.title != null && quickTokens(args.title).list) throw "To change a task's list, use Move to list.";
        apply(find(args), args);
        return shown(args);
      case "delete_task": {
        const { at, block } = takeBlock(args);
        renumberAll();
        return { view: shown(args), removed: { line: at, text: JSON.stringify(block), anchor: null } };
      }
      case "restore_task": {
        const holder = args.source === "tasks" ? listNamed(args.list || "Inbox").tasks : days[args.offset];
        holder.splice(args.line, 0, ...JSON.parse(args.text));
        renumberAll();
        return shown(args);
      }
      case "move_task": {
        const dest = listNamed(args.list);
        const { block } = takeBlock(args);
        const base = block[0].level;
        dest.tasks.push(...block.map((t) => ({ ...t, level: t.level - base })));
        renumberAll();
        return shown(args);
      }
      case "save_notes":
        notes[args.offset] = args.notes;
        if (!(args.offset in days)) days[args.offset] = [];
        return view(args.offset);
      case "get_config":
        return {
          vault_path: "C:\\Vault",
          daily_folder: "Daily",
          date_format: "YYYY-MM-DD",
          tasks_heading: "## Tasks",
          notes_heading: "## Notes",
          hide_completed: false,
          scan_days: 30,
          tasks_file: "Tasks.md",
          default_list: "Inbox",
        };
      default:
        return null;
    }
  };
}
