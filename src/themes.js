"use strict";
/*
 * Tema warna ObsiTask.
 *
 * "Default" adalah tampilan bawaan ObsiTask (gaya Obsidian, hitam + ungu). Tema lain memakai nilai warna dari
 * Terax (https://github.com/crynta/terax-ai, src/modules/theme/themes, lisensi
 * Apache-2.0) — hanya nilai warnanya yang diambil, dipetakan ke token ObsiTask:
 *
 *   background  -> panel                        card      -> kartu task/notes, popover, kartu Settings
 *   text        <- cardForeground               muted     <- mutedForeground
 *   border      -> garis kartu / panel          secondary -> kolom di dalam kartu: bar tambah task, kotak Notes
 *   accent      -> hover, latar list terbuka          primary   -> aksen: checkbox, tab, fokus
 *   onPrimary   <- primaryForeground            danger    <- destructive (overdue, toast error)
 *   high/medium/low <- terminal ansi[1]/[3]/[4] tag       <- terminal ansi[6]
 *   selection   <- terminal selection
 *
 * Token opsional (hanya Default): faint, placeholder, separator (garis antar
 * task), raised (popover), primaryText, primarySoft, ring, sidebar. Kalau tidak ada, theme.css menurunkannya dari token lain.
 *
 * Kontras: token yang di bawah WCAG (teks 4.5:1, kotak prioritas dan ikon 3:1,
 * diukur di atas panel, kolom bar tambah/Notes, dan kartu — yang terburuk)
 * digeser sedikit ke arah warna teks tema itu sampai lolos; daftar token yang
 * diubah ada di `adjusted`. Default tidak diubah (nilainya sudah lolos).
 */

