mod config;
mod tasks;

use std::path::PathBuf;

use chrono::{Duration, Local, NaiveDate};
use serde::Serialize;
use tauri::{AppHandle, Manager};
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
}

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

fn build_view(cfg: &Config, offset: i64) -> DayView {
    let date = day(offset);
    let mut view = DayView {
        configured: cfg.is_configured(),
        date: date.format("%Y-%m-%d").to_string(),
        file: String::new(),
        exists: false,
        tasks: Vec::new(),
        notes: String::new(),
        hide_completed: cfg.hide_completed,
    };
    if !view.configured {
        return view;
    }
    view.file = cfg.daily_note_rel(date);
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
fn get_day(app: AppHandle, offset: i64) -> Result<DayView, String> {
    Ok(build_view(&load_config(&app)?, offset))
}

#[tauri::command]
fn toggle_task(app: AppHandle, offset: i64, line: usize, text: String) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    edit_note(&cfg, offset, false, |content| {
        Ok((tasks::toggle_task(content, line, &text, today())?, ()))
    })?;
    Ok(build_view(&cfg, offset))
}

/// Tambah task baru di bawah heading task. `text` boleh berisi token quick-add
/// (`!high`, `@tomorrow`, ...); `priority` / `due` dari tombol menang atas token.
#[tauri::command]
fn add_task(
    app: AppHandle,
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
    Ok(build_view(&cfg, offset))
}

/// Ubah judul / prioritas / deadline. Argumen yang tidak dikirim tidak diubah;
/// `due` kosong menghapus deadline.
#[tauri::command]
fn update_task(
    app: AppHandle,
    offset: i64,
    line: usize,
    text: String,
    title: Option<String>,
    priority: Option<String>,
    due: Option<String>,
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
    Ok(build_view(&cfg, offset))
}

#[tauri::command]
fn delete_task(app: AppHandle, offset: i64, line: usize, text: String) -> Result<Deleted, String> {
    let cfg = load_config(&app)?;
    let removed = edit_note(&cfg, offset, false, |content| {
        tasks::delete_task(content, line, &text)
    })?;
    Ok(Deleted {
        view: build_view(&cfg, offset),
        removed,
    })
}

/// Undo `delete_task`: kembalikan blok yang dihapus ke tempatnya.
#[tauri::command]
fn restore_task(
    app: AppHandle,
    offset: i64,
    line: usize,
    text: String,
    anchor: Option<String>,
) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    let removed = tasks::Removed { line, text, anchor };
    edit_note(&cfg, offset, true, |content| {
        Ok((tasks::restore_task(content, &removed, &tasks_heading(&cfg)), ()))
    })?;
    Ok(build_view(&cfg, offset))
}

#[tauri::command]
fn save_notes(app: AppHandle, offset: i64, notes: String) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    // Daily note yang belum ada dianggap kosong, dan baru dibuat kalau ada isinya.
    edit_note(&cfg, offset, true, |content| {
        Ok((tasks::write_notes(content, &notes_heading(&cfg), &notes), ()))
    })?;
    Ok(build_view(&cfg, offset))
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
