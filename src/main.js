"use strict";

const POLL_MS = 2000; // seberapa sering file dibaca ulang
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
  panel: $("panel"),
  title: $("title"),
  titleMeta: $("title-meta"),
  tabs: [...document.querySelectorAll(".tabs button")],
  todayBadge: $("today-badge"),
  week: $("week"),
  tasks: $("tasks"),
  empty: $("empty"),
  open: $("btn-open"),
  addForm: $("add-form"),
  addInput: $("add-input"),
  addMirror: $("add-mirror"),
  addPreview: $("add-preview"),
  addPriority: $("add-priority"),
  addDue: $("add-due"),
  addDueLabel: $("add-due-label"),
  suggest: $("suggest"),
  popover: $("popover"),
  notesSection: $("notes-section"),
  notesToggle: $("notes-toggle"),
  notes: $("notes"),
  notesStatus: $("notes-status"),
  toast: $("toast"),
  settings: $("settings"),
  form: $("settings-form"),
  formError: $("form-error"),
};

const state = {
  tab: "today", // "today" | "upcoming" | "all"
  view: null,
  lastJson: "",
  notesDirty: false,
  notesNote: "", // "saving…" / "saved 12:41" / "not saved"
  saveTimer: null,
  busy: false,
  editing: false, // judul task sedang diedit inline
  stale: false, // ada data baru yang belum digambar (ditahan selama edit/popover)
  draft: { priority: null, due: null }, // pilihan tombol di kotak quick-add
  dayFilter: null, // tanggal yang dipilih di strip Upcoming (null = semua)
  addingList: null, // list di tab All yang input "Add to …"-nya terbuka
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

/** "Nov 18" / "Jan 3, 2027" (tahun hanya kalau bukan tahun ini). */
function shortDate(iso) {
  const d = parseIso(iso);
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

/** "Wed, Nov 18" (tahun hanya kalau bukan tahun ini). */
function longDate(iso) {
  const d = parseIso(iso);
  const opts = { weekday: "short", month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

const weekday = (iso) => parseIso(iso).toLocaleDateString("en-US", { weekday: "short" });

/** Judul grup tanggal di tab Upcoming: "tomorrow · wed" / "thu · nov 20". */
function dateHeading(iso) {
  const wd = weekday(iso).toLowerCase();
  return iso === isoPlus(1) ? `tomorrow · ${wd}` : `${wd} · ${shortDate(iso).toLowerCase()}`;
}

/** Selisih hari kalender a - b (tanggal ISO). */
const daysBetween = (a, b) => Math.round((parseIso(a) - parseIso(b)) / 86400000);

/** Rentang Upcoming untuk judul: "Nov 18 – 24" / "Nov 28 – Dec 4" / "Nov 18". */
function rangeLabel(days) {
  const from = isoPlus(1);
  const to = isoPlus(days);
  if (from === to) return shortDate(from);
  const a = parseIso(from);
  const b = parseIso(to);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return `${shortDate(from)} – ${sameMonth ? b.getDate() : shortDate(to)}`;
}

/** Tanggal selesai di grup Completed: "Today" / "Yesterday" / "Nov 15". */
function doneLabel(iso) {
  if (!iso) return "";
  if (iso === isoToday()) return "Today";
  if (iso === isoPlus(-1)) return "Yesterday";
  return shortDate(iso);
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

/**
 * Judul (HTML) + bagian keterangan kecil dari sebuah task, mis.
 * "2d late · Nov 15 · kuliah". `hideDue`: tanggal yang sudah jelas dari
 * grupnya, jadi tidak perlu ditulis.
 */
function describeTask(task, { hideDue } = {}) {
  let text = task.title;
  const subs = []; // [teks, kelas]

  // Jam di depan: "15:00 Rapat" atau "15:00-16:00 Rapat"
  const time = text.match(/^(\d{1,2}[:.]\d{2})(?:\s*[-–]\s*(\d{1,2}[:.]\d{2}))?\s+/);
  if (time) {
    subs.push([time[2] ? `${time[1]}–${time[2]}` : time[1]]);
    text = text.slice(time[0].length);
  }

  const today = isoToday();
  if (task.due && !isClosed(task) && task.due < today) {
    subs.push([`${daysBetween(today, task.due)}d late`, "late"], [shortDate(task.due)]);
  } else if (task.due && task.due !== hideDue) {
    subs.push([task.due === today ? "today" : task.due === isoPlus(1) ? "tomorrow" : shortDate(task.due)]);
  }
  // Task dari daily note hari lain: sebut asalnya (sekali, di task induk).
  if (task.date && task.level === 0) subs.push(["from " + shortDate(task.date)]);
  // Di Today / Upcoming, task dari Tasks.md diberi nama list-nya.
  if (task.list && state.tab !== "all" && task.level === 0) subs.push([task.list.toLowerCase()]);

  const html = escapeHtml(text)
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1") // [[link|alias]] -> alias
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [teks](url) -> teks
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)(#[^\s#]+)/g, '$1<span class="tag">$2</span>');

  return { html, subs };
}

/**
 * Urutan tampil: belum selesai dulu, lalu prioritas, lalu deadline, lalu urutan
 * asal. Subtask diurutkan di antara saudaranya dan tetap di bawah induknya.
 * File tidak pernah diurutkan — ini hanya tampilan.
 */
function sortTasks(tasks) {
  const roots = [];
  const stack = [];
  tasks.forEach((task, index) => {
    const node = { task, index, kids: [] };
    stack.length = Math.min(stack.length, task.level);
    (stack.length ? stack[stack.length - 1].kids : roots).push(node);
    stack.push(node);
  });
  const key = ({ task, index }) => [isClosed(task) ? 1 : 0, PRIORITY_RANK[task.priority] ?? 3, task.due || "9999-99-99", index];
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

/** Satu baris task. `doneDate`: tampilkan tanggal selesai di kanan (grup Completed). */
function renderTask(task, opts = {}) {
  const { html, subs } = describeTask(task, opts);
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
    title: "Priority, due date, list, delete",
    "aria-label": "Task options",
    html: ICON.more,
    onclick: () => openTaskMenu(task, more),
  });
  const sub =
    subs.length > 0 &&
    h(
      "div",
      { class: "sub" },
      ...subs.flatMap(([text, cls], i) => [i ? " · " : null, h("span", { class: cls || null }, text)]).filter(Boolean)
    );
  const doneDate = opts.doneDate && task.done_date && h("span", { class: "done-date" }, doneLabel(task.done_date));
  return h(
    "li",
    {
      class: `task p-${task.priority}` + (task.done ? " done" : "") + (task.cancelled ? " cancelled" : ""),
      style: `padding-left:${4 + task.level * 28}px`,
      oncontextmenu: (e) => {
        e.preventDefault();
        openTaskMenu(task, more);
      },
    },
    box,
    h("div", { class: "main" }, h("div", { class: "body" }, title, sub), doneDate, more)
  );
}

const CHEV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

/**
 * Judul grup (mono, huruf kecil). Dengan `onToggle`, grup bisa dilipat.
 * `kind: "alert"` = oranye (overdue).
 */
function groupLabel(text, { count, collapsed, onToggle, kind } = {}) {
  const inner = [
    onToggle && h("span", { class: "chev", html: CHEV }),
    h("span", {}, text),
    count != null && h("span", { class: "group-count" }, String(count)),
  ];
  return h(
    "li",
    { class: "group" + (kind ? ` ${kind}` : "") + (collapsed ? " collapsed" : "") },
    onToggle ? h("button", { type: "button", "aria-expanded": String(!collapsed), onclick: onToggle }, ...inner) : h("span", {}, ...inner)
  );
}

/** Grup yang bisa dilipat, status lipatnya disimpan di preferensi `pref`. */
function foldGroup(text, pref, defaultCollapsed, count, kind) {
  const collapsed = readPref(pref, defaultCollapsed);
  const label = groupLabel(text, {
    count,
    kind,
    collapsed,
    onToggle: () => {
      writePref(pref, !collapsed);
      renderTasks(state.view);
    },
  });
  return { label, collapsed };
}

/** Urutkan (subtask tetap di bawah induknya), lalu buang yang selesai kalau perlu. */
const visible = (tasks, hideDone) => sortTasks(tasks).filter((t) => !hideDone || !isClosed(t));
const roots = (tasks) => tasks.filter((t) => t.level === 0);
const openRoots = (tasks) => roots(tasks).filter((t) => !isClosed(t)).length;
/** Jumlah task terbuka di sebuah list (termasuk subtask), sama dengan judul list. */
const openCount = (list) => list.tasks.filter((t) => !isClosed(t)).length;

/** Pecah task menjadi blok: induk level 0 + subtask-nya. */
function blocksOf(tasks) {
  const blocks = [];
  for (const t of tasks) {
    if (t.level === 0 || !blocks.length) blocks.push([t]);
    else blocks[blocks.length - 1].push(t);
  }
  return blocks;
}

/* ---------- Tab All ---------- */

const isCompletedOpen = (name) => readPref("completedOpenLists", []).some((n) => sameList(n, name));
function toggleCompletedOpen(name) {
  const open = readPref("completedOpenLists", []).filter((n) => !sameList(n, name));
  if (!isCompletedOpen(name)) open.push(name);
  writePref("completedOpenLists", open);
}

/** Input "Add to <list>…" di akhir list, muncul setelah tombol + diklik. */
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
  const closeRow = () => {
    if (state.addingList !== name) return;
    state.addingList = null;
    renderTasks(state.view);
  };
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Escape") {
      input.value = "";
      closeRow();
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
  input.addEventListener("blur", () =>
    setTimeout(() => {
      // Pindah fokus ke luar tanpa teks = tutup input-nya.
      if (!input.value.trim() && document.activeElement?.dataset?.list !== name) closeRow();
      releaseHold();
    }, 120)
  );
  return h("li", { class: "list-add-row" }, h("span", { class: "plus" }, "+"), input);
}

/** Satu list di tab All: kepala (lipat, nama, jumlah, +), task terbuka, Completed. */
function renderListBlock(list) {
  // Task dari Tasks.md membawa sumber + nama list-nya, untuk command tulis.
  const tasks = list.tasks.map((t) => ({ ...t, source: "tasks", list: list.name }));
  const collapsed = isListCollapsed(list.name);
  const toggle = () => {
    toggleListCollapsed(list.name);
    if (isListCollapsed(list.name) && state.addingList === list.name) state.addingList = null;
    renderTasks(state.view);
  };
  const plus = h("button", {
    type: "button",
    class: "list-plus",
    title: `Add a task to ${list.name}`,
    "aria-label": `Add a task to ${list.name}`,
    html: ICON.plus,
    onclick: () => {
      state.addingList = list.name;
      if (isListCollapsed(list.name)) toggleListCollapsed(list.name);
      renderTasks(state.view);
      const input = [...el.tasks.querySelectorAll(".list-add")].find((i) => i.dataset.list === list.name);
      if (input) {
        input.scrollIntoView({ block: "nearest" });
        input.focus();
      }
    },
  });
  const head = h(
    "div",
    { class: "list-head" },
    h(
      "button",
      { type: "button", class: "list-toggle", "aria-expanded": String(!collapsed), onclick: toggle },
      h("span", { class: "chev", html: CHEV }),
      h("span", { class: "list-name" }, list.name),
      h("span", { class: "list-count" }, String(tasks.filter((t) => !isClosed(t)).length))
    ),
    plus
  );
  const block = h("li", { class: "list-block" + (collapsed ? "" : " open") }, head);
  if (collapsed) return block;

  // Blok dengan induk selesai/dibatalkan masuk Completed; sisanya tampil biasa.
  const blocks = blocksOf(tasks);
  const open = blocks.filter((b) => !isClosed(b[0])).flat();
  const closed = blocks
    .filter((b) => isClosed(b[0]))
    .sort((a, b) => (b[0].done_date || "").localeCompare(a[0].done_date || "") || a[0].line - b[0].line);
  const rows = sortTasks(open).map((t) => renderTask(t));
  if (state.addingList === list.name) rows.push(listAddRow(list.name));
  if (!open.length && state.addingList !== list.name) rows.push(h("li", { class: "list-empty" }, closed.length ? "All done." : "No tasks."));
  if (closed.length) {
    const shown = isCompletedOpen(list.name);
    rows.push(
      groupLabel("Completed", {
        count: closed.length,
        collapsed: !shown,
        onToggle: () => {
          toggleCompletedOpen(list.name);
          renderTasks(state.view);
        },
      })
    );
    if (shown) rows.push(...closed.flatMap((b) => sortTasks(b)).map((t) => renderTask(t, { doneDate: true })));
  }
  block.append(h("ul", { class: "list-tasks" }, ...rows));
  return block;
}

/** Tab All: semua list di Tasks.md, sesuai urutan heading di file. */
function renderLists(view) {
  return { rows: (view.lists || []).map(renderListBlock), message: view.lists?.length ? "" : "No lists yet." };
}

/* ---------- Tab Today ---------- */

/** Tab Today: overdue, today (due hari ini + daily note hari ini), done today. */
function renderToday(view) {
  const a = view.agenda;
  const hide = view.hide_completed;
  const today = isoToday();
  const overdue = visible(a.overdue, hide);
  const due = visible(a.today, hide);
  const done = sortTasks(a.done);

  const rows = [];
  if (!overdue.length && !due.length && !done.length) return { rows, message: "Nothing for today. Add a task below." };
  if (overdue.length) {
    const g = foldGroup("overdue", "overdueCollapsed", false, roots(a.overdue).length, "alert");
    rows.push(g.label);
    if (!g.collapsed) rows.push(...overdue.map((t) => renderTask(t)));
  }
  rows.push(groupLabel("today", { count: openRoots(a.today) }));
  if (due.length) rows.push(...due.map((t) => renderTask(t, { hideDue: today })));
  else rows.push(h("li", { class: "group-empty" }, a.today.length ? "All done." : "Nothing due today."));
  if (done.length) {
    const g = foldGroup("done today", "doneTodayCollapsed", true, roots(a.done).length);
    rows.push(g.label);
    if (!g.collapsed) rows.push(...done.map((t) => renderTask(t)));
  }
  return { rows, message: "" };
}

/* ---------- Tab Upcoming ---------- */

/** Task Upcoming per tanggal; blok (induk + subtask) ikut tanggal induknya. */
function upcomingByDate(view) {
  const byDate = new Map();
  let date = null;
  for (const t of view.agenda.upcoming) {
    if (t.level === 0) date = t.due;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(t);
  }
  return byDate;
}

/** Strip 7 hari: huruf hari, tanggal, batang sesuai jumlah task. Klik = filter. */
function renderWeek(view) {
  const byDate = upcomingByDate(view);
  const days = Array.from({ length: 7 }, (_, i) => isoPlus(i + 1));
  const counts = days.map((d) => openRoots(byDate.get(d) || []));
  const max = Math.max(1, ...counts);
  const buttons = days.map((iso, i) => {
    const n = counts[i];
    const inRange = i < view.upcoming_days;
    const picked = state.dayFilter === iso;
    const d = parseIso(iso);
    return h(
      "button",
      {
        type: "button",
        class: "day" + (n ? "" : " zero") + (inRange ? "" : " off"),
        "aria-pressed": String(picked),
        disabled: !inRange,
        title: inRange ? `${longDate(iso)} · ${n} open${picked ? " · click to show all" : ""}` : "Outside Upcoming days (Settings)",
        onclick: () => {
          state.dayFilter = picked ? null : iso;
          renderTasks(state.view);
        },
      },
      h("span", { class: "wd" }, d.toLocaleDateString("en-US", { weekday: "narrow" })),
      h("span", { class: "dn" }, String(d.getDate())),
      h("span", { class: "bar-slot" }, h("span", { class: "bar", style: n ? `height:${3 + Math.round((11 * n) / max)}px` : null }))
    );
  });
  el.week.replaceChildren(...buttons);
}

/** Tab Upcoming: deadline besok sampai N hari ke depan, per tanggal. */
function renderUpcoming(view) {
  renderWeek(view);
  const byDate = upcomingByDate(view);
  const n = view.upcoming_days;
  const rows = [];
  for (const d of [...byDate.keys()].sort()) {
    if (state.dayFilter && d !== state.dayFilter) continue;
    const tasks = byDate.get(d);
    rows.push(groupLabel(dateHeading(d), { count: openRoots(tasks) }));
    rows.push(...visible(tasks, view.hide_completed).map((t) => renderTask(t, { hideDue: d })));
  }
  let message = "";
  if (!rows.length) message = state.dayFilter ? `Nothing due on ${longDate(state.dayFilter)}.` : `Nothing due in the next ${n === 1 ? "day" : n + " days"}.`;
  return { rows, message };
}

function renderTasks(view) {
  el.week.hidden = state.tab !== "upcoming";
  const render = { today: renderToday, upcoming: renderUpcoming, all: renderLists }[state.tab];
  // Input "Add to …" yang sedang fokus dibuat ulang: kembalikan fokusnya.
  const focused = document.activeElement?.classList.contains("list-add") ? document.activeElement.dataset.list : null;
  const { rows, message } = render(view);
  el.tasks.replaceChildren(...rows);
  if (focused) [...el.tasks.querySelectorAll(".list-add")].find((i) => i.dataset.list === focused)?.focus();
  // Pesan besar di tengah hanya kalau tidak ada apa pun untuk ditampilkan.
  el.empty.textContent = message;
  el.empty.hidden = !message;
  el.tasks.hidden = !!message;
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

/** Judul + keterangan kanannya, badge Today, dan teks lain yang ikut data. */
function renderChrome(view) {
  const a = view.agenda;
  const openToday = openRoots(a.overdue) + openRoots(a.today);
  el.todayBadge.textContent = String(openToday);
  el.todayBadge.hidden = !openToday;
  el.todayBadge.title = `${openToday} open`;
  if (state.tab === "today") {
    el.title.textContent = parseIso(view.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    el.titleMeta.textContent = "";
  } else if (state.tab === "upcoming") {
    el.title.textContent = "Upcoming";
    el.titleMeta.textContent = rangeLabel(view.upcoming_days);
  } else {
    el.title.textContent = "All lists";
    el.titleMeta.textContent = `${(view.lists || []).reduce((n, l) => n + openCount(l), 0)} open`;
  }
  const where = state.tab === "all" ? view.tasks_file : view.file;
  el.open.title = `Open ${where || "note"} in Obsidian`;
}

function applyView(view) {
  state.view = view;
  state.lastJson = JSON.stringify(view);
  if (state.dayFilter && state.dayFilter <= isoToday()) state.dayFilter = null; // hari sudah berganti
  renderChrome(view);
  if (isHeld()) state.stale = true;
  else renderTasks(view);
  renderDraft();

  // Jangan timpa notes yang sedang diketik.
  const editing = state.notesDirty || document.activeElement === el.notes;
  if (!editing && el.notes.value !== view.notes) el.notes.value = view.notes;
}

/* ---------- Data ---------- */

async function refresh(force = false) {
  if (state.busy && !force) return;
  state.busy = true;
  try {
    const view = await invoke("get_view");
    if (!view.configured) {
      state.view = view;
      openSetup();
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
 * Jalankan command yang mengubah file asal task (`src`: `offset` daily note
 * dan/atau `source: "tasks"`), lalu gambar tampilan terbaru. Mengembalikan
 * hasil command, atau null kalau gagal.
 */
async function mutate(cmd, args, src = {}) {
  try {
    const result = await invoke(cmd, { offset: src.offset ?? 0, source: src.source, ...args });
    applyView(result.view || result);
    return result;
  } catch (err) {
    showToast(String(err));
    refresh(true);
    return null;
  }
}

const target = (task) => ({ line: task.line, text: task.text });
/** File asal task: daily note `offset` hari dari hari ini, atau Tasks.md. */
const srcOf = (task) => ({ offset: task.offset ?? 0, source: task.source });

const toggleTask = (task) => mutate("toggle_task", target(task), srcOf(task));

async function deleteTask(task) {
  const src = srcOf(task);
  const result = await mutate("delete_task", target(task), src);
  if (!result) return;
  showToast("Task deleted", {
    ms: UNDO_MS,
    action: "Undo",
    run: () => mutate("restore_task", { list: task.list, ...result.removed }, src),
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

/* ---------- Popover (prioritas, deadline, list, hapus) ---------- */

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

/* ---------- Quick-add ---------- */

const PRIORITY_TOKENS = { "!high": "high", "!med": "medium", "!medium": "medium", "!low": "low", "!none": "none" };

/** Jenis token quick-add untuk satu kata: "prio" / "date" / "list" / null. */
function tokenKind(word) {
  const w = word.toLowerCase();
  if (PRIORITY_TOKENS[w]) return "prio";
  if (w === "@today" || w === "@tomorrow") return "date";
  if (/^@\d{4}-\d{2}-\d{2}$/.test(w) && isoOf(parseIso(w.slice(1))) === w.slice(1)) return "date";
  if (/^~\p{L}/u.test(word)) return "list";
  return null;
}

/**
 * Baca token quick-add (!high, @tomorrow, ~list, ...) dari input. Hanya untuk
 * pratinjau dan untuk mode contoh; yang berlaku tetap parser di tasks.rs.
 */
function quickTokens(text) {
  const out = { title: [], priority: null, due: null, list: null };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = word.toLowerCase();
    const kind = tokenKind(word);
    if (kind === "prio") out.priority = PRIORITY_TOKENS[w];
    else if (kind === "date") out.due = w === "@today" ? isoToday() : w === "@tomorrow" ? isoPlus(1) : w.slice(1);
    else if (kind === "list") out.list = word.slice(1);
    else out.title.push(word);
  }
  out.title = out.title.join(" ");
  return out;
}

const listNames = () => (state.view?.lists || []).map((l) => l.name);

/**
 * Warnai token yang dikenali seperti chip. Input aslinya transparan di atas
 * "cermin" ini, jadi perilakunya tetap input teks biasa; cermin hanya ikut
 * isi dan posisi gulir horizontalnya.
 */
function renderMirror() {
  const names = listNames();
  const html = el.addInput.value
    .split(/(\s+)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part)) return escapeHtml(part);
      let kind = tokenKind(part);
      if (kind === "list" && !resolveList(names, part.slice(1))) kind = null; // list tak dikenal: teks biasa
      return kind ? `<span class="tok ${kind}">${escapeHtml(part)}</span>` : escapeHtml(part);
    })
    .join("");
  el.addMirror.innerHTML = html;
  el.addMirror.scrollLeft = el.addInput.scrollLeft;
}

/** Deadline task baru: tombol, lalu token, lalu "hari ini" kalau ditambah dari tab Today. */
const draftDue = (typed) => state.draft.due || typed.due || (state.tab === "today" ? isoToday() : null);

/** "Today" / "Wed, Nov 18". */
const dueWords = (iso) => (iso === isoToday() ? "Today" : longDate(iso));

/** Tombol prioritas/tanggal, warna token, dan baris pratinjau hasil. */
function renderDraft() {
  const typed = quickTokens(el.addInput.value);
  const priority = state.draft.priority || typed.priority || "none";
  const due = draftDue(typed);
  el.addPriority.className = `mini-btn p-${priority}`;
  el.addPriority.title = priority === "none" ? "Priority" : `Priority: ${priority}`;
  el.addDue.classList.toggle("set", !!due);
  el.addDue.title = due ? `Due ${dayLabel(due)}` : "Due date";
  el.addDueLabel.textContent = due ? dayLabel(due).replace(/^t/, "T") : "";
  renderMirror();

  // Pratinjau: "→ Kuliah · High · Wed, Nov 18"
  const text = el.addInput.value.trim();
  el.addPreview.hidden = !text || !state.view;
  if (el.addPreview.hidden) return;
  const parts = [];
  if (typed.list && !resolveList(listNames(), typed.list)) {
    el.addPreview.replaceChildren(h("span", { class: "warn" }, `→ No list named "${typed.list}"`));
    return;
  }
  parts.push((typed.list && resolveList(listNames(), typed.list)) || state.view.default_list);
  if (priority !== "none") parts.push(PRIORITIES.find((p) => p.id === priority).label);
  if (due) parts.push(dueWords(due));
  if (!typed.title) parts.push("needs a title");
  el.addPreview.textContent = "→ " + parts.join(" · ");
}

/* --- Saran list saat mengetik "~" --- */

const suggest = { items: [], index: 0, start: 0, end: 0 };

/** Kata "~…" tempat caret berada, atau null. */
function tildeAtCaret() {
  const input = el.addInput;
  if (input.selectionStart !== input.selectionEnd) return null;
  const pos = input.selectionStart;
  const before = input.value.slice(0, pos);
  const m = before.match(/(^|\s)~([^\s~]*)$/);
  if (!m) return null;
  const after = input.value.slice(pos).match(/^[^\s]*/)[0];
  return { start: pos - m[2].length - 1, end: pos + after.length, query: m[2] };
}

function closeSuggest() {
  el.suggest.hidden = true;
  suggest.items = [];
}

function renderSuggest() {
  const at = state.view && document.activeElement === el.addInput ? tildeAtCaret() : null;
  if (!at) return closeSuggest();
  const q = at.query.toLowerCase();
  const lists = state.view.lists || [];
  const starts = lists.filter((l) => l.name.toLowerCase().startsWith(q));
  const contains = lists.filter((l) => !starts.includes(l) && q && l.name.toLowerCase().includes(q));
  const items = [...starts, ...contains].slice(0, 8);
  if (!items.length) return closeSuggest();
  const same = items.map((l) => l.name).join("\n") === suggest.items.map((l) => l.name).join("\n");
  suggest.items = items;
  suggest.index = same ? Math.min(suggest.index, items.length - 1) : 0;
  suggest.start = at.start;
  suggest.end = at.end;
  el.suggest.replaceChildren(
    h("div", { class: "suggest-head" }, "lists · Tab to pick"),
    ...items.map((l, i) =>
      h(
        "button",
        {
          type: "button",
          role: "option",
          tabindex: "-1",
          "aria-selected": String(i === suggest.index),
          onpointerdown: (e) => e.preventDefault(), // input tetap fokus
          onclick: () => pickSuggest(i),
        },
        h("span", { class: "tilde" }, "~"),
        h("span", { class: "name" }, l.name),
        h("span", { class: "n" }, String(openCount(l)))
      )
    )
  );
  el.suggest.hidden = false;
}

/** Ganti kata "~…" dengan token list yang pasti dikenali. */
function pickSuggest(i) {
  const list = suggest.items[i];
  if (!list) return;
  const names = listNames();
  // Token berhenti di spasi: untuk nama berspasi, pakai kata pertamanya kalau unik.
  const first = list.name.split(/\s+/)[0];
  const token = "~" + (resolveList(names, first) === list.name ? first : list.name.replace(/\s+/g, ""));
  const v = el.addInput.value;
  const rest = v.slice(suggest.end).replace(/^\s*/, "");
  el.addInput.value = v.slice(0, suggest.start) + token + " " + rest;
  const caret = suggest.start + token.length + 1;
  el.addInput.setSelectionRange(caret, caret);
  closeSuggest();
  renderDraft();
}

const syncAdd = () => {
  renderDraft();
  renderSuggest();
};
el.addInput.addEventListener("input", syncAdd);
el.addInput.addEventListener("click", renderSuggest);
el.addInput.addEventListener("keyup", (e) => {
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) renderSuggest();
  el.addMirror.scrollLeft = el.addInput.scrollLeft;
});
el.addInput.addEventListener("scroll", () => (el.addMirror.scrollLeft = el.addInput.scrollLeft));
el.addInput.addEventListener("select", () => (el.addMirror.scrollLeft = el.addInput.scrollLeft));
el.addInput.addEventListener("blur", () => setTimeout(closeSuggest, 100));

el.addInput.addEventListener("keydown", (e) => {
  if (!el.suggest.hidden && suggest.items.length) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = suggest.items.length;
      suggest.index = (suggest.index + (e.key === "ArrowDown" ? 1 : n - 1)) % n;
      renderSuggest();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      pickSuggest(suggest.index);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeSuggest();
      return;
    }
  }
  if (e.key === "Escape") {
    el.addInput.value = "";
    state.draft = { priority: null, due: null };
    renderDraft();
    el.addInput.blur();
  }
  // Setelah karakter masuk, posisi gulir input bisa berubah.
  requestAnimationFrame(() => (el.addMirror.scrollLeft = el.addInput.scrollLeft));
});

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
    dueSection(draftDue(quickTokens(el.addInput.value)), (due) => {
      state.draft.due = due || null;
      closePopover();
      renderDraft();
      el.addInput.focus();
    })
  )
);

/** Apakah task baru dengan deadline `due` di list `list` terlihat di tab sekarang. */
function shownHere(due, list) {
  const today = isoToday();
  if (state.tab === "today") return !!due && due <= today;
  if (state.tab === "upcoming") return !!due && due > today && due <= isoPlus(state.view.upcoming_days) && (!state.dayFilter || state.dayFilter === due);
  return !isListCollapsed(list);
}

// Task baru dari quick-add selalu masuk Tasks.md: list default (atau ~list),
// dengan deadline hari ini kalau dari tab Today (kecuali token/tombol bilang lain).
el.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = el.addInput.value.trim();
  if (!text || !state.view) return;
  closeSuggest();
  const typed = quickTokens(text);
  const args = { text, list: state.view.default_list };
  if (state.draft.priority) args.priority = state.draft.priority;
  // Deadline dari token dibaca parser di tasks.rs; argumen `due` hanya untuk tombol / default Today.
  if (state.draft.due) args.due = state.draft.due;
  else if (!typed.due && state.tab === "today") args.due = isoToday();
  const list = (typed.list && resolveList(listNames(), typed.list)) || state.view.default_list;
  const due = args.due || typed.due;
  const result = await mutate("add_task", args);
  if (!result) return; // gagal: biarkan teksnya supaya bisa diperbaiki
  el.addInput.value = "";
  state.draft = { priority: null, due: null };
  renderDraft();
  el.tasks.scrollTop = 0;
  // Kalau task baru tidak terlihat di tab ini, beri tahu ke mana perginya.
  if (!shownHere(due, list) || (typed.list && state.tab !== "all")) {
    showToast(`Added to ${list}` + (due ? ` · due ${dayLabel(due)}` : ""), { info: true, ms: 2600 });
  }
});

