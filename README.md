# ObsiTask

Widget desktop kecil untuk task di vault Obsidian: task dari **daily note** hari ini, **list permanen** di `Tasks.md`, plus kotak catatan singkat — tanpa perlu membuka Obsidian.

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
- **List permanen (tab All)** — task yang tidak terikat hari tinggal di satu file, default `Tasks.md` di root vault (bisa diatur di Settings). Task di sana tidak "hilang" saat ganti hari; hanya hilang dari tampilan kalau dicentang.
  - Setiap heading `## Nama` adalah satu list, sesuai urutan di file. `###` dan lebih dalam tetap bagian list di atasnya. `#` mengakhiri list; task sesudahnya, juga task sebelum heading `##` pertama, masuk Inbox. Heading dengan nama sama digabung. Heading dan task di dalam code block diabaikan.
  - Format baris dan metadata sama persis dengan di daily note.
  - Tab All menampilkan semua list (bisa dilipat, dengan jumlah task belum selesai), masing-masing dengan input "Add to …" sendiri. Task selesai disembunyikan; tombol "Show completed" menampilkannya.
  - Kotak "Add a task…" di tab All menambah ke list default (default `Inbox`, bisa diatur). List default selalu tampil walau heading-nya belum ada; heading-nya dibuat saat task pertama masuk. `Tasks.md` dibuat kalau belum ada.
  - **Token `~list`** di quick-add memilih list, tidak peka huruf besar/kecil dan boleh awalan unik (`~kul` → Kuliah). Di tab hari, `~list` mengirim task ke `Tasks.md` alih-alih daily note. Kalau tidak ada list yang cocok, task tidak disimpan dan muncul pesan "No list named …". List baru tidak dibuat dari widget: membuat, mengganti nama, dan menghapus list dilakukan di Obsidian dengan mengedit heading.
  - **Move to list** (menu `⋯`) memindahkan task beserta subtask-nya ke akhir list lain, dari `Tasks.md` maupun dari daily note. Antar file urutannya: cek baris di file asal → tulis ke `Tasks.md` → hapus dari file asal (dicek ulang). Kalau langkah terakhir gagal karena file asal berubah, task dibiarkan ada di dua tempat (tidak hilang) dan widget memberi tahu.
  - Mengubah list lewat edit judul (`~list` di judul) ditolak; pakai Move to list.
- **Notes** — isi di bawah heading `## Notes` di daily note yang sama. Disimpan otomatis ±0,7 detik setelah berhenti mengetik. Heading ditambahkan di akhir file kalau belum ada; bagian lain file tidak disentuh.
- **Yesterday / Today / Tomorrow / All** — pindah ke daily note kemarin atau besok, atau ke semua list. Tab All memakai Notes hari ini.
- File dibaca ulang tiap 2 detik, jadi perubahan dari Obsidian langsung muncul. `Tasks.md` juga di-cache berdasarkan waktu modifikasi + ukuran.
- Tombol hijau membuka daily note itu (atau `Tasks.md` di tab All) di Obsidian, dan membuatnya kalau belum ada.
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
  src/scan.rs         cache parse file (mtime + ukuran): daily note lama dan Tasks.md
  src/config.rs       config + konversi format tanggal Obsidian
  src/lib.rs          command Tauri
  tauri.conf.json     ukuran & sifat window
```

Test: `cd src-tauri && cargo test`

Config tersimpan di `%APPDATA%\com.kekensya.obsitask\config.json`.

## Belum ada (sengaja)

- Task ber-deadline yang ditulis di daily note *setelah* hari yang ditampilkan, atau di note selain daily note dan `Tasks.md`, tidak ikut dipindai.
- Task di `Tasks.md` belum ikut tampil di tab hari (Overdue / Today) — tab Today / Upcoming / All menyusul.
- UI untuk membuat, mengganti nama, atau menghapus list (lakukan di Obsidian dengan mengedit heading `##`).
- Memindahkan task dari `Tasks.md` kembali ke daily note.
- Recurring task, reminder/notifikasi, pomodoro, smart list/filter kustom, tag view, arsip task selesai, drag-and-drop reorder, sinkronisasi.
- Prioritas `🔺` / `⏬` plugin Tasks tidak dikelola (dibiarkan apa adanya di baris).
- Efek blur ke desktop (acrylic/mica). Panel sekarang semi-transparan biasa.
- Tray icon dan autostart saat Windows menyala.

Untuk mencoba terhadap vault percobaan tanpa menyentuh config asli, set `OBSITASK_CONFIG` ke path file config lain sebelum menjalankan.