const OBSI_THEMES = [
  {
    id: "default",
    name: "Default",
    variants: {
      dark: {
        background: "#181818",
        card: "#2a2a2a",
        text: "#dadada",
        muted: "#a3a3a3",
        faint: "#949494",
        placeholder: "#a0a0a0",
        border: "rgba(218, 218, 218, 0.06)",
        separator: "rgba(218, 218, 218, 0.07)",
        secondary: "#333333",
        accent: "rgba(218, 218, 218, 0.035)",
        primary: "#8a6cef",
        onPrimary: "#121212",
        primaryText: "#ab94f7",
        primarySoft: "rgba(138, 108, 239, 0.16)",
        danger: "#ff8a5c",
        high: "#ff8a5c",
        medium: "#f2c14e",
        low: "#5aa9ff",
        ring: "#6e6e6e",
        tag: "#ab94f7",
        selection: "rgba(138, 108, 239, 0.32)",
        raised: "#3a3a3a",
        sidebar: "#141414"
      },
      light: {
        background: "#f2f2f2",
        card: "#ffffff",
        text: "#222222",
        muted: "#5c5c5c",
        faint: "#6b6b6b",
        border: "rgba(34, 34, 34, 0.08)",
        separator: "rgba(34, 34, 34, 0.08)",
        secondary: "#f2f2f2",
        accent: "rgba(34, 34, 34, 0.035)",
        primary: "#7a5af0",
        onPrimary: "#ffffff",
        primaryText: "#7a5af0",
        primarySoft: "rgba(122, 90, 240, 0.12)",
        danger: "#c2410c",
        high: "#c2410c",
        medium: "#a16207",
        low: "#1d4ed8",
        ring: "#8a8a8a",
        tag: "#7a5af0",
        selection: "rgba(122, 90, 240, 0.20)",
        raised: "#ffffff",
        sidebar: "#e9e9e9"
      }
    }
  },
  {
    id: "xcode",
    name: "Xcode",
    variants: {
      dark: {
        background: "#1c1c1e",
        card: "#2c2c2e",
        text: "#f5f5f7",
        muted: "#a3a3a8",
        border: "rgba(255,255,255,0.09)",
        secondary: "#3a3a3c",
        accent: "#3a3a3c",
        primary: "#0a84ff",
        onPrimary: "#ffffff",
        danger: "#fc7d76",
        high: "#ff453a",
        medium: "#ffd60a",
        low: "#0a84ff",
        tag: "#64d2ff",
        selection: "rgba(10,132,255,0.28)",
        adjusted: [
          "muted",
          "danger"
        ]
      },
      light: {
        background: "#ffffff",
        card: "#f5f5f7",
        text: "#1d1d1f",
        muted: "#6c6c71",
        border: "rgba(0,0,0,0.09)",
        secondary: "#f0f0f2",
        accent: "#ebebed",
        primary: "#007aff",
        onPrimary: "#ffffff",
        danger: "#c9342c",
        high: "#d70015",
        medium: "#b25000",
        low: "#0040dd",
        tag: "#0071a4",
        selection: "rgba(0,122,255,0.18)",
        adjusted: [
          "muted",
          "danger"
        ]
      }
    }
  },
  {
    id: "claude",
    name: "Claude",
    variants: {
      dark: {
        background: "#1f1e1d",
        card: "#262624",
        text: "#f5f4ee",
        muted: "#b0a89a",
        border: "rgba(245,244,238,0.10)",
        secondary: "#2a2926",
        accent: "#2f2d2a",
        primary: "#d97757",
        onPrimary: "#1f1e1d",
        danger: "#e66953",
        high: "#e5634d",
        medium: "#e8b87a",
        low: "#8fb0d9",
        tag: "#82c0bb",
        selection: "rgba(217,119,87,0.22)",
        adjusted: [
          "danger"
        ]
      },
      light: {
        background: "#faf9f5",
        card: "#ffffff",
        text: "#3d3a2f",
        muted: "#6f6c5b",
        border: "rgba(61,58,47,0.12)",
        secondary: "#f0eee6",
        accent: "#f0ede4",
        primary: "#c15f3c",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#c0392b",
        medium: "#b07a2a",
        low: "#3a6ea5",
        tag: "#2d7679",
        selection: "rgba(193,95,60,0.16)",
        adjusted: [
          "muted",
          "tag"
        ]
      }
    }
  },
  {
    id: "kanagawa",
    name: "Kanagawa",
    variants: {
      dark: {
        background: "#1f1f28",
        card: "#16161d",
        text: "#dcd7ba",
        muted: "#a09f96",
        border: "rgba(220,215,186,0.08)",
        secondary: "#2a2a37",
        accent: "#363646",
        primary: "#7e9cd8",
        onPrimary: "#1f1f28",
        danger: "#cd7c73",
        high: "#c54c4d",
        medium: "#c0a36e",
        low: "#7e9cd8",
        tag: "#739a8d",
        selection: "rgba(45,79,103,0.45)",
        adjusted: [
          "danger",
          "tag",
          "high"
        ]
      },
      light: {
        background: "#f2ecbc",
        card: "#e5ddb0",
        text: "#545464",
        muted: "#60606a",
        border: "rgba(84,84,100,0.14)",
        secondary: "#e5ddb0",
        accent: "#dcd5ac",
        primary: "#4d699b",
        onPrimary: "#f2ecbc",
        danger: "#97485a",
        high: "#c84053",
        medium: "#77713f",
        low: "#4d699b",
        tag: "#56636a",
        selection: "rgba(220,213,172,0.7)",
        adjusted: [
          "muted",
          "danger",
          "tag"
        ]
      }
    }
  },
  {
    id: "kanagawa-dragon",
    name: "Kanagawa Dragon",
    variants: {
      dark: {
        background: "#181616",
        card: "#0d0c0c",
        text: "#c5c9c5",
        muted: "#a6a69c",
        border: "rgba(197,201,197,0.08)",
        secondary: "#282727",
        accent: "#393836",
        primary: "#8ba4b0",
        onPrimary: "#181616",
        danger: "#c47b75",
        high: "#c4746e",
        medium: "#c4b28a",
        low: "#8ba4b0",
        tag: "#8ea4a2",
        selection: "rgba(45,79,103,0.45)",
        adjusted: [
          "danger"
        ]
      }
    }
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    variants: {
      dark: {
        background: "#1a1b26",
        card: "#1f2030",
        text: "#c0caf5",
        muted: "#9aa5ce",
        border: "rgba(255,255,255,0.08)",
        secondary: "#292e42",
        accent: "#292e42",
        primary: "#c0caf5",
        onPrimary: "#1a1b26",
        danger: "#f7768e",
        high: "#f7768e",
        medium: "#e0af68",
        low: "#7aa2f7",
        tag: "#7dcfff",
        selection: "rgba(122,162,247,0.25)"
      }
    }
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    variants: {
      dark: {
        background: "#1e1e2e",
        card: "#181825",
        text: "#cdd6f4",
        muted: "#a6adc8",
        border: "rgba(205,214,244,0.10)",
        secondary: "#313244",
        accent: "#313244",
        primary: "#cba6f7",
        onPrimary: "#1e1e2e",
        danger: "#f38ba8",
        high: "#f38ba8",
        medium: "#f9e2af",
        low: "#89b4fa",
        tag: "#94e2d5",
        selection: "rgba(203,166,247,0.25)"
      },
      light: {
        background: "#eff1f5",
        card: "#ffffff",
        text: "#4c4f69",
        muted: "#64677e",
        border: "rgba(76,79,105,0.12)",
        secondary: "#e6e9ef",
        accent: "#e6e9ef",
        primary: "#8839ef",
        onPrimary: "#eff1f5",
        danger: "#cf103a",
        high: "#d20f39",
        medium: "#b07a35",
        low: "#1e66f5",
        tag: "#327181",
        selection: "rgba(136,57,239,0.20)",
        adjusted: [
          "muted",
          "danger",
          "tag",
          "medium"
        ]
      }
    }
  },
  {
    id: "rose-pine",
    name: "Rosé Pine",
    variants: {
      dark: {
        background: "#191724",
        card: "#1f1d2e",
        text: "#e0def4",
        muted: "#908caa",
        border: "rgba(224,222,244,0.10)",
        secondary: "#26233a",
        accent: "#26233a",
        primary: "#c4a7e7",
        onPrimary: "#191724",
        danger: "#eb6f92",
        high: "#eb6f92",
        medium: "#f6c177",
        low: "#9ccfd8",
        tag: "#ebbcba",
        selection: "rgba(196,167,231,0.25)"
      },
      light: {
        background: "#faf4ed",
        card: "#fffaf3",
        text: "#575279",
        muted: "#6b6688",
        border: "rgba(87,82,121,0.12)",
        secondary: "#f2e9e1",
        accent: "#f2e9e1",
        primary: "#907aa9",
        onPrimary: "#faf4ed",
        danger: "#895b7a",
        high: "#b4637a",
        medium: "#a97c52",
        low: "#568f9c",
        tag: "#7d607b",
        selection: "rgba(144,122,169,0.22)",
        adjusted: [
          "muted",
          "danger",
          "tag",
          "medium",
          "low"
        ]
      }
    }
  },
  {
    id: "everforest",
    name: "Everforest",
    variants: {
      dark: {
        background: "#2d353b",
        card: "#272e33",
        text: "#d3c6aa",
        muted: "#a0aba1",
        border: "rgba(211,198,170,0.08)",
        secondary: "#343f44",
        accent: "#3d484d",
        primary: "#a7c080",
        onPrimary: "#2d353b",
        danger: "#e0948d",
        high: "#e67e80",
        medium: "#dbbc7f",
        low: "#7fbbb3",
        tag: "#83c092",
        selection: "rgba(76,55,67,0.6)",
        adjusted: [
          "muted",
          "danger"
        ]
      },
      light: {
        background: "#fdf6e3",
        card: "#f4f0d9",
        text: "#5c6a72",
        muted: "#5e6c73",
        border: "rgba(92,106,114,0.12)",
        secondary: "#efebd4",
        accent: "#e6e2cc",
        primary: "#7d8f25",
        onPrimary: "#fdf6e3",
        danger: "#72676e",
        high: "#e25856",
        medium: "#9b843b",
        low: "#3f8eb9",
        tag: "#5a6c72",
        selection: "rgba(230,226,204,0.8)",
        adjusted: [
          "muted",
          "danger",
          "tag",
          "high",
          "medium",
          "low",
          "primary"
        ]
      }
    }
  },
  {
    id: "nord",
    name: "Nord",
    variants: {
      dark: {
        background: "#2e3440",
        card: "#3b4252",
        text: "#eceff4",
        muted: "#b3bcce",
        border: "rgba(255,255,255,0.08)",
        secondary: "#434c5e",
        accent: "#434c5e",
        primary: "#88c0d0",
        onPrimary: "#2e3440",
        danger: "#d9b3ba",
        high: "#cb868e",
        medium: "#ebcb8b",
        low: "#81a1c1",
        tag: "#90c4d3",
        selection: "rgba(136,192,208,0.25)",
        adjusted: [
          "muted",
          "danger",
          "tag",
          "high"
        ]
      },
      light: {
        background: "#eceff4",
        card: "#ffffff",
        text: "#2e3440",
        muted: "#4c566a",
        border: "rgba(46,52,64,0.12)",
        secondary: "#e5e9f0",
        accent: "#e5e9f0",
        primary: "#5e81ac",
        onPrimary: "#eceff4",
        danger: "#99555f",
        high: "#bf616a",
        medium: "#908367",
        low: "#6d87a2",
        tag: "#526c7a",
        selection: "rgba(94,129,172,0.25)",
        adjusted: [
          "danger",
          "tag",
          "medium",
          "low"
        ]
      }
    }
  },
  {
    id: "gruvbox",
    name: "Gruvbox",
    variants: {
      dark: {
        background: "#282828",
        card: "#32302f",
        text: "#ebdbb2",
        muted: "#afa089",
        border: "rgba(235,219,178,0.10)",
        secondary: "#3c3836",
        accent: "#3c3836",
        primary: "#fabd2f",
        onPrimary: "#282828",
        danger: "#f58064",
        high: "#d65f4d",
        medium: "#d79921",
        low: "#528c8b",
        tag: "#87ac7b",
        selection: "rgba(250,189,47,0.25)",
        adjusted: [
          "muted",
          "danger",
          "tag",
          "high",
          "low"
        ]
      },
      light: {
        background: "#fbf1c7",
        card: "#f9f5d7",
        text: "#3c3836",
        muted: "#695f56",
        border: "rgba(60,56,54,0.12)",
        secondary: "#ebdbb2",
        accent: "#ebdbb2",
        primary: "#a97017",
        onPrimary: "#fbf1c7",
        danger: "#9d0006",
        high: "#9d0006",
        medium: "#a97017",
        low: "#076678",
        tag: "#406a4f",
        selection: "rgba(181,118,20,0.22)",
        adjusted: [
          "muted",
          "tag",
          "medium",
          "primary"
        ]
      }
    }
  },
  {
    id: "dracula",
    name: "Dracula",
    variants: {
      dark: {
        background: "#282a36",
        card: "#21222c",
        text: "#f8f8f2",
        muted: "#a9acc0",
        border: "rgba(248,248,242,0.08)",
        secondary: "#343746",
        accent: "#44475a",
        primary: "#bd93f9",
        onPrimary: "#282a36",
        danger: "#fe7674",
        high: "#ff5555",
        medium: "#f1fa8c",
        low: "#bd93f9",
        tag: "#8be9fd",
        selection: "rgba(68,71,90,0.7)",
        adjusted: [
          "danger"
        ]
      }
    }
  },
  {
    id: "solarized",
    name: "Solarized",
    variants: {
      dark: {
        background: "#002b36",
        card: "#073642",
        text: "#93a1a1",
        muted: "#8c9b9c",
        border: "rgba(131,148,150,0.12)",
        secondary: "#073642",
        accent: "#0a4754",
        primary: "#268bd2",
        onPrimary: "#002b36",
        danger: "#999898",
        high: "#c35856",
        medium: "#b58900",
        low: "#268bd2",
        tag: "#71a19e",
        selection: "rgba(7,54,66,0.9)",
        adjusted: [
          "muted",
          "danger",
          "tag",
          "high"
        ]
      },
      light: {
        background: "#fdf6e3",
        card: "#eee8d5",
        text: "#566c73",
        muted: "#566c73",
        border: "rgba(101,123,131,0.14)",
        secondary: "#eee8d5",
        accent: "#e3ddca",
        primary: "#268bd2",
        onPrimary: "#fdf6e3",
        danger: "#b14545",
        high: "#dc322f",
        medium: "#9e821c",
        low: "#268bd2",
        tag: "#566c73",
        selection: "rgba(238,232,213,0.9)",
        adjusted: [
          "text",
          "muted",
          "danger",
          "tag",
          "medium"
        ]
      }
    }
  },
  {
    id: "tide",
    name: "Tide",
    variants: {
      dark: {
        background: "#14191c",
        card: "#1a2024",
        text: "#cdd9da",
        muted: "#93a3a4",
        border: "rgba(205,217,218,0.09)",
        secondary: "#232c30",
        accent: "#283330",
        primary: "#6cb6b0",
        onPrimary: "#14191c",
        danger: "#e07a6a",
        high: "#e07a6a",
        medium: "#d9bd80",
        low: "#6fa8c9",
        tag: "#6cb6b0",
        selection: "rgba(108,182,176,0.20)"
      },
      light: {
        background: "#f2f6f5",
        card: "#ffffff",
        text: "#2b3a39",
        muted: "#5d6c6b",
        border: "rgba(43,58,57,0.12)",
        secondary: "#e3ecea",
        accent: "#e3ecea",
        primary: "#2f7d76",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#c0392b",
        medium: "#a9802a",
        low: "#3a6ea5",
        tag: "#2e746d",
        selection: "rgba(47,125,118,0.16)",
        adjusted: [
          "muted",
          "tag"
        ]
      }
    }
  },
  {
    id: "sage",
    name: "Sage",
    variants: {
      dark: {
        background: "#1c211e",
        card: "#222824",
        text: "#d8e0d2",
        muted: "#9aa597",
        border: "rgba(216,224,210,0.09)",
        secondary: "#2a322c",
        accent: "#2d362f",
        primary: "#a7c080",
        onPrimary: "#1c211e",
        danger: "#e67e80",
        high: "#e67e80",
        medium: "#dbbc7f",
        low: "#7fbbb3",
        tag: "#83c092",
        selection: "rgba(167,192,128,0.20)"
      },
      light: {
        background: "#f4f6f0",
        card: "#ffffff",
        text: "#36422f",
        muted: "#616c5a",
        border: "rgba(54,66,47,0.12)",
        secondary: "#e6ecdd",
        accent: "#e6ecdd",
        primary: "#5a7a3f",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#c0392b",
        medium: "#a97f2a",
        low: "#3a7a6e",
        tag: "#2d746b",
        selection: "rgba(90,122,63,0.16)",
        adjusted: [
          "muted",
          "tag"
        ]
      }
    }
  },
  {
    id: "caffeine",
    name: "Caffeine",
    variants: {
      dark: {
        background: "#111111",
        card: "#191919",
        text: "#eeeeee",
        muted: "#b4b4b4",
        border: "#201e18",
        secondary: "#393028",
        accent: "#2a2a2a",
        primary: "#ffe0c2",
        onPrimary: "#081a1b",
        danger: "#e87a64",
        high: "#e06c75",
        medium: "#ffd9a0",
        low: "#8fb0d9",
        tag: "#88c0c8",
        selection: "rgba(255,224,194,0.20)",
        adjusted: [
          "danger"
        ]
      },
      light: {
        background: "#f9f9f9",
        card: "#fcfcfc",
        text: "#202020",
        muted: "#646464",
        border: "#d8d8d8",
        secondary: "#ffdfb5",
        accent: "#e8e8e8",
        primary: "#644a40",
        onPrimary: "#ffffff",
        danger: "#ae402a",
        high: "#c0392b",
        medium: "#a9762a",
        low: "#3a6ea5",
        tag: "#286f72",
        selection: "rgba(100,74,64,0.16)",
        adjusted: [
          "danger",
          "tag"
        ]
      }
    }
  }
];