/* ---------- Notes (selalu daily note hari ini) ---------- */

const clock = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function renderNotesStatus() {
  el.notesStatus.textContent = "today" + (state.notesNote ? ` · ${state.notesNote}` : "");
}

async function saveNotes() {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (!state.notesDirty) return;
  const text = el.notes.value;
  state.notesNote = "saving…";
  renderNotesStatus();
  try {
    const view = await invoke("save_notes", { notes: text });
    if (el.notes.value === text) {
      state.notesDirty = false;
      state.notesNote = `saved ${clock()}`;
      renderNotesStatus();
    }
    applyView(view);
  } catch (err) {
    state.notesNote = "not saved";
    renderNotesStatus();
    showToast(String(err));
  }
}

/** Lipat/buka Notes; statusnya sama untuk semua tab dan diingat. */
function applyNotesCollapsed() {
  const collapsed = readPref("notesCollapsed", false);
  el.notesSection.classList.toggle("collapsed", collapsed);
  el.notesToggle.setAttribute("aria-expanded", String(!collapsed));
}
el.notesToggle.addEventListener("click", async () => {
  const collapse = !readPref("notesCollapsed", false);
  if (collapse) await saveNotes();
  writePref("notesCollapsed", collapse);
  applyNotesCollapsed();
  if (!collapse) el.notes.focus();
});

