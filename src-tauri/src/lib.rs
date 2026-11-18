mod config;
mod scan;
mod tasks;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use chrono::{Duration, Local, NaiveDate};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use config::{Config, DetectedDaily};

/// Semua yang dibutuhkan widget untuk menggambar satu hari.
#[derive(Serialize)]
struct DayView {
    configured: bool,
    /// Tanggal ISO (YYYY-MM-DD) dari hari yang ditampilkan.
    date: String,
    /// Path daily note relatif terhadap vault.
    file: String,
    exists: bool,
    tasks: Vec<tasks::Task>,
    notes: String,
    hide_completed: bool,
    /// Task belum selesai dari daily note hari-hari sebelumnya yang deadline-nya
    /// paling lambat hari yang ditampilkan (bagian "Overdue & due").
    due: Vec<DueTask>,
}

/// Task dari daily note lain. `offset` menunjuk file asalnya, jadi command
/// tulis yang sama (toggle/update/delete) bisa dipakai langsung.
#[derive(Serialize)]
struct DueTask {
    offset: i64,
    /// Tanggal daily note asal (YYYY-MM-DD).
    date: String,
    #[serde(flatten)]
    task: tasks::Task,
}

/// Cache parse daily note untuk pemindaian, dipakai bersama semua command.
type Scan = Mutex<scan::NoteCache>;

/// Hasil menghapus task: tampilan baru + data untuk undo.
#[derive(Serialize)]
struct Deleted {
    view: DayView,
    removed: tasks::Removed,
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
fn collect_due(cfg: &Config, date: NaiveDate, scan: &Scan) -> Vec<DueTask> {
    let through = iso(date);
    let base = today();
    let mut cache = scan.lock().unwrap_or_else(|e| e.into_inner());
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
        if let Some(found) = cache.tasks(&path) {
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

fn build_view(cfg: &Config, offset: i64, scan: &Scan) -> DayView {
    let date = day(offset);
    let mut view = DayView {
        configured: cfg.is_configured(),
        date: date.format("%Y-%m-%d").to_string(),
        file: String::new(),
        exists: false,
        tasks: Vec::new(),
        notes: String::new(),
        hide_completed: cfg.hide_completed,
        due: Vec::new(),
    };
    if !view.configured {
        return view;
    }
    view.file = cfg.daily_note_rel(date);
    view.due = collect_due(cfg, date, scan);
    if let Ok(content) = std::fs::read_to_string(cfg.daily_note_path(date)) {
        view.exists = true;
        view.tasks = tasks::parse_tasks(&content);
        view.notes = tasks::read_notes(&content, &notes_heading(cfg));
    }
    view
}

/// Baca daily note hari `offset`, ubah isinya lewat `change` (fungsi murni dari
/// `tasks`), lalu tulis balik kalau memang berubah. Dengan `create`, daily note
/// yang belum ada dianggap kosong dan dibuat.
fn edit_note<T>(
    cfg: &Config,
    offset: i64,
    create: bool,
    change: impl FnOnce(&str) -> Result<(String, T), String>,
) -> Result<T, String> {
    if !cfg.is_configured() {
        return Err("Vault is not set up yet.".into());
    }
    let path = cfg.daily_note_path(day(offset));
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if create && e.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.to_string()),
    };
    let (updated, out) = change(&content)?;
    if updated != content {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    }
    Ok(out)
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
fn get_day(app: AppHandle, scan: State<Scan>, offset: i64) -> Result<DayView, String> {
    Ok(build_view(&load_config(&app)?, offset, &scan))
}

// Command tulis: `offset` = daily note yang diubah (bisa file asal task di
// "Overdue & due"); `show` = hari yang sedang tampil di widget, untuk tampilan
// yang dikembalikan (default: sama dengan `offset`).

#[tauri::command]
fn toggle_task(
    app: AppHandle,
    scan: State<Scan>,
    offset: i64,
    line: usize,
    text: String,
    show: Option<i64>,
) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    edit_note(&cfg, offset, false, |content| {
        Ok((tasks::toggle_task(content, line, &text, today())?, ()))
    })?;
    Ok(build_view(&cfg, show.unwrap_or(offset), &scan))
}

/// Tambah task baru di bawah heading task. `text` boleh berisi token quick-add
/// (`!high`, `@tomorrow`, ...); `priority` / `due` dari tombol menang atas token.
#[tauri::command]
fn add_task(
    app: AppHandle,
    scan: State<Scan>,
    offset: i64,
    text: String,
    priority: Option<String>,
    due: Option<String>,
) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    let edit = tasks::Edit {
        title: Some(text),
        priority: parse_priority(priority)?,
        due,
    };
    let task = tasks::compose_task(&edit, today())?;
    edit_note(&cfg, offset, true, |content| {
        Ok((tasks::add_task(content, &tasks_heading(&cfg), &task), ()))
    })?;
    Ok(build_view(&cfg, offset, &scan))
}

