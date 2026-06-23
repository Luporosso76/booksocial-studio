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

export type SceneAspect = "1:1" | "4:5" | "1.91:1" | "9:16" | "16:9";

// Dimensioni SDXL per aspect (multipli di 64, ~1MP). 9:16 verticale per reel/storie.
const DIMS: Record<SceneAspect, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "4:5": { w: 1024, h: 1280 },
  "1.91:1": { w: 1216, h: 640 },
  "9:16": { w: 768, h: 1344 },
  "16:9": { w: 1344, h: 768 },
};

// ORDINE OTTIMALE PER Z-IMAGE: la descrizione della scena (soggetto→...→mood, da content/imagePrompt.ts)
// va PRIMA; lo STILE/medium e i vincoli vanno in CODA, in LINGUAGGIO NATURALE (non tag). Z-Image (cfg
// basso) IGNORA i negative: i divieti stanno qui in POSITIVO, alla fine. Vedi content/imagePrompt.ts.
const STYLE_TAIL =
  "The whole image is rendered as a graphic-novel illustration: bold ink outlines, cel shading, rich warm cinematic colors, soft volumetric light, highly detailed and atmospheric, a single full-bleed picture. There is no text, no letters, no words, no signs, no captions, no speech bubbles, no panels and no watermark anywhere in the image.";

export function dimsForAspect(aspect: SceneAspect): { w: number; h: number } {
  return DIMS[aspect] ?? DIMS["1:1"];
}

// Compone il prompt completo dallo SOGGETTO+SCENA fornito dal chiamante.
export function buildScenePrompt(subjectScene: string): string {
  const s = subjectScene
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^["']|["']$/g, "");
  // Scena PRIMA, stile+vincoli in CODA. Chiude la descrizione con un punto se non già punteggiata.
  const sep = /[.!?]$/.test(s) ? "" : ".";
  return `${s}${sep} ${STYLE_TAIL}`;
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
  return activeEngine().generate({
    prompt: input.prompt,
    aspect: input.aspect,
    outPath: input.outPath,
    ...(input.seed != null ? { seed: input.seed } : {}),
    ...(input.steps != null ? { steps: input.steps } : {}),
    ...(input.cfg != null ? { cfg: input.cfg } : {}),
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