function selectTab(tab) {
  if (tab === state.tab) return;
  closePopover();
  closeSuggest();
  state.tab = tab;
  state.dayFilter = null;
  el.panel.dataset.tab = tab;
  el.tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  el.tasks.scrollTop = 0;
  renderDraft();
  if (state.view) applyView(state.view);
  refresh(true);
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

/* ---------- Config tampilan (tema, zoom, opacity, always on top) ---------- */

let display = null; // config terakhir: theme, appearance, zoom, opacity, always_on_top

/** Terapkan setting tampilan dari config ke widget. */
function applyDisplay(cfg) {
  display = cfg;
  applyTheme(cfg.theme, cfg.appearance);
  document.documentElement.style.zoom = String((cfg.zoom || 100) / 100);
  // Hanya latar panel dan permukaan yang ikut transparan (lihat theme.css).
  document.documentElement.style.setProperty("--opacity", `${cfg.opacity ?? 95}%`);
  if (appWindow) appWindow.setAlwaysOnTop(cfg.always_on_top).catch(() => {});
}

/** Ubah sebagian config lalu simpan; semua window menerima event config-changed. */
async function patchConfig(patch) {
  try {
    const saved = await invoke("update_config", { patch });
    if (saved) applyDisplay(saved);
  } catch (err) {
    showToast(String(err));
  }
}

onSystemModeChange(() => display && applyTheme(display.theme, display.appearance));
if (tauri) {
  tauri.event.listen("config-changed", (e) => {
    applyDisplay(e.payload);
    refresh(true);
  });
}

/* ---------- Setup pertama kali (Settings lengkap: window terpisah) ---------- */

const field = {
  vault: $("f-vault"),
  folder: $("f-folder"),
  format: $("f-format"),
};

async function openSetup() {
  if (!el.settings.hidden) return;
  closePopover();
  const cfg = await invoke("get_config");
  field.vault.value = cfg.vault_path;
  field.folder.value = cfg.daily_folder;
  field.format.value = cfg.date_format;
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
    const cfg = await invoke("get_config");
    await invoke("save_config", {
      config: {
        ...cfg,
        vault_path: field.vault.value.trim(),
        daily_folder: field.folder.value.trim(),
        date_format: field.format.value.trim() || "YYYY-MM-DD",
      },
    });
    el.settings.hidden = true;
    await refresh(true);
  } catch (err) {
    el.formError.textContent = String(err);
    el.formError.hidden = false;
  }
});

