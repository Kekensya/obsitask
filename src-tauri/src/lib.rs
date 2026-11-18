mod config;
mod scan;
mod tasks;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{Duration, Local, NaiveDate};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

use config::{Config, DetectedDaily};
use tasks::{Task, TaskList};

/// Semua yang dibutuhkan widget: tab Today / Upcoming / All dan Notes hari ini.
#[derive(Serialize)]
struct View {
    configured: bool,
    /// Tanggal hari ini (YYYY-MM-DD).
    date: String,
    /// Path daily note hari ini relatif terhadap vault.
    file: String,
    /// Daily note hari ini sudah ada.
    exists: bool,
    /// Notes daily note hari ini.
    notes: String,
    hide_completed: bool,
    upcoming_days: u32,
    /// Grup tab Today dan Upcoming, dari Tasks.md dan daily note.
    agenda: AgendaView,
    /// List di Tasks.md, sesuai urutan heading (tab All). List default selalu
    /// ada (kosong kalau heading-nya belum ada di file).
    lists: Vec<TaskList>,
    default_list: String,
    /// Path Tasks.md relatif terhadap vault.
    tasks_file: String,
}

#[derive(Serialize, Default)]
struct AgendaView {
    overdue: Vec<Item>,
    today: Vec<Item>,
    /// Selesai hari ini.
    done: Vec<Item>,
    /// Deadline besok sampai `upcoming_days` hari ke depan.
    upcoming: Vec<Item>,
}

/// Task beserta file asalnya, supaya command tulis bisa langsung dipakai.
#[derive(Serialize, Clone)]
struct Item {
    #[serde(flatten)]
    task: Task,
    /// "tasks" (Tasks.md) atau "daily".
    source: &'static str,
    /// Daily note: selisih hari dari hari ini.
    #[serde(skip_serializing_if = "Option::is_none")]
    offset: Option<i64>,
    /// Daily note hari lain: tanggalnya (untuk label "from Nov 10").
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    /// Tasks.md: nama list-nya.
    #[serde(skip_serializing_if = "Option::is_none")]
    list: Option<String>,
}

/// Cache hasil parse (berdasarkan mtime), dipakai bersama semua command.
#[derive(Default)]
struct Caches {
    /// Daily note hari lain (dipindai untuk overdue / due / upcoming).
    daily: Mutex<scan::NoteCache<Vec<Task>>>,
    /// Tasks.md.
    lists: Mutex<scan::NoteCache<Vec<TaskList>>>,
}

/// Hasil menghapus task: tampilan baru + data untuk undo.
#[derive(Serialize)]
struct Deleted {
    view: View,
    removed: tasks::Removed,
}

/// File tempat sebuah task tinggal.
#[derive(Clone, Copy, PartialEq, Debug)]
enum Source {
    /// Daily note `offset` hari dari hari ini.
    Daily(i64),
    /// Tasks.md (list permanen).
    Lists,
}

/// Argumen `source` dari frontend: kosong / "daily" = daily note `offset`,
/// "tasks" = Tasks.md.
fn source_of(offset: i64, source: Option<&str>) -> Result<Source, String> {
    match source.map(str::trim) {
        None | Some("") | Some("daily") => Ok(Source::Daily(offset)),
        Some("tasks") => Ok(Source::Lists),
        Some(other) => Err(format!("Unknown task source: {other}")),
    }
}

fn source_path(cfg: &Config, source: Source) -> PathBuf {
    match source {
        Source::Daily(offset) => cfg.daily_note_path(day(offset)),
        Source::Lists => cfg.tasks_path(),
    }
}

/// Lokasi config.json. Variabel lingkungan `OBSITASK_CONFIG` menggantinya, supaya
/// widget bisa dicoba terhadap vault percobaan tanpa menyentuh config asli.
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(p) = std::env::var_os("OBSITASK_CONFIG").filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(p));
    }
    app.path()
        .app_config_dir()
        .map(|d| d.join("config.json"))
        .map_err(|e| e.to_string())
}

