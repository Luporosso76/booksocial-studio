import type { VisualSpec } from "../spec.js";
import type { RenderContext, RenderOutput } from "./types.js";
import { renderCard, renderStoryboardCard } from "../renderCard.js";

// Modulo renderer caricato dal dispatcher (renderers/index.ts) per i kind
// "quote_card" e "storyboard". Delega a renderCard.ts (satori + resvg).
// Se satori/@resvg/resvg-js non sono installati, renderCard lancia
// RendererUnavailableError e la coda segna il job 'failed' con messaggio chiaro.

export async function renderQuoteCard(spec: VisualSpec, ctx: RenderContext): Promise<RenderOutput> {
  return renderCard(spec, ctx);
}

export async function renderStoryboard(
  spec: VisualSpec,
  ctx: RenderContext,
): Promise<RenderOutput> {
  return renderStoryboardCard(spec, ctx);
}
