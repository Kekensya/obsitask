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

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join("config.json"))
        .map_err(|e| e.to_string())
}

fn load_config(app: &AppHandle) -> Result<Config, String> {
    Ok(Config::load(&config_path(app)?))
}

/// Heading notes yang pasti valid (`## Notes` kalau kosong / bukan heading).
fn notes_heading(cfg: &Config) -> String {
    let h = cfg.notes_heading.trim();
    if h.is_empty() {
        "## Notes".to_string()
    } else if h.starts_with('#') && h.trim_start_matches('#').starts_with(' ') {
        h.to_string()
    } else {
        format!("## {}", h.trim_start_matches('#').trim())
    }
}

fn day(offset: i64) -> NaiveDate {
    Local::now().date_naive() + Duration::days(offset)
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

#[tauri::command]
fn get_config(app: AppHandle) -> Result<Config, String> {
    load_config(&app)
}

#[tauri::command]
fn save_config(app: AppHandle, config: Config) -> Result<(), String> {
    let mut cfg = config;
    cfg.vault_path = cfg.vault_path.trim().to_string();
    if !cfg.is_configured() {
        return Err("Folder vault tidak ditemukan.".into());
    }
    cfg.notes_heading = notes_heading(&cfg);
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
    let path = cfg.daily_note_path(day(offset));
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let updated = tasks::toggle_task(&content, line, &text)?;
    std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    Ok(build_view(&cfg, offset))
}

#[tauri::command]
fn save_notes(app: AppHandle, offset: i64, notes: String) -> Result<DayView, String> {
    let cfg = load_config(&app)?;
    if !cfg.is_configured() {
        return Err("Vault belum diatur.".into());
    }
    let path = cfg.daily_note_path(day(offset));
    // Daily note yang belum ada dianggap kosong, dan baru dibuat kalau ada isinya.
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let updated = tasks::write_notes(&content, &notes_heading(&cfg), &notes);
    if updated != content {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    }
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
        return Err("Vault belum diatur.".into());
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
            save_notes,
            open_in_obsidian
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan ObsiTask");
}
