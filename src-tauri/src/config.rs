use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Konfigurasi yang disimpan sebagai JSON di app config dir.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Path absolut ke folder vault Obsidian.
    pub vault_path: String,
    /// Folder daily note, relatif terhadap vault. Kosong = root vault.
    pub daily_folder: String,
    /// Format nama daily note, gaya Obsidian/Moment (mis. `YYYY-MM-DD`).
    pub date_format: String,
    /// Heading yang isinya ditampilkan di bagian Notes widget.
    pub notes_heading: String,
    /// Heading tempat task baru dari widget ditambahkan.
    pub tasks_heading: String,
    /// File list permanen, relatif terhadap vault (default `Tasks.md`).
    pub tasks_file: String,
    /// List tujuan task baru di Tasks.md.
    pub default_list: String,
    /// Sembunyikan task yang sudah dicentang.
    pub hide_completed: bool,
    /// Berapa hari ke belakang daily note dipindai untuk task overdue / due.
    /// 0 = mati.
    pub scan_days: u32,
    /// Berapa hari ke depan yang tampil di tab Upcoming (mulai besok).
    pub upcoming_days: u32,
}

/// Batas atas `scan_days`, supaya polling tetap ringan.
pub const MAX_SCAN_DAYS: u32 = 365;
/// Batas atas `upcoming_days`.
pub const MAX_UPCOMING_DAYS: u32 = 90;

impl Default for Config {
    fn default() -> Self {
        Self {
            vault_path: String::new(),
            daily_folder: String::new(),
            date_format: "YYYY-MM-DD".to_string(),
            notes_heading: "## Notes".to_string(),
            tasks_heading: "## Tasks".to_string(),
            tasks_file: "Tasks.md".to_string(),
            default_list: "Inbox".to_string(),
            hide_completed: false,
            scan_days: 30,
            upcoming_days: 7,
        }
    }
}

/// Setting plugin Daily notes bawaan Obsidian (`.obsidian/daily-notes.json`).
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct DetectedDaily {
    pub folder: String,
    pub format: String,
}

impl Config {
    pub fn is_configured(&self) -> bool {
        let p = self.vault_path.trim();
        !p.is_empty() && Path::new(p).is_dir()
    }

    /// Path file daily note untuk tanggal tertentu.
    pub fn daily_note_path(&self, date: chrono::NaiveDate) -> PathBuf {
        let fmt = if self.date_format.trim().is_empty() {
            "YYYY-MM-DD"
        } else {
            self.date_format.trim()
        };
        let name = format!("{}.md", date.format(&moment_to_chrono(fmt)));
        let mut p = PathBuf::from(self.vault_path.trim());
        // Folder maupun format boleh mengandung "/" (subfolder).
        let rel = format!("{}/{}", self.daily_folder.trim(), name);
        for part in rel.split(['/', '\\']) {
            if !part.is_empty() && part != "." && part != ".." {
                p.push(part);
            }
        }
        p
    }

    /// Path absolut Tasks.md. `.md` ditambahkan kalau tidak ditulis.
    pub fn tasks_path(&self) -> PathBuf {
        let rel = self.tasks_file.trim();
        let rel = if rel.is_empty() { "Tasks.md" } else { rel };
        let mut p = PathBuf::from(self.vault_path.trim());
        for part in rel.split(['/', '\\']) {
            if !part.is_empty() && part != "." && part != ".." {
                p.push(part);
            }
        }
        if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("md")) {
            let name = format!("{}.md", p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
            p.set_file_name(name);
        }
        p
    }

    /// Path file di vault relatif terhadap vault, pakai "/" (untuk URI obsidian://).
    pub fn vault_rel(&self, full: &Path) -> String {
        let rel = full
            .strip_prefix(self.vault_path.trim())
            .unwrap_or(full)
            .to_string_lossy()
            .replace('\\', "/");
        rel.trim_start_matches('/').to_string()
    }

    /// List default yang pasti terisi (tanpa awalan `#`).
    pub fn default_list(&self) -> String {
        let name = self.default_list.trim().trim_start_matches('#').trim();
        if name.is_empty() { "Inbox".to_string() } else { name.to_string() }
    }

