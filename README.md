# ObsiTask

Widget desktop kecil yang menampilkan task dari **daily note Obsidian** hari ini, plus kotak catatan singkat — tanpa perlu membuka Obsidian.

Rust + Tauri 2, frontend HTML/CSS/JS polos (tanpa bundler, tanpa npm).

## Cara kerja

- **Tasks** — semua baris checkbox (`- [ ]`, `- [x]`) di daily note hari yang dipilih. Klik untuk mencentang; hanya karakter di dalam `[ ]` pada baris itu yang ditulis ulang.
- **Notes** — isi di bawah heading `## Notes` di daily note yang sama. Disimpan otomatis ±0,7 detik setelah berhenti mengetik. Heading ditambahkan di akhir file kalau belum ada; bagian lain file tidak disentuh.
- **Yesterday / Today / Tomorrow** — pindah ke daily note kemarin atau besok.
- File dibaca ulang tiap 2 detik, jadi perubahan dari Obsidian langsung muncul.
- Tombol hijau membuka daily note itu di Obsidian (dan membuatnya kalau belum ada).
- Tombol pin = always-on-top. Posisi dan ukuran window diingat.

Keterangan kecil di bawah task diambil dari teksnya: jam di depan (`- [ ] 15:00 Rapat`) dan due date gaya plugin Tasks (`📅 2026-11-18`, merah kalau sudah lewat).

## Build di Windows

Prasyarat: [Rust](https://rustup.rs), Microsoft C++ Build Tools, dan WebView2 (sudah ada di Windows 10/11 terbaru).

```powershell
cargo install tauri-cli --version "^2"

cd src-tauri
cargo tauri dev      # jalankan untuk development
cargo tauri build    # hasil .msi dan .exe di target/release/bundle/
```

Saat pertama dijalankan, pilih folder vault. Folder dan format daily note diisi otomatis dari setting plugin Daily notes (`.obsidian/daily-notes.json`) kalau ada.

## Struktur

```
src/                  frontend widget
  index.html
  style.css           warna & font ada di :root paling atas
  main.js             buka index.html langsung di browser = mode contoh data
src-tauri/
  src/tasks.rs        parser checkbox + notes (logika murni, ada unit test)
  src/config.rs       config + konversi format tanggal Obsidian
  src/lib.rs          command Tauri
  tauri.conf.json     ukuran & sifat window
```

Test: `cd src-tauri && cargo test`

Config tersimpan di `%APPDATA%\com.kekensya.obsitask\config.json`.

## Belum ada (sengaja)

- Menambah / mengedit teks task dari widget — lakukan di Obsidian.
- Efek blur ke desktop (acrylic/mica). Panel sekarang semi-transparan biasa.
- Tray icon dan autostart saat Windows menyala.
