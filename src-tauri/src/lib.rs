mod config;
mod scan;
mod tasks;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{Duration, Local, NaiveDate};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use config::{Config, DetectedDaily};
use tasks::{Task, TaskList};

/// Semua yang dibutuhkan widget untuk menggambar satu hari, plus list permanen.
#[derive(Serialize)]
struct DayView {
    configured: bool,
    /// Tanggal ISO (YYYY-MM-DD) dari hari yang ditampilkan.
    date: String,
    /// Path daily note relatif terhadap vault.
    file: String,
    exists: bool,
    tasks: Vec<Task>,
    notes: String,
    hide_completed: bool,
    /// Task belum selesai dari daily note hari-hari sebelumnya yang deadline-nya
    /// paling lambat hari yang ditampilkan (bagian "Overdue & due").
    due: Vec<DueTask>,
    /// List di Tasks.md, sesuai urutan heading. List default selalu ada
    /// (kosong kalau heading-nya belum ada di file).
    lists: Vec<TaskList>,
    default_list: String,
    /// Path Tasks.md relatif terhadap vault.
    tasks_file: String,
}

/// Task dari daily note lain. `offset` menunjuk file asalnya, jadi command
/// tulis yang sama (toggle/update/delete) bisa dipakai langsung.
#[derive(Serialize)]
struct DueTask {
    offset: i64,
    /// Tanggal daily note asal (YYYY-MM-DD).
    date: String,
    #[serde(flatten)]
    task: Task,
}

/// Cache hasil parse (berdasarkan mtime), dipakai bersama semua command.
#[derive(Default)]
struct Caches {
    /// Daily note hari-hari sebelumnya, untuk "Overdue & due".
    daily: Mutex<scan::NoteCache<Vec<Task>>>,
    /// Tasks.md.
    lists: Mutex<scan::NoteCache<Vec<TaskList>>>,
}

/// Hasil menghapus task: tampilan baru + data untuk undo.
#[derive(Serialize)]
struct Deleted {
    view: DayView,
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

/// Pindai daily note `scan_days` hari sebelum `date` (pakai cache mtime) dan
/// kumpulkan task belum selesai yang deadline-nya <= `date`.
fn collect_due(cfg: &Config, date: NaiveDate, caches: &Caches) -> Vec<DueTask> {
    let through = iso(date);
    let base = today();
    let mut cache = caches.daily.lock().unwrap_or_else(|e| e.into_inner());
    // Format tanggal tanpa hari (mis. bulanan) bisa memetakan beberapa tanggal
    // ke file yang sama; file hari yang sedang tampil juga dilewati.
    let mut seen: HashSet<PathBuf> = HashSet::from([cfg.daily_note_path(date)]);
    let mut out = Vec::new();
    for back in 1..=i64::from(cfg.scan_days.min(config::MAX_SCAN_DAYS)) {
        let d = date - Duration::days(back);
        let path = cfg.daily_note_path(d);
        if !seen.insert(path.clone()) {
            continue;
        }
        if let Some(found) = cache.get(&path, tasks::parse_tasks) {
            out.extend(tasks::due_by(&found, &through).into_iter().map(|task| DueTask {
                offset: (d - base).num_days(),
                date: iso(d),
                task,
            }));
        }
    }
    cache.retain(|p| seen.contains(p));
    out
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

fn build_view(cfg: &Config, offset: i64, caches: &Caches) -> DayView {
    let date = day(offset);
    let mut view = DayView {
        configured: cfg.is_configured(),
        date: iso(date),
        file: String::new(),
        exists: false,
        tasks: Vec::new(),
        notes: String::new(),
        hide_completed: cfg.hide_completed,
        due: Vec::new(),
        lists: Vec::new(),
        default_list: cfg.default_list(),
        tasks_file: String::new(),
    };
    if !view.configured {
        return view;
    }
    view.file = cfg.daily_note_rel(date);
    view.tasks_file = cfg.vault_rel(&cfg.tasks_path());
    view.due = collect_due(cfg, date, caches);
    view.lists = load_lists(cfg, caches);
    if let Ok(content) = std::fs::read_to_string(cfg.daily_note_path(date)) {
        view.exists = true;
        view.tasks = tasks::parse_tasks(&content);
        view.notes = tasks::read_notes(&content, &notes_heading(cfg));
    }
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

#[tauri::command]
fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    let mut cfg = config;
    cfg.vault_path = cfg.vault_path.trim().to_string();
    if !cfg.is_configured() {
        return Err("Vault folder not found.".into());
    }
    cfg.notes_heading = notes_heading(&cfg);
    cfg.tasks_heading = tasks_heading(&cfg);
    cfg.scan_days = cfg.scan_days.min(config::MAX_SCAN_DAYS);
    cfg.tasks_file = match cfg.tasks_file.trim() {
        "" => "Tasks.md".to_string(),
        f => f.to_string(),
    };
    cfg.default_list = cfg.default_list();
    cfg.save(&config_path(&app)?)
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
fn get_day(app: AppHandle, caches: State<Caches>, offset: i64) -> Result<DayView, String> {
    Ok(build_view(&load_config(&app)?, offset, &caches))
}

// Command tulis menerima:
// - `offset` + `source`: file yang diubah. Tanpa `source` = daily note `offset`
//   (bisa file asal task di "Overdue & due"); `source: "tasks"` = Tasks.md.
// - `show`: hari yang sedang tampil di widget, untuk tampilan yang dikembalikan
//   (default: `offset`).

#[tauri::command]
fn toggle_task(
    app: AppHandle,
    caches: State<Caches>,
    offset: i64,
    source: Option<String>,
    line: usize,
    text: String,
    show: Option<i64>,
) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    edit_source(&cfg, source_of(offset, source.as_deref())?, false, |content| {
        Ok((tasks::toggle_task(content, line, &text, today())?, ()))
    })?;
    Ok(build_view(&cfg, show.unwrap_or(offset), &caches))
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
) -> Result<DayView, String> {
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
    Ok(build_view(&cfg, offset, &caches))
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
    show: Option<i64>,
) -> Result<DayView, String> {
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
    Ok(build_view(&cfg, show.unwrap_or(offset), &caches))
}

#[tauri::command]
fn delete_task(
    app: AppHandle,
    caches: State<Caches>,
    offset: i64,
    source: Option<String>,
    line: usize,
    text: String,
    show: Option<i64>,
) -> Result<Deleted, String> {
    let cfg = load_config(&app)?;
    let removed = edit_source(&cfg, source_of(offset, source.as_deref())?, false, |content| {
        tasks::delete_task(content, line, &text)
    })?;
    Ok(Deleted {
        view: build_view(&cfg, show.unwrap_or(offset), &caches),
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
    show: Option<i64>,
) -> Result<DayView, String> {
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
    Ok(build_view(&cfg, show.unwrap_or(offset), &caches))
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
    show: Option<i64>,
) -> Result<DayView, String> {
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
    Ok(build_view(&cfg, show.unwrap_or(offset), &caches))
}

#[tauri::command]
fn save_notes(app: AppHandle, caches: State<Caches>, offset: i64, notes: String) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    // Daily note yang belum ada dianggap kosong, dan baru dibuat kalau ada isinya.
    edit_source(&cfg, Source::Daily(offset), true, |content| {
        Ok((tasks::write_notes(content, &notes_heading(&cfg), &notes), ()))
    })?;
    Ok(build_view(&cfg, offset, &caches))
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
            detect_daily,
            pick_folder,
            get_day,
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