fn load_config(app: &AppHandle) -> Result<Config, String> {
    Ok(Config::load(&config_path(app)?))
}

/// Heading yang pasti valid (`default` kalau kosong; `## ` ditambahkan kalau
/// bukan heading).
fn heading_or(value: &str, default: &str) -> String {
    let h = value.trim();
    if h.is_empty() {
        default.to_string()
    } else if h.starts_with('#') && h.trim_start_matches('#').starts_with(' ') {
        h.to_string()
    } else {
        format!("## {}", h.trim_start_matches('#').trim())
    }
}

fn notes_heading(cfg: &Config) -> String {
    heading_or(&cfg.notes_heading, "## Notes")
}

fn tasks_heading(cfg: &Config) -> String {
    heading_or(&cfg.tasks_heading, "## Tasks")
}

fn today() -> NaiveDate {
    Local::now().date_naive()
}

fn day(offset: i64) -> NaiveDate {
    today() + Duration::days(offset)
}

fn iso(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

/// List di Tasks.md (pakai cache mtime). List default ditambahkan di depan
/// kalau belum ada, supaya selalu ada tempat untuk menambah task.
fn load_lists(cfg: &Config, caches: &Caches) -> Vec<TaskList> {
    let mut cache = caches.lists.lock().unwrap_or_else(|e| e.into_inner());
    let path = cfg.tasks_path();
    let mut lists = cache
        .get(&path, tasks::parse_lists)
        .map(|l| (*l).clone())
        .unwrap_or_default();
    cache.retain(|p| p == path);
    let default = cfg.default_list();
    if !lists.iter().any(|l| tasks::same_list(&l.name, &default)) {
        lists.insert(0, TaskList { name: default, heading: false, tasks: Vec::new() });
    }
    lists
}

/// Nama list yang boleh dituju di isi Tasks.md `content`: semua list di file
/// plus list default (dibuat kalau belum ada).
fn list_names(cfg: &Config, content: &str) -> Vec<String> {
    let mut names: Vec<String> = tasks::parse_lists(content).into_iter().map(|l| l.name).collect();
    let default = cfg.default_list();
    if !names.iter().any(|n| tasks::same_list(n, &default)) {
        names.push(default);
    }
    names
}

impl AgendaView {
    /// Tambahkan hasil `tasks::agenda` satu file, ditandai asalnya lewat `tag`.
    fn extend(&mut self, a: tasks::Agenda, tag: impl Fn(Task) -> Item) {
        self.overdue.extend(a.overdue.into_iter().map(&tag));
        self.today.extend(a.today.into_iter().map(&tag));
        self.done.extend(a.done.into_iter().map(&tag));
        self.upcoming.extend(a.upcoming.into_iter().map(&tag));
    }
}

/// Kumpulkan grup Today / Upcoming dari semua sumber:
/// - Tasks.md, per list;
/// - daily note hari ini (`today_tasks`): semua task-nya;
/// - daily note `scan_days` hari ke belakang dan `upcoming_days` hari ke depan
///   (pakai cache mtime): hanya task yang deadline / tanggal selesainya relevan.
fn collect_agenda(cfg: &Config, lists: &[TaskList], today_tasks: &[Task], caches: &Caches) -> AgendaView {
    let base = today();
    let (now, until) = (iso(base), iso(base + Duration::days(i64::from(cfg.upcoming_days.min(config::MAX_UPCOMING_DAYS)))));
    let mut view = AgendaView::default();

    for list in lists {
        view.extend(tasks::agenda(&list.tasks, &now, &until, false), |task| Item {
            task,
            source: "tasks",
            offset: None,
            date: None,
            list: Some(list.name.clone()),
        });
    }
    let daily = |offset: i64| {
        move |task| Item {
            task,
            source: "daily",
            offset: Some(offset),
            date: (offset != 0).then(|| iso(base + Duration::days(offset))),
            list: None,
        }
    };
    view.extend(tasks::agenda(today_tasks, &now, &until, true), daily(0));

    let mut cache = caches.daily.lock().unwrap_or_else(|e| e.into_inner());
    // Format tanggal tanpa hari (mis. bulanan) bisa memetakan beberapa tanggal
    // ke file yang sama; daily note hari ini sudah dihitung di atas.
    let mut seen: HashSet<PathBuf> = HashSet::from([cfg.daily_note_path(base)]);
    let back = i64::from(cfg.scan_days.min(config::MAX_SCAN_DAYS));
    let ahead = i64::from(cfg.upcoming_days.min(config::MAX_UPCOMING_DAYS));
    for offset in (-back..0).rev().chain(1..=ahead) {
        let path = cfg.daily_note_path(base + Duration::days(offset));
        if !seen.insert(path.clone()) {
            continue;
        }
        if let Some(found) = cache.get(&path, tasks::parse_tasks) {
            view.extend(tasks::agenda(&found, &now, &until, false), daily(offset));
        }
    }
    cache.retain(|p| seen.contains(p));
    view
}

fn build_view(cfg: &Config, caches: &Caches) -> View {
    let date = today();
    let mut view = View {
        configured: cfg.is_configured(),
        date: iso(date),
        file: String::new(),
        exists: false,
        notes: String::new(),
        hide_completed: cfg.hide_completed,
        upcoming_days: cfg.upcoming_days.min(config::MAX_UPCOMING_DAYS),
        agenda: AgendaView::default(),
        lists: Vec::new(),
        default_list: cfg.default_list(),
        tasks_file: String::new(),
    };
    if !view.configured {
        return view;
    }
    view.file = cfg.daily_note_rel(date);
    view.tasks_file = cfg.vault_rel(&cfg.tasks_path());
    let mut today_tasks = Vec::new();
    if let Ok(content) = std::fs::read_to_string(cfg.daily_note_path(date)) {
        view.exists = true;
        today_tasks = tasks::parse_tasks(&content);
        view.notes = tasks::read_notes(&content, &notes_heading(cfg));
    }
    view.lists = load_lists(cfg, caches);
    view.agenda = collect_agenda(cfg, &view.lists, &today_tasks, caches);
    view
}

/// Baca file `path`, ubah isinya lewat `change` (fungsi murni dari `tasks`),
/// lalu tulis balik kalau memang berubah. Dengan `create`, file yang belum ada
/// dianggap kosong dan dibuat.
fn edit_file<T>(
    cfg: &Config,
    path: &Path,
    create: bool,
    change: impl FnOnce(&str) -> Result<(String, T), String>,
) -> Result<T, String> {
    if !cfg.is_configured() {
        return Err("Vault is not set up yet.".into());
    }
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) if create && e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.to_string()),
    };
    let (updated, out) = change(&content)?;
    if updated != content {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(path, updated).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

fn edit_source<T>(
    cfg: &Config,
    source: Source,
    create: bool,
    change: impl FnOnce(&str) -> Result<(String, T), String>,
) -> Result<T, String> {
    edit_file(cfg, &source_path(cfg, source), create, change)
}

fn parse_priority(name: Option<String>) -> Result<Option<tasks::Priority>, String> {
    name.map(|n| tasks::Priority::from_name(n.trim()).ok_or(format!("Unknown priority: {n}")))
        .transpose()
}

#[tauri::command]
fn get_config(app: AppHandle) -> Result<Config, String> {
    load_config(&app)
}

/// Satu penulisan config.json pada satu waktu: widget dan Settings bisa
/// menyimpan hampir bersamaan.
static CONFIG_LOCK: Mutex<()> = Mutex::new(());

/// Simpan seluruh config (setup pertama kali).
#[tauri::command]
fn save_config(app: AppHandle, config: Config) -> Result<Config, String> {
    let _guard = CONFIG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    store_config(&app, config)
}

/// Ubah sebagian setting: field di `patch` diganti, sisanya dibaca ulang dari
/// disk. Dipakai window Settings dan tombol pin widget.
#[tauri::command]
fn update_config(app: AppHandle, patch: serde_json::Map<String, serde_json::Value>) -> Result<Config, String> {
    let _guard = CONFIG_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let next = config::apply_patch(&load_config(&app)?, &patch)?;
    store_config(&app, next)
}

/// Rapikan, simpan, lalu beri tahu semua window.
fn store_config(app: &AppHandle, config: Config) -> Result<Config, String> {
    let mut cfg = config;
    cfg.vault_path = cfg.vault_path.trim().to_string();
    if !cfg.is_configured() {
        return Err("Vault folder not found.".into());
    }
    cfg.notes_heading = notes_heading(&cfg);
    cfg.tasks_heading = tasks_heading(&cfg);
    cfg.scan_days = cfg.scan_days.min(config::MAX_SCAN_DAYS);
    cfg.upcoming_days = cfg.upcoming_days.clamp(1, config::MAX_UPCOMING_DAYS);
    cfg.tasks_file = match cfg.tasks_file.trim() {
        "" => "Tasks.md".to_string(),
        f => f.to_string(),
    };
    cfg.default_list = cfg.default_list();
    cfg.normalize_display();
    cfg.save(&config_path(app)?)?;
    // Semua window (widget dan Settings) menerapkan perubahan saat itu juga.
    let _ = app.emit("config-changed", &cfg);
    Ok(cfg)
}

/// Periksa setting vault yang sedang diisi di Settings (belum tentu tersimpan).
#[tauri::command]
fn check_config(config: Config) -> Vec<config::Check> {
    config::check(&config, today())
}

/// Buka window Settings, atau fokuskan kalau sudah terbuka. Async: membuat
/// window dari command sinkron bisa macet di Windows.
#[tauri::command]
async fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.unminimize();
        let _ = win.show();
        return win.set_focus().map_err(|e| e.to_string());
    }
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("ObsiTask Settings")
        .inner_size(720.0, 640.0)
        .min_inner_size(560.0, 460.0)
        .resizable(true)
        .decorations(true)
        .always_on_top(false)
        .center()
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    config_path: String,
}

