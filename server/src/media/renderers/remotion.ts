import type { VisualSpec } from "../spec.js";
import type { RenderContext, RenderOutput } from "./types.js";
import { RendererUnavailableError } from "./types.js";
import { renderReelRemotion } from "../renderRemotion.js";
import { renderReelVideo } from "../renderVideo.js";

// Modulo renderer caricato dal dispatcher (renderers/index.ts) per il kind
// "reel_text". DEFAULT: percorso satori-frames + ffmpeg-static (deterministico, GPU-free)
// che monta DAVVERO la musica (spec.music.trackId) con fade in/out.
//
// Remotion (Chromium headless) e' OPT-IN via REEL_RENDERER=remotion: produce animazioni
// React piu' ricche MA al momento NON monta la traccia musicale (video muto), quindi non
// e' il default. Quando il path Remotion gestira' l'audio si potra' riabilitare.
//
// Se il renderer fallisce (deps assenti) propaga RendererUnavailableError: la coda segna
// il job 'failed' con messaggio chiaro. MAI crash dell'app.

export async function renderReel(spec: VisualSpec, ctx: RenderContext): Promise<RenderOutput> {
  const useRemotion = (process.env.REEL_RENDERER ?? "").toLowerCase() === "remotion";

  if (useRemotion) {
    try {
      return await renderReelRemotion(spec, ctx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.warn(`[render] Remotion non utilizzabile, passo al fallback ffmpeg: ${msg}`);
    }
  }

  try {
    return await renderReelVideo(spec, ctx);
  } catch (e) {
    if (e instanceof RendererUnavailableError) throw e;
    throw new RendererUnavailableError(
      `Reel non disponibile su questo ambiente: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