const THEME_VARS = {
  background: "--bg",
  card: "--card",
  text: "--text",
  muted: "--muted",
  faint: "--faint",
  placeholder: "--placeholder",
  border: "--border",
  separator: "--sep",
  secondary: "--secondary",
  accent: "--hover",
  primary: "--primary",
  onPrimary: "--on-primary",
  primaryText: "--primary-text",
  danger: "--danger",
  high: "--p-high",
  medium: "--p-medium",
  low: "--p-low",
  tag: "--tag",
  selection: "--selection",
  raised: "--raised",
  ring: "--ring",
  primarySoft: "--primary-soft",
  sidebar: "--sidebar",
};

const findTheme = (id) => OBSI_THEMES.find((t) => t.id === id) || OBSI_THEMES[0];

/** Mode yang diminta: "light" / "dark", atau mode Windows untuk "system". */
function wantedMode(appearance) {
  if (appearance === "light" || appearance === "dark") return appearance;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Varian yang dipakai: yang diminta kalau ada, kalau tidak satu-satunya yang ada. */
function themeMode(theme, wanted) {
  if (theme.variants[wanted]) return wanted;
  return theme.variants.dark ? "dark" : "light";
}

/** "Dark only" / "Light only" / null. */
function themeOnly(theme) {
  const { dark, light } = theme.variants;
  return dark && !light ? "Dark only" : light && !dark ? "Light only" : null;
}

/** Deklarasi variabel CSS untuk satu varian (dipakai juga oleh pratinjau). */
function themeDeclarations(variant) {
  return Object.entries(THEME_VARS)
    .filter(([key]) => variant[key])
    .map(([key, name]) => `${name}: ${variant[key]};`)
    .join(" ");
}

(function injectThemeRules() {
  const rules = [];
  for (const t of OBSI_THEMES) {
    for (const [mode, variant] of Object.entries(t.variants)) {
      rules.push(`:root[data-theme="${t.id}"][data-mode="${mode}"] { ${themeDeclarations(variant)} }`);
    }
  }
  const style = document.createElement("style");
  style.id = "theme-rules";
  style.textContent = rules.join("\n");
  document.head.append(style);
})();

/** Pasang tema di <html> (data-theme + data-mode). Mengembalikan mode yang dipakai. */
function applyTheme(id, appearance) {
  const theme = findTheme(id);
  const mode = themeMode(theme, wantedMode(appearance));
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.mode = mode;
  return mode;
}

/** Panggil `fn` setiap kali mode Windows (terang/gelap) berubah. */
function onSystemModeChange(fn) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", fn);
}
