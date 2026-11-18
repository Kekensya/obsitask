# Development notes

Technical details behind ObsiTask. For using the app, see the [README](../README.md).

Rust + Tauri 2. The frontend is plain HTML/CSS/JS (no bundler, no npm) using `window.__TAURI__`.

## Build

Prerequisites: [Rust](https://rustup.rs), Microsoft C++ Build Tools, and WebView2 (included in current Windows 10/11).

```powershell
cargo install tauri-cli --version "^2"

cd src-tauri
cargo tauri dev      # run in development
cargo tauri build    # .msi and -setup.exe in src-tauri/target/release/bundle/
cargo test           # unit tests (parser, writer, config)
```

To try the app against a test vault without touching your real config, set `OBSITASK_CONFIG` to the path of another config file before running. The normal config lives at `%APPDATA%\com.kekensya.obsitask\config.json`.

The app uses a strict Content Security Policy (`app.security.csp` in `tauri.conf.json`): only local scripts, styles, fonts and Tauri IPC. Inline `style` attributes and the `<style>` element that `themes.js` injects need `'unsafe-inline'` for styles, so `dangerousDisableAssetCspModification` is set for `style-src` (otherwise Tauri adds a nonce, which makes browsers ignore `'unsafe-inline'`). Plain `cargo tauri dev` serves `src/` from the CLI's dev server, which does not send the CSP; use `cargo tauri dev --no-dev-server` to test with the CSP applied.

Opening `src/index.html` or `src/settings.html` directly in a browser runs them with built-in sample data (a mock of the Tauri commands), which is handy for working on the layout.

## Code layout

```
src/                  frontend
  index.html          widget (+ first-run setup)
  main.js             widget logic; mock data when opened in a browser
  style.css           widget layout; all colors via CSS variables
  theme.css           color tokens, derived colors, fonts, opacity (shared by widget and Settings)
  themes.js           theme data (generated) and applyTheme()
  settings.html       Settings window (settings.js, settings.css)
  fonts/              Space Grotesk (+ OFL license)
src-tauri/
  src/tasks.rs        task/notes parser and writer (pure logic, unit tested)
  src/scan.rs         parse cache per file (mtime + size): daily notes and Tasks.md
  src/config.rs       config + Obsidian date-format conversion
  src/lib.rs          Tauri commands
  tauri.conf.json     window and bundle settings
docs/
  theme-contrast.md   color/contrast audit of every theme variant (with screenshots)
  README.id.md        Indonesian README (more detailed)
```

## Data model

- The Markdown files in the vault are the only source of truth: the daily notes and one list file (default `Tasks.md`). There is no database and no metadata file.
- Every change rewrites only the affected line(s). Line endings are preserved, and a write is refused if that line has changed in Obsidian since it was read.
- Metadata uses the emoji format of the Obsidian Tasks plugin at the end of the line: `⏫` high, `🔼` medium, `🔽` low, `📅 YYYY-MM-DD` due, `✅ YYYY-MM-DD` done. Other Tasks fields (`➕`, `🛫`, `⏳`, …) and block ids are left untouched. `🔺` / `⏬` are kept as they are but not managed.
- In `Tasks.md`, every `## Heading` is a list, in file order. `###` and deeper belong to the list above; `#` ends a list. Tasks before the first `##` (or after a `#`) go to Inbox. Headings with the same name are merged; headings and tasks inside code blocks are ignored.
- Move to list across files: verify the line in the source file → write to `Tasks.md` → remove from the source (re-checked). If the last step fails because the source changed, the task is left in both places rather than lost, and the widget says so.
- Notes are the content under `## Notes` in today's daily note; the heading is appended if missing, and the rest of the file is never touched.

## Polling and caching

- Files are re-read every 2 seconds, so edits made in Obsidian show up almost immediately.
- Scanned daily notes: today, `scan_days` days back ("Look-back days", default 30, max 365, 0 = off), and the "Upcoming days" ahead.
- The parse result of every file is cached by modification time + size, so a poll usually only checks file metadata.
- Saves from the widget and from Settings change only the fields they touch (re-read from disk under a lock), so the two windows never overwrite each other.
- Only one Settings window can exist: `open_settings` checks and creates it under a single lock.

## Themes

- Themes are applied with `data-theme` and `data-mode` on `<html>`. All CSS colors go through variables in `src/theme.css`; theme data is in `src/themes.js`, which is generated (do not edit by hand).
- **Default** is ObsiTask's own Obsidian-like palette (black + purple). The other themes use color values from [Terax](https://github.com/crynta/terax-ai) (Apache License 2.0), mapped to ObsiTask tokens:

  | Terax | ObsiTask |
  |---|---|
  | background | panel |
  | card | task / Notes card, theme cards in Settings |
  | cardForeground | main text |
  | mutedForeground | dim text (faint = dim at 85% over the card) |
  | border | card / panel border |
  | secondary | fields inside the card (quick-add bar, Notes box) |
  | accent | hover (as a tint over the card) |
  | primary / primaryForeground | accent (done checkbox, tab underline, Today badge, + button, focus) / text on it |
  | destructive | overdue, error toast |
  | terminal ansi[1] / [3] / [4] | priority high / medium / low |
  | terminal ansi[6] | tag |
  | terminal selection | text selection |

- Layer order in every theme: dark = panel < card < field < popover (lighter each step); light = card lightest, panel and fields slightly darker. Terax variants whose `card` is darker than `background` (9 of them) are swapped so the panel stays the darkest layer.
- **Contrast**: tokens below WCAG (small text 4.5:1; large text, priority circles, tab line, icons 3:1) are shifted in lightness as little as possible until they pass, measured on the backgrounds actually used. Priority colors must also stay distinguishable from each other, including under red-green color-blindness simulation. Full tables per variant are in [theme-contrast.md](theme-contrast.md); adjusted tokens are listed in `adjusted` in `themes.js`.

## Opacity

- Only the panel uses its base color (`--bg`, alpha = opacity). The card is drawn as a thin tint layer over the panel, and fields (quick-add bar, Notes box, inputs) as a tint over the card; those tint alphas are multiplied by the opacity.
- The tint color and alpha are computed per variant by the theme generator (`cardTint`/`cardAlpha`, `wellTint`/`wellAlpha` in `themes.js`) so that at 100% the result is exactly the card/field hex value (accounting for WebView2's 8-bit premultiplied compositing), and at any opacity the card is never darker or murkier than the panel.
- Text, icons, checkboxes, accents and the scrollbar never fade. Thin borders stay visible so the widget's shape stays readable. At 0% all backgrounds are fully transparent. The Settings window is always opaque.
- Config values outside 0–100 are clamped when read.

## Scrollbar

Lists, popovers and the Notes box use a scrollbar inside the card: a 6px rounded thumb (a 14px transparent track with a 4px transparent border), 4px from the right edge, stopping 10px before the rounded corners. The thumb is always visible (dimmed) because WebView2 does not repaint the scrollbar thumb when a parent's `:hover` changes.

## Not implemented (on purpose)

- Tasks with due dates in notes other than daily notes and `Tasks.md`, and daily notes outside the look-back / upcoming range, are not scanned.
- Subtasks with a different due date than their parent stay in the parent's group.
- Opening or adding to daily notes other than today's from the widget.
- UI to create, rename or delete lists (edit the `##` headings in Obsidian).
- Moving tasks from `Tasks.md` back into a daily note.
- Recurring tasks, reminders, pomodoro, custom filters, tag view, archiving, drag-and-drop reordering, sync.
- Blur (acrylic/mica) and background images; custom theme editing; configurable shortcuts; tray icon and autostart.
