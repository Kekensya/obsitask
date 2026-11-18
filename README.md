# ObsiTask

Widget desktop kecil yang menampilkan task dari **daily note Obsidian** hari ini, plus kotak catatan singkat — tanpa perlu membuka Obsidian.

Rust + Tauri 2, frontend HTML/CSS/JS polos (tanpa bundler, tanpa npm).

## Cara kerja

- **Tasks** — semua baris checkbox (`- [ ]`, `- [x]`) di daily note hari yang dipilih. File markdown tetap satu-satunya sumber data; setiap perubahan hanya menulis ulang baris yang dimaksud (line ending dipertahankan, dan ditolak kalau baris itu sudah berubah di Obsidian).
  - **Centang** lewat lingkaran checkbox. `✅ YYYY-MM-DD` ditambahkan saat dicentang dan dihapus saat dibatalkan.
  - **Tambah** lewat kotak "Add a task…" + Enter. Task ditulis sebagai `- [ ] ...` di akhir daftar di bawah heading task (default `## Tasks`, bisa diatur di Settings). Heading ditambahkan kalau belum ada; daily note dibuat kalau belum ada (tanpa template Obsidian).
  - **Quick-add**: `!high` / `!med` / `!low` untuk prioritas, `@today` / `@tomorrow` / `@YYYY-MM-DD` untuk deadline. Atau pakai tombol bendera dan kalender di kotak yang sama (pilihan tombol menang atas token).
  - **Edit**: klik judul untuk mengubah teks (Enter simpan, Esc batal; token quick-add juga berlaku). Tombol `⋯` atau klik kanan membuka menu prioritas, deadline, dan hapus. Menghapus task ikut menghapus subtask-nya, dan bisa di-Undo beberapa detik.
  - **Metadata** memakai format emoji plugin Obsidian Tasks di akhir baris: `⏫` high, `🔼` medium, `🔽` low, `📅 YYYY-MM-DD` deadline, `✅ YYYY-MM-DD` selesai. Field Tasks lain (`➕`, `🛫`, `⏳`, …) dan block id dibiarkan utuh.
  - **Urutan tampil**: belum selesai dulu, lalu prioritas, lalu deadline; subtask tetap di bawah induknya. Urutan baris di file tidak pernah diubah.
- **Overdue & due** — di atas daftar, task belum selesai dari daily note hari-hari sebelumnya yang deadline-nya paling lambat hari yang ditampilkan, lengkap dengan asal note-nya ("from Nov 10"). Mencentang, mengedit, mengubah prioritas/deadline, atau menghapus dari sini menulis ke file asalnya, dengan pengaman yang sama. Bagian ini bisa dilipat.
  - Jumlah hari yang dipindai diatur di Settings ("Look back for due tasks", default 30, maksimum 365, 0 = mati).
  - Hasil parse tiap note di-cache berdasarkan waktu modifikasi + ukuran file, jadi polling 2 detik hanya mengecek metadata file; note dibaca ulang hanya kalau berubah.
- **Notes** — isi di bawah heading `## Notes` di daily note yang sama. Disimpan otomatis ±0,7 detik setelah berhenti mengetik. Heading ditambahkan di akhir file kalau belum ada; bagian lain file tidak disentuh.
- **Yesterday / Today / Tomorrow** — pindah ke daily note kemarin atau besok.
- File dibaca ulang tiap 2 detik, jadi perubahan dari Obsidian langsung muncul.
- Tombol hijau membuka daily note itu di Obsidian (dan membuatnya kalau belum ada).
- Tombol pin = always-on-top. Posisi dan ukuran window diingat.

Keterangan kecil di bawah task: jam di depan teks (`- [ ] 15:00 Rapat`) dan deadline (merah kalau sudah lewat). Warna lingkaran checkbox menandai prioritas.

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
  src/tasks.rs        parser + penulis task/notes (logika murni, ada unit test)
  src/scan.rs         cache parse daily note (mtime + ukuran) untuk "Overdue & due"
  src/config.rs       config + konversi format tanggal Obsidian
  src/lib.rs          command Tauri
  tauri.conf.json     ukuran & sifat window
```

Test: `cd src-tauri && cargo test`

Config tersimpan di `%APPDATA%\com.kekensya.obsitask\config.json`.

## Belum ada (sengaja)

- Task ber-deadline yang ditulis di daily note *setelah* hari yang ditampilkan, atau di note selain daily note, tidak ikut dipindai.
- Recurring task, reminder/notifikasi, pomodoro, project/tag manager, drag-and-drop reorder, sinkronisasi.
- Prioritas `🔺` / `⏬` plugin Tasks tidak dikelola (dibiarkan apa adanya di baris).
- Efek blur ke desktop (acrylic/mica). Panel sekarang semi-transparan biasa.
- Tray icon dan autostart saat Windows menyala.

Untuk mencoba terhadap vault percobaan tanpa menyentuh config asli, set `OBSITASK_CONFIG` ke path file config lain sebelum menjalankan.