#[tauri::command]
fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        config_path: config_path(&app)?.to_string_lossy().into_owned(),
    })
}

/// Buka folder tempat config.json di file explorer.
#[tauri::command]
fn open_config_dir(app: AppHandle) -> Result<(), String> {
    let path = config_path(&app)?;
    let dir = path.parent().ok_or("No config folder.")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    open_uri(&dir.to_string_lossy())
}

/// Baca setting plugin Daily notes dari `.obsidian/daily-notes.json`.
#[tauri::command]
fn detect_daily(path: String) -> Option<DetectedDaily> {
    config::detect_daily(&path)
}

/// Dialog pilih folder. Async supaya tidak memblokir main thread.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[tauri::command]
fn get_view(app: AppHandle, caches: State<Caches>) -> Result<View, String> {
    Ok(build_view(&load_config(&app)?, &caches))
}

// Command tulis menerima `offset` + `source` untuk memilih file yang diubah:
// tanpa `source` (atau "daily") = daily note `offset` hari dari hari ini;
// `source: "tasks"` = Tasks.md. Semuanya mengembalikan tampilan terbaru.

#[tauri::command]
fn toggle_task(
    app: AppHandle,
    caches: State<Caches>,
    offset: i64,
    source: Option<String>,
    line: usize,
    text: String,
) -> Result<View, String> {
    let cfg = load_config(&app)?;
    edit_source(&cfg, source_of(offset, source.as_deref())?, false, |content| {
        Ok((tasks::toggle_task(content, line, &text, today())?, ()))
    })?;
    Ok(build_view(&cfg, &caches))
}

