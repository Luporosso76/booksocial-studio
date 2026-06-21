import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { QuoteCardSpec, StoryboardSpec, VisualSpec } from "./spec.js";
import { loadFonts } from "./fonts.js";
import { imageIdToDataUri } from "./images.js";
import { buildQuoteCard, buildStoryboard, dimsFor } from "./templates/cards.js";
import type { RenderContext, RenderOutput } from "./renderers/types.js";
import { RendererUnavailableError } from "./renderers/types.js";

// Renderer PNG pure-Node: satori (elementi -> SVG) + @resvg/resvg-js (SVG -> PNG).
// Nessun browser/Chromium, nessun FFmpeg. Le dipendenze sono caricate via dynamic
// import: se assenti, lancia RendererUnavailableError (la coda lo segna 'failed').

type SatoriFn = (
  element: unknown,
  options: { width: number; height: number; fonts: unknown[] },
) => Promise<string>;

async function loadSatori(): Promise<SatoriFn> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import("satori")) as Record<string, unknown>;
  } catch {
    throw new RendererUnavailableError(
      "Dipendenza 'satori' non installata in server/. Esegui: cd server && npm i satori @resvg/resvg-js",
    );
  }
  const fn = (mod.default ?? mod.satori) as SatoriFn | undefined;
  if (typeof fn !== "function") {
    throw new RendererUnavailableError("Export 'satori' non trovato.");
  }
  return fn;
}

async function svgToPng(svg: string, width: number): Promise<Buffer> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import("@resvg/resvg-js")) as Record<string, unknown>;
  } catch {
    throw new RendererUnavailableError(
      "Dipendenza '@resvg/resvg-js' non installata in server/. Esegui: cd server && npm i @resvg/resvg-js",
    );
  }
  const Resvg = mod.Resvg as
    | (new (svg: string, opts?: unknown) => { render(): { asPng(): Buffer } })
    | undefined;
  if (typeof Resvg !== "function") {
    throw new RendererUnavailableError("Export 'Resvg' non trovato in @resvg/resvg-js.");
  }
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return resvg.render().asPng();
}

async function renderElementToPng(
  element: unknown,
  aspect: string,
  ctx: RenderContext,
): Promise<RenderOutput> {
  const { width, height } = dimsFor(aspect);
  const fonts = await loadFonts();
  if (fonts.length === 0) {
    throw new RendererUnavailableError(
      "Nessun font disponibile in server/assets/fonts: impossibile renderizzare la card.",
    );
  }
  const satori = await loadSatori();
  const svg = await satori(element, { width, height, fonts });
  const png = await svgToPng(svg, width);
  const path = join(ctx.outDir, `${ctx.baseName}.png`);
  await writeFile(path, png);
  return { path, mediaType: "PHOTO" };
}

export async function renderCard(spec: VisualSpec, ctx: RenderContext): Promise<RenderOutput> {
  if (spec.kind !== "quote_card") {
    throw new RendererUnavailableError("renderCard richiede uno spec quote_card.");
  }
  const card = spec as QuoteCardSpec;
  // Sfondo immagine del libro (best-effort): se l'id non risolve o il file e'
  // illeggibile, imageUri resta null e si usa il template solo-testo. MAI crash.
  const imageUri = await imageIdToDataUri(card.imageId);
  return renderElementToPng(buildQuoteCard(card, imageUri), card.aspect, ctx);
}

export async function renderStoryboardCard(
  spec: VisualSpec,
  ctx: RenderContext,
): Promise<RenderOutput> {
  if (spec.kind !== "storyboard") {
    throw new RendererUnavailableError("renderStoryboardCard richiede uno spec storyboard.");
  }
  const sb = spec as StoryboardSpec;
  const images = await resolvePanelImages(sb);
  return renderElementToPng(buildStoryboard(sb, images), sb.aspect, ctx);
}

// Risolve gli imageId dei pannelli in data URI (best-effort: id non risolvibili
// vengono semplicemente omessi dalla mappa -> pannello senza sfondo immagine).
async function resolvePanelImages(sb: StoryboardSpec): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = Array.from(
    new Set(sb.panels.map((p) => p.imageId).filter((id): id is number => id != null)),
  );
  for (const id of ids) {
    const uri = await imageIdToDataUri(id);
    if (uri) map.set(id, uri);
  }
  return map;
}
