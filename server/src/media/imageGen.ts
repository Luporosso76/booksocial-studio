// Generazione immagini AI di SCENA (illustrazioni graphic-novel). Il motore è PLUGGABLE:
// l'implementazione concreta (sd-cli/Z-Image locale, OpenAI Images, Google Imagen, …) vive in
// imageEngine.ts ed è scelta da IMAGE_PROVIDER via createImageEngine(). Qui restano INVARIATE le
// firme pubbliche storiche (SceneAspect, imageGenAvailable, dimsForAspect, buildScenePrompt,
// generateFromPrompt, generateSceneImage): i chiamanti non vanno toccati, delegano al provider attivo.
//
// Lo STILE è ottenuto col solo prompt (lead "breathtaking graphic novel illustration of ...");
// nessuna LoRA. Il chiamante passa solo la descrizione SOGGETTO+SCENA, qui aggiungiamo lo stile
// (via buildScenePrompt) prima di passare il prompt COMPLETO al motore — vale per TUTTI i backend.

import { createImageEngine, type ImageEngine } from "./imageEngine.js";
import * as aiSettings from "../content/aiSettings.js";
import type { ImageStyleCfg } from "../content/aiSettings.js";

export type SceneAspect = "1:1" | "4:5" | "1.91:1" | "9:16" | "16:9";

// Dimensioni SDXL per aspect (multipli di 64, ~1MP). 9:16 verticale per reel/storie.
const DIMS: Record<SceneAspect, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "4:5": { w: 1024, h: 1280 },
  "1.91:1": { w: 1216, h: 640 },
  "9:16": { w: 768, h: 1344 },
  "16:9": { w: 1344, h: 768 },
};

export const STYLE_PLACEHOLDER = "§STYLE§";

const PRESET_MEDIUM: Record<string, string> = {
  "graphic-novel": "graphic-novel illustration with ink outlines and cel shading",
  "cel-anime": "anime cel-shaded illustration",
  painterly: "painterly digital illustration with visible brushwork",
  photorealistic: "photorealistic image with natural detail",
  cinematic: "cinematic photographic frame with filmic lighting",
  watercolor: "watercolor illustration with soft washes",
  oil: "oil painting with rich textured brushwork",
  "3d-render": "polished 3D-rendered image",
  "flat-vector": "flat vector illustration with clean shapes",
  storybook: "soft storybook illustration",
  "pencil-sketch": "pencil and ink sketch",
  "concept-art": "digital concept-art illustration",
  "line-art": "clean line-art illustration",
};

export function buildStyleTail(style: ImageStyleCfg): string {
  const preset = style.preset || "graphic-novel";
  let medium: string;
  if (preset === "custom") {
    const cs = (style.customStyle || "").trim();
    medium = cs !== "" ? cs : PRESET_MEDIUM["graphic-novel"];
  } else {
    medium = PRESET_MEDIUM[preset] ?? PRESET_MEDIUM["graphic-novel"];
  }
  const intensity = Math.min(100, Math.max(0, Number(style.intensity)));
  const vividness = Math.min(100, Math.max(0, Number(style.vividness)));
  const qualifier =
    intensity < 34 ? "subtle, lightly stylized " : intensity > 66 ? "bold, heavily stylized " : "";
  const colour =
    vividness < 34
      ? ", with muted, soft colours"
      : vividness > 66
        ? ", with vivid, high-contrast colours"
        : ", with natural colours";
  return `${qualifier}${medium}${colour}`;
}

export function dimsForAspect(aspect: SceneAspect): { w: number; h: number } {
  return DIMS[aspect] ?? DIMS["1:1"];
}

export function buildScenePrompt(subjectScene: string): string {
  const s = subjectScene
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "");
  const sep = /[.!?]$/.test(s) ? "" : ".";
  return `${s}${sep} Rendered as a single full-bleed uninterrupted ${STYLE_PLACEHOLDER}, the palette and lighting matching the scene described above; any signs, screens or papers appear blank and unlettered.`;
}

export function applyStyleForProvider(prompt: string, provider: string): string {
  if (!prompt.includes(STYLE_PLACEHOLDER)) return prompt;
  const tail = buildStyleTail(aiSettings.getImageStyle(provider));
  return prompt.split(STYLE_PLACEHOLDER).join(tail);
}

// Motore attivo: ricreato a OGNI operazione da createImageEngine(), che legge la config EFFETTIVA
// (cache aiSettings ?? env). Così i cambi di provider/chiavi/modelli dalle Impostazioni si applicano
// senza riavvio. createImageEngine() è sincrona (getImage() è sincrona) e a basso costo.
function activeEngine(): ImageEngine {
  return createImageEngine();
}

// True se il motore immagini attivo è disponibile (locale: binario+modello; HTTP: chiave presente).
export function imageGenAvailable(): boolean {
  return activeEngine().available();
}

export interface SceneGenInput {
  subjectScene: string; // descrizione SOGGETTO+SCENA (lo stile lo aggiunge buildScenePrompt)
  aspect: SceneAspect;
  outPath: string;
  seed?: number; // onorati solo dal backend locale sd-cli; ignorati dai backend HTTP
  steps?: number;
  cfg?: number;
  signal?: AbortSignal; // per ANNULLARE: interrompe la generazione in corso
}

export interface RawGenInput {
  prompt: string; // prompt COMPLETO (già con lo stile), passato così com'è al motore
  aspect: SceneAspect;
  outPath: string;
  seed?: number; // onorati solo dal backend locale sd-cli; ignorati dai backend HTTP
  steps?: number;
  cfg?: number;
  signal?: AbortSignal;
}

// Genera da un prompt COMPLETO (no wrapping). Usata da generateSceneImage e dalla rigenerazione
// singola (che riusa/modifica il gen_prompt salvato). Delega al motore attivo.
export async function generateFromPrompt(input: RawGenInput): Promise<string | null> {
  if (!input.prompt || input.prompt.trim() === "") return null;
  const style = aiSettings.getImageStyle(aiSettings.getImage().provider);
  const steps =
    input.steps != null
      ? input.steps
      : typeof style.steps === "number" && style.steps > 0
        ? style.steps
        : undefined;
  const cfg =
    input.cfg != null
      ? input.cfg
      : typeof style.cfg === "number" && style.cfg > 0
        ? style.cfg
        : undefined;
  return activeEngine().generate({
    prompt: input.prompt,
    aspect: input.aspect,
    outPath: input.outPath,
    ...(input.seed != null ? { seed: input.seed } : {}),
    ...(steps != null ? { steps } : {}),
    ...(cfg != null ? { cfg } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

// Genera un'immagine di scena dal SOGGETTO+SCENA (aggiunge lo stile via buildScenePrompt).
export async function generateSceneImage(input: SceneGenInput): Promise<string | null> {
  if (!input.subjectScene || input.subjectScene.trim() === "") return null;
  return generateFromPrompt({
    prompt: buildScenePrompt(input.subjectScene),
    aspect: input.aspect,
    outPath: input.outPath,
    ...(input.seed != null ? { seed: input.seed } : {}),
    ...(input.steps != null ? { steps: input.steps } : {}),
    ...(input.cfg != null ? { cfg: input.cfg } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}
