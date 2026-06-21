import type { VisualSpec } from "../spec.js";
import { type RenderContext, type RenderOutput, RendererUnavailableError } from "./types.js";

// Dispatcher dei renderer. Risolve il renderer giusto per spec.kind caricandolo
// con dynamic import: se il modulo (o la sua dipendenza npm) non e' installato,
// l'import fallisce e qui lo convertiamo in RendererUnavailableError con un
// messaggio chiaro. La coda lo traduce in un render_job 'failed'. MAI crash.
//
// I moduli concreti sono forniti da BK3 (./satori) e BK4 (./remotion). Vengono
// importati per nome calcolato cosi' tsc non richiede che esistano gia' a
// compile-time (anello CODE RENDERS opzionale).

async function loadModule(name: string): Promise<Record<string, unknown> | null> {
  try {
    // Nome calcolato: evita che il type-checker risolva staticamente il modulo.
    const mod = (await import(/* @vite-ignore */ `./${name}.js`)) as Record<string, unknown>;
    return mod;
  } catch {
    return null;
  }
}

export async function renderSpec(spec: VisualSpec, ctx: RenderContext): Promise<RenderOutput> {
  if (spec.kind === "quote_card" || spec.kind === "storyboard") {
    const mod = await loadModule("satori");
    if (!mod) {
      throw new RendererUnavailableError(
        "Renderer immagini non disponibile: installa 'satori' e 'sharp' in server/ (npm i satori sharp).",
      );
    }
    const fnName = spec.kind === "quote_card" ? "renderQuoteCard" : "renderStoryboard";
    const fn = mod[fnName];
    if (typeof fn !== "function") {
      throw new RendererUnavailableError(`Renderer '${fnName}' non esportato dal modulo satori.`);
    }
    return await (fn as (s: VisualSpec, c: RenderContext) => Promise<RenderOutput>)(spec, ctx);
  }

  // reel_text -> Remotion
  const mod = await loadModule("remotion");
  if (!mod) {
    throw new RendererUnavailableError(
      "Renderer video non disponibile: installa Remotion e ffmpeg in server/ (vedi server/src/media/renderers/README).",
    );
  }
  const fn = mod.renderReel;
  if (typeof fn !== "function") {
    throw new RendererUnavailableError("Renderer 'renderReel' non esportato dal modulo remotion.");
  }
  return await (fn as (s: VisualSpec, c: RenderContext) => Promise<RenderOutput>)(spec, ctx);
}