    /// Path daily note relatif terhadap vault, pakai "/" (untuk URI obsidian://).
    pub fn daily_note_rel(&self, date: chrono::NaiveDate) -> String {
        let full = self.daily_note_path(date);
        let rel = full
            .strip_prefix(self.vault_path.trim())
            .unwrap_or(&full)
            .to_string_lossy()
            .replace('\\', "/");
        rel.trim_start_matches('/').to_string()
    }

    /// Nama vault = nama foldernya.
    pub fn vault_name(&self) -> String {
        Path::new(self.vault_path.trim())
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default()
    }

    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| e.to_string())
    }
}

/// Baca setting Daily notes dari vault, kalau ada.
pub fn detect_daily(vault_path: &str) -> Option<DetectedDaily> {
    let p = Path::new(vault_path.trim())
        .join(".obsidian")
        .join("daily-notes.json");
    let s = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&s).ok()
}

/// Ubah format tanggal gaya Moment (yang dipakai Obsidian) ke format chrono.
/// Token yang didukung: YYYY YY MMMM MMM MM M DD D dddd ddd, dan `[teks literal]`.
pub fn moment_to_chrono(fmt: &str) -> String {
    const TOKENS: [(&str, &str); 10] = [
        ("YYYY", "%Y"),
        ("YY", "%y"),
        ("MMMM", "%B"),
        ("MMM", "%b"),
        ("MM", "%m"),
        ("M", "%-m"),
        ("DD", "%d"),
        ("D", "%-d"),
        ("dddd", "%A"),
        ("ddd", "%a"),
    ];
    let mut out = String::new();
    let mut rest = fmt;
    'outer: while let Some(c) = rest.chars().next() {
        if c == '[' {
            if let Some(end) = rest.find(']') {
                out.push_str(&rest[1..end].replace('%', "%%"));
                rest = &rest[end + 1..];
                continue;
            }
        }
        for (tok, rep) in TOKENS {
            if rest.starts_with(tok) {
                out.push_str(rep);
                rest = &rest[tok.len()..];
                continue 'outer;
            }
        }
        if c == '%' {
            out.push_str("%%");
        } else {
            out.push(c);
        }
        rest = &rest[c.len_utf8()..];
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    #[test]
    fn converts_moment_formats() {
        assert_eq!(moment_to_chrono("YYYY-MM-DD"), "%Y-%m-%d");
        assert_eq!(moment_to_chrono("YYYY/MM/YYYY-MM-DD"), "%Y/%m/%Y-%m-%d");
        assert_eq!(moment_to_chrono("dddd, D MMMM YYYY"), "%A, %-d %B %Y");
        assert_eq!(moment_to_chrono("[Daily] YYYY-MM-DD"), "Daily %Y-%m-%d");
    }

    #[test]
    fn builds_daily_note_path() {
        let cfg = Config {
            vault_path: "/vault".into(),
            daily_folder: "Journal/Daily".into(),
            date_format: "YYYY/YYYY-MM-DD".into(),
            ..Default::default()
        };
        let d = NaiveDate::from_ymd_opt(2026, 11, 17).unwrap();
        assert_eq!(
            cfg.daily_note_path(d),
            PathBuf::from("/vault/Journal/Daily/2026/2026-11-17.md")
        );
        assert_eq!(cfg.daily_note_rel(d), "Journal/Daily/2026/2026-11-17.md");
    }

    #[test]
    fn builds_tasks_file_path() {
        let mut cfg = Config { vault_path: "/vault".into(), ..Default::default() };
        assert_eq!(cfg.tasks_path(), PathBuf::from("/vault/Tasks.md"));
        assert_eq!(cfg.vault_rel(&cfg.tasks_path()), "Tasks.md");
        cfg.tasks_file = "Lists/Todo".into();
        assert_eq!(cfg.tasks_path(), PathBuf::from("/vault/Lists/Todo.md"));
        cfg.tasks_file = "../luar/x.MD".into();
        assert_eq!(cfg.tasks_path(), PathBuf::from("/vault/luar/x.MD"));
        cfg.tasks_file = "  ".into();
        assert_eq!(cfg.tasks_path(), PathBuf::from("/vault/Tasks.md"));
        cfg.default_list = " ## Kuliah ".into();
        assert_eq!(cfg.default_list(), "Kuliah");
        cfg.default_list = "".into();
        assert_eq!(cfg.default_list(), "Inbox");
    }
}
