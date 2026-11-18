"use strict";

/*
 * Window Settings. Setiap perubahan langsung disimpan ke config.json lewat
 * save_config; backend lalu mengirim event "config-changed" ke semua window,
 * jadi widget ikut berubah saat itu juga. Tidak ada tombol Save.
 */

const tauri = window.__TAURI__;
const invoke = tauri ? tauri.core.invoke : settingsMock();
const thisWindow = tauri ? tauri.window.getCurrentWindow() : null;

const $ = (id) => document.getElementById(id);
const TEXT_DELAY_MS = 500; // jeda setelah berhenti mengetik sebelum teks disimpan

let cfg = null; // config terakhir yang tersimpan

/* ---------- Simpan ---------- */

let queue = Promise.resolve();
/**
 * Simpan hanya field di `patch`; backend membaca sisanya dari disk, jadi
 * perubahan dari widget (mis. tombol pin) tidak tertimpa. Penyimpanan
 * diantrekan supaya berurutan. Mengembalikan true kalau berhasil.
 */
function save(patch) {
  const run = async () => {
    try {
      cfg = await invoke("update_config", { patch });
      applyLook();
      return true;
    } catch (err) {
      showToast(String(err));
      return false;
    }
  };
  const next = queue.then(run);
  queue = next.catch(() => {});
  return next;
}

/** Tema + varian window ini, termasuk warna title bar Windows. */
function applyLook() {
  const mode = applyTheme(cfg.theme, cfg.appearance);
  if (thisWindow) thisWindow.setTheme(mode).catch(() => {});
  renderAppearance();
  renderThemes();
}

let toastTimer;
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 4000);
}

/* ---------- Tab ---------- */

const navButtons = [...document.querySelectorAll(".nav button")];
function selectTab(name) {
  navButtons.forEach((b) => (b.dataset.tab === name ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  document.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
  try {
    localStorage.setItem("settingsTab", name);
  } catch {}
  if (name === "vault") runChecks();
}
navButtons.forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));

/* ---------- General ---------- */

const modeCards = [...document.querySelectorAll(".mode-card")];
function renderAppearance() {
  modeCards.forEach((c) => c.setAttribute("aria-checked", String(c.dataset.appearance === cfg.appearance)));
}
modeCards.forEach((c) => c.addEventListener("click", () => save({ appearance: c.dataset.appearance })));
onSystemModeChange(() => cfg && applyLook());

const zoom = $("s-zoom");
let zoomTimer;
zoom.addEventListener("input", () => {
  $("s-zoom-value").textContent = `${zoom.value}%`;
  clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => save({ zoom: Number(zoom.value) }), 120);
});

$("s-top").addEventListener("change", (e) => save({ always_on_top: e.target.checked }));
$("s-hide").addEventListener("change", (e) => save({ hide_completed: e.target.checked }));

/* ---------- Kolom teks / angka (Vault, Tasks) ---------- */

/** Nilai kolom `input` dalam bentuk yang disimpan di config. */
function valueOf(input) {
  if (input.type !== "number") return input.value.trim();
  const n = Math.round(Number(input.value));
  if (input.value === "" || !Number.isFinite(n)) return null;
  return Math.max(Number(input.dataset.min), Math.min(Number(input.dataset.max), n));
}

for (const input of document.querySelectorAll("[data-key]")) {
  let timer;
  const commit = async () => {
    clearTimeout(timer);
    const value = valueOf(input);
    if (value === null || value === cfg[input.dataset.key]) return;
    await save({ [input.dataset.key]: value });
    if (document.activeElement !== input) fill(); // tampilkan nilai yang sudah dirapikan backend
    runChecks();
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(commit, TEXT_DELAY_MS);
    if (input.closest("[data-panel='vault']")) runChecks();
  });
  input.addEventListener("change", commit);
  input.addEventListener("blur", () => {
    commit();
    if (input.type === "number" || input.value.trim() === "") setTimeout(fill, 50);
  });
}

/* ---------- Vault ---------- */

const vaultInput = $("s-vault");
let vaultTimer;

/** Simpan vault hanya kalau foldernya ada; kalau tidak, cukup tampilkan peringatan. */
async function commitVault() {
  clearTimeout(vaultTimer);
  const path = vaultInput.value.trim();
  if (path === cfg.vault_path) return runChecks();
  const checks = await runChecks();
  const missing = checks.some((c) => c.field === "vault_path" && c.level === "warn" && !/\.obsidian/.test(c.message));
  if (!missing) await save({ vault_path: path });
}
vaultInput.addEventListener("input", () => {
  clearTimeout(vaultTimer);
  vaultTimer = setTimeout(commitVault, TEXT_DELAY_MS);
});
vaultInput.addEventListener("change", commitVault);

$("s-browse").addEventListener("click", async () => {
  const picked = await invoke("pick_folder");
  if (!picked) return;
  vaultInput.value = picked;
  await commitVault();
});

$("s-detect").addEventListener("click", async () => {
  const note = document.querySelector("[data-field='detect'] .note");
  const path = vaultInput.value.trim();
  const found = path ? await invoke("detect_daily", { path }) : null;
  note.hidden = false;
  note.className = "note" + (found ? "" : " warn");
  if (!found) {
    note.textContent = "No Daily notes settings found in this vault (.obsidian/daily-notes.json).";
    return;
  }
  $("s-folder").value = found.folder || "";
  $("s-format").value = found.format || "YYYY-MM-DD";
  const ok = await save({ daily_folder: $("s-folder").value, date_format: $("s-format").value });
  note.textContent = ok ? `Found: folder "${found.folder || "(vault root)"}", format ${found.format || "YYYY-MM-DD"}.` : "";
  runChecks();
});

