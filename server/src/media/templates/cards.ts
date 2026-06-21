import type { QuoteCardSpec, StoryboardSpec } from "../spec.js";
import { SANS, SERIF } from "../fonts.js";
import { stripMdEscapes } from "../../textEscapes.js";

// Template per le card-citazione, espressi come alberi di elementi "React-like"
// ({ type, props }) che Satori sa renderizzare SENZA JSX (tsconfig senza jsx).
// Cura tipografica: gerarchia chiara, ampio respiro, UN SOLO accent. Niente
// accrocchi. I colori derivano dalla palette + accent dello spec.

type El = { type: string; props: Record<string, unknown> };

function el(type: string, props: Record<string, unknown>, children?: unknown): El {
  return { type, props: children === undefined ? props : { ...props, children } };
}

// ---- dimensioni per aspect ----

export function dimsFor(aspect: string): { width: number; height: number } {
  switch (aspect) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "1.91:1":
      return { width: 1080, height: 566 }; // landscape feed Meta
    case "1:1":
    default:
      return { width: 1080, height: 1080 };
  }
}

// ---- palette ----

interface Theme {
  bg: string;
  bgAlt: string;
  fg: string;
  muted: string;
}

const PALETTE_THEMES: Record<string, Theme> = {
  ink: { bg: "#13131a", bgAlt: "#1d1d28", fg: "#f5f3ee", muted: "#9b97a6" },
  warm: { bg: "#fbf6ef", bgAlt: "#f3e7d6", fg: "#2a211a", muted: "#8a7a66" },
  cool: { bg: "#eef3f6", bgAlt: "#dce7ee", fg: "#1b2a33", muted: "#6d8593" },
  mono: { bg: "#ffffff", bgAlt: "#f0f0f0", fg: "#111111", muted: "#777777" },
  brand: { bg: "#101418", bgAlt: "#19222b", fg: "#f6f7f9", muted: "#8fa0ad" },
};

function themeFor(palette: string): Theme {
  return PALETTE_THEMES[palette] ?? PALETTE_THEMES.ink!;
}

// Stima il numero di righe mandando a capo per PAROLE su una larghezza data (in caratteri).
function estimateLines(text: string, charsPerLine: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const need = (cur === 0 ? 0 : 1) + w.length;
    if (cur + need <= charsPerLine) cur += need;
    else {
      lines++;
      cur = w.length;
    }
  }
  return lines;
}

// Font PIÙ GRANDE per cui il testo ENTRA nel box disponibile (larghezza×altezza), così le
// citazioni lunghe non sforano e non vengono tagliate. `charW` = larghezza media di un
// carattere come frazione del font (serif ~0.5, sans bold ~0.6). Margine di sicurezza 4%.
function fitFontSize(
  text: string,
  boxW: number,
  boxH: number,
  lineHeight: number,
  maxFs: number,
  charW: number,
  minFs = 30,
): number {
  for (let fs = maxFs; fs > minFs; fs -= 2) {
    const charsPerLine = Math.max(1, Math.floor(boxW / (fs * charW)));
    const lines = estimateLines(text, charsPerLine);
    if (lines * fs * lineHeight <= boxH * 0.96) return fs;
  }
  return minFs;
}

function quoteText(raw: string): string {
  const t = stripMdEscapes(raw.trim());
  if (t === "") return "";
  // Aggiungi virgolette caporali se non gia' racchiuso.
  if (t.startsWith("«") || t.startsWith('"') || t.startsWith("“")) return t;
  return `«${t}»`;
}

// ---- template: serif su sfondo chiaro/scuro a seconda della palette ----

function serifCard(spec: QuoteCardSpec, theme: Theme, base: number): El {
  const { width, height } = dimsFor(spec.aspect);
  // box = card meno padding (110/100) e spazio per accent (6+56) e fonte (30+56).
  const fs = fitFontSize(
    quoteText(spec.quote),
    width - 200,
    height - 220 - 62 - 86,
    1.22,
    base,
    0.5,
  );
  return el(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        backgroundColor: theme.bg,
        padding: "110px 100px",
        position: "relative",
      },
    },
    [
      el("div", {
        style: {
          width: 84,
          height: 6,
          backgroundColor: spec.accent,
          marginBottom: 56,
          borderRadius: 3,
        },
      }),
      el("div", {
        style: {
          fontFamily: SERIF,
          fontWeight: 700,
          fontSize: fs,
          lineHeight: 1.22,
          color: theme.fg,
          display: "flex",
        },
        children: quoteText(spec.quote),
      }),
      spec.source
        ? el("div", {
            style: {
              fontFamily: SANS,
              fontWeight: 400,
              fontSize: 30,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: theme.muted,
              marginTop: 56,
              display: "flex",
            },
            children: spec.source,
          })
        : el("div", { style: { display: "flex" } }),
    ],
  );
}