/// Tambah task baru. `text` boleh berisi token quick-add (`!high`,
/// `@tomorrow`, `~kuliah`, ...); `priority` / `due` dari tombol menang atas
/// token. Tujuan:
/// - token `~list` di teks, atau argumen `list`: akhir list itu di Tasks.md
///   (token menang atas argumen). Nama harus cocok dengan list yang ada atau
///   list default; list baru tidak dibuat.
/// - selain itu: daily note `offset`, di bawah heading task.
#[tauri::command]
fn add_task(
    app: AppHandle,
    caches: State<Caches>,
    offset: i64,
    text: String,
    priority: Option<String>,
    due: Option<String>,
    list: Option<String>,
) -> Result<View, String> {
    let cfg = load_config(&app)?;
    let wanted = tasks::parse_quick(&text, today())
        .list
        .or(list.filter(|l| !l.trim().is_empty()));
    let edit = tasks::Edit {
        title: Some(text),
        priority: parse_priority(priority)?,
        due,
    };
    let task = tasks::compose_task(&edit, today())?;
    match wanted {
        Some(query) => edit_file(&cfg, &cfg.tasks_path(), true, |content| {
            let name = tasks::resolve_list(&list_names(&cfg, content), &query)?;
            Ok((tasks::add_to_list(content, &name, &task), ()))
        })?,
        None => edit_source(&cfg, Source::Daily(offset), true, |content| {
            Ok((tasks::add_task(content, &tasks_heading(&cfg), &task), ()))
        })?,
    }
    Ok(build_view(&cfg, &caches))
}

