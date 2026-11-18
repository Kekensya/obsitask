"use strict";
/*
 * Tema warna ObsiTask. FILE INI DIBUAT OLEH GENERATOR — jangan diedit tangan.
 *
 * "Default" adalah tampilan bawaan ObsiTask (gaya Obsidian, hitam + ungu). Tema lain memakai nilai warna dari
 * Terax (https://github.com/crynta/terax-ai, src/modules/theme/themes, lisensi
 * Apache-2.0) — hanya nilai warnanya yang diambil, dipetakan ke token ObsiTask:
 *
 *   background  -> panel                        card      -> kartu task/Notes, kartu tema di Settings
 *   text        <- cardForeground               muted     <- mutedForeground
 *   border      -> garis kartu / panel          secondary -> kolom di dalam kartu: bar tambah task, kotak Notes
 *   accent      -> hover (sebagai tint di atas kartu)   primary   -> aksen: checkbox selesai, tab, badge, +, fokus
 *   onPrimary   <- primaryForeground            danger    <- destructive (overdue, toast error)
 *   high/medium/low <- terminal ansi[1]/[3]/[4] tag       <- terminal ansi[6]
 *   selection   <- terminal selection
 *
 * Urutan terang-gelap: di tema gelap panel paling gelap, kartu lebih terang,
 * kolom lebih terang lagi, popover di atasnya; di tema terang kartu paling
 * terang, panel dan kolom sedikit lebih gelap. Tema Terax yang card-nya lebih
 * gelap dari background ditukar (panel = card, kartu = background).
 *
 * Diturunkan untuk tema Terax: raised (popover), faint (= muted 85% di atas
 * kartu), placeholder (= faint), ring (abu-abu netral 3.2:1 di atas kartu).
 *
 * cardTint/cardAlpha dan wellTint/wellAlpha: kartu digambar sebagai lapisan
 * tint di atas panel, kolom sebagai tint di atas kartu, dengan alpha dikali
 * opacity widget — jadi seluruh widget memudar seragam; di 100% hasilnya sama
 * dengan nilai hex card/secondary.
 *
 * Kontras: token yang di bawah WCAG digeser terangnya (L*) sesedikit mungkin
 * sampai lolos; daftar token yang diubah ada di `adjusted`, rinciannya di
 * docs/theme-contrast.md.
 */