/// Ubah judul / prioritas / deadline. Argumen yang tidak dikirim tidak diubah;
/// `due` kosong menghapus deadline.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn update_task(
    app: AppHandle,
    scan: State<Scan>,
    offset: i64,
    line: usize,
    text: String,
    title: Option<String>,
    priority: Option<String>,
    due: Option<String>,
    show: Option<i64>,
) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    let edit = tasks::Edit {
        title,
        priority: parse_priority(priority)?,
        due,
    };
    edit_note(&cfg, offset, false, |content| {
        Ok((tasks::update_task(content, line, &text, &edit, today())?, ()))
    })?;
    Ok(build_view(&cfg, show.unwrap_or(offset), &scan))
}

#[tauri::command]
fn delete_task(
    app: AppHandle,
    scan: State<Scan>,
    offset: i64,
    line: usize,
    text: String,
    show: Option<i64>,
) -> Result<Deleted, String> {
    let cfg = load_config(&app)?;
    let removed = edit_note(&cfg, offset, false, |content| {
        tasks::delete_task(content, line, &text)
    })?;
    Ok(Deleted {
        view: build_view(&cfg, show.unwrap_or(offset), &scan),
        removed,
    })
}

/// Undo `delete_task`: kembalikan blok yang dihapus ke tempatnya.
#[tauri::command]
fn restore_task(
    app: AppHandle,
    scan: State<Scan>,
    offset: i64,
    line: usize,
    text: String,
    anchor: Option<String>,
    show: Option<i64>,
) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    let removed = tasks::Removed { line, text, anchor };
    edit_note(&cfg, offset, true, |content| {
        Ok((tasks::restore_task(content, &removed, &tasks_heading(&cfg)), ()))
    })?;
    Ok(build_view(&cfg, show.unwrap_or(offset), &scan))
}

#[tauri::command]
fn save_notes(app: AppHandle, scan: State<Scan>, offset: i64, notes: String) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    // Daily note yang belum ada dianggap kosong, dan baru dibuat kalau ada isinya.
    edit_note(&cfg, offset, true, |content| {
        Ok((tasks::write_notes(content, &notes_heading(&cfg), &notes), ()))
    })?;
    Ok(build_view(&cfg, offset, &scan))
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

/// Buka daily note hari itu di Obsidian (dibuat dulu oleh Obsidian kalau belum ada).
#[tauri::command]
fn open_in_obsidian(app: AppHandle, offset: i64) -> Result<(), String> {
    let cfg = load_config(&app)?;
    if !cfg.is_configured() {
        return Err("Vault is not set up yet.".into());
    }
    let date = day(offset);
    let vault = percent_encode(&cfg.vault_name());
    let exists = cfg.daily_note_path(date).is_file();
    let uri = if exists {
        let file = percent_encode(&cfg.daily_note_rel(date));
        format!("obsidian://open?vault={vault}&file={file}")
    } else if offset == 0 {
        // Biar Obsidian yang membuat daily note hari ini, lengkap dengan template.
        format!("obsidian://daily?vault={vault}")
    } else {
        let file = percent_encode(cfg.daily_note_rel(date).trim_end_matches(".md"));
        format!("obsidian://new?vault={vault}&file={file}")
    };
    open_uri(&uri)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Scan::default())
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
            save_notes,
            open_in_obsidian
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan ObsiTask");
}
