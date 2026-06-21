import type { ReelTextSpec, ReelScene } from "../spec.js";
import { SANS, SERIF } from "../fonts.js";
import { stripMdEscapes } from "../../textEscapes.js";

// Frame (singola scena) di un reel 9:16, come albero Satori senza JSX. Ogni scena
// e' un PNG; ffmpeg li monta in MP4. Estetica coerente con le card: sfondo a
// gradiente per palette, citazione reale grande, eventuale CTA.

type El = { type: string; props: Record<string, unknown> };
function el(type: string, props: Record<string, unknown>, children?: unknown): El {
  return { type, props: children === undefined ? props : { ...props, children } };
}

export const REEL_W = 1080;
export const REEL_H = 1920;

const GRADIENTS: Record<string, [string, string, string]> = {
  // [from, to, fg]
  ink: ["#1b1b26", "#2a2540", "#f5f3ee"],
  warm: ["#3a2417", "#7a3b1d", "#fdf3e7"],
  cool: ["#13313f", "#1f5a73", "#eaf4f8"],
  mono: ["#000000", "#222222", "#ffffff"],
  brand: ["#101418", "#243240", "#f6f7f9"],
};

function scaleFor(len: number): number {
  if (len > 200) return 60;
  if (len > 130) return 74;
  if (len > 70) return 88;
  return 104;
}

function sceneText(s: ReelScene): string {
  const raw = stripMdEscapes((s.quote ?? s.text ?? "").trim());
  if (raw === "") return "";
  if (s.quote && !(raw.startsWith("«") || raw.startsWith('"') || raw.startsWith("“"))) {
    return `«${raw}»`;
  }
  return raw;
}

const baseRootStyle: Record<string, unknown> = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "120px 90px",
  position: "relative",
};

// Velo scuro a tutta scena per la leggibilità del testo sopra la foto.
function veil(): El {
  return el("div", {
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: "flex",
      background:
        "linear-gradient(180deg, rgba(8,8,12,0.45) 0%, rgba(8,8,12,0.35) 45%, rgba(8,8,12,0.72) 100%)",
    },
  });
}

// Contenuto testuale (citazione + eventuale CTA) della scena.
function textContent(scene: ReelScene, fg: string, withShadow: boolean): El {
  const text = sceneText(scene);
  const fs = scaleFor(text.length);
  const isSerif = !!scene.quote;
  const content: El[] = [
    el("div", {
      style: {
        fontFamily: isSerif ? SERIF : SANS,
        fontWeight: 700,
        fontSize: fs,
        lineHeight: 1.22,
        color: fg,
        textAlign: "center",
        display: "flex",
        padding: "0 40px",
        ...(withShadow ? { textShadow: "0 2px 20px rgba(0,0,0,0.6)" } : {}),
      },
      children: text,
    }),
  ];
  if (scene.cta) {
    content.push(
      el("div", {
        style: {
          marginTop: 56,
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: 38,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: fg,
          opacity: 0.85,
          display: "flex",
        },
        children: scene.cta,
      }),
    );
  }
  return el(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      },
    },
    content,
  );
}

// SFONDO della scena (immagine+velo o gradiente), SENZA testo. Su questo ffmpeg applica il Ken Burns.
export function buildReelBg(spec: ReelTextSpec, imageUri?: string | null): El {
  const palette = spec.background.palette;
  const [from, to] = GRADIENTS[palette] ?? GRADIENTS.ink!;
  const rootStyle: Record<string, unknown> = { ...baseRootStyle };
  const children: El[] = [];
  if (imageUri) {
    rootStyle.backgroundColor = "#0d0d12";
    rootStyle.backgroundImage = `url(${imageUri})`;
    rootStyle.backgroundSize = "cover";
    rootStyle.backgroundPosition = "center";
    children.push(veil());
  } else {
    rootStyle.background = `linear-gradient(160deg, ${from}, ${to})`;
  }
  return el("div", { style: rootStyle }, children);
}

// LAYER del TESTO su sfondo TRASPARENTE (PNG con alpha): ffmpeg lo sovrappone con dissolvenza
// in entrata (testo animato). `hasImage` decide il colore (bianco su foto, fg-gradiente altrimenti).
export function buildReelText(spec: ReelTextSpec, sceneIndex: number, hasImage: boolean): El {
  const scene = spec.scenes[sceneIndex] ?? spec.scenes[0]!;
  const [, , gradFg] = GRADIENTS[spec.background.palette] ?? GRADIENTS.ink!;
  const fg = hasImage ? "#ffffff" : gradFg;
  return el("div", { style: { ...baseRootStyle } }, [textContent(scene, fg, hasImage)]);
}

// Frame COMPLETO (sfondo + testo "cotti" insieme). Mantenuto per compatibilità.
export function buildReelFrame(
  spec: ReelTextSpec,
  sceneIndex: number,
  imageUri?: string | null,
): El {
  const scene = spec.scenes[sceneIndex] ?? spec.scenes[0]!;
  const bg = buildReelBg(spec, imageUri);
  const [, , gradFg] = GRADIENTS[spec.background.palette] ?? GRADIENTS.ink!;
  const fg = imageUri ? "#ffffff" : gradFg;
  const props = bg.props as { children?: unknown };
  const kids = Array.isArray(props.children) ? [...(props.children as El[])] : [];
  kids.push(textContent(scene, fg, !!imageUri));
  return el("div", { style: (bg.props as { style: Record<string, unknown> }).style }, kids);
}

export type { El };
