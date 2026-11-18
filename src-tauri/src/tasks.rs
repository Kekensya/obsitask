//! Logika murni: parse checkbox (plus metadata gaya plugin Obsidian Tasks) dan
//! bagian Notes dari isi file markdown, lalu tulis balik perubahan tanpa
//! menyentuh baris lain. Tidak ada I/O di sini; `lib.rs` yang baca/tulis file.

use chrono::{Duration, NaiveDate};
use serde::{Deserialize, Serialize};

const E_HIGH: &str = "⏫";
const E_MEDIUM: &str = "🔼";
const E_LOW: &str = "🔽";
const E_DUE: &str = "📅";
const E_DONE: &str = "✅";
/// Field plugin Tasks lain yang bernilai tanggal. Tidak dikelola widget, tapi
/// dikenali supaya tidak ikut jadi judul dan tetap utuh saat baris ditulis ulang.
const E_OTHER_DATES: [&str; 6] = ["➕", "🛫", "⏳", "❌", "📆", "🗓"];
/// Prioritas plugin Tasks di luar tiga tingkat yang dikelola widget.
const E_OTHER_FLAGS: [&str; 2] = ["🔺", "⏬"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    #[default]
    None,
    Low,
    Medium,
    High,
}

impl Priority {
    fn emoji(self) -> Option<&'static str> {
        match self {
            Priority::High => Some(E_HIGH),
            Priority::Medium => Some(E_MEDIUM),
            Priority::Low => Some(E_LOW),
            Priority::None => None,
        }
    }

    fn from_emoji(s: &str) -> Option<Self> {
        match s {
            E_HIGH => Some(Priority::High),
            E_MEDIUM => Some(Priority::Medium),
            E_LOW => Some(Priority::Low),
            _ => None,
        }
    }

    /// Dari nama ("high", "med", "medium", "low", "none"), tidak peka huruf besar.
    pub fn from_name(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "high" => Some(Priority::High),
            "med" | "medium" => Some(Priority::Medium),
            "low" => Some(Priority::Low),
            "none" => Some(Priority::None),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Task {
    /// Indeks baris (mulai 0) di file.
    pub line: usize,
    /// Teks mentah setelah checkbox, termasuk metadata. Dipakai sebagai
    /// `expected_text` saat menulis balik.
    pub text: String,
    pub done: bool,
    pub cancelled: bool,
    /// Level indentasi (0 = paling kiri).
    pub level: usize,
    /// Teks tanpa metadata di akhir baris (jam di depan tetap ikut).
    pub title: String,
    pub priority: Priority,
    /// Deadline `YYYY-MM-DD` (📅).
    pub due: Option<String>,
    /// Tanggal selesai `YYYY-MM-DD` (✅).
    pub done_date: Option<String>,
}

/* ---------- Baris checkbox ---------- */

struct ParsedLine {
    indent: usize,
    /// Posisi byte karakter di dalam kurung `[ ]`.
    mark_idx: usize,
    mark: char,
    /// Posisi byte awal teks task (= panjang baris kalau teksnya kosong).
    text_idx: usize,
    text: String,
}

fn indent_width(line: &str) -> usize {
    line.chars()
        .take_while(|c| c.is_whitespace())
        .map(|c| if c == '\t' { 4 } else { 1 })
        .sum()
}

fn parse_line(line: &str) -> Option<ParsedLine> {
    let trimmed = line.trim_start();
    let indent = indent_width(line);

    // Bullet: "-", "*", "+", atau list bernomor "1." / "1)".
    let after_bullet = if let Some(r) = trimmed
        .strip_prefix('-')
        .or_else(|| trimmed.strip_prefix('*'))
        .or_else(|| trimmed.strip_prefix('+'))
    {
        r
    } else {
        let digits = trimmed.chars().take_while(|c| c.is_ascii_digit()).count();
        if digits == 0 {
            return None;
        }
        let r = &trimmed[digits..];
        r.strip_prefix('.').or_else(|| r.strip_prefix(')'))?
    };

    let body = after_bullet.trim_start();
    if body.len() == after_bullet.len() {
        return None; // wajib ada spasi setelah bullet
    }
    let inner = body.strip_prefix('[')?;
    let mark = inner.chars().next()?;
    let after_mark = inner[mark.len_utf8()..].strip_prefix(']')?;
    if !(after_mark.is_empty() || after_mark.starts_with(char::is_whitespace)) {
        return None; // mis. "[x](link)" bukan checkbox
    }
    let mark_idx = line.len() - inner.len();
    Some(ParsedLine {
        indent,
        mark_idx,
        mark,
        text_idx: line.len() - after_mark.trim_start().len(),
        text: after_mark.trim().to_string(),
    })
}

fn split_lines(content: &str) -> (Vec<String>, &'static str) {
    let eol = if content.contains("\r\n") { "\r\n" } else { "\n" };
    let lines = content
        .split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l).to_string())
        .collect();
    (lines, eol)
}

/// `true` untuk baris pagar code block (``` / ~~~) dan semua baris di dalamnya.
fn code_mask(lines: &[String]) -> Vec<bool> {
    let mut in_code = false;
    lines
        .iter()
        .map(|line| {
            let t = line.trim_start();
            if t.starts_with("```") || t.starts_with("~~~") {
                in_code = !in_code;
                true
            } else {
                in_code
            }
        })
        .collect()
}

/// Ganti teks task di sebuah baris; indentasi, bullet, dan checkbox tetap.
fn with_text(line: &str, p: &ParsedLine, text: &str) -> String {
    let close = p.mark_idx + p.mark.len_utf8() + 1; // tepat setelah "]"
    let gap = if p.text.is_empty() { " " } else { &line[close..p.text_idx] };
    if text.is_empty() {
        line[..close].to_string()
    } else {
        format!("{}{}{}", &line[..close], gap, text)
    }
}

/// Pastikan baris `line` masih task yang sama dengan yang dilihat widget.
fn locate(lines: &[String], line: usize, expected_text: &str) -> Result<ParsedLine, String> {
    let target = lines
        .get(line)
        .ok_or("Line not found — the note has changed.")?;
    if code_mask(lines)[line] {
        return Err("That line is no longer a task — the note has changed.".into());
    }
    let parsed =
        parse_line(target).ok_or("That line is no longer a task — the note has changed.")?;
    if parsed.text != expected_text {
        return Err("That task has changed in the note.".into());
    }
    Ok(parsed)
}

/* ---------- Metadata di akhir baris ---------- */

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Priority(Priority),
    Due(String),
    Done(String),
    /// Field lain plugin Tasks, disimpan apa adanya.
    Other(String),
}

/// Teks task yang sudah dipisah: judul, deretan metadata di akhir (urutan asli
/// dipertahankan), dan block id (`^abc`) kalau ada.
#[derive(Debug, Clone, PartialEq)]
struct Meta {
    title: String,
    toks: Vec<Tok>,
    block: Option<String>,
}

