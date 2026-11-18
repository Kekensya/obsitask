//! Logika murni: parse checkbox dan bagian Notes dari isi file markdown,
//! lalu tulis balik perubahan tanpa menyentuh baris lain.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Task {
    /// Indeks baris (mulai 0) di file.
    pub line: usize,
    pub text: String,
    pub done: bool,
    pub cancelled: bool,
    /// Level indentasi (0 = paling kiri).
    pub level: usize,
}

struct ParsedLine {
    indent: usize,
    /// Posisi byte karakter di dalam kurung `[ ]`.
    mark_idx: usize,
    mark: char,
    text: String,
}

fn parse_line(line: &str) -> Option<ParsedLine> {
    let trimmed = line.trim_start();
    let lead = line.len() - trimmed.len();
    let indent = line[..lead]
        .chars()
        .map(|c| if c == '\t' { 4 } else { 1 })
        .sum();

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

/// Ambil semua checkbox dari isi file.
pub fn parse_tasks(content: &str) -> Vec<Task> {
    let (lines, _) = split_lines(content);
    let mut raw: Vec<(usize, ParsedLine)> = Vec::new();
    let mut in_code = false;
    for (i, line) in lines.iter().enumerate() {
        let t = line.trim_start();
        if t.starts_with("```") || t.starts_with("~~~") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        if let Some(p) = parse_line(line) {
            raw.push((i, p));
        }
    }

    // Ubah lebar indentasi jadi level bertingkat.
    let mut stack: Vec<usize> = Vec::new();
    raw.into_iter()
        .map(|(line, p)| {
            while stack.last().is_some_and(|&top| top >= p.indent) {
                stack.pop();
            }
            let level = stack.len();
            stack.push(p.indent);
            Task {
                line,
                text: p.text,
                done: matches!(p.mark, 'x' | 'X'),
                cancelled: p.mark == '-',
                level,
            }
        })
        .collect()
}

/// Balik status checkbox di baris `line`. `expected_text` memastikan baris itu
/// masih task yang sama (file bisa saja berubah sejak terakhir dibaca).
pub fn toggle_task(content: &str, line: usize, expected_text: &str) -> Result<String, String> {
    let (mut lines, eol) = split_lines(content);
    let target = lines
        .get_mut(line)
        .ok_or("Baris tidak ditemukan — file sudah berubah.")?;
    let parsed = parse_line(target).ok_or("Baris itu bukan task lagi — file sudah berubah.")?;
    if parsed.text != expected_text {
        return Err("Task di baris itu sudah berubah.".into());
    }
    let new_mark = if parsed.mark == ' ' { "x" } else { " " };
    target.replace_range(
        parsed.mark_idx..parsed.mark_idx + parsed.mark.len_utf8(),
        new_mark,
    );
    Ok(lines.join(eol))
}

fn heading_level(line: &str) -> Option<usize> {
    let t = line.trim_start();
    let n = t.chars().take_while(|&c| c == '#').count();
    if (1..=6).contains(&n) && t[n..].starts_with(' ') {
        Some(n)
    } else {
        None
    }
}

/// Cari rentang isi bagian notes: (baris heading, akhir eksklusif).
fn notes_range(lines: &[String], heading: &str) -> Option<(usize, usize)> {
    let want = heading.trim();
    let level = heading_level(want)?;
    let start = lines
        .iter()
        .position(|l| l.trim().eq_ignore_ascii_case(want))?;
    let end = lines[start + 1..]
        .iter()
        .position(|l| heading_level(l).is_some_and(|n| n <= level))
        .map(|off| start + 1 + off)
        .unwrap_or(lines.len());
    Some((start, end))
}

/// Isi di bawah heading notes (kosong kalau heading tidak ada).
pub fn read_notes(content: &str, heading: &str) -> String {
    let (lines, _) = split_lines(content);
    match notes_range(&lines, heading) {
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

    match notes_range(&lines, heading) {
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
    fn toggles_only_that_line() {
        let out = toggle_task(NOTE, 3, "Kerjain laporan IoT").unwrap();
        assert_eq!(out, NOTE.replace("- [ ] Kerjain", "- [x] Kerjain"));
        let back = toggle_task(&out, 3, "Kerjain laporan IoT").unwrap();
        assert_eq!(back, NOTE);
        // nested + centang balik
        let out = toggle_task(NOTE, 4, "Wiring sensor").unwrap();
        assert!(out.contains("    - [ ] Wiring sensor"));
    }

    #[test]
    fn toggle_refuses_when_file_changed() {
        assert!(toggle_task(NOTE, 3, "Teks lain").is_err());
        assert!(toggle_task(NOTE, 0, "x").is_err());
        assert!(toggle_task(NOTE, 999, "x").is_err());
    }

    #[test]
    fn keeps_crlf() {
        let crlf = NOTE.replace('\n', "\r\n");
        let out = toggle_task(&crlf, 3, "Kerjain laporan IoT").unwrap();
        assert_eq!(out, crlf.replace("- [ ] Kerjain", "- [x] Kerjain"));
        assert_eq!(read_notes(&crlf, "## Notes"), "baris satu\nbaris dua");
        let w = write_notes(&crlf, "## Notes", "baru");
        assert!(w.contains("## Notes\r\n\r\nbaru\r\n\r\n## Lain\r\nisi lain\r\n"));
        assert!(!w.replace("\r\n", "").contains('\n'));
    }

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