/// Ubah judul / prioritas / deadline. Argumen yang tidak dikirim tidak diubah;
/// `due` kosong menghapus deadline.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn update_task(
    app: AppHandle,
    caches: State<Caches>,
    offset: i64,
    source: Option<String>,
    line: usize,
    text: String,
    title: Option<String>,
    priority: Option<String>,
    due: Option<String>,
) -> Result<View, String> {
    let cfg = load_config(&app)?;
    if title.as_deref().is_some_and(|t| tasks::parse_quick(t, today()).list.is_some()) {
        return Err("To change a task's list, use Move to list.".into());
    }
    let edit = tasks::Edit {
        title,
        priority: parse_priority(priority)?,
        due,
    };
    edit_source(&cfg, source_of(offset, source.as_deref())?, false, |content| {
        Ok((tasks::update_task(content, line, &text, &edit, today())?, ()))
    })?;
    Ok(build_view(&cfg, &caches))
}

#[tauri::command]
fn delete_task(
    app: AppHandle,
    caches: State<Caches>,
    offset: i64,
    source: Option<String>,
    line: usize,
    text: String,
) -> Result<Deleted, String> {
    let cfg = load_config(&app)?;
    let removed = edit_source(&cfg, source_of(offset, source.as_deref())?, false, |content| {
        tasks::delete_task(content, line, &text)
    })?;
    Ok(Deleted {
        view: build_view(&cfg, &caches),
        removed,
    })
}

/// Undo `delete_task`: kembalikan blok yang dihapus ke tempatnya. Kalau
/// tempatnya sudah bergeser, blok masuk ke akhir heading task (daily note) atau
/// list `list` (Tasks.md; default: list default).
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn restore_task(
    app: AppHandle,
    caches: State<Caches>,
    offset: i64,
    source: Option<String>,
    line: usize,
    text: String,
    anchor: Option<String>,
    list: Option<String>,
) -> Result<View, String> {
    let cfg = load_config(&app)?;
    let source = source_of(offset, source.as_deref())?;
    let heading = match source {
        Source::Daily(_) => tasks_heading(&cfg),
        Source::Lists => format!("## {}", list.filter(|l| !l.trim().is_empty()).unwrap_or_else(|| cfg.default_list()).trim()),
    };
    let removed = tasks::Removed { line, text, anchor };
    edit_source(&cfg, source, true, |content| {
        Ok((tasks::restore_task(content, &removed, &heading), ()))
    })?;
    Ok(build_view(&cfg, &caches))
}