/// Emoji kadang diikuti variation selector (U+FE0F); buang supaya bisa dibandingkan.
fn bare(word: &str) -> String {
    word.chars().filter(|&c| c != '\u{FE0F}').collect()
}

fn is_iso_date(s: &str) -> bool {
    s.len() == 10 && NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

/// Pisahkan kata terakhir: ("sisa di depan", "kata").
fn split_last_word(s: &str) -> Option<(&str, &str)> {
    let s = s.trim_end();
    if s.is_empty() {
        return None;
    }
    match s.char_indices().rev().find(|(_, c)| c.is_whitespace()) {
        Some((i, c)) => Some((s[..i].trim_end(), &s[i + c.len_utf8()..])),
        None => Some(("", s)),
    }
}

fn is_block_id(word: &str) -> bool {
    word.strip_prefix('^')
        .is_some_and(|id| !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
}

fn date_tok(emoji: &str, date: &str) -> Option<Tok> {
    if !is_iso_date(date) {
        return None;
    }
    if emoji == E_DUE {
        Some(Tok::Due(date.to_string()))
    } else if emoji == E_DONE {
        Some(Tok::Done(date.to_string()))
    } else if E_OTHER_DATES.contains(&emoji) {
        Some(Tok::Other(format!("{emoji} {date}")))
    } else {
        None
    }
}

impl Meta {
    /// Baca metadata dari belakang, seperti plugin Tasks: berhenti di kata
    /// pertama yang bukan metadata. Sisanya adalah judul.
    fn parse(text: &str) -> Meta {
        let mut rest = text.trim();
        let mut block = None;
        if let Some((head, word)) = split_last_word(rest) {
            if is_block_id(word) && !head.is_empty() {
                block = Some(word.to_string());
                rest = head;
            }
        }

        let mut toks = Vec::new();
        while let Some((head, word)) = split_last_word(rest) {
            let w = bare(word);
            if let Some(p) = Priority::from_emoji(&w) {
                toks.push(Tok::Priority(p));
                rest = head;
                continue;
            }
            if E_OTHER_FLAGS.contains(&w.as_str()) {
                toks.push(Tok::Other(w));
                rest = head;
                continue;
            }
            // "📅2026-11-18" (menempel) ...
            if let Some(split) = w.len().checked_sub(10).filter(|&i| i > 0 && w.is_char_boundary(i)) {
                if let Some(tok) = date_tok(&w[..split], &w[split..]) {
                    toks.push(tok);
                    rest = head;
                    continue;
                }
            }
            // ... atau "📅 2026-11-18" (dua kata).
            if let Some((head2, emoji)) = split_last_word(head) {
                if let Some(tok) = date_tok(&bare(emoji), &w) {
                    toks.push(tok);
                    rest = head2;
                    continue;
                }
            }
            break;
        }
        toks.reverse();
        Meta {
            title: rest.trim().to_string(),
            toks,
            block,
        }
    }

    fn render(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        if !self.title.is_empty() {
            parts.push(self.title.clone());
        }
        for tok in &self.toks {
            parts.push(match tok {
                Tok::Priority(p) => p.emoji().unwrap_or_default().to_string(),
                Tok::Due(d) => format!("{E_DUE} {d}"),
                Tok::Done(d) => format!("{E_DONE} {d}"),
                Tok::Other(raw) => raw.clone(),
            });
        }
        if let Some(b) = &self.block {
            parts.push(b.clone());
        }
        parts.join(" ")
    }

    fn priority(&self) -> Priority {
        self.toks
            .iter()
            .rev()
            .find_map(|t| match t {
                Tok::Priority(p) => Some(*p),
                _ => None,
            })
            .unwrap_or_default()
    }

    fn due(&self) -> Option<String> {
        self.toks.iter().rev().find_map(|t| match t {
            Tok::Due(d) => Some(d.clone()),
            _ => None,
        })
    }

    fn done_date(&self) -> Option<String> {
        self.toks.iter().rev().find_map(|t| match t {
            Tok::Done(d) => Some(d.clone()),
            _ => None,
        })
    }

    /// Ganti semua token sejenis dengan `new` di posisi token lama; kalau belum
    /// ada, sisipkan di `default_at`.
    fn replace(&mut self, same: fn(&Tok) -> bool, new: Option<Tok>, default_at: usize) {
        let at = self.toks.iter().position(same);
        self.toks.retain(|t| !same(t));
        if let Some(tok) = new {
            let at = at.unwrap_or(default_at).min(self.toks.len());
            self.toks.insert(at, tok);
        }
    }

    fn set_priority(&mut self, p: Priority) {
        let new = (p != Priority::None).then_some(Tok::Priority(p));
        self.replace(|t| matches!(t, Tok::Priority(_)), new, 0);
    }

    fn set_due(&mut self, due: Option<&str>) {
        let before_done = self
            .toks
            .iter()
            .position(|t| matches!(t, Tok::Done(_)))
            .unwrap_or(self.toks.len());
        let new = due.map(|d| Tok::Due(d.to_string()));
        self.replace(|t| matches!(t, Tok::Due(_)), new, before_done);
    }

    fn set_done(&mut self, date: Option<&str>) {
        let new = date.map(|d| Tok::Done(d.to_string()));
        self.replace(|t| matches!(t, Tok::Done(_)), new, usize::MAX);
    }

    /// Terapkan metadata yang ikut terketik di dalam `other` (mis. judul hasil
    /// edit yang berisi emoji) ke sini.
    fn absorb(&mut self, other: Meta) {
        for tok in other.toks {
            match tok {
                Tok::Priority(p) => self.set_priority(p),
                Tok::Due(d) => self.set_due(Some(&d)),
                Tok::Done(d) => self.set_done(Some(&d)),
                Tok::Other(_) => self.toks.push(tok),
            }
        }
        if other.block.is_some() {
            self.block = other.block;
        }
    }
}

/* ---------- Membaca ---------- */

/// Ambil semua checkbox dari isi file (yang di dalam code block diabaikan).
pub fn parse_tasks(content: &str) -> Vec<Task> {
    let (lines, _) = split_lines(content);
    let mask = code_mask(&lines);
    let raw = lines
        .iter()
        .enumerate()
        .filter(|(i, _)| !mask[*i])
        .filter_map(|(i, line)| parse_line(line).map(|p| (i, p)));

    // Ubah lebar indentasi jadi level bertingkat.
    let mut stack: Vec<usize> = Vec::new();
    raw.map(|(line, p)| {
        while stack.last().is_some_and(|&top| top >= p.indent) {
            stack.pop();
        }
        let level = stack.len();
        stack.push(p.indent);
        let meta = Meta::parse(&p.text);
        Task {
            line,
            done: matches!(p.mark, 'x' | 'X'),
            cancelled: p.mark == '-',
            level,
            priority: meta.priority(),
            due: meta.due(),
            done_date: meta.done_date(),
            title: meta.title,
            text: p.text,
        }
    })
    .collect()
}

/// Task yang belum selesai (bukan `[x]`, bukan `[-]`) dengan deadline paling
/// lambat `through` (`YYYY-MM-DD`). Urutan file dipertahankan.
pub fn due_by(tasks: &[Task], through: &str) -> Vec<Task> {
    tasks
        .iter()
        .filter(|t| !t.done && !t.cancelled)
        .filter(|t| t.due.as_deref().is_some_and(|d| d <= through))
        .cloned()
        .collect()
}

/* ---------- Quick-add ---------- */

/// Hasil membaca input quick-add: judul bersih + token yang ditemukan.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Quick {
    pub title: String,
    pub priority: Option<Priority>,
    pub due: Option<String>,
}

/// Baca token `!high` / `!med` / `!low` (juga `!medium`, `!none`) dan
/// `@today` / `@tomorrow` / `@YYYY-MM-DD` dari input. Token dibuang dari judul.
/// Kata lain yang diawali `!` atau `@` dibiarkan sebagai bagian judul.
pub fn parse_quick(input: &str, today: NaiveDate) -> Quick {
    let input = input.replace(['\r', '\n'], " ");
    let mut quick = Quick::default();
    let mut kept: Vec<&str> = Vec::new();
    let mut found = false;
    for word in input.split_whitespace() {
        let lower = word.to_ascii_lowercase();
        if let Some(p) = lower.strip_prefix('!').and_then(Priority::from_name) {
            quick.priority = Some(p);
            found = true;
        } else if let Some(d) = lower.strip_prefix('@').and_then(|d| match d {
            "today" => Some(today),
            "tomorrow" => Some(today + Duration::days(1)),
            _ if d.len() == 10 => NaiveDate::parse_from_str(d, "%Y-%m-%d").ok(),
            _ => None,
        }) {
            quick.due = Some(d.format("%Y-%m-%d").to_string());
            found = true;
        } else {
            kept.push(word);
        }
    }
    // Tanpa token, spasi di dalam judul dibiarkan apa adanya.
    quick.title = if found { kept.join(" ") } else { input.trim().to_string() };
    quick
}

/// Perubahan untuk satu task. `None` = tidak diubah.
#[derive(Debug, Clone, Default)]
pub struct Edit {
    /// Judul baru; boleh berisi token quick-add.
    pub title: Option<String>,
    pub priority: Option<Priority>,
    /// `Some("")` menghapus deadline.
    pub due: Option<String>,
}

fn apply_edit(meta: &mut Meta, edit: &Edit, today: NaiveDate) -> Result<(), String> {
    if let Some(title) = &edit.title {
        let quick = parse_quick(title, today);
        let typed = Meta::parse(&quick.title);
        meta.title = typed.title.clone();
        meta.absorb(typed);
        if let Some(p) = quick.priority {
            meta.set_priority(p);
        }
        if let Some(d) = &quick.due {
            meta.set_due(Some(d));
        }
    }
    if let Some(p) = edit.priority {
        meta.set_priority(p);
    }
    if let Some(due) = &edit.due {
        let due = due.trim();
        if due.is_empty() {
            meta.set_due(None);
        } else if is_iso_date(due) {
            meta.set_due(Some(due));
        } else {
            return Err("Due date must look like YYYY-MM-DD.".into());
        }
    }
    if meta.title.is_empty() {
        return Err("A task needs a title.".into());
    }
    Ok(())
}

/// Susun teks task baru dari input quick-add. `edit.priority` / `edit.due`
/// (pilihan dari tombol) menang atas token yang diketik.
pub fn compose_task(edit: &Edit, today: NaiveDate) -> Result<String, String> {
    let mut meta = Meta {
        title: String::new(),
        toks: Vec::new(),
        block: None,
    };
    let edit = Edit {
        title: Some(edit.title.clone().unwrap_or_default()),
        ..edit.clone()
    };
    apply_edit(&mut meta, &edit, today)?;
    Ok(meta.render())
}

/* ---------- Menulis ---------- */

/// Balik status checkbox di baris `line`. `expected_text` memastikan baris itu
/// masih task yang sama (file bisa saja berubah sejak terakhir dibaca).
/// Saat dicentang `✅ today` ditambahkan; saat centang dibatalkan, dihapus.
pub fn toggle_task(
    content: &str,
    line: usize,
    expected_text: &str,
    today: NaiveDate,
) -> Result<String, String> {
    let (mut lines, eol) = split_lines(content);
    let parsed = locate(&lines, line, expected_text)?;
    let checking = parsed.mark == ' ';

    let old = Meta::parse(&parsed.text);
    let mut meta = old.clone();
    if !checking {
        meta.set_done(None);
    } else if meta.done_date().is_none() {
        meta.set_done(Some(&today.format("%Y-%m-%d").to_string()));
    }

    let target = &mut lines[line];
    // Teks hanya ditulis ulang kalau metadatanya memang berubah.
    if meta != old {
        *target = with_text(target, &parsed, &meta.render());
    }
    target.replace_range(
        parsed.mark_idx..parsed.mark_idx + parsed.mark.len_utf8(),
        if checking { "x" } else { " " },
    );
    Ok(lines.join(eol))
}

/// Ubah judul / prioritas / deadline task di baris `line`.
pub fn update_task(
    content: &str,
    line: usize,
    expected_text: &str,
    edit: &Edit,
    today: NaiveDate,
) -> Result<String, String> {
    let (mut lines, eol) = split_lines(content);
    let parsed = locate(&lines, line, expected_text)?;
    let old = Meta::parse(&parsed.text);
    let mut meta = old.clone();
    apply_edit(&mut meta, edit, today)?;
    if meta != old {
        lines[line] = with_text(&lines[line], &parsed, &meta.render());
    }
    Ok(lines.join(eol))
}

/// Task yang dihapus, cukup untuk mengembalikannya (undo).
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Removed {
    /// Baris tempat blok itu tadinya berada.
    pub line: usize,
    /// Baris yang dihapus (task + subtask/lanjutannya), dipisah "\n".
    pub text: String,
    /// Isi baris tepat di atasnya, untuk memastikan posisinya masih sama.
    pub anchor: Option<String>,
}

/// Hapus task di baris `line` beserta baris yang menjorok di bawahnya
/// (subtask dan teks lanjutan).
pub fn delete_task(
    content: &str,
    line: usize,
    expected_text: &str,
) -> Result<(String, Removed), String> {
    let (mut lines, eol) = split_lines(content);
    let parsed = locate(&lines, line, expected_text)?;
    let end = block_end(&lines, line, parsed.indent, lines.len());
    let removed = Removed {
        line,
        text: lines[line..end].join("\n"),
        anchor: line.checked_sub(1).map(|i| lines[i].clone()),
    };
    lines.drain(line..end);
    Ok((lines.join(eol), removed))
}

/// Kembalikan blok yang dihapus `delete_task`. Kalau posisi lamanya sudah
/// bergeser (file diedit sementara itu), blok ditaruh di akhir daftar di bawah
/// `heading` supaya tidak ada yang hilang.
pub fn restore_task(content: &str, removed: &Removed, heading: &str) -> String {
    let (mut lines, eol) = split_lines(content);
    let block: Vec<String> = removed
        .text
        .replace("\r\n", "\n")
        .split('\n')
        .map(str::to_string)
        .collect();
    let at = removed.line;
    let same_place = at <= lines.len()
        && match (&removed.anchor, at.checked_sub(1)) {
            (Some(anchor), Some(prev)) => lines.get(prev) == Some(anchor),
            (None, None) => true,
            _ => false,
        };
    if same_place {
        lines.splice(at..at, block);
    } else {
        insert_under_heading(&mut lines, heading, block);
    }
    lines.join(eol)
}

/// Tambah `- [ ] text` di akhir daftar task di bawah `heading`. Heading
/// ditambahkan di akhir file kalau belum ada.
pub fn add_task(content: &str, heading: &str, text: &str) -> String {
    let (mut lines, eol) = split_lines(content);
    let text = text.replace(['\r', '\n'], " ");
    insert_under_heading(&mut lines, heading, vec![format!("- [ ] {}", text.trim())]);
    lines.join(eol)
}

/// Akhir (eksklusif) blok milik baris `start`: baris-baris berikutnya yang
/// tidak kosong dan menjorok lebih dalam dari `indent`.
fn block_end(lines: &[String], start: usize, indent: usize, limit: usize) -> usize {
    let mut end = start + 1;
    while end < limit && !lines[end].trim().is_empty() && indent_width(&lines[end]) > indent {
        end += 1;
    }
    end
}

fn insert_under_heading(lines: &mut Vec<String>, heading: &str, block: Vec<String>) {
    let mask = code_mask(lines);
    match section_range(lines, &mask, heading) {
        Some((start, end)) => {
            let tasks: Vec<(usize, usize)> = (start + 1..end)
                .filter(|&i| !mask[i])
                .filter_map(|i| parse_line(&lines[i]).map(|p| (i, p.indent)))
                .collect();
            // Indentasi dasar daftar: baris yang menjorok lebih dalam dari ini
            // masih milik task di atasnya (subtask, teks lanjutan).
            let base = tasks.iter().map(|&(_, indent)| indent).min();
            let at = match tasks.last().zip(base) {
                // Setelah task terakhir beserta subtask/lanjutannya.
                Some((&(i, _), base)) => block_end(lines, i, base, end),
                // Belum ada task: setelah isi terakhir bagian itu.
                None => (start + 1..end)
                    .rev()
                    .find(|&i| !lines[i].trim().is_empty())
                    .map_or(start + 1, |i| i + 1),
            };
            lines.splice(at..at, block);
        }
        None => {
            while lines.last().is_some_and(|l| l.trim().is_empty()) {
                lines.pop();
            }
            if !lines.is_empty() {
                lines.push(String::new());
            }
            lines.push(heading.trim().to_string());
            lines.extend(block);
            lines.push(String::new());
        }
    }
}

/* ---------- Heading & Notes ---------- */

fn heading_level(line: &str) -> Option<usize> {
    let t = line.trim_start();
    let n = t.chars().take_while(|&c| c == '#').count();
    if (1..=6).contains(&n) && t[n..].starts_with(' ') {
        Some(n)
    } else {
        None
    }
}

/// Cari rentang sebuah bagian: (baris heading, akhir eksklusif). Heading di
/// dalam code block tidak dihitung.
fn section_range(lines: &[String], mask: &[bool], heading: &str) -> Option<(usize, usize)> {
    let want = heading.trim();
    let level = heading_level(want)?;
    let start = (0..lines.len()).find(|&i| !mask[i] && lines[i].trim().eq_ignore_ascii_case(want))?;
    let end = (start + 1..lines.len())
        .find(|&i| !mask[i] && heading_level(&lines[i]).is_some_and(|n| n <= level))
        .unwrap_or(lines.len());
    Some((start, end))
}

/// Isi di bawah heading notes (kosong kalau heading tidak ada).
pub fn read_notes(content: &str, heading: &str) -> String {
    let (lines, _) = split_lines(content);
    match section_range(&lines, &code_mask(&lines), heading) {
        Some((start, end)) => lines[start + 1..end].join("\n").trim().to_string(),
        None => String::new(),
    }
}

/// Ganti isi di bawah heading notes. Heading ditambahkan di akhir file kalau
/// belum ada. Baris di luar bagian itu tidak disentuh.
pub fn write_notes(content: &str, heading: &str, notes: &str) -> String {
    let (mut lines, eol) = split_lines(content);
    let notes = notes.replace("\r\n", "\n");
    let body: Vec<String> = notes.trim().split('\n').map(str::to_string).collect();
    let has_body = !notes.trim().is_empty();

    match section_range(&lines, &code_mask(&lines), heading) {
        Some((start, end)) => {
            let mut section: Vec<String> = Vec::new();
            if has_body {
                section.push(String::new());
                section.extend(body);
            }
            // Jaga satu baris kosong sebelum heading berikutnya / akhir file.
            section.push(String::new());
            lines.splice(start + 1..end, section);
        }
        None => {
            if !has_body {
                return content.to_string();
            }
            while lines.last().is_some_and(|l| l.trim().is_empty()) {
                lines.pop();
            }
            if !lines.is_empty() {
                lines.push(String::new());
            }
            lines.push(heading.trim().to_string());
            lines.push(String::new());
            lines.extend(body);
            lines.push(String::new());
        }
    }
    lines.join(eol)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOTE: &str = "# 2026-11-17\n\n## Tasks\n- [ ] Kerjain laporan IoT\n    - [x] Wiring sensor\n- [X] Beli kabel\n* [ ] 15:00 Rapat lab #icn\n- [-] Batal\n1. [ ] Bernomor\n- bukan task\n- [link](x) bukan\n\n```\n- [ ] di dalam kode\n```\n\n## Notes\nbaris satu\nbaris dua\n\n## Lain\nisi lain\n";

    fn day(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }
    fn today() -> NaiveDate {
        day("2026-11-17")
    }
    fn title(s: &str) -> Edit {
        Edit { title: Some(s.into()), ..Default::default() }
    }
    fn prio(p: Priority) -> Edit {
        Edit { priority: Some(p), ..Default::default() }
    }
    fn due(d: &str) -> Edit {
        Edit { due: Some(d.into()), ..Default::default() }
    }
    /// Satu task dari satu baris.
    fn one(line: &str) -> Task {
        let mut t = parse_tasks(line);
        assert_eq!(t.len(), 1, "{line:?}");
        t.remove(0)
    }

    /* ----- membaca ----- */

    #[test]
    fn parses_tasks() {
        let t = parse_tasks(NOTE);
        let texts: Vec<&str> = t.iter().map(|x| x.text.as_str()).collect();
        assert_eq!(
            texts,
            [
                "Kerjain laporan IoT",
                "Wiring sensor",
                "Beli kabel",
                "15:00 Rapat lab #icn",
                "Batal",
                "Bernomor"
            ]
        );
        assert_eq!(t[0].line, 3);
        assert!(!t[0].done);
        assert_eq!((t[1].level, t[1].done), (1, true));
        assert!(t[2].done);
        assert!(t[4].cancelled);
        assert_eq!(t[5].level, 0);
    }

    #[test]
    fn lines_without_metadata_read_as_before() {
        for t in parse_tasks(NOTE) {
            assert_eq!(t.title, t.text);
            assert_eq!(t.priority, Priority::None);
            assert_eq!(t.due, None);
            assert_eq!(t.done_date, None);
        }
        // Emoji / tanggal yang bukan metadata tetap bagian judul.
        let t = one("- [ ] Rilis 2026-11-18 🎉");
        assert_eq!(t.title, "Rilis 2026-11-18 🎉");
        let t = one("- [ ] Beli 📅 kalender");
        assert_eq!((t.title.as_str(), &t.due), ("Beli 📅 kalender", &None));
        let t = one("- [ ] Cek 📅 2026-13-45");
        assert_eq!((t.title.as_str(), &t.due), ("Cek 📅 2026-13-45", &None));
        // Checkbox kosong.
        let t = one("- [ ]");
        assert_eq!((t.text.as_str(), t.title.as_str()), ("", ""));
    }

    #[test]
    fn parses_metadata() {
        let t = one("- [ ] Laporan IoT ⏫ 📅 2026-11-18");
        assert_eq!(t.title, "Laporan IoT");
        assert_eq!(t.text, "Laporan IoT ⏫ 📅 2026-11-18");
        assert_eq!(t.priority, Priority::High);
        assert_eq!(t.due.as_deref(), Some("2026-11-18"));
        assert_eq!(t.done_date, None);

        assert_eq!(one("- [ ] a 🔼").priority, Priority::Medium);
        assert_eq!(one("- [ ] a 🔽").priority, Priority::Low);

        let t = one("- [x] 15:00 Rapat #icn 🔽 ✅ 2026-11-17");
        assert_eq!(t.title, "15:00 Rapat #icn");
        assert_eq!(t.priority, Priority::Low);
        assert_eq!(t.done_date.as_deref(), Some("2026-11-17"));
        assert!(t.done);
    }

    #[test]
    fn parses_metadata_in_any_order() {
        let expect = |line: &str| {
            let t = one(line);
            assert_eq!(t.title, "Judul", "{line:?}");
            assert_eq!(t.priority, Priority::High, "{line:?}");
            assert_eq!(t.due.as_deref(), Some("2026-11-18"), "{line:?}");
            assert_eq!(t.done_date.as_deref(), Some("2026-11-17"), "{line:?}");
        };
        expect("- [x] Judul ⏫ 📅 2026-11-18 ✅ 2026-11-17");
        expect("- [x] Judul ✅ 2026-11-17 📅 2026-11-18 ⏫");
        expect("- [x] Judul 📅 2026-11-18 ⏫ ✅ 2026-11-17");
        // Field Tasks lain di sela-sela, emoji menempel, variation selector, block id.
        expect("- [x] Judul ➕ 2026-11-01 📅 2026-11-18 🛫 2026-11-02 ⏫ ✅ 2026-11-17");
        expect("- [x] Judul ⏫ 📅2026-11-18 ✅2026-11-17");
        expect("- [x] Judul ⏫\u{FE0F}   📅\u{FE0F}  2026-11-18 ✅ 2026-11-17  ");
        expect("- [x] Judul ⏫ 📅 2026-11-18 ✅ 2026-11-17 ^abc-1");
    }

    #[test]
    fn ignores_tasks_in_code_blocks() {
        let note = "- [ ] luar\n```md\n- [ ] dalam ⏫\n```\n~~~\n- [ ] dalam juga\n~~~\n- [ ] luar lagi\n";
        let t = parse_tasks(note);
        let titles: Vec<&str> = t.iter().map(|x| x.title.as_str()).collect();
        assert_eq!(titles, ["luar", "luar lagi"]);
        assert_eq!(t[1].line, 7);
        // Tidak bisa ditulis juga, walau nomor baris dan teksnya cocok.
        assert!(toggle_task(note, 2, "dalam ⏫", today()).is_err());
        assert!(update_task(note, 2, "dalam ⏫", &prio(Priority::Low), today()).is_err());
        assert!(delete_task(note, 5, "dalam juga").is_err());
    }

    #[test]
    fn picks_open_tasks_due_by_a_date() {
        let note = "## Tasks\n- [ ] lewat 📅 2026-11-10\n- [ ] hari ini ⏫ 📅 2026-11-17\n- [ ] besok 📅 2026-11-18\n- [ ] tanpa deadline\n- [x] selesai 📅 2026-11-01 ✅ 2026-11-02\n- [-] batal 📅 2026-11-01\n    - [ ] subtask lewat 📅 2026-11-12\n```\n- [ ] di kode 📅 2026-11-01\n```\n- [ ] bukan metadata 2026-11-01\n";
        let tasks = parse_tasks(note);
        let got = due_by(&tasks, "2026-11-17");
        let titles: Vec<&str> = got.iter().map(|t| t.title.as_str()).collect();
        assert_eq!(titles, ["lewat", "hari ini", "subtask lewat"]);
        assert_eq!(got[2].line, 7);
        assert_eq!(got[1].priority, Priority::High);
        // Batas tanggal ikut dihitung; baris tanpa metadata tidak pernah terpilih.
        assert_eq!(due_by(&tasks, "2026-11-09").len(), 0);
        assert_eq!(due_by(&tasks, "2026-11-18").len(), 4);
        assert!(due_by(&parse_tasks(NOTE), "9999-12-31").is_empty());
        assert!(due_by(&parse_tasks(""), "2026-11-17").is_empty());
    }

    /* ----- toggle ----- */

    #[test]
    fn toggles_only_that_line() {
        let out = toggle_task(NOTE, 3, "Kerjain laporan IoT", today()).unwrap();
        assert_eq!(
            out,
            NOTE.replace("- [ ] Kerjain laporan IoT", "- [x] Kerjain laporan IoT ✅ 2026-11-17")
        );
        let back = toggle_task(&out, 3, "Kerjain laporan IoT ✅ 2026-11-17", today()).unwrap();
        assert_eq!(back, NOTE);
        // nested + centang balik
        let out = toggle_task(NOTE, 4, "Wiring sensor", today()).unwrap();
        assert_eq!(out, NOTE.replace("    - [x] Wiring sensor", "    - [ ] Wiring sensor"));
        // dibatalkan ("[-]") -> kembali belum selesai
        let out = toggle_task(NOTE, 7, "Batal", today()).unwrap();
        assert_eq!(out, NOTE.replace("- [-] Batal", "- [ ] Batal"));
    }

    #[test]
    fn toggle_manages_done_date() {
        // ✅ masuk di akhir metadata, sebelum block id.
        let out = toggle_task("- [ ] a ⏫ 📅 2026-11-18 ^id1", 0, "a ⏫ 📅 2026-11-18 ^id1", today()).unwrap();
        assert_eq!(out, "- [x] a ⏫ 📅 2026-11-18 ✅ 2026-11-17 ^id1");
        // ✅ lama tidak digandakan / ditimpa.
        let out = toggle_task("- [ ] a ✅ 2026-11-01", 0, "a ✅ 2026-11-01", today()).unwrap();
        assert_eq!(out, "- [x] a ✅ 2026-11-01");
        // Batal centang: hanya ✅ yang hilang, urutan metadata lain tetap.
        let out = toggle_task("- [x] a ✅ 2026-11-01 📅 2026-11-18 ⏫", 0, "a ✅ 2026-11-01 📅 2026-11-18 ⏫", today()).unwrap();
        assert_eq!(out, "- [ ] a 📅 2026-11-18 ⏫");
        // Checkbox tanpa teks.
        assert_eq!(toggle_task("- [ ]", 0, "", today()).unwrap(), "- [x] ✅ 2026-11-17");
    }

    #[test]
    fn refuses_when_file_changed() {
        // Widget melihat baris 3 = "Kerjain laporan IoT"; sementara itu file berubah.
        assert!(toggle_task(NOTE, 3, "Teks lain", today()).is_err());
        assert!(toggle_task(NOTE, 0, "x", today()).is_err());
        assert!(toggle_task(NOTE, 999, "x", today()).is_err());

        let seen = one("- [ ] Kerjain laporan IoT");
        // Baris disisipkan di atasnya di Obsidian -> baris 3 sekarang task lain.
        let shifted = NOTE.replace("## Tasks\n", "## Tasks\n- [ ] Baru dari Obsidian\n");
        assert!(toggle_task(&shifted, 3, &seen.text, today()).is_err());
        assert!(update_task(&shifted, 3, &seen.text, &title("x"), today()).is_err());
        assert!(delete_task(&shifted, 3, &seen.text).is_err());
        // Teksnya diedit di Obsidian (termasuk hanya metadata).
        let edited = NOTE.replace("Kerjain laporan IoT", "Kerjain laporan IoT ⏫");
        assert!(toggle_task(&edited, 3, &seen.text, today()).is_err());
        assert!(update_task(&edited, 3, &seen.text, &due("2026-11-20"), today()).is_err());
        assert!(delete_task(&edited, 3, &seen.text).is_err());
        // Barisnya bukan task lagi.
        let gone = NOTE.replace("- [ ] Kerjain laporan IoT", "Kerjain laporan IoT");
        assert!(update_task(&gone, 3, &seen.text, &title("x"), today()).is_err());
    }

    #[test]
    fn keeps_crlf() {
        let crlf = NOTE.replace('\n', "\r\n");
        let lf = |s: String| {
            assert!(!s.replace("\r\n", "").contains(['\n', '\r']), "EOL campur");
            s.replace("\r\n", "\n")
        };

        let out = toggle_task(&crlf, 3, "Kerjain laporan IoT", today()).unwrap();
        assert_eq!(lf(out), toggle_task(NOTE, 3, "Kerjain laporan IoT", today()).unwrap());
        assert_eq!(read_notes(&crlf, "## Notes"), "baris satu\nbaris dua");
        let w = write_notes(&crlf, "## Notes", "baru");
        assert!(w.contains("## Notes\r\n\r\nbaru\r\n\r\n## Lain\r\nisi lain\r\n"));
        lf(w);

        let out = add_task(&crlf, "## Tasks", "baru ⏫");
        assert_eq!(lf(out), add_task(NOTE, "## Tasks", "baru ⏫"));
        let out = add_task(&crlf, "## Belum ada", "baru");
        assert!(out.ends_with("isi lain\r\n\r\n## Belum ada\r\n- [ ] baru\r\n"));
        lf(out);

        let e = Edit { title: Some("Ganti".into()), priority: Some(Priority::High), due: Some("2026-11-20".into()) };
        let out = update_task(&crlf, 3, "Kerjain laporan IoT", &e, today()).unwrap();
        assert_eq!(lf(out), update_task(NOTE, 3, "Kerjain laporan IoT", &e, today()).unwrap());

        let (out, removed) = delete_task(&crlf, 3, "Kerjain laporan IoT").unwrap();
        assert_eq!(removed.text, "- [ ] Kerjain laporan IoT\n    - [x] Wiring sensor");
        assert_eq!(restore_task(&out, &removed, "## Tasks"), crlf);
        lf(out);
    }

    /* ----- quick-add ----- */

    #[test]
    fn parses_quick_add_tokens() {
        let q = parse_quick("Beli kabel !high @tomorrow", today());
        assert_eq!(q.title, "Beli kabel");
        assert_eq!(q.priority, Some(Priority::High));
        assert_eq!(q.due.as_deref(), Some("2026-11-18"));

        let q = parse_quick("@today !MED   Rapat   lab", today());
        assert_eq!((q.title.as_str(), q.priority), ("Rapat lab", Some(Priority::Medium)));
        assert_eq!(q.due.as_deref(), Some("2026-11-17"));

        let q = parse_quick("Bayar @2026-12-01 kos !low", today());
        assert_eq!((q.title.as_str(), q.priority), ("Bayar kos", Some(Priority::Low)));
        assert_eq!(q.due.as_deref(), Some("2026-12-01"));

        // Bukan token: dibiarkan, spasi asli tetap.
        let q = parse_quick("  Email a@b.com  @budi !penting wow! @2026-02-30 ", today());
        assert_eq!(q.title, "Email a@b.com  @budi !penting wow! @2026-02-30");
        assert_eq!((q.priority, q.due), (None, None));

        // Token terakhir yang menang; akhir bulan/tahun.
        let q = parse_quick("x !low !high @today @tomorrow", day("2026-12-31"));
        assert_eq!(q.priority, Some(Priority::High));
        assert_eq!(q.due.as_deref(), Some("2027-01-01"));
    }

    #[test]
    fn composes_new_task_text() {
        let c = |e: &Edit| compose_task(e, today());
        assert_eq!(c(&title("Beli kabel")).unwrap(), "Beli kabel");
        assert_eq!(c(&title("Beli kabel !high @tomorrow")).unwrap(), "Beli kabel ⏫ 📅 2026-11-18");
        assert_eq!(c(&title("15:00 Rapat @today")).unwrap(), "15:00 Rapat 📅 2026-11-17");
        // Pilihan tombol menang atas token.
        let e = Edit { title: Some("a !low @today".into()), priority: Some(Priority::Medium), due: Some("2026-12-01".into()) };
        assert_eq!(c(&e).unwrap(), "a 🔼 📅 2026-12-01");
        // Emoji yang diketik langsung dirapikan, tidak digandakan.
        assert_eq!(c(&title("a 📅 2026-11-20 🔽 !high")).unwrap(), "a ⏫ 📅 2026-11-20");
        // Baris baru tidak boleh lolos ke file.
        assert_eq!(c(&title("a\r\nb")).unwrap(), "a  b");
        // Judul kosong / tanggal ngawur ditolak.
        assert!(c(&title("   ")).is_err());
        assert!(c(&title("!high @today")).is_err());
        assert!(c(&Edit::default()).is_err());
        assert!(c(&Edit { due: Some("besok".into()), ..title("a") }).is_err());
    }

    /* ----- tambah ----- */

    #[test]
    fn adds_task_at_end_of_list_under_heading() {
        // Setelah task terakhir (bukan di akhir bagian, bukan di akhir file).
        let out = add_task(NOTE, "## Tasks", "Baru ⏫");
        assert_eq!(out, NOTE.replace("1. [ ] Bernomor\n", "1. [ ] Bernomor\n- [ ] Baru ⏫\n"));
        assert_eq!(parse_tasks(&out).iter().filter(|t| t.title == "Baru").count(), 1);

        // Task terakhir punya subtask dan teks lanjutan: masuk setelahnya.
        let note = "## Tasks\n- [ ] a\n    - [ ] sub\n    catatan sub\n\nparagraf\n\n## Notes\nx\n";
        assert_eq!(
            add_task(note, "## Tasks", "b"),
            "## Tasks\n- [ ] a\n    - [ ] sub\n    catatan sub\n- [ ] b\n\nparagraf\n\n## Notes\nx\n"
        );
        // Bagian masih kosong.
        assert_eq!(add_task("## Tasks\n\n## Notes\nx\n", "## Tasks", "a"), "## Tasks\n- [ ] a\n\n## Notes\nx\n");
        assert_eq!(add_task("## Tasks", "## Tasks", "a"), "## Tasks\n- [ ] a");
        // Bagian berisi teks tapi belum ada task: setelah isi terakhir.
        assert_eq!(
            add_task("## Tasks\nintro\n\n\n## Notes\n", "## Tasks", "a"),
            "## Tasks\nintro\n- [ ] a\n\n\n## Notes\n"
        );
        // Heading tidak peka huruf besar; subheading masih bagian yang sama.
        assert_eq!(
            add_task("## tasks\n### Pagi\n- [ ] a\n# Lain\n", "## Tasks", "b"),
            "## tasks\n### Pagi\n- [ ] a\n- [ ] b\n# Lain\n"
        );
        // Task di code block bukan "task terakhir"; heading di code block bukan heading.
        assert_eq!(
            add_task("```\n## Tasks\n```\n## Tasks\n- [ ] a\n```\n- [ ] kode\n```\n", "## Tasks", "b"),
            "```\n## Tasks\n```\n## Tasks\n- [ ] a\n- [ ] b\n```\n- [ ] kode\n```\n"
        );
    }

    #[test]
    fn adds_heading_when_missing() {
        assert_eq!(add_task("# Judul\nisi\n", "## Tasks", "a"), "# Judul\nisi\n\n## Tasks\n- [ ] a\n");
        assert_eq!(add_task("isi tanpa newline", "## Tasks", "a"), "isi tanpa newline\n\n## Tasks\n- [ ] a\n");
        assert_eq!(add_task("isi\n\n\n\n", "## Tasks", "a"), "isi\n\n## Tasks\n- [ ] a\n");
        // Task di luar heading tidak dipindah; heading baru tetap di akhir.
        assert_eq!(add_task("- [ ] lama\n", "## Tasks", "a"), "- [ ] lama\n\n## Tasks\n- [ ] a\n");
        // Menambah lagi masuk ke bawah heading yang baru dibuat.
        let twice = add_task(&add_task("isi\n", "## Tasks", "a"), "## Tasks", "b");
        assert_eq!(twice, "isi\n\n## Tasks\n- [ ] a\n- [ ] b\n");
    }

    #[test]
    fn adds_to_empty_file() {
        assert_eq!(add_task("", "## Tasks", "a ⏫"), "## Tasks\n- [ ] a ⏫\n");
        assert_eq!(add_task("\n\n", "## Tasks", "a"), "## Tasks\n- [ ] a\n");
        assert_eq!(add_task("\r\n", "## Tasks", "a"), "## Tasks\r\n- [ ] a\r\n");
        assert_eq!(parse_tasks("").len(), 0);
    }

    /* ----- edit ----- */

    #[test]
    fn updates_only_that_line() {
        // Judul: bullet, indentasi, checkbox, dan baris lain tetap.
        let out = update_task(NOTE, 4, "Wiring sensor", &title("Wiring sensor gate"), today()).unwrap();
        assert_eq!(out, NOTE.replace("    - [x] Wiring sensor", "    - [x] Wiring sensor gate"));
        let out = update_task(NOTE, 6, "15:00 Rapat lab #icn", &title("16:00 Rapat lab #icn"), today()).unwrap();
        assert_eq!(out, NOTE.replace("* [ ] 15:00", "* [ ] 16:00"));
        let out = update_task(NOTE, 8, "Bernomor", &prio(Priority::High), today()).unwrap();
        assert_eq!(out, NOTE.replace("1. [ ] Bernomor", "1. [ ] Bernomor ⏫"));
        // Tidak ada perubahan -> isi file persis sama.
        assert_eq!(update_task(NOTE, 3, "Kerjain laporan IoT", &title("Kerjain laporan IoT"), today()).unwrap(), NOTE);
        assert_eq!(update_task(NOTE, 3, "Kerjain laporan IoT", &prio(Priority::None), today()).unwrap(), NOTE);
        let odd = "-   [ ]   a   b  ⏫  ";
        assert_eq!(update_task(odd, 0, "a   b  ⏫", &prio(Priority::High), today()).unwrap(), odd);
        // Judul kosong ditolak.
        assert!(update_task(NOTE, 3, "Kerjain laporan IoT", &title("  "), today()).is_err());
    }

    #[test]
    fn updates_metadata_in_place() {
        let up = |line: &str, e: &Edit| {
            let text = one(line).text;
            update_task(line, 0, &text, e, today()).unwrap()
        };
        // Prioritas: ganti, tambah (di depan metadata lain), hapus.
        assert_eq!(up("- [ ] a ⏫ 📅 2026-11-18", &prio(Priority::Low)), "- [ ] a 🔽 📅 2026-11-18");
        assert_eq!(up("- [ ] a 📅 2026-11-18", &prio(Priority::Medium)), "- [ ] a 🔼 📅 2026-11-18");
        assert_eq!(up("- [ ] a ⏫ 📅 2026-11-18", &prio(Priority::None)), "- [ ] a 📅 2026-11-18");
        // Deadline: ganti, tambah (sebelum ✅), hapus.
        assert_eq!(up("- [ ] a 📅 2026-11-18 ⏫", &due("2026-12-01")), "- [ ] a 📅 2026-12-01 ⏫");
        assert_eq!(up("- [x] a ⏫ ✅ 2026-11-17", &due("2026-12-01")), "- [x] a ⏫ 📅 2026-12-01 ✅ 2026-11-17");
        assert_eq!(up("- [ ] a 📅 2026-11-18 ⏫", &due("")), "- [ ] a ⏫");
        assert_eq!(up("- [ ] a", &due("2026-12-01")), "- [ ] a 📅 2026-12-01");
        // Judul diganti, metadata (termasuk field Tasks lain dan block id) tetap.
        assert_eq!(
            up("- [ ] lama ➕ 2026-11-01 ⏫ 📅 2026-11-18 ^id", &title("baru")),
            "- [ ] baru ➕ 2026-11-01 ⏫ 📅 2026-11-18 ^id"
        );
        // Token quick-add di judul hasil edit ikut diterapkan.
        assert_eq!(up("- [ ] a ⏫", &title("b !low @tomorrow")), "- [ ] b 🔽 📅 2026-11-18");
        assert_eq!(up("- [ ] a ⏫ 📅 2026-11-18", &title("b !none")), "- [ ] b 📅 2026-11-18");
        // Metadata ganda dirapikan jadi satu.
        assert_eq!(up("- [ ] a 📅 2026-11-01 📅 2026-11-18", &due("2026-12-01")), "- [ ] a 📅 2026-12-01");
        // Tanggal ngawur ditolak.
        let line = "- [ ] a";
        assert!(update_task(line, 0, "a", &due("2026-02-30"), today()).is_err());
    }

    /* ----- hapus & undo ----- */

    #[test]
    fn deletes_task_with_its_subtasks_and_restores() {
        // Task tunggal.
        let (out, removed) = delete_task(NOTE, 5, "Beli kabel").unwrap();
        assert_eq!(out, NOTE.replace("- [X] Beli kabel\n", ""));
        assert_eq!(removed, Removed { line: 5, text: "- [X] Beli kabel".into(), anchor: Some("    - [x] Wiring sensor".into()) });
        assert_eq!(restore_task(&out, &removed, "## Tasks"), NOTE);

        // Induk membawa subtask; subtask sendiri tidak membawa apa-apa.
        let (out, removed) = delete_task(NOTE, 3, "Kerjain laporan IoT").unwrap();
        assert_eq!(out, NOTE.replace("- [ ] Kerjain laporan IoT\n    - [x] Wiring sensor\n", ""));
        assert_eq!(restore_task(&out, &removed, "## Tasks"), NOTE);
        let (out, removed) = delete_task(NOTE, 4, "Wiring sensor").unwrap();
        assert_eq!(out, NOTE.replace("    - [x] Wiring sensor\n", ""));
        assert_eq!(restore_task(&out, &removed, "## Tasks"), NOTE);

        // Baris pertama dan terakhir file.
        let (out, removed) = delete_task("- [ ] a\n- [ ] b", 0, "a").unwrap();
        assert_eq!((out.as_str(), &removed.anchor), ("- [ ] b", &None));
        assert_eq!(restore_task(&out, &removed, "## Tasks"), "- [ ] a\n- [ ] b");
        let (out, removed) = delete_task("- [ ] a\n- [ ] b", 1, "b").unwrap();
        assert_eq!(out, "- [ ] a");
        assert_eq!(restore_task(&out, &removed, "## Tasks"), "- [ ] a\n- [ ] b");

        // Baris kosong mengakhiri blok.
        let (out, _) = delete_task("- [ ] a\n  lanjutan\n\n  bukan lanjutan\n", 0, "a").unwrap();
        assert_eq!(out, "\n  bukan lanjutan\n");
    }

    #[test]
    fn restore_falls_back_when_file_changed() {
        let (out, removed) = delete_task(NOTE, 5, "Beli kabel").unwrap();
        // Sementara itu ada baris baru di atasnya: posisi lama tidak valid lagi,
        // jadi task kembali di akhir daftar di bawah heading — tidak hilang.
        let changed = out.replace("## Tasks\n", "## Tasks\n- [ ] Baru dari Obsidian\n");
        let back = restore_task(&changed, &removed, "## Tasks");
        assert_eq!(back, changed.replace("1. [ ] Bernomor\n", "1. [ ] Bernomor\n- [X] Beli kabel\n"));
        // File jadi lebih pendek dari posisi lama.
        assert_eq!(restore_task("x\n", &removed, "## Tasks"), "x\n\n## Tasks\n- [X] Beli kabel\n");
    }

    /* ----- notes ----- */

    #[test]
    fn reads_and_writes_notes() {
        assert_eq!(read_notes(NOTE, "## Notes"), "baris satu\nbaris dua");
        assert_eq!(read_notes(NOTE, "## Tidak ada"), "");

        let w = write_notes(NOTE, "## Notes", "ganti\nisi");
        assert_eq!(read_notes(&w, "## Notes"), "ganti\nisi");
        assert!(w.contains("## Lain\nisi lain\n"));
        assert!(w.starts_with("# 2026-11-17\n\n## Tasks\n- [ ] Kerjain"));
        // idempoten
        assert_eq!(write_notes(&w, "## Notes", "ganti\nisi"), w);

        // heading belum ada -> ditambah di akhir
        let w = write_notes("- [ ] a\n", "## Notes", "halo");
        assert_eq!(w, "- [ ] a\n\n## Notes\n\nhalo\n");
        // file kosong
        assert_eq!(write_notes("", "## Notes", "halo"), "## Notes\n\nhalo\n");
        // notes kosong + heading belum ada -> tidak mengubah apa-apa
        assert_eq!(write_notes("- [ ] a\n", "## Notes", "  "), "- [ ] a\n");
    }
}
