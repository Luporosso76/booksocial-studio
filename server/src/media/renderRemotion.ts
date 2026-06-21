import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReelTextSpec, VisualSpec } from "./spec.js";
import type { RenderContext, RenderOutput } from "./renderers/types.js";
import { RendererUnavailableError } from "./renderers/types.js";
import { imageIdToDataUri } from "./images.js";

// Percorso REEL via Remotion REALE: bundle della composizione (src/media/remotion/
// index.ts) -> selectComposition -> renderMedia (H.264) usando il Chromium headless
// di Remotion (scaricato da ensureBrowser alla prima esecuzione) e ffmpeg-static.
//
// Tutte le dipendenze sono caricate via dynamic import: se Remotion/Chromium non
// sono utilizzabili in questo ambiente, lancia RendererUnavailableError e il
// chiamante puo' ricorrere al fallback satori+ffmpeg. MAI crash dell'app.

function remotionEntry(): string {
  // src/media/renderRemotion.ts -> ./remotion/index.ts
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "remotion", "index.ts");
}

async function imp(name: string): Promise<Record<string, unknown>> {
  return (await import(name)) as Record<string, unknown>;
}

export async function renderReelRemotion(
  spec: VisualSpec,
  ctx: RenderContext,
): Promise<RenderOutput> {
  if (spec.kind !== "reel_text") {
    throw new RendererUnavailableError("renderReelRemotion richiede uno spec reel_text.");
  }
  const reel = spec as ReelTextSpec;

  let renderer: Record<string, unknown>;
  let bundler: Record<string, unknown>;
  try {
    renderer = await imp("@remotion/renderer");
    bundler = await imp("@remotion/bundler");
  } catch (e) {
    throw new RendererUnavailableError(
      `Remotion non disponibile (@remotion/renderer|bundler non importabile): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const ensureBrowser = renderer.ensureBrowser as
    | ((opts?: unknown) => Promise<unknown>)
    | undefined;
  const selectComposition = renderer.selectComposition as
    | ((
        opts: Record<string, unknown>,
      ) => Promise<{ durationInFrames: number; fps: number; width: number; height: number }>)
    | undefined;
  const renderMedia = renderer.renderMedia as
    | ((opts: Record<string, unknown>) => Promise<unknown>)
    | undefined;
  const bundle = bundler.bundle as ((opts: Record<string, unknown>) => Promise<string>) | undefined;

  if (!selectComposition || !renderMedia || !bundle) {
    throw new RendererUnavailableError("API Remotion attese non presenti in questa versione.");
  }

  const entry = remotionEntry();
  if (!existsSync(entry)) {
    throw new RendererUnavailableError(`Entry Remotion non trovato: ${entry}`);
  }

  // Scarica/verifica il Chromium headless di Remotion. Se fallisce (ambiente senza
  // rete o senza le librerie di sistema), l'errore diventa RendererUnavailableError.
  try {
    if (ensureBrowser) await ensureBrowser();
  } catch (e) {
    throw new RendererUnavailableError(
      `Chromium headless di Remotion non disponibile su questo ambiente: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Risolvi le immagini di sfondo per-scena in data URI server-side: il bundle
  // Remotion gira in Chromium senza accesso al DB/disco, quindi passiamo gia' le
  // immagini inline. Id non risolvibili -> scena senza immagine (gradiente).
  const scenesWithImages = [];
  for (const scene of reel.scenes) {
    const image = await imageIdToDataUri(scene.imageId);
    scenesWithImages.push(image ? { ...scene, image } : scene);
  }

  const inputProps = {
    scenes: scenesWithImages,
    palette: reel.background.palette,
    accent: "#c8553d",
  };

  try {
    const serveUrl = await bundle({ entryPoint: entry });
    const composition = await selectComposition({
      serveUrl,
      id: "Reel",
      inputProps,
    });
    const outPath = join(ctx.outDir, `${ctx.baseName}.mp4`);
    // Remotion include il proprio ffmpeg compilato: NON va sovrascritto con
    // ffmpeg-static (binariesDirectory si aspetta le binarie di Remotion, non
    // quelle di ffmpeg-static). Lasciamo che usi il suo.
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outPath,
      inputProps,
    });
    return { path: outPath, mediaType: "REEL" };
  } catch (e) {
    throw new RendererUnavailableError(
      `Render Remotion fallito: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