// ---- template: sans bold su sfondo scuro con accent forte ----

function boldCard(spec: QuoteCardSpec, theme: Theme, base: number): El {
  const { width, height } = dimsFor(spec.aspect);
  // sans bold (più larga, charW 0.6); box = card meno padding (96/90), fonte (34) e accent (10).
  const fs = fitFontSize(
    quoteText(spec.quote),
    width - 180,
    height - 192 - 34 - 10 - 50,
    1.12,
    Math.round(base * 1.05),
    0.6,
  );
  return el(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: theme.bg,
        padding: "96px 90px",
      },
    },
    [
      el("div", {
        style: {
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 34,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: spec.accent,
          display: "flex",
        },
        children: spec.source || "—",
      }),
      el("div", {
        style: {
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: fs,
          lineHeight: 1.12,
          color: theme.fg,
          display: "flex",
        },
        children: quoteText(spec.quote),
      }),
      el("div", {
        style: {
          width: 140,
          height: 10,
          backgroundColor: spec.accent,
          borderRadius: 5,
          display: "flex",
        },
      }),
    ],
  );
}

// ---- template: blocco accent laterale + citazione (mezza "copertina") ----

function coverSideCard(spec: QuoteCardSpec, theme: Theme, base: number): El {
  const { width, height } = dimsFor(spec.aspect);
  // testo nella colonna destra (~66% larghezza) meno padding (90/80) e fonte (28+44).
  const fs = fitFontSize(
    quoteText(spec.quote),
    Math.round(width * 0.66) - 160,
    height - 180 - 72,
    1.2,
    Math.round(base * 0.82),
    0.5,
  );
  return el(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        backgroundColor: theme.bg,
      },
    },
    [
      // Banda laterale con gradiente accent.
      el("div", {
        style: {
          width: "34%",
          height: "100%",
          display: "flex",
          background: `linear-gradient(160deg, ${spec.accent}, ${theme.bgAlt})`,
        },
      }),
      el(
        "div",
        {
          style: {
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "90px 80px",
          },
        },
        [
          el("div", {
            style: {
              fontFamily: SERIF,
              fontWeight: 700,
              fontSize: fs,
              lineHeight: 1.2,
              color: theme.fg,
              display: "flex",
            },
            children: quoteText(spec.quote),
          }),
          spec.source
            ? el("div", {
                style: {
                  fontFamily: SANS,
                  fontWeight: 400,
                  fontSize: 28,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: theme.muted,
                  marginTop: 44,
                  display: "flex",
                },
                children: spec.source,
              })
            : el("div", { style: { display: "flex" } }),
        ],
      ),
    ],
  );
}