/// Pindahkan task (beserta subtask-nya) ke akhir list `list` di Tasks.md, dari
/// Tasks.md sendiri atau dari daily note.
///
/// Antar file urutannya: validasi `text` di sumber -> tulis ke Tasks.md ->
/// hapus dari sumber (divalidasi ulang terhadap isi terbaru). Kalau langkah
/// terakhir gagal, task dibiarkan dobel daripada hilang, dan error-nya
/// menjelaskan itu.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn move_task(
    app: AppHandle,
    caches: State<Caches>,
    offset: i64,
    source: Option<String>,
    line: usize,
    text: String,
    list: String,
) -> Result<View, String> {
    let cfg = load_config(&app)?;
    let source = source_of(offset, source.as_deref())?;
    let from = source_path(&cfg, source);
    let to = cfg.tasks_path();
    if from == to {
        edit_file(&cfg, &to, false, |content| {
            let name = tasks::resolve_list(&list_names(&cfg, content), &list)?;
            Ok((tasks::move_to_list(content, line, &text, &name)?, ()))
        })?;
    } else {
        // 1. Validasi di sumber dan ambil bloknya, tanpa menulis apa pun.
        let content = std::fs::read_to_string(&from).map_err(|e| e.to_string())?;
        let (_, removed) = tasks::delete_task(&content, line, &text)?;
        // 2. Tulis ke Tasks.md.
        let name = edit_file(&cfg, &to, true, |content| {
            let name = tasks::resolve_list(&list_names(&cfg, content), &list)?;
            Ok((tasks::insert_block(content, &name, &removed.text), name))
        })?;
        // 3. Baru hapus dari sumber.
        edit_file(&cfg, &from, false, |content| {
            Ok((tasks::delete_task(content, line, &text)?.0, ()))
        })
        .map_err(|e| {
            format!("Copied to {name}, but couldn't remove it from the original note ({e}) — it's in both places now.")
        })?;
    }
    Ok(build_view(&cfg, &caches))
}

/// Simpan Notes daily note hari ini.
#[tauri::command]
fn save_notes(app: AppHandle, caches: State<Caches>, notes: String) -> Result<View, String> {
    let cfg = load_config(&app)?;
    // Daily note yang belum ada dianggap kosong, dan baru dibuat kalau ada isinya.
    edit_source(&cfg, Source::Daily(0), true, |content| {
        Ok((tasks::write_notes(content, &notes_heading(&cfg), &notes), ()))
    })?;
    Ok(build_view(&cfg, &caches))
}

fn percent_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn open_uri(uri: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", uri]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(uri);
        c
    };
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(uri);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Buka daily note hari itu (atau Tasks.md, dengan `source: "tasks"`) di
/// Obsidian. File yang belum ada dibuat oleh Obsidian.
#[tauri::command]
fn open_in_obsidian(app: AppHandle, offset: i64, source: Option<String>) -> Result<(), String> {
    let cfg = load_config(&app)?;
    if !cfg.is_configured() {
        return Err("Vault is not set up yet.".into());
    }
    let source = source_of(offset, source.as_deref())?;
    let path = source_path(&cfg, source);
    let rel = cfg.vault_rel(&path);
    let vault = percent_encode(&cfg.vault_name());
    let uri = if path.is_file() {
        format!("obsidian://open?vault={vault}&file={}", percent_encode(&rel))
    } else if source == Source::Daily(0) {
        // Biar Obsidian yang membuat daily note hari ini, lengkap dengan template.
        format!("obsidian://daily?vault={vault}")
    } else {
        format!("obsidian://new?vault={vault}&file={}", percent_encode(rel.trim_end_matches(".md")))
    };
    open_uri(&uri)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Caches::default())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            update_config,
            check_config,
            open_settings,
            app_info,
            open_config_dir,
            detect_daily,
            pick_folder,
            get_view,
            toggle_task,
            add_task,
            update_task,
            delete_task,
            restore_task,
            move_task,
            save_notes,
            open_in_obsidian
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan ObsiTask");
}
