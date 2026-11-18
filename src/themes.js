"use strict";
/*
 * Tema warna ObsiTask.
 *
 * "Default" adalah tampilan bawaan ObsiTask. Tema lain memakai nilai warna dari
 * Terax (https://github.com/crynta/terax-ai, src/modules/theme/themes, lisensi
 * Apache-2.0) — hanya nilai warnanya yang diambil, dipetakan ke token ObsiTask:
 *
 *   background  -> panel (sedikit transparan)   card      -> kartu
 *   text        <- cardForeground               muted     <- mutedForeground
 *   border      -> garis kartu / panel          secondary -> kotak input, tombol bulat, segmented
 *   accent      -> sorotan baris task           primary   -> tombol hijau, checkbox, tab, fokus
 *   onPrimary   <- primaryForeground            danger    <- destructive (overdue, toast error)
 *   high/medium/low <- terminal ansi[1]/[3]/[4] tag       <- terminal ansi[6]
 *   selection   <- terminal selection
 *
 * Token opsional (hanya Default): faint, raised, primaryText, ring. Kalau tidak
 * ada, theme.css menurunkannya dari token lain.
 *
 * Kontras: token yang di bawah WCAG (teks 4.5:1, lingkaran prioritas dan ikon
 * 3:1, diukur di atas kartu) digeser sedikit ke arah warna teks tema itu sampai
 * lolos; daftar token yang diubah ada di `adjusted`. Default tidak diubah.
 */

