# ObsiTask

Widget desktop kecil untuk task di vault Obsidian: task hari ini, overdue, dan yang akan datang dari **daily note** dan **list permanen** di `Tasks.md`, plus kotak catatan singkat — tanpa perlu membuka Obsidian.

Rust + Tauri 2, frontend HTML/CSS/JS polos (tanpa bundler, tanpa npm).

Warna tema bawaan (selain Default) dan gaya window Settings diadaptasi dari [Terax](https://github.com/crynta/terax-ai) oleh crynta, lisensi Apache 2.0.

## Cara kerja

File markdown di vault tetap satu-satunya sumber data: daily note dan satu file list (default `Tasks.md`). Setiap perubahan hanya menulis ulang baris yang dimaksud (line ending dipertahankan, dan ditolak kalau baris itu sudah berubah di Obsidian). Tidak ada database atau file metadata lain.

Widget punya tiga tab:

- **Today**
  - **Overdue** — task belum selesai dengan deadline sebelum hari ini, dari `Tasks.md` dan dari daily note hari-hari sebelumnya (dengan asalnya, mis. "from Nov 10"). Bisa dilipat.
  - **Today** — task dengan deadline hari ini dari `Tasks.md` dan daily note lain, plus *semua* task di daily note hari ini.
  - **Completed today** — task yang dicentang hari ini (`✅` hari ini), dan task selesai di daily note hari ini. Terlipat secara default.
  - Task dari `Tasks.md` diberi label kecil nama list-nya.
- **Upcoming** — task belum selesai dengan deadline besok sampai N hari ke depan (default 7, diatur di Settings "Upcoming days"), dikelompokkan per tanggal ("Tomorrow", "Thu, Nov 20").
- **All** — semua list di `Tasks.md` (lihat di bawah).

Task yang terpilih ke sebuah grup selalu dibawa bersama subtask-nya; subtask mengikuti tanggal induknya.

- **Tambah** lewat kotak "Add a task…" + Enter. Task baru selalu masuk ke `Tasks.md`, di list default (default `Inbox`, bisa diatur):
  - dari Today: dengan `📅` hari ini;
  - dari Upcoming dan All: tanpa deadline.
  - Token atau tombol mengubahnya. Kalau task baru tidak terlihat di tab yang sedang dibuka, muncul pesan "Added to …".
- **Quick-add**: `!high` / `!med` / `!low` untuk prioritas, `@today` / `@tomorrow` / `@YYYY-MM-DD` untuk deadline, `~list` untuk list. Atau pakai tombol bendera dan kalender di kotak yang sama (pilihan tombol menang atas token).
- **Centang** lewat lingkaran checkbox. `✅ YYYY-MM-DD` ditambahkan saat dicentang dan dihapus saat dibatalkan.
- **Edit**: klik judul untuk mengubah teks (Enter simpan, Esc batal; token quick-add juga berlaku). Tombol `⋯` atau klik kanan membuka menu prioritas, deadline, Move to list, dan hapus. Menghapus task ikut menghapus subtask-nya, dan bisa di-Undo beberapa detik.
- Semua perubahan dari tab mana pun ditulis ke file asal task itu (daily note lama, daily note hari ini, atau `Tasks.md`), dengan pengaman yang sama.
- **Metadata** memakai format emoji plugin Obsidian Tasks di akhir baris: `⏫` high, `🔼` medium, `🔽` low, `📅 YYYY-MM-DD` deadline, `✅ YYYY-MM-DD` selesai. Field Tasks lain (`➕`, `🛫`, `⏳`, …) dan block id dibiarkan utuh.
- **Urutan tampil**: belum selesai dulu, lalu prioritas, lalu deadline; subtask tetap di bawah induknya. Urutan baris di file tidak pernah diubah.
- **Daily note yang dipindai**: hari ini, `scan_days` hari ke belakang ("Look back for due tasks", default 30, maksimum 365, 0 = mati), dan N hari ke depan untuk Upcoming. Hasil parse tiap file (daily note dan `Tasks.md`) di-cache berdasarkan waktu modifikasi + ukuran, jadi polling 2 detik hanya mengecek metadata file.

### List permanen (`Tasks.md`, tab All)

- Setiap heading `## Nama` adalah satu list, sesuai urutan di file. `###` dan lebih dalam tetap bagian list di atasnya. `#` mengakhiri list; task sesudahnya, juga task sebelum heading `##` pertama, masuk Inbox. Heading dengan nama sama digabung. Heading dan task di dalam code block diabaikan.
- Format baris dan metadata sama persis dengan di daily note.
- Tab All menampilkan semua list (bisa dilipat, dengan jumlah task belum selesai), masing-masing dengan input "Add to …" sendiri. Task selesai disembunyikan; tombol "Show completed" menampilkannya. Task tanpa deadline juga ada di sini.
- List default selalu tampil walau heading-nya belum ada; heading-nya dibuat di akhir file saat task pertama masuk. `Tasks.md` dibuat (dengan `## Inbox`) kalau belum ada.
- **Token `~list`** tidak peka huruf besar/kecil dan boleh awalan unik (`~kul` → Kuliah). Kalau tidak ada list yang cocok, task tidak disimpan dan muncul pesan "No list named …". List baru tidak dibuat dari widget: membuat, mengganti nama, dan menghapus list dilakukan di Obsidian dengan mengedit heading.
- **Move to list** (menu `⋯`) memindahkan task beserta subtask-nya ke akhir list lain, dari `Tasks.md` maupun dari daily note. Antar file urutannya: cek baris di file asal → tulis ke `Tasks.md` → hapus dari file asal (dicek ulang). Kalau langkah terakhir gagal karena file asal berubah, task dibiarkan ada di dua tempat (tidak hilang) dan widget memberi tahu.
- Mengubah list lewat edit judul (`~list` di judul) ditolak; pakai Move to list.

### Lainnya

- **Notes** — selalu isi di bawah heading `## Notes` di daily note hari ini, di tab mana pun. Disimpan otomatis ±0,7 detik setelah berhenti mengetik. Heading ditambahkan di akhir file kalau belum ada; bagian lain file tidak disentuh.
- File dibaca ulang tiap 2 detik, jadi perubahan dari Obsidian langsung muncul.
- Tombol hijau membuka daily note hari ini (atau `Tasks.md` di tab All) di Obsidian, dan membuatnya kalau belum ada.
- Tombol pin = always-on-top (sama dengan setting "Always on top"). Posisi dan ukuran window diingat.

Keterangan kecil di bawah task: jam di depan teks (`- [ ] 15:00 Rapat`), deadline (merah kalau sudah lewat), daily note asal, dan nama list. Warna lingkaran checkbox menandai prioritas.

### Settings dan tema

- Tombol roda gigi membuka **window Settings** terpisah (atau memfokuskannya kalau sudah terbuka). Setiap perubahan langsung disimpan ke `config.json` dan langsung terlihat di widget — tidak ada tombol Save. Setup pertama kali (pilih vault) tetap di dalam widget.
  - **General** — Appearance (System / Light / Dark; System mengikuti mode terang/gelap Windows saat itu juga), zoom widget 80–150%, always on top.
  - **Vault** — folder vault (Browse), folder dan format daily note, heading task dan Notes, file list; tombol "Detect from Obsidian" menyalin folder + format dari plugin Daily notes. Baris yang bermasalah diberi peringatan (folder tidak ada, bukan vault, format tanpa tahun/bulan/hari); vault yang tidak ada tidak disimpan.
  - **Tasks** — sembunyikan task selesai, list default, Upcoming days, look-back days.
  - **Themes** — kartu pratinjau setiap tema; varian yang tampil mengikuti Appearance. Tema berlabel "Dark only" / "Light only" selalu memakai varian itu. Window Settings sendiri ikut memakai tema yang dipilih.
  - **About** — versi, lokasi config, tombol buka folder config, kredit.
- Penyimpanan dari Settings dan dari tombol pin hanya mengubah field yang disentuh (dibaca ulang dari disk dan dikunci), jadi dua window tidak saling menimpa.
- **Tema** dipasang lewat `data-theme` dan `data-mode` di `<html>`. Semua warna di CSS lewat variabel (`src/theme.css`); data tema ada di `src/themes.js`. "Default" adalah tampilan asli ObsiTask (dark) plus varian light-nya.
- Tema lain memakai **nilai warna dari [Terax](https://github.com/crynta/terax-ai)** (Apache License 2.0); hanya nilai warnanya yang diambil, tanpa kode. Pemetaannya: background → panel, card → kartu, cardForeground → teks, mutedForeground → teks redup, border → garis, secondary → kotak input/tombol bulat/segmented, accent → sorotan baris, primary → tombol hijau/checkbox/tab/fokus, destructive → overdue/toast error, terminal ansi[1]/[3]/[4] → prioritas high/medium/low, ansi[6] → tag, terminal selection → seleksi teks.
- **Kontras**: token yang di bawah WCAG (teks 4.5:1, lingkaran prioritas dan ikon 3:1, diukur di atas kartu) digeser sedikit ke arah warna teks tema itu sampai lolos; daftar token yang diubah tercatat di `adjusted` pada `themes.js`. Default dark sengaja tidak diubah.

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
src/                  frontend
  index.html          widget (+ setup pertama kali)
  main.js             buka index.html langsung di browser = mode contoh data
  style.css           tata letak widget; semua warna lewat variabel
  theme.css           token warna + warna turunan (dipakai widget dan Settings)
  themes.js           data tema (Default + warna Terax) dan applyTheme()
  settings.html       window Settings (settings.js, settings.css); bisa dibuka langsung di browser
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

- Task ber-deadline di note selain daily note dan `Tasks.md` tidak ikut dipindai, begitu juga daily note di luar jangkauan "Look back" / "Upcoming days".
- Subtask yang deadline-nya berbeda dari induknya tetap tampil di grup induknya.
- Membuka atau menambah ke daily note hari selain hari ini dari widget (tab Yesterday / Tomorrow sudah diganti Today / Upcoming).
- UI untuk membuat, mengganti nama, atau menghapus list (lakukan di Obsidian dengan mengedit heading `##`).
- Memindahkan task dari `Tasks.md` kembali ke daily note.
- Recurring task, reminder/notifikasi, pomodoro, smart list/filter kustom, tag view, arsip task selesai, drag-and-drop reorder, sinkronisasi.
- Prioritas `🔺` / `⏬` plugin Tasks tidak dikelola (dibiarkan apa adanya di baris).
- Efek blur ke desktop (acrylic/mica) dan gambar latar. Panel sekarang semi-transparan biasa.
- Membuat atau mengedit tema sendiri dari widget, dan shortcut keyboard yang bisa diatur.
- Tray icon dan autostart saat Windows menyala.

Untuk mencoba terhadap vault percobaan tanpa menyentuh config asli, set `OBSITASK_CONFIG` ke path file config lain sebelum menjalankan.