const OBSI_THEMES = [
  {
    id: "default",
    name: "Default",
    variants: {
      dark: {
        background: "#181818",
        card: "#2a2a2a",
        secondary: "#333333",
        raised: "#3a3a3a",
        text: "#dadada",
        muted: "#a3a3a3",
        faint: "#9b9b9b",
        placeholder: "#a0a0a0",
        border: "rgba(218, 218, 218, 0.06)",
        separator: "rgba(218, 218, 218, 0.07)",
        accent: "rgba(218, 218, 218, 0.035)",
        primary: "#8a6cef",
        onPrimary: "#121212",
        primaryText: "#ab94f7",
        primarySoft: "rgba(138, 108, 239, 0.16)",
        danger: "#ff8a5c",
        high: "#ec7a4d",
        medium: "#f2c14e",
        low: "#5aa9ff",
        ring: "#737373",
        tag: "#ab94f7",
        selection: "rgba(138, 108, 239, 0.32)",
        sidebar: "#141414",
        cardTint: "rgb(253 253 253)",
        cardAlpha: "0.078431",
        wellTint: "rgb(251 251 251)",
        wellAlpha: "0.043137",
        adjusted: [
          "faint",
          "ring",
          "high"
        ]
      },
      light: {
        background: "#f2f2f2",
        card: "#ffffff",
        secondary: "#f2f2f2",
        raised: "#ffffff",
        text: "#222222",
        muted: "#5c5c5c",
        faint: "#6b6b6b",
        border: "rgba(34, 34, 34, 0.08)",
        separator: "rgba(34, 34, 34, 0.08)",
        accent: "rgba(34, 34, 34, 0.035)",
        primary: "#7a5af0",
        onPrimary: "#ffffff",
        primaryText: "#7254e9",
        primarySoft: "rgba(122, 90, 240, 0.12)",
        danger: "#c2410c",
        high: "#981900",
        medium: "#a16207",
        low: "#1d4ed8",
        ring: "#8a8a8a",
        tag: "#7a5af0",
        selection: "rgba(122, 90, 240, 0.20)",
        sidebar: "#e9e9e9",
        placeholder: "#6b6b6b",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.964706",
        wellTint: "rgb(0 0 0)",
        wellAlpha: "0.05098",
        adjusted: [
          "primaryText",
          "high"
        ]
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
        muted: "#ababb0",
        border: "rgba(255,255,255,0.09)",
        secondary: "#3a3a3c",
        accent: "rgba(254, 254, 255, 0.066667)",
        primary: "#0073eb",
        onPrimary: "#ffffff",
        danger: "#ff8b73",
        high: "#ff453a",
        medium: "#ffd60a",
        low: "#0a84ff",
        tag: "#64d2ff",
        selection: "rgba(10,132,255,0.28)",
        raised: "#404042",
        faint: "#a3a3a7",
        placeholder: "#a3a3a7",
        primaryText: "#5aa7ff",
        ring: "#797979",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.070588",
        wellTint: "rgb(254 254 255)",
        wellAlpha: "0.066667",
        adjusted: [
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "danger",
          "primary"
        ]
      },
      light: {
        background: "#f5f5f7",
        card: "#ffffff",
        text: "#1d1d1f",
        muted: "#6d6d72",
        border: "rgba(0,0,0,0.09)",
        secondary: "#f0f0f2",
        accent: "rgba(0, 0, 25, 0.078431)",
        primary: "#0070f3",
        onPrimary: "#ffffff",
        danger: "#e81e20",
        high: "#d70015",
        medium: "#df752d",
        low: "#0040dd",
        tag: "#0071a4",
        selection: "rgba(0,122,255,0.18)",
        raised: "#ffffff",
        faint: "#6d6d71",
        placeholder: "#6d6d71",
        primaryText: "#0066e7",
        ring: "#8f8f8f",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.952941",
        wellTint: "rgb(0 0 34)",
        wellAlpha: "0.058824",
        adjusted: [
          "background/card",
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "danger",
          "primary",
          "medium"
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
        card: "#272725",
        text: "#f5f4ee",
        muted: "#b0a89a",
        border: "rgba(245,244,238,0.10)",
        secondary: "#2d2c29",
        accent: "rgba(255, 209, 179, 0.035294)",
        primary: "#d97757",
        onPrimary: "#1f1e1d",
        danger: "#f5715a",
        high: "#e5634d",
        medium: "#e8b87a",
        low: "#8fb0d9",
        tag: "#82c0bb",
        selection: "rgba(217,119,87,0.22)",
        raised: "#33322f",
        faint: "#9b9588",
        placeholder: "#9b9588",
        primaryText: "#da7858",
        ring: "#747474",
        cardTint: "rgb(235 255 233)",
        cardAlpha: "0.039216",
        wellTint: "rgb(255 221 183)",
        wellAlpha: "0.027451",
        adjusted: [
          "card",
          "secondary",
          "primaryText",
          "danger"
        ]
      },
      light: {
        background: "#f8f7f3",
        card: "#ffffff",
        text: "#3d3a2f",
        muted: "#6f6c5b",
        border: "rgba(61,58,47,0.12)",
        secondary: "#f0eee6",
        accent: "rgba(113, 85, 0, 0.105882)",
        primary: "#bb5a37",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#b52f23",
        medium: "#b07a2a",
        low: "#3a6ea5",
        tag: "#2a8085",
        selection: "rgba(193,95,60,0.16)",
        raised: "#ffffff",
        faint: "#6f6c5f",
        placeholder: "#6f6c5f",
        primaryText: "#af502e",
        ring: "#8f8f8f",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.960784",
        wellTint: "rgb(102 82 0)",
        wellAlpha: "0.098039",
        adjusted: [
          "background",
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "primary",
          "high"
        ]
      }
    }
  },
  {
    id: "kanagawa",
    name: "Kanagawa",
    variants: {
      dark: {
        background: "#16161d",
        card: "#1f1f28",
        text: "#dcd7ba",
        muted: "#a09f96",
        border: "rgba(220,215,186,0.08)",
        secondary: "#2a2a37",
        accent: "rgba(199, 199, 255, 0.137255)",
        primary: "#7e9cd8",
        onPrimary: "#1f1f28",
        danger: "#f56d6a",
        high: "#c34043",
        medium: "#c0a36e",
        low: "#7e9cd8",
        tag: "#6a9589",
        selection: "rgba(45,79,103,0.45)",
        raised: "#30303c",
        faint: "#93928c",
        placeholder: "#93928c",
        primaryText: "#7e9cd8",
        ring: "#6e6e6e",
        cardTint: "rgb(213 213 255)",
        cardAlpha: "0.047059",
        wellTint: "rgb(187 187 252)",
        wellAlpha: "0.070588",
        adjusted: [
          "background/card",
          "faint",
          "placeholder",
          "danger"
        ]
      },
      light: {
        background: "#e5ddb0",
        card: "#f2ecbc",
        text: "#545464",
        muted: "#626159",
        border: "rgba(84,84,100,0.14)",
        secondary: "#e5ddb0",
        accent: "rgba(18, 1, 25, 0.098039)",
        primary: "#4d699b",
        onPrimary: "#f2ecbc",
        danger: "#bf374c",
        high: "#e25867",
        medium: "#77713f",
        low: "#4d699b",
        tag: "#4f706a",
        selection: "rgba(220,213,172,0.7)",
        raised: "#f2ecbc",
        faint: "#636154",
        placeholder: "#636154",
        primaryText: "#446192",
        ring: "#828282",
        cardTint: "rgb(255 252 201)",
        cardAlpha: "0.482353",
        wellTint: "rgb(35 0 0)",
        wellAlpha: "0.062745",
        adjusted: [
          "background/card",
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "danger",
          "tag",
          "high"
        ]
      }
    }
  },
  {
    id: "kanagawa-dragon",
    name: "Kanagawa Dragon",
    variants: {
      dark: {
        background: "#0d0c0c",
        card: "#1a1818",
        text: "#c5c9c5",
        muted: "#a6a69c",
        border: "rgba(197,201,197,0.08)",
        secondary: "#282727",
        accent: "rgba(197, 201, 197, 0.05)",
        primary: "#8ba4b0",
        onPrimary: "#181616",
        danger: "#cf7e77",
        high: "#c1716c",
        medium: "#c4b28a",
        low: "#8ba4b0",
        tag: "#8ea4a2",
        selection: "rgba(45,79,103,0.45)",
        raised: "#2e2d2d",
        faint: "#919188",
        placeholder: "#919188",
        primaryText: "#8ba4b0",
        ring: "#696969",
        cardTint: "rgb(250 231 231)",
        cardAlpha: "0.054902",
        wellTint: "rgb(236 249 249)",
        wellAlpha: "0.066667",
        adjusted: [
          "background/card",
          "card",
          "accent (hover)",
          "danger",
          "high"
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
        card: "#222334",
        text: "#c0caf5",
        muted: "#9aa5ce",
        border: "rgba(255,255,255,0.08)",
        secondary: "#292e42",
        accent: "rgba(139, 200, 255, 0.066667)",
        primary: "#c0caf5",
        onPrimary: "#1a1b26",
        danger: "#f7768e",
        high: "#f7768e",
        medium: "#e0af68",
        low: "#7aa2f7",
        tag: "#7dcfff",
        selection: "rgba(122,162,247,0.25)",
        raised: "#2e3348",
        faint: "#8b95ba",
        placeholder: "#8b95ba",
        primaryText: "#c0caf5",
        ring: "#727272",
        cardTint: "rgb(153 154 255)",
        cardAlpha: "0.062745",
        wellTint: "rgb(139 200 255)",
        wellAlpha: "0.066667",
        adjusted: [
          "card",
          "faint",
          "placeholder"
        ]
      }
    }
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    variants: {
      dark: {
        background: "#181825",
        card: "#212131",
        text: "#cdd6f4",
        muted: "#a6adc8",
        border: "rgba(205,214,244,0.10)",
        secondary: "#313244",
        accent: "rgba(210, 221, 255, 0.090196)",
        primary: "#cba6f7",
        onPrimary: "#1e1e2e",
        danger: "#f38ba8",
        high: "#f38ba8",
        medium: "#f9e2af",
        low: "#89b4fa",
        tag: "#94e2d5",
        selection: "rgba(203,166,247,0.25)",
        raised: "#36384a",
        faint: "#949ab3",
        placeholder: "#949ab3",
        primaryText: "#cba6f7",
        ring: "#717171",
        cardTint: "rgb(188 188 255)",
        cardAlpha: "0.054902",
        wellTint: "rgb(210 221 255)",
        wellAlpha: "0.090196",
        adjusted: [
          "background/card",
          "card",
          "faint",
          "placeholder"
        ]
      },
      light: {
        background: "#eff1f5",
        card: "#ffffff",
        text: "#4c4f69",
        muted: "#65687e",
        border: "rgba(76,79,105,0.12)",
        secondary: "#e6e9ef",
        accent: "rgba(0, 31, 92, 0.098039)",
        primary: "#8839ef",
        onPrimary: "#eff1f5",
        danger: "#d20f39",
        high: "#d20f39",
        medium: "#d2830b",
        low: "#1e66f5",
        tag: "#00838a",
        selection: "rgba(136,57,239,0.20)",
        raised: "#ffffff",
        faint: "#656879",
        placeholder: "#656879",
        primaryText: "#8738ee",
        ring: "#8f8f8f",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.972549",
        wellTint: "rgb(0 31 92)",
        wellAlpha: "0.098039",
        adjusted: [
          "muted",
          "faint",
          "placeholder",
          "primaryText",
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
        card: "#222031",
        text: "#e0def4",
        muted: "#9591af",
        border: "rgba(224,222,244,0.10)",
        secondary: "#28253c",
        accent: "rgba(127, 102, 255, 0.043137)",
        primary: "#c4a7e7",
        onPrimary: "#191724",
        danger: "#eb6f92",
        high: "#eb6f92",
        medium: "#f6c177",
        low: "#9ccfd8",
        tag: "#ebbcba",
        selection: "rgba(196,167,231,0.25)",
        raised: "#2e2b42",
        faint: "#8e8ba7",
        placeholder: "#8e8ba7",
        primaryText: "#c4a7e7",
        ring: "#707070",
        cardTint: "rgb(178 176 255)",
        cardAlpha: "0.058824",
        wellTint: "rgb(152 130 255)",
        wellAlpha: "0.05098",
        adjusted: [
          "card",
          "secondary",
          "muted",
          "faint",
          "placeholder"
        ]
      },
      light: {
        background: "#f8f2eb",
        card: "#fffaf3",
        text: "#575279",
        muted: "#6a6683",
        border: "rgba(87,82,121,0.12)",
        secondary: "#f2e9e1",
        accent: "rgba(81, 22, 1, 0.07451)",
        primary: "#836d9c",
        onPrimary: "#ffffff",
        danger: "#ab5b72",
        high: "#b4637a",
        medium: "#ca8214",
        low: "#56949f",
        tag: "#ad5d5a",
        selection: "rgba(144,122,169,0.22)",
        raised: "#fffaf3",
        faint: "#6b677e",
        placeholder: "#6b677e",
        primaryText: "#76618e",
        ring: "#8c8c8c",
        cardTint: "rgb(255 251 243)",
        cardAlpha: "0.929412",
        wellTint: "rgb(81 22 1)",
        wellAlpha: "0.07451",
        adjusted: [
          "background",
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "danger",
          "tag",
          "medium",
          "onPrimary",
          "primary"
        ]
      }
    }
  },
  {
    id: "everforest",
    name: "Everforest",
    variants: {
      dark: {
        background: "#272e33",
        card: "#2d353b",
        text: "#d3c6aa",
        muted: "#a5b1a8",
        border: "rgba(211,198,170,0.08)",
        secondary: "#343f44",
        accent: "rgba(215, 255, 250, 0.094118)",
        primary: "#a7c080",
        onPrimary: "#2d353b",
        danger: "#fa9091",
        high: "#e0797b",
        medium: "#dbbc7f",
        low: "#7fbbb3",
        tag: "#83c092",
        selection: "rgba(76,55,67,0.6)",
        raised: "#3a4448",
        faint: "#9eaaa3",
        placeholder: "#9eaaa3",
        primaryText: "#a7c080",
        ring: "#818181",
        cardTint: "rgb(192 224 255)",
        cardAlpha: "0.039216",
        wellTint: "rgb(194 255 250)",
        wellAlpha: "0.047059",
        adjusted: [
          "background/card",
          "muted",
          "faint",
          "placeholder",
          "danger",
          "high"
        ]
      },
      light: {
        background: "#f2efd8",
        card: "#fdf6e3",
        text: "#5c6a72",
        muted: "#5f6d5e",
        border: "rgba(92,106,114,0.12)",
        secondary: "#efebd4",
        accent: "rgba(27, 50, 1, 0.101961)",
        primary: "#697f00",
        onPrimary: "#ffffff",
        danger: "#d33237",
        high: "#f85552",
        medium: "#9f6a00",
        low: "#3a94c5",
        tag: "#008159",
        selection: "rgba(230,226,204,0.8)",
        raised: "#fdf6e3",
        faint: "#626d5e",
        placeholder: "#626d5e",
        primaryText: "#5b7200",
        ring: "#8a8a8a",
        cardTint: "rgb(255 248 229)",
        cardAlpha: "0.807843",
        wellTint: "rgb(43 81 2)",
        wellAlpha: "0.066667",
        adjusted: [
          "background/card",
          "background",
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "danger",
          "tag",
          "medium",
          "primary",
          "onPrimary"
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
        muted: "#b8c5dc",
        border: "rgba(255,255,255,0.08)",
        secondary: "#434c5e",
        accent: "rgba(179, 216, 255, 0.066667)",
        primary: "#88c0d0",
        onPrimary: "#2e3440",
        danger: "#ffafb6",
        high: "#d07078",
        medium: "#ebcb8b",
        low: "#81a1c1",
        tag: "#88c0d0",
        selection: "rgba(136,192,208,0.25)",
        raised: "#495263",
        faint: "#b1bcd3",
        placeholder: "#b1bcd3",
        primaryText: "#8cc4d4",
        ring: "#929292",
        cardTint: "rgb(184 201 255)",
        cardAlpha: "0.094118",
        wellTint: "rgb(179 216 255)",
        wellAlpha: "0.066667",
        adjusted: [
          "muted",
          "faint",
          "placeholder",
          "primaryText",
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
        accent: "rgba(0, 39, 108, 0.101961)",
        primary: "#5579a3",
        onPrimary: "#ffffff",
        danger: "#b75a63",
        high: "#bc5e68",
        medium: "#ad9154",
        low: "#7898b8",
        tag: "#467e8d",
        selection: "rgba(94,129,172,0.25)",
        raised: "#ffffff",
        faint: "#61697a",
        placeholder: "#61697a",
        primaryText: "#476b95",
        ring: "#8f8f8f",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.976471",
        wellTint: "rgb(0 39 108)",
        wellAlpha: "0.101961",
        adjusted: [
          "faint",
          "placeholder",
          "primaryText",
          "danger",
          "tag",
          "medium",
          "low",
          "onPrimary",
          "primary",
          "high"
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
        muted: "#b6a792",
        border: "rgba(235,219,178,0.10)",
        secondary: "#3c3836",
        accent: "rgba(255, 218, 196, 0.047059)",
        primary: "#fabd2f",
        onPrimary: "#282828",
        danger: "#ff8868",
        high: "#e03a2b",
        medium: "#d79921",
        low: "#458588",
        tag: "#6ea470",
        selection: "rgba(250,189,47,0.25)",
        raised: "#423e3a",
        faint: "#ada08d",
        placeholder: "#ada08d",
        primaryText: "#fabd2f",
        ring: "#7e7e7e",
        cardTint: "rgb(252 210 189)",
        cardAlpha: "0.047059",
        wellTint: "rgb(255 218 196)",
        wellAlpha: "0.047059",
        adjusted: [
          "muted",
          "faint",
          "placeholder",
          "danger",
          "tag",
          "high"
        ]
      },
      light: {
        background: "#f6ecc3",
        card: "#f9f5d7",
        text: "#3c3836",
        muted: "#6b5e54",
        border: "rgba(60,56,54,0.12)",
        secondary: "#ebdbb2",
        accent: "rgba(168, 94, 1, 0.172549)",
        primary: "#a56900",
        onPrimary: "#ffffff",
        danger: "#9d0006",
        high: "#9d0006",
        medium: "#b57614",
        low: "#076678",
        tag: "#427b58",
        selection: "rgba(181,118,20,0.22)",
        raised: "#f9f5d7",
        faint: "#6b5f52",
        placeholder: "#6b5f52",
        primaryText: "#8c5400",
        ring: "#888888",
        cardTint: "rgb(253 255 239)",
        cardAlpha: "0.45098",
        wellTint: "rgb(168 94 1)",
        wellAlpha: "0.172549",
        adjusted: [
          "background",
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "onPrimary",
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
        background: "#21222c",
        card: "#282a36",
        text: "#f8f8f2",
        muted: "#a9acc0",
        border: "rgba(248,248,242,0.08)",
        secondary: "#343746",
        accent: "rgba(248, 248, 242, 0.05)",
        primary: "#bd93f9",
        onPrimary: "#282a36",
        danger: "#ff837c",
        high: "#ff5555",
        medium: "#f1fa8c",
        low: "#bd93f9",
        tag: "#8be9fd",
        selection: "rgba(68,71,90,0.7)",
        raised: "#3a3d4b",
        faint: "#9da0b2",
        placeholder: "#9da0b2",
        primaryText: "#bd93f9",
        ring: "#787878",
        cardTint: "rgb(182 204 255)",
        cardAlpha: "0.047059",
        wellTint: "rgb(193 208 255)",
        wellAlpha: "0.078431",
        adjusted: [
          "background/card",
          "accent (hover)",
          "faint",
          "placeholder",
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
        text: "#9aa8a8",
        muted: "#92a9b1",
        border: "rgba(131,148,150,0.12)",
        secondary: "#0d3b46",
        accent: "rgba(39, 235, 255, 0.094118)",
        primary: "#268bd2",
        onPrimary: "#00222d",
        danger: "#ff7f6d",
        high: "#e23833",
        medium: "#cd9e23",
        low: "#268bd2",
        tag: "#35a9a0",
        selection: "rgba(7,54,66,0.9)",
        raised: "#14414b",
        faint: "#88a3ab",
        placeholder: "#88a3ab",
        primaryText: "#4da4ed",
        ring: "#7e7e7e",
        cardTint: "rgb(119 230 255)",
        cardAlpha: "0.058824",
        wellTint: "rgb(255 255 236)",
        wellAlpha: "0.023529",
        adjusted: [
          "secondary",
          "text",
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "danger",
          "tag",
          "high",
          "onPrimary",
          "medium"
        ]
      },
      light: {
        background: "#eee8d5",
        card: "#fdf6e3",
        text: "#566c73",
        muted: "#5e6b6b",
        border: "rgba(101,123,131,0.14)",
        secondary: "#eee8d5",
        accent: "rgba(16, 18, 0, 0.109804)",
        primary: "#007cc2",
        onPrimary: "#ffffff",
        danger: "#d72d2c",
        high: "#ca1d23",
        medium: "#b48800",
        low: "#268bd2",
        tag: "#007f77",
        selection: "rgba(238,232,213,0.9)",
        raised: "#fdf6e3",
        faint: "#606a67",
        placeholder: "#606a67",
        primaryText: "#006cb0",
        ring: "#8a8a8a",
        cardTint: "rgb(255 248 229)",
        cardAlpha: "0.854902",
        wellTint: "rgb(14 23 4)",
        wellAlpha: "0.062745",
        adjusted: [
          "background/card",
          "text",
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "danger",
          "tag",
          "medium",
          "onPrimary",
          "primary",
          "high"
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
        card: "#1d2327",
        text: "#cdd9da",
        muted: "#93a3a4",
        border: "rgba(205,217,218,0.09)",
        secondary: "#232c30",
        accent: "rgba(185, 255, 166, 0.070588)",
        primary: "#6cb6b0",
        onPrimary: "#14191c",
        danger: "#e17b6b",
        high: "#da7565",
        medium: "#d9bd80",
        low: "#6fa8c9",
        tag: "#6cb6b0",
        selection: "rgba(108,182,176,0.20)",
        raised: "#293236",
        faint: "#859495",
        placeholder: "#859495",
        primaryText: "#6cb6b0",
        ring: "#707070",
        cardTint: "rgb(211 237 255)",
        cardAlpha: "0.047059",
        wellTint: "rgb(168 244 248)",
        wellAlpha: "0.043137",
        adjusted: [
          "card",
          "faint",
          "placeholder",
          "danger",
          "high"
        ]
      },
      light: {
        background: "#f2f6f5",
        card: "#ffffff",
        text: "#2b3a39",
        muted: "#5d6c6b",
        border: "rgba(43,58,57,0.12)",
        secondary: "#e3ecea",
        accent: "rgba(0, 82, 64, 0.109804)",
        primary: "#2f7d76",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#b52f23",
        medium: "#a9802a",
        low: "#3a6ea5",
        tag: "#2f7d76",
        selection: "rgba(47,125,118,0.16)",
        raised: "#ffffff",
        faint: "#5f6c6b",
        placeholder: "#5f6c6b",
        primaryText: "#26756f",
        ring: "#8f8f8f",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.964706",
        wellTint: "rgb(0 82 64)",
        wellAlpha: "0.109804",
        adjusted: [
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "high"
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
        card: "#242a26",
        text: "#d8e0d2",
        muted: "#9aa597",
        border: "rgba(216,224,210,0.09)",
        secondary: "#2a322c",
        accent: "rgba(200, 255, 202, 0.054902)",
        primary: "#a7c080",
        onPrimary: "#1c211e",
        danger: "#e88082",
        high: "#e0797b",
        medium: "#dbbc7f",
        low: "#7fbbb3",
        tag: "#83c092",
        selection: "rgba(167,192,128,0.20)",
        raised: "#303832",
        faint: "#8f9a8d",
        placeholder: "#8f9a8d",
        primaryText: "#a7c080",
        ring: "#767676",
        cardTint: "rgb(232 255 234)",
        cardAlpha: "0.039216",
        wellTint: "rgb(206 255 208)",
        wellAlpha: "0.035294",
        adjusted: [
          "card",
          "faint",
          "placeholder",
          "danger",
          "high"
        ]
      },
      light: {
        background: "#f4f6f0",
        card: "#ffffff",
        text: "#36422f",
        muted: "#626c5b",
        border: "rgba(54,66,47,0.12)",
        secondary: "#e6ecdd",
        accent: "rgba(67, 112, 0, 0.133333)",
        primary: "#5a7a3f",
        onPrimary: "#ffffff",
        danger: "#c0392b",
        high: "#b52f23",
        medium: "#a97f2a",
        low: "#3a7a6e",
        tag: "#27837e",
        selection: "rgba(90,122,63,0.16)",
        raised: "#ffffff",
        faint: "#646c5d",
        placeholder: "#646c5d",
        primaryText: "#537238",
        ring: "#8f8f8f",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.968627",
        wellTint: "rgb(67 112 0)",
        wellAlpha: "0.133333",
        adjusted: [
          "muted",
          "faint",
          "placeholder",
          "primaryText",
          "tag",
          "high"
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
        card: "#1c1c1c",
        text: "#eeeeee",
        muted: "#b4b4b4",
        border: "#201e18",
        secondary: "#393028",
        accent: "rgba(251, 251, 251, 0.062745)",
        primary: "#ffe0c2",
        onPrimary: "#081a1b",
        danger: "#ff7752",
        high: "#e06c75",
        medium: "#ffd9a0",
        low: "#8fb0d9",
        tag: "#88c0c8",
        selection: "rgba(255,224,194,0.20)",
        raised: "#3e362e",
        faint: "#9d9d9d",
        placeholder: "#9d9d9d",
        primaryText: "#ffe0c2",
        ring: "#6c6c6c",
        cardTint: "rgb(251 251 251)",
        cardAlpha: "0.047059",
        wellTint: "rgb(252 183 121)",
        wellAlpha: "0.129412",
        adjusted: [
          "card",
          "danger"
        ]
      },
      light: {
        background: "#f4f4f4",
        card: "#fcfcfc",
        text: "#202020",
        muted: "#646464",
        border: "#d8d8d8",
        secondary: "#ffdfb5",
        accent: "rgba(0, 0, 0, 0.078431)",
        primary: "#644a40",
        onPrimary: "#ffffff",
        danger: "#d43e22",
        high: "#af291f",
        medium: "#a9762a",
        low: "#3a6ea5",
        tag: "#248084",
        selection: "rgba(100,74,64,0.16)",
        raised: "#fcfcfc",
        faint: "#666666",
        placeholder: "#666666",
        primaryText: "#644a40",
        ring: "#8d8d8d",
        cardTint: "rgb(255 255 255)",
        cardAlpha: "0.682353",
        wellTint: "rgb(255 217 167)",
        wellAlpha: "0.835294",
        adjusted: [
          "background",
          "faint",
          "placeholder",
          "danger",
          "tag",
          "high"
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
  cardTint: "--card-tint",
  cardAlpha: "--card-alpha",
  wellTint: "--well-tint",
  wellAlpha: "--well-alpha",
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