// ---- template: immagine del libro come sfondo + velo scuro + citazione ----
// Usato quando lo spec ha un imageId valido (data URI gia' risolto dal renderer).
// Il velo (gradiente scuro) garantisce SEMPRE la leggibilita' del testo sopra la foto.
function imageBackgroundCard(spec: QuoteCardSpec, imageUri: string, base: number): El {
  const { width, height } = dimsFor(spec.aspect);
  // testo ancorato in basso: box = card meno padding-bottom (110), accent (6+40) e fonte (30+44).
  const fs = fitFontSize(
    quoteText(spec.quote),
    width - 192,
    height - 110 - 46 - 74 - 30,
    1.2,
    Math.round(base * 0.95),
    0.5,
  );
  const fg = "#ffffff";
  const muted = "rgba(255,255,255,0.82)";
  return el(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        backgroundColor: "#0d0d12",
        backgroundImage: `url(${imageUri})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        position: "relative",
      },
    },
    [
      // Velo/scrim scuro a tutta carta per leggibilita' (piu' denso in basso).
      el("div", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          background:
            "linear-gradient(180deg, rgba(8,8,12,0.25) 0%, rgba(8,8,12,0.55) 55%, rgba(8,8,12,0.86) 100%)",
        },
      }),
      // Contenuto in primo piano (sopra il velo).
      el(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            padding: "0 96px 110px 96px",
            position: "relative",
          },
        },
        [
          el("div", {
            style: {
              width: 84,
              height: 6,
              backgroundColor: spec.accent,
              marginBottom: 40,
              borderRadius: 3,
              display: "flex",
            },
          }),
          el("div", {
            style: {
              fontFamily: SERIF,
              fontWeight: 700,
              fontSize: fs,
              lineHeight: 1.2,
              color: fg,
              textShadow: "0 2px 18px rgba(0,0,0,0.55)",
              display: "flex",
            },
            children: quoteText(spec.quote),
          }),
          spec.source
            ? el("div", {
                style: {
                  fontFamily: SANS,
                  fontWeight: 400,
                  fontSize: 30,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: muted,
                  marginTop: 44,
                  display: "flex",
                },
                children: spec.source,
              })
            : el("div", { style: { display: "flex" } }),
        ],
      ),
    ],
  );
}

// Mappa template dello spec (classic|serif-bold|minimal|gradient) + alias del task
// (serif-minimal|bold-dark|cover-side) al builder concreto. Sconosciuto -> serif.
// Se `imageUri` e' presente, lo sfondo immagine ha SEMPRE la precedenza (velo + testo).
export function buildQuoteCard(spec: QuoteCardSpec, imageUri?: string | null): El {
  const theme = themeFor(spec.palette);
  const { width } = dimsFor(spec.aspect);
  const base = Math.round(width * 0.072); // ~78px su 1080
  if (imageUri) {
    return imageBackgroundCard(spec, imageUri, base);
  }
  switch (spec.template) {
    case "serif-bold":
    case "bold-dark":
      return boldCard(spec, theme, base);
    case "gradient":
    case "cover-side":
      return coverSideCard(spec, theme, base);
    case "minimal":
    case "serif-minimal":
    case "classic":
    default:
      return serifCard(spec, theme, base);
  }
}

// ---- storyboard: pannelli dialogo impilati ----

// `images` (opzionale): mappa imageId(media_asset reale) -> data URI, gia' risolta
// dal renderer. Se un pannello ha un imageId presente nella mappa, il riquadro usa
// quell'immagine come sfondo con un velo scuro per la leggibilita' del dialogo.
export function buildStoryboard(spec: StoryboardSpec, images?: Map<number, string>): El {
  const theme = themeFor(spec.panels[0]?.bg ?? "ink");
  const accent = "#c8553d";
  const panels = spec.panels.slice(0, 4);
  // Storia 9:16 → pannelli IMPILATI in verticale; post (1:1 ecc.) → GRIGLIA 2×2 nel quadrato.
  // In griglia i pannelli sono più piccoli, quindi font ridotti per non sforare.
  const vertical = spec.aspect === "9:16";
  const speakerSize = vertical ? 30 : 22;
  const dialogueSize = vertical ? 44 : 30;

  const renderPanel = (p: (typeof panels)[number], i: number): El => {
    const pt = themeFor(p.bg);
    const uri = p.imageId != null ? images?.get(p.imageId) : undefined;
    const panelStyle: Record<string, unknown> = {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      backgroundColor: pt.bgAlt,
      borderRadius: 28,
      padding: vertical ? "44px 52px" : "32px 36px",
      borderLeft: `12px solid ${accent}`,
      position: "relative",
      overflow: "hidden",
    };
    if (uri) {
      panelStyle.backgroundImage = `url(${uri})`;
      panelStyle.backgroundSize = "cover";
      panelStyle.backgroundPosition = "center";
    }
    const scrim = uri
      ? el("div", {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            background: "linear-gradient(180deg, rgba(8,8,12,0.45) 0%, rgba(8,8,12,0.78) 100%)",
          },
        })
      : null;
    const fg = uri ? "#ffffff" : pt.fg;
    return el("div", { key: String(i), style: panelStyle }, [
      ...(scrim ? [scrim] : []),
      p.speaker
        ? el("div", {
            style: {
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: speakerSize,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: accent,
              marginBottom: 12,
              display: "flex",
              position: "relative",
            },
            children: p.speaker,
          })
        : el("div", { style: { display: "flex" } }),
      el("div", {
        style: {
          fontFamily: SERIF,
          fontWeight: 400,
          fontSize: dialogueSize,
          lineHeight: 1.25,
          color: fg,
          display: "flex",
          position: "relative",
        },
        children: quoteText(p.dialogue),
      }),
    ]);
  };

  // Corpo: colonna di pannelli (verticale) oppure colonna di RIGHE da 2 pannelli (griglia 2×2).
  let body: El[];
  if (vertical) {
    body = panels.map((p, i) => renderPanel(p, i));
  } else {
    const rows: El[] = [];
    for (let r = 0; r < panels.length; r += 2) {
      const pair = panels.slice(r, r + 2);
      rows.push(
        el(
          "div",
          { key: `row${r}`, style: { flex: 1, display: "flex", flexDirection: "row", gap: 28 } },
          pair.map((p, idx) => renderPanel(p, r + idx)),
        ),
      );
    }
    body = rows;
  }

  return el(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: theme.bg,
        padding: 64,
        gap: 28,
      },
    },
    body,
  );
}

export type { El };
