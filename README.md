# ObsiTask

Widget desktop kecil untuk task di vault Obsidian: task hari ini, overdue, dan yang akan datang dari **daily note** dan **list permanen** di `Tasks.md`, plus kotak catatan singkat — tanpa perlu membuka Obsidian.

Rust + Tauri 2, frontend HTML/CSS/JS polos (tanpa bundler, tanpa npm).

Warna tema bawaan (selain Default) dan gaya window Settings diadaptasi dari [Terax](https://github.com/crynta/terax-ai) oleh crynta, lisensi Apache 2.0. Font judul [Space Grotesk](https://github.com/floriankarsten/space-grotesk) (SIL Open Font License 1.1) dibundel di `src/fonts/`.

## Cara kerja

File markdown di vault tetap satu-satunya sumber data: daily note dan satu file list (default `Tasks.md`). Setiap perubahan hanya menulis ulang baris yang dimaksud (line ending dipertahankan, dan ditolak kalau baris itu sudah berubah di Obsidian). Tidak ada database atau file metadata lain.

Tampilan widget, dari atas ke bawah:

- **Bar atas** — `obsitask.` di kiri, tombol Settings dan Close di kanan. Seluruh bar (dan baris judul) dipakai untuk menggeser widget.
- **Judul** — tanggal lengkap di Today ("Tuesday, November 17"), "Upcoming" dengan rentang tanggal di kanan ("Nov 18 – 24"), atau "All lists" dengan jumlah task belum selesai ("13 open"). Ikon kecil di kanan judul membuka daily note hari ini (atau `Tasks.md` di tab All) di Obsidian, dan membuatnya kalau belum ada.
- **Tab** Today / Upcoming / All dengan garis bawah aksen (tanpa garis di bawah baris tab). Today diberi badge jumlah task belum selesai (overdue + hari ini).
- Di bawahnya dua **kartu** (sudut 14px, 10px dari tepi kiri/kanan/bawah panel, 8px di antaranya): **kartu task** (bar tambah task di atas, lalu daftar) dan **kartu Notes**. Judul, tab, dan strip 7 hari di Upcoming ada langsung di panel, di luar kartu. Celah 8px di antara kedua kartu adalah pegangan untuk mengubah tinggi Notes (lihat Notes di bawah).

Isi tiap tab:

- **Today**
  - **overdue** (oranye) — task belum selesai dengan deadline sebelum hari ini, dari `Tasks.md` dan dari daily note hari-hari sebelumnya. Bisa dilipat.
  - **today** — task dengan deadline hari ini dari `Tasks.md` dan daily note lain, plus *semua* task di daily note hari ini.
  - **done today** — task yang dicentang hari ini (`✅` hari ini), dan task selesai di daily note hari ini. Terlipat secara default.
- **Upcoming** — task belum selesai dengan deadline besok sampai N hari ke depan (default 7, "Upcoming days" di Settings), dikelompokkan per tanggal ("tomorrow · wed", "thu · nov 20"). Di atasnya ada strip 7 hari (mulai besok; kotak harinya berwarna kartu): huruf hari, tanggal, dan batang yang tingginya sesuai jumlah task; hari kosong dibuat redup. Klik satu hari = hanya task hari itu; klik lagi = semua. Hari di luar "Upcoming days" tidak bisa dipilih.
- **All** — semua list di `Tasks.md`, semuanya di dalam satu kartu (lihat di bawah).

Judul grup memakai huruf mono kecil dengan jumlahnya di kanan. Task yang terpilih ke sebuah grup selalu dibawa bersama subtask-nya; subtask mengikuti tanggal induknya dan menjorok 28px.

Tiap baris task: checkbox lingkaran 18px (garisnya berwarna sesuai prioritas: high oranye, medium kuning, low biru, tanpa prioritas abu-abu; selesai = terisi aksen dengan centang; dibatalkan `[-]` = abu-abu dengan strip), judul, lalu keterangan mono kecil: jam di depan teks (`- [ ] 15:00 Rapat`), deadline ("2d late · Nov 15" untuk yang terlambat, atau "tomorrow" / "Nov 18"), daily note asal ("from Nov 16"), dan nama list (di Today / Upcoming). Di bawah setiap task ada garis tipis yang dimulai sejajar teks.

- **Quick-add** (bar "› Add a task   ~list  !prio  @date" di bagian atas kartu task, di Today dan Upcoming; di All tiap list punya tombol `+` sendiri) — Enter atau tombol **+** di ujung kanan bar (kotak aksen 28px) menambah task. Task baru selalu masuk ke `Tasks.md`, di list default (default `Inbox`, bisa diatur):
  - dari Today: dengan `📅` hari ini;
  - dari Upcoming dan All: tanpa deadline.
  - Token: `!high` / `!med` / `!low` untuk prioritas, `@today` / `@tomorrow` / `@YYYY-MM-DD` untuk deadline, `~list` untuk list. Token yang dikenali diwarnai seperti chip saat diketik (@tanggal biru, !prioritas oranye, ~list ungu); input-nya tetap input teks biasa (caret, seleksi, copy-paste, undo).
  - Mengetik `~` memunculkan daftar list yang cocok beserta jumlah task terbukanya, membuka ke bawah di bawah bar; ↑/↓ memilih, Tab memasukkan, Esc menutup.
  - Di bawah bar ada pratinjau hasilnya, mis. "→ Kuliah · High · Wed, Nov 18", atau peringatan kalau list tidak ada.
  - Tombol bendera dan kalender kecil di bar tetap ada (pilihan tombol menang atas token). Di widget yang lebih sempit dari 380px, label tanggal di samping ikon kalender disembunyikan supaya placeholder tetap utuh; ikonnya tetap berwarna aksen dan tanggalnya ada di pratinjau. Kalau task baru tidak terlihat di tab yang sedang dibuka, muncul pesan "Added to …".
- **Centang** lewat checkbox. `✅ YYYY-MM-DD` ditambahkan saat dicentang dan dihapus saat dibatalkan.
- **Edit**: klik judul untuk mengubah teks (Enter simpan, Esc batal; token quick-add juga berlaku). Tombol `⋯` (muncul saat baris disorot) atau klik kanan membuka menu prioritas, deadline, Move to list, dan hapus. Menghapus task ikut menghapus subtask-nya, dan bisa di-Undo beberapa detik.
- Semua perubahan dari tab mana pun ditulis ke file asal task itu (daily note lama, daily note hari ini, atau `Tasks.md`), dengan pengaman yang sama.
- **Metadata** memakai format emoji plugin Obsidian Tasks di akhir baris: `⏫` high, `🔼` medium, `🔽` low, `📅 YYYY-MM-DD` deadline, `✅ YYYY-MM-DD` selesai. Field Tasks lain (`➕`, `🛫`, `⏳`, …) dan block id dibiarkan utuh.
- **Urutan tampil**: belum selesai dulu, lalu prioritas, lalu deadline; subtask tetap di bawah induknya. Urutan baris di file tidak pernah diubah.
- **Daily note yang dipindai**: hari ini, `scan_days` hari ke belakang ("Look-back days", default 30, maksimum 365, 0 = mati), dan N hari ke depan untuk Upcoming. Hasil parse tiap file (daily note dan `Tasks.md`) di-cache berdasarkan waktu modifikasi + ukuran, jadi polling 2 detik hanya mengecek metadata file.

### List permanen (`Tasks.md`, tab All)

- Setiap heading `## Nama` adalah satu list, sesuai urutan di file. `###` dan lebih dalam tetap bagian list di atasnya. `#` mengakhiri list; task sesudahnya, juga task sebelum heading `##` pertama, masuk Inbox. Heading dengan nama sama digabung. Heading dan task di dalam code block diabaikan.
- Format baris dan metadata sama persis dengan di daily note.
- Tab All menampilkan semua list di dalam satu kartu. Tiap list bisa dilipat (chevron, nama, jumlah task belum selesai); list yang terbuka diberi latar tipis. Tombol `+` di kepala list (ikon aksen tanpa kotak, area klik ±30px, latar tipis saat hover) membuka input "Add to …" untuk list itu (Esc atau klik di luar menutupnya). Task tanpa deadline juga ada di sini.
- Task selesai dan dibatalkan ada di grup **Completed N** di bagian bawah tiap list (terlipat secara default; status buka/tutupnya diingat per list), dicoret, dengan tanggal selesai dari `✅` di kanan ("Today", "Yesterday", "Nov 15"). List tanpa task selesai tidak punya grup ini. Subtask selesai yang induknya belum selesai tetap tampil di bawah induknya.
- List default selalu tampil walau heading-nya belum ada; heading-nya dibuat di akhir file saat task pertama masuk. `Tasks.md` dibuat (dengan `## Inbox`) kalau belum ada.
- **Token `~list`** tidak peka huruf besar/kecil dan boleh awalan unik (`~kul` → Kuliah). Kalau tidak ada list yang cocok, task tidak disimpan dan muncul pesan "No list named …". List baru tidak dibuat dari widget: membuat, mengganti nama, dan menghapus list dilakukan di Obsidian dengan mengedit heading.
- **Move to list** (menu `⋯`) memindahkan task beserta subtask-nya ke akhir list lain, dari `Tasks.md` maupun dari daily note. Antar file urutannya: cek baris di file asal → tulis ke `Tasks.md` → hapus dari file asal (dicek ulang). Kalau langkah terakhir gagal karena file asal berubah, task dibiarkan ada di dua tempat (tidak hilang) dan widget memberi tahu.
- Mengubah list lewat edit judul (`~list` di judul) ditolak; pakai Move to list.

### Lainnya

- **Notes** — selalu isi di bawah heading `## Notes` di daily note hari ini, di tab mana pun. Kartunya berisi header (ikon pensil, judul "Notes", chevron untuk melipat; di kanan "saved 12:41") dan kotak tulis polos. Status lipatnya sama untuk semua tab dan diingat. Disimpan otomatis ±0,7 detik setelah berhenti mengetik. Heading ditambahkan di akhir file kalau belum ada; bagian lain file tidak disentuh.
- **Tinggi Notes bisa diubah**: tarik celah di antara kartu task dan kartu Notes ke atas/bawah (kursor berubah jadi resize; garis tipis muncul saat hover, saat ditarik, dan saat difokuskan). Pegangannya juga bisa difokuskan dengan Tab lalu diatur dengan panah atas (lebih tinggi) / bawah (lebih pendek), 8px per tekan, 32px dengan Shift. Klik ganda = kembali ke tinggi bawaan (150px).
  - Batas: kartu Notes minimal setinggi header + 2 baris teks; kartu task minimal ±120px. Kalau widget dikecilkan, tinggi Notes yang dipakai dijepit supaya batas itu terpenuhi, tapi nilai yang disimpan tidak berubah — saat widget dibesarkan lagi, tinggi pilihanmu kembali. Kalau widget terlalu pendek untuk keduanya (mis. 280×370 di tab Upcoming, karena ada strip 7 hari), Notes tetap di batas minimalnya dan kartu task yang mengecil; lipat Notes untuk memberi seluruh ruang ke daftar task.
  - Tingginya disimpan di `config.json` (`notes_height`, px CSS) dan sama di semua tab. Saat Notes dilipat, pegangannya disembunyikan.
- File dibaca ulang tiap 2 detik, jadi perubahan dari Obsidian langsung muncul.
- Always on top diatur di Settings > General (tombol pin di widget sudah tidak ada). Posisi dan ukuran widget diingat.

### Settings dan tema

- Tombol roda gigi membuka **window Settings** terpisah, atau memfokuskannya kalau sudah terbuka. Hanya bisa ada satu window Settings: penjagaannya di backend (`open_settings` mengecek dan membuat window di bawah satu kunci), jadi klik berkali-kali dengan cepat pun tidak membuka dua. Window Settings selalu dibuka di tengah dengan ukuran 720×640 (ukurannya tidak diingat). Setiap perubahan langsung disimpan ke `config.json` dan langsung terlihat di widget — tidak ada tombol Save. Setup pertama kali (pilih vault) tetap di dalam widget.
- Navigasi di sisi kiri (`obsitask. settings` di atas, versi app di bawah); item aktif diberi latar tint aksen dan garis aksen kecil. Tiap halaman punya judul dan subjudul.
  - **General** — zoom widget 80–150%, **Widget opacity** 0–100% (default 95%; lihat "Opacity" di bawah), always on top.
  - **Vault** — folder vault (Browse), folder dan format daily note, heading task dan Notes, file list; tombol "Detect from Obsidian" menyalin folder + format dari plugin Daily notes. Baris yang bermasalah diberi peringatan (folder tidak ada, bukan vault, format tanpa tahun/bulan/hari); vault yang tidak ada tidak disimpan.
  - **Tasks** — sembunyikan task selesai (di Today dan Upcoming), list default, Upcoming days, look-back days.
  - **Themes** — Appearance (System / Light / Dark; System mengikuti mode terang/gelap Windows saat itu juga) sebagai segmented control di kanan judul, lalu grid 3 kolom kartu tema: pratinjau mini (latar, tiga task dengan lingkaran warna prioritas, garis aksen), nama, dan varian yang tersedia ("dark · light" / "dark"). Kartu terpilih diberi bingkai aksen dan lencana centang. Tema yang hanya punya satu varian selalu memakai varian itu. Window Settings sendiri ikut memakai tema yang dipilih. Kredit Terax di bawah grid.
  - **About** — versi, lokasi config, tombol buka folder config, kredit.
- **Opacity** memudarkan *semua* latar widget dengan nilai yang sama: panel, kartu task dan Notes, kotak hari di strip 7 hari, kartu list yang terbuka, bar quick-add, kotak Notes, popover/menu ⋯, daftar saran `~list`, hover, tint pilihan, badge Today, chip token, toast, dan latar input. Caranya: setiap latar memakai variabel `--panel` / `--well` / `--f-*` di `src/theme.css`, yaitu warna tema yang alpha-nya dikali `--opacity` lewat `color-mix` — jadi berlaku untuk semua tema dan mode, tanpa CSS `opacity` pada pembungkus. Di 0% semua latar benar-benar tembus pandang. Yang tidak memudar: teks, ikon, checkbox (garis dan isinya), garis bawah tab, tombol aksen, dan scrollbar. Garis tipis (bingkai panel dan kartu, pemisah task) juga tetap terlihat supaya bentuk widget masih kebaca. Di bawah 80% angka badge Today memakai warna teks biasa karena latar aksennya ikut memudar. Lapisan yang menumpuk (kartu di atas panel, kolom di atas kartu) tampak sedikit lebih pekat daripada panel di nilai menengah, karena dua lapis semi-transparan bertumpuk (mis. 40% + 40% ≈ 64%). Window Settings sendiri tidak ikut transparan. Nilai di `config.json` di luar 0–100 (juga negatif atau pecahan) dijepit ke batasnya saat dibaca.
- Penyimpanan dari Settings dan dari widget hanya mengubah field yang disentuh (dibaca ulang dari disk dan dikunci), jadi dua window tidak saling menimpa.
- **Font**: judul Space Grotesk 600 (dibundel), teks dan judul task Inter (dipanggil lewat nama dari font Windows; cadangannya Segoe UI Variable), label kecil, judul grup, tanggal, jumlah, dan token "Hack Nerd Font" (lewat nama; cadangannya Consolas).
- **Tema** dipasang lewat `data-theme` dan `data-mode` di `<html>`. Semua warna di CSS lewat variabel (`src/theme.css`); data tema ada di `src/themes.js`.
- **Default** bergaya Obsidian, hitam + ungu. Dark: panel `#181818`, kartu (task, Notes, kartu tema di Settings) `#2a2a2a` dengan garis `rgba(218,218,218,0.06)`, kolom di dalam kartu (bar tambah task, kotak tulis Notes) `#333333`, popover/menu `#3a3a3a`, sidebar Settings `#141414`, teks `#dadada` / redup `#a3a3a3` / samar `#949494`, placeholder `#a0a0a0`, garis antar task `rgba(218,218,218,0.07)`, aksen `#8a6cef` (teks/ikon di atasnya `#121212`, teks aksen `#ab94f7`), prioritas `#ff8a5c` / `#f2c14e` / `#5aa9ff` / tanpa `#6e6e6e`, overdue `#ff8a5c`. Light: panel `#f2f2f2`, kartu `#ffffff` dengan garis `rgba(34,34,34,0.08)`, kolom `#f2f2f2`, popover `#ffffff`, sidebar Settings `#e9e9e9`, teks `#222222` / `#5c5c5c` / `#6b6b6b`, aksen `#7a5af0` (ikon di atasnya putih), prioritas `#c2410c` / `#a16207` / `#1d4ed8` / tanpa `#8a8a8a`.
- Tema lain memakai **nilai warna dari [Terax](https://github.com/crynta/terax-ai)** (Apache License 2.0); hanya nilai warnanya yang diambil, tanpa kode. Pemetaannya: background → panel, card → kartu task/Notes, popover, dan kartu tema di Settings, cardForeground → teks, mutedForeground → teks redup, border → garis, secondary → kolom di dalam kartu (bar tambah task, kotak Notes), accent → hover dan latar list terbuka, primary → aksen (checkbox, tab, fokus), destructive → overdue/toast error, terminal ansi[1]/[3]/[4] → prioritas high/medium/low, ansi[6] → tag, terminal selection → seleksi teks.
- **Kontras**: token tema Terax yang di bawah WCAG (teks 4.5:1, kotak prioritas dan ikon 3:1) digeser sedikit ke arah warna teks tema itu sampai lolos. Kontras diukur terhadap panel, kolom, dan kartu sekaligus (yang terburuk); daftar token yang diubah tercatat di `adjusted` pada `themes.js`. Default memakai nilai di atas apa adanya.

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
  fonts/              Space Grotesk (+ lisensi OFL)
  main.js             buka index.html langsung di browser = mode contoh data
  style.css           tata letak widget; semua warna lewat variabel
  theme.css           token warna, warna turunan, font, opacity (dipakai widget dan Settings)
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
- Efek blur ke desktop (acrylic/mica) dan gambar latar. Panel hanya bisa diatur opacity-nya.
- Membuat atau mengedit tema sendiri dari widget, dan shortcut keyboard yang bisa diatur.
- Tray icon dan autostart saat Windows menyala.

Untuk mencoba terhadap vault percobaan tanpa menyentuh config asli, set `OBSITASK_CONFIG` ke path file config lain sebelum menjalankan.