/** Periksa isi kolom Vault yang sedang tertulis (belum tentu tersimpan) dan tampilkan catatannya. */
let checkSeq = 0;
async function runChecks() {
  const seq = ++checkSeq;
  const draft = { ...cfg, vault_path: vaultInput.value.trim() };
  for (const input of document.querySelectorAll("[data-panel='vault'] [data-key]")) draft[input.dataset.key] = valueOf(input);
  let checks = [];
  try {
    checks = await invoke("check_config", { config: draft });
  } catch {}
  if (seq !== checkSeq) return checks; // sudah ada pemeriksaan yang lebih baru
  for (const row of document.querySelectorAll("[data-panel='vault'] [data-field]")) {
    if (row.dataset.field === "detect") continue;
    const mine = checks.filter((c) => c.field === row.dataset.field);
    const note = row.querySelector(".note");
    note.hidden = !mine.length;
    note.textContent = mine.map((c) => c.message).join(" ");
    const warn = mine.some((c) => c.level === "warn");
    note.className = "note" + (warn ? " warn" : "");
    row.classList.toggle("has-warn", warn);
  }
  return checks;
}

/* ---------- Themes ---------- */

const themeGrid = $("theme-grid");

function previewOf(theme, mode) {
  const p = document.createElement("div");
  p.className = "preview";
  p.setAttribute("style", themeDeclarations(theme.variants[mode]));
  p.innerHTML = `
    <div class="pv-top"><span class="pv-tab on"></span><span class="pv-tab"></span><span class="pv-tab"></span><span class="pv-btn"></span></div>
    <div class="pv-card">
      <div class="pv-row"><span class="pv-box high"></span><span class="pv-line" style="width:58%"></span></div>
      <div class="pv-row"><span class="pv-box medium"></span><span class="pv-line" style="width:40%"></span><span class="pv-tag"></span></div>
      <div class="pv-row"><span class="pv-box low"></span><span class="pv-line danger" style="width:30%"></span></div>
      <div class="pv-row"><span class="pv-box done"></span><span class="pv-line muted" style="width:46%"></span></div>
    </div>`;
  return p;
}

function renderThemes() {
  const wanted = wantedMode(cfg.appearance);
  $("themes-lead").textContent = `Showing the ${wanted} variants (from Appearance). Themes marked "Dark only" or "Light only" always use that variant.`;
  const cards = OBSI_THEMES.map((theme) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "theme-card";
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", String(theme.id === cfg.theme));
    card.dataset.theme = theme.id;
    const only = themeOnly(theme);
    const meta = document.createElement("div");
    meta.className = "theme-meta";
    const name = document.createElement("span");
    name.className = "theme-name";
    name.textContent = theme.name;
    meta.append(name);
    if (only) {
      const tag = document.createElement("span");
      tag.className = "theme-only";
      tag.textContent = only;
      meta.append(tag);
    }
    card.append(previewOf(theme, themeMode(theme, wanted)), meta);
    card.addEventListener("click", () => save({ theme: theme.id }));
    return card;
  });
  themeGrid.replaceChildren(...cards);
}

/* ---------- About ---------- */

$("s-open-config").addEventListener("click", () => invoke("open_config_dir").catch((err) => showToast(String(err))));

/* ---------- Isi form dari config ---------- */

function fill() {
  zoom.value = cfg.zoom;
  $("s-zoom-value").textContent = `${cfg.zoom}%`;
  $("s-top").checked = cfg.always_on_top;
  $("s-hide").checked = cfg.hide_completed;
  if (document.activeElement !== vaultInput) vaultInput.value = cfg.vault_path;
  for (const input of document.querySelectorAll("[data-key]")) {
    if (document.activeElement !== input) input.value = cfg[input.dataset.key];
  }
}

(async () => {
  cfg = await invoke("get_config");
  fill();
  applyLook();
  let tab = "general";
  try {
    tab = localStorage.getItem("settingsTab") || tab;
  } catch {}
  selectTab(document.querySelector(`[data-panel="${tab}"]`) ? tab : "general");
  const info = await invoke("app_info");
  $("s-version").textContent = `Version ${info.version}`;
  $("s-config-path").textContent = info.config_path;
  // Perubahan dari widget (mis. tombol pin) ikut tampil di sini.
  if (tauri) {
    tauri.event.listen("config-changed", (e) => {
      cfg = e.payload;
      fill();
      applyLook();
    });
  }
})().catch((err) => showToast(String(err)));

/* ---------- Mock (buka settings.html langsung di browser) ---------- */

function settingsMock() {
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
  };
  return async (cmd, args = {}) => {
    switch (cmd) {
      case "get_config":
        return { ...config };
      case "update_config":
        if ("vault_path" in args.patch && !args.patch.vault_path) throw "Vault folder not found.";
        config = { ...config, ...args.patch };
        return { ...config };
      case "check_config":
        return args.config.vault_path === "C:\\Vault"
          ? [{ field: "date_format", level: "info", message: "Today's note: Daily/2026-11-17.md" }]
          : [{ field: "vault_path", level: "warn", message: "Folder not found. The vault was not changed." }];
      case "detect_daily":
        return { folder: "Daily", format: "YYYY-MM-DD" };
      case "app_info":
        return { version: "0.1.0 (mock)", config_path: "C:\\Users\\you\\AppData\\Roaming\\com.kekensya.obsitask\\config.json" };
      default:
        return null;
    }
  };
}