$("btn-settings").addEventListener("click", () => {
  if (state.view && !state.view.configured) return openSetup();
  invoke("open_settings").catch((err) => showToast(String(err)));
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || el.popover.hidden) return;
  const anchor = popoverAnchor;
  closePopover();
  if (anchor && anchor.isConnected) anchor.focus();
});

/* ---------- Window ---------- */

$("btn-close").addEventListener("click", async () => {
  await saveNotes();
  if (appWindow) appWindow.close();
});
// Tombol buka: Tasks.md di tab All, daily note hari ini di tab lain.
el.open.addEventListener("click", () =>
  invoke("open_in_obsidian", { offset: 0, source: state.tab === "all" ? "tasks" : undefined }).catch((err) => showToast(String(err)))
);

el.tabs.forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));

el.notes.addEventListener("input", () => {
  state.notesDirty = true;
  state.notesNote = "";
  renderNotesStatus();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveNotes, SAVE_DELAY_MS);
});
el.notes.addEventListener("blur", saveNotes);

/* ---------- Start ---------- */

el.panel.dataset.tab = state.tab;
applyNotesCollapsed();
renderNotesStatus();
renderDraft();
// Tampilan dulu (tema, zoom, opacity, always on top), baru data.
invoke("get_config")
  .then(async (cfg) => {
    // Pindahkan pilihan pin lama (localStorage) ke config, sekali saja.
    const old = readPref("pinned", null);
    if (old !== null) {
      try {
        localStorage.removeItem("pinned");
      } catch {}
      if (old !== cfg.always_on_top && cfg.vault_path) return patchConfig({ always_on_top: old });
    }
    applyDisplay(cfg);
  })
  .catch(() => {})
  .finally(() => refresh(true));
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

  // Daily note contoh per offset hari (0 = hari ini).
  const days = {
    "-6": [
      make(0, "Kirim revisi proposal", { priority: "high", due: isoPlus(-2) }),
      make(0, "Sudah beres", { due: isoPlus(-3), done: true, done_date: isoPlus(-3) }),
    ],
    "-3": [make(0, "Bayar tagihan internet", { due: isoToday() }), make(0, "Tanpa deadline")],
    "-1": [make(0, "Kumpulkan form KRS", { done: true, done_date: isoToday() })],
    0: [
      make(0, "Kerjain laporan projek akhir IoT", { priority: "high" }),
      make(1, "Wiring sensor gate", { done: true, done_date: isoPlus(-1) }),
      make(1, "Tulis bab pengujian", { priority: "medium" }),
      make(0, "Review PR **ObsiTask** #dev", { priority: "low" }),
      make(0, "15:00 Rapat asisten praktikum"),
      make(0, "Beli kabel jumper", { done: true, done_date: isoToday() }),
    ],
    2: [make(0, "Bawa laptop ke lab", { due: isoPlus(3) })],
  };
  // Tasks.md contoh: satu list per heading "## Nama".
  const lists = [
    {
      name: "Inbox",
      heading: true,
      tasks: [
        make(0, "Cari referensi skripsi"),
        make(0, "Balas email dosen", { priority: "medium", due: isoPlus(1) }),
        make(0, "Daftar lomba desain", { cancelled: true }),
      ],
    },
    {
      name: "Kuliah",
      heading: true,
      tasks: [
        make(0, "Laporan praktikum jaringan", { priority: "high", due: isoPlus(2) }),
        make(1, "Ambil data Wireshark"),
        make(1, "Tulis analisis", { done: true, done_date: isoPlus(-1) }),
        make(0, "Belajar untuk kuis basis data", { due: isoPlus(5) }),
        make(0, "Revisi makalah", { priority: "high", due: isoPlus(-1) }),
        make(0, "Baca [[Paper ICN|paper ICN]] bab 2", { due: isoToday() }),
        make(0, "Kumpulkan tugas 3", { priority: "medium", done: true, done_date: isoPlus(-2) }),
      ],
    },
    {
      name: "Personal",
      heading: true,
      tasks: [make(0, "Perpanjang SIM", { priority: "low", due: isoPlus(9) }), make(0, "Gym", { done: true, done_date: isoToday() })],
    },
    { name: "Someday", heading: true, tasks: [] },
  ];
  let notes = "Ide: widget cukup baca daily note.\nTanya dosen soal jadwal demo.";
  let config = {
    vault_path: "C:\\Vault",
    daily_folder: "Daily",
    date_format: "YYYY-MM-DD",
    tasks_heading: "## Tasks",
    notes_heading: "## Notes",
    hide_completed: false,
    scan_days: 30,
    upcoming_days: 7,
    tasks_file: "Tasks.md",
    default_list: "Inbox",
    theme: "default",
    appearance: "system",
    zoom: 100,
    always_on_top: true,
    opacity: 95,
  };

  /** Nomor baris: daily note mulai baris 3; Tasks.md tiap heading satu baris. */
  const renumber = () => {
    for (const tasks of Object.values(days)) tasks.forEach((t, i) => (t.line = 3 + i));
    let line = 0;
    for (const l of lists) {
      line++;
      for (const t of l.tasks) t.line = line++;
    }
  };
  renumber();

  /** Versi JS dari tasks::agenda (lihat tasks.rs). */
  const agendaOf = (tasks, today, until, wholeDay, tag, out) => {
    for (let i = 0; i < tasks.length; ) {
      const t = tasks[i];
      const closed = t.done || t.cancelled;
      let group = null;
      if (wholeDay) group = closed ? "done" : "today";
      else if (closed) group = t.done && t.done_date === today ? "done" : null;
      else if (t.due) group = t.due < today ? "overdue" : t.due === today ? "today" : t.due <= until ? "upcoming" : null;
      if (!group) {
        i++;
        continue;
      }
      let end = i + 1;
      while (end < tasks.length && tasks[end].level > t.level) end++;
      out[group].push(...tasks.slice(i, end).map((c) => ({ ...c, level: c.level - t.level, ...tag })));
      i = end;
    }
  };

  const view = () => {
    const today = isoToday();
    const until = isoPlus(config.upcoming_days);
    const agenda = { overdue: [], today: [], done: [], upcoming: [] };
    for (const l of lists) agendaOf(l.tasks, today, until, false, { source: "tasks", list: l.name }, agenda);
    agendaOf(days[0] || [], today, until, true, { source: "daily", offset: 0 }, agenda);
    for (const key of Object.keys(days).map(Number).filter((o) => o !== 0).sort((a, b) => b - a)) {
      agendaOf(days[key], today, until, false, { source: "daily", offset: key, date: isoPlus(key) }, agenda);
    }
    return {
      configured: true,
      date: today,
      file: `Daily/${today}.md`,
      exists: 0 in days,
      notes,
      hide_completed: false,
      upcoming_days: config.upcoming_days,
      agenda,
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
  /** Ambil task + subtask-nya dari tempatnya. */
  const takeBlock = (args) => {
    const holder = holderOf(args);
    const t = find(args);
    const at = holder.indexOf(t);
    let end = at + 1;
    while (end < holder.length && holder[end].level > t.level) end++;
    return { at, block: holder.splice(at, end - at) };
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
  return async (cmd, args = {}) => {
    switch (cmd) {
      case "get_view":
        return view();
      case "toggle_task": {
        const t = find(args);
        t.done = !t.done && !t.cancelled;
        t.cancelled = false;
        t.done_date = t.done ? isoToday() : null;
        sync(t);
        return view();
      }
      case "add_task": {
        const wanted = quickTokens(args.text).list || args.list;
        const into = wanted ? listNamed(wanted).tasks : (days[args.offset] ||= []);
        into.push(apply(make(0, ""), { title: args.text, priority: args.priority, due: args.due }));
        renumber();
        return view();
      }
      case "update_task":
        if (args.title != null && quickTokens(args.title).list) throw "To change a task's list, use Move to list.";
        apply(find(args), args);
        return view();
      case "delete_task": {
        const { at, block } = takeBlock(args);
        renumber();
        return { view: view(), removed: { line: at, text: JSON.stringify(block), anchor: null } };
      }
      case "restore_task": {
        const holder = args.source === "tasks" ? listNamed(args.list || "Inbox").tasks : (days[args.offset] ||= []);
        holder.splice(args.line, 0, ...JSON.parse(args.text));
        renumber();
        return view();
      }
      case "move_task": {
        const dest = listNamed(args.list);
        const { block } = takeBlock(args);
        const base = block[0].level;
        dest.tasks.push(...block.map((t) => ({ ...t, level: t.level - base })));
        renumber();
        return view();
      }
      case "save_notes":
        notes = args.notes;
        days[0] ||= [];
        return view();
      case "get_config":
        return { ...config };
      case "save_config":
        config = { ...args.config };
        return { ...config };
      case "update_config":
        config = { ...config, ...args.patch };
        return { ...config };
      case "check_config":
        return [{ field: "date_format", level: "info", message: `Today's note: Daily/${isoToday()}.md` }];
      case "app_info":
        return { version: "0.1.0 (mock)", config_path: "C:\\Users\\you\\AppData\\Roaming\\com.kekensya.obsitask\\config.json" };
      default:
        return null;
    }
  };
}