const OBSI_THEMES = [
  {
    id: "default",
    name: "Default",
    variants: {
      dark: {
        background: "rgb(40, 38, 37)",
        card: "rgba(255, 255, 255, 0.065)",
        text: "#f3f0ea",
        muted: "#a9a39b",
        faint: "#7d7770",
        border: "rgba(255, 255, 255, 0.08)",
        secondary: "rgba(255, 255, 255, 0.065)",
        accent: "rgba(255, 255, 255, 0.05)",
        primary: "#2f9461",
        onPrimary: "#ffffff",
        primaryText: "#7fd6a6",
        danger: "#ff5f52",
        high: "#ff6b5e",
        medium: "#f0b445",
        low: "#62a8f2",
        tag: "#86c7a3",
        selection: "rgba(47, 148, 97, 0.35)",
        raised: "#2f2c2b",
        ring: "#d9d4cc"
      },
      light: {
        background: "#f3f0ea",
        card: "rgba(255, 255, 255, 0.72)",
        text: "#2a2725",
        muted: "#6c665f",
        faint: "#8a837b",
        border: "rgba(42, 39, 37, 0.12)",
        secondary: "rgba(42, 39, 37, 0.06)",
        accent: "rgba(42, 39, 37, 0.05)",
        primary: "#23794c",
        onPrimary: "#ffffff",
        primaryText: "#1d6e44",
        danger: "#c8433a",
        high: "#cc3f35",
        medium: "#a8680f",
        low: "#2b68b3",
        tag: "#20734b",
        selection: "rgba(47, 148, 97, 0.22)",
        raised: "#fbfaf7",
        ring: "#7a736b"
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
        muted: "#98989d",
        border: "rgba(255,255,255,0.09)",
        secondary: "#3a3a3c",
        accent: "#3a3a3c",
        primary: "#0a84ff",
        onPrimary: "#ffffff",
        danger: "#fe5a51",
        high: "#ff453a",
        medium: "#ffd60a",
        low: "#0a84ff",
        tag: "#64d2ff",
        selection: "rgba(10,132,255,0.28)",
        adjusted: [
          "danger"
        ]
      },
      light: {
        background: "#ffffff",
        card: "#f5f5f7",
        text: "#1d1d1f",
        muted: "#6e6e73",
        border: "rgba(0,0,0,0.09)",
        secondary: "#f0f0f2",
        accent: "#ebebed",
        primary: "#007aff",
        onPrimary: "#ffffff",
        danger: "#cd342c",
        high: "#d70015",
        medium: "#b25000",
        low: "#0040dd",
        tag: "#0071a4",
        selection: "rgba(0,122,255,0.18)",
        adjusted: [
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
        danger: "#e56650",
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
        muted: "#73705f",
        border: "rgba(61,58,47,0.12)",
        secondary: "#f0eee6",
        accent: "#f0ede4",
        primary: "#c15f3c",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#c0392b",
        medium: "#b07a2a",
        low: "#3a6ea5",
        tag: "#2a8085",
        selection: "rgba(193,95,60,0.16)"
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
        danger: "#c9615d",
        high: "#c34043",
        medium: "#c0a36e",
        low: "#7e9cd8",
        tag: "#6a9589",
        selection: "rgba(45,79,103,0.45)",
        adjusted: [
          "danger"
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
        danger: "#c4746e",
        high: "#c4746e",
        medium: "#c4b28a",
        low: "#8ba4b0",
        tag: "#8ea4a2",
        selection: "rgba(45,79,103,0.45)"
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
        muted: "#6c6f85",
        border: "rgba(76,79,105,0.12)",
        secondary: "#e6e9ef",
        accent: "#e6e9ef",
        primary: "#8839ef",
        onPrimary: "#eff1f5",
        danger: "#d20f39",
        high: "#d20f39",
        medium: "#ca8528",
        low: "#1e66f5",
        tag: "#24828d",
        selection: "rgba(136,57,239,0.20)",
        adjusted: [
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
        muted: "#74708f",
        border: "rgba(87,82,121,0.12)",
        secondary: "#f2e9e1",
        accent: "#f2e9e1",
        primary: "#907aa9",
        onPrimary: "#faf4ed",
        danger: "#a1607a",
        high: "#b4637a",
        medium: "#bb854a",
        low: "#56949f",
        tag: "#92687b",
        selection: "rgba(144,122,169,0.22)",
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
    id: "everforest",
    name: "Everforest",
    variants: {
      dark: {
        background: "#2d353b",
        card: "#272e33",
        text: "#d3c6aa",
        muted: "#9da9a0",
        border: "rgba(211,198,170,0.08)",
        secondary: "#343f44",
        accent: "#3d484d",
        primary: "#a7c080",
        onPrimary: "#2d353b",
        danger: "#e67e80",
        high: "#e67e80",
        medium: "#dbbc7f",
        low: "#7fbbb3",
        tag: "#83c092",
        selection: "rgba(76,55,67,0.6)"
      },
      light: {
        background: "#fdf6e3",
        card: "#f4f0d9",
        text: "#5c6a72",
        muted: "#616f74",
        border: "rgba(92,106,114,0.12)",
        secondary: "#efebd4",
        accent: "#e6e2cc",
        primary: "#7f9221",
        onPrimary: "#fdf6e3",
        danger: "#85656a",
        high: "#ec5755",
        medium: "#a38734",
        low: "#3b92c2",
        tag: "#577173",
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
        muted: "#a4afc4",
        border: "rgba(255,255,255,0.08)",
        secondary: "#434c5e",
        accent: "#434c5e",
        primary: "#88c0d0",
        onPrimary: "#2e3440",
        danger: "#d4a2a9",
        high: "#c67880",
        medium: "#ebcb8b",
        low: "#81a1c1",
        tag: "#88c0d0",
        selection: "rgba(136,192,208,0.25)",
        adjusted: [
          "muted",
          "danger",
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
        danger: "#b15d66",
        high: "#bf616a",
        medium: "#a3926f",
        low: "#7996b4",
        tag: "#5b7a88",
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
        muted: "#a89984",
        border: "rgba(235,219,178,0.10)",
        secondary: "#3c3836",
        accent: "#3c3836",
        primary: "#fabd2f",
        onPrimary: "#282828",
        danger: "#f76c52",
        high: "#d34c3e",
        medium: "#d79921",
        low: "#458588",
        tag: "#75a371",
        selection: "rgba(250,189,47,0.25)",
        adjusted: [
          "danger",
          "tag",
          "high"
        ]
      },
      light: {
        background: "#fbf1c7",
        card: "#f9f5d7",
        text: "#3c3836",
        muted: "#796d62",
        border: "rgba(60,56,54,0.12)",
        secondary: "#ebdbb2",
        accent: "#ebdbb2",
        primary: "#b57614",
        onPrimary: "#fbf1c7",
        danger: "#9d0006",
        high: "#9d0006",
        medium: "#b57614",
        low: "#076678",
        tag: "#427b58",
        selection: "rgba(181,118,20,0.22)",
        adjusted: [
          "muted"
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
        danger: "#ff5555",
        high: "#ff5555",
        medium: "#f1fa8c",
        low: "#bd93f9",
        tag: "#8be9fd",
        selection: "rgba(68,71,90,0.7)"
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
        muted: "#5f6e6d",
        border: "rgba(43,58,57,0.12)",
        secondary: "#e3ecea",
        accent: "#e3ecea",
        primary: "#2f7d76",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#c0392b",
        medium: "#a9802a",
        low: "#3a6ea5",
        tag: "#2f7d76",
        selection: "rgba(47,125,118,0.16)"
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
        muted: "#6b7563",
        border: "rgba(54,66,47,0.12)",
        secondary: "#e6ecdd",
        accent: "#e6ecdd",
        primary: "#5a7a3f",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#c0392b",
        medium: "#a97f2a",
        low: "#3a7a6e",
        tag: "#2a827d",
        selection: "rgba(90,122,63,0.16)",
        adjusted: [
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
        danger: "#e54d2e",
        high: "#e06c75",
        medium: "#ffd9a0",
        low: "#8fb0d9",
        tag: "#88c0c8",
        selection: "rgba(255,224,194,0.20)"
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
        danger: "#c9472c",
        high: "#c0392b",
        medium: "#a9762a",
        low: "#3a6ea5",
        tag: "#297f83",
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
  border: "--border",
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
