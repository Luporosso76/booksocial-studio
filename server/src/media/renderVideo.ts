import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { ReelTextSpec, StoryboardSpec, VisualSpec } from "./spec.js";
import { loadFonts } from "./fonts.js";
import { imageIdToDataUri } from "./images.js";
import { buildReelBg, buildReelText, REEL_W, REEL_H } from "./templates/reel.js";
import { buildStoryboard, dimsFor } from "./templates/cards.js";
import type { RenderContext, RenderOutput } from "./renderers/types.js";
import { RendererUnavailableError } from "./renderers/types.js";

// Renderer VIDEO best-effort, SENZA Chromium: ogni scena viene renderizzata come
// PNG con satori + @resvg/resvg-js (gia' usati dalle card), poi ffmpeg-static
// monta i frame in un MP4 9:16 con le durate per-scena dello spec. Se manca una
// dipendenza (satori/resvg/ffmpeg) -> RendererUnavailableError: la coda segna il
// job 'failed' con "reel non disponibile su questo ambiente". MAI crash.
//
// Nota: Remotion + react sono installati per chi vuole comporre reel piu' ricchi
// (vedi remotion/README.md), ma richiedono il download di un Chromium headless
// che non e' garantito in ogni ambiente. Questo percorso e' il default robusto.

type El = { type: string; props: Record<string, unknown> };

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
      "Reel non disponibile: dipendenza 'satori' non installata in server/.",
    );
  }
  const fn = (mod.default ?? mod.satori) as SatoriFn | undefined;
  if (typeof fn !== "function") throw new RendererUnavailableError("Export 'satori' non trovato.");
  return fn;
}

async function loadResvg(): Promise<
  new (svg: string, opts?: unknown) => { render(): { asPng(): Buffer } }
> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import("@resvg/resvg-js")) as Record<string, unknown>;
  } catch {
    throw new RendererUnavailableError(
      "Reel non disponibile: dipendenza '@resvg/resvg-js' non installata in server/.",
    );
  }
  const Resvg = mod.Resvg as
    | (new (svg: string, opts?: unknown) => { render(): { asPng(): Buffer } })
    | undefined;
  if (typeof Resvg !== "function")
    throw new RendererUnavailableError("Export 'Resvg' non trovato.");
  return Resvg;
}

async function ffmpegPath(): Promise<string> {
  try {
    const mod = (await import("ffmpeg-static")) as { default?: unknown };
    const p = (mod.default ?? mod) as unknown;
    if (typeof p === "string" && p !== "" && existsSync(p)) return p;
  } catch {
    /* fallthrough */
  }
  throw new RendererUnavailableError(
    "Reel non disponibile su questo ambiente: 'ffmpeg-static' assente o binario non trovato.",
  );
}

async function elementToPng(
  satori: SatoriFn,
  Resvg: new (svg: string, opts?: unknown) => { render(): { asPng(): Buffer } },
  element: El,
  width: number,
  height: number,
  fonts: unknown[],
): Promise<Buffer> {
  const svg = await satori(element, { width, height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  return resvg.render().asPng();
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.trim().split("\n").pop() ?? ""}`));
    });
  });
}

// Costruisce un MP4 da una lista di {png, sec, zoom} usando il demuxer concat di
// ffmpeg. Se `zoom` e' true sul frame, applica un lieve Ken Burns (zoompan) — ha
// senso solo sui frame con immagine di sfondo; i frame a gradiente restano statici.
// Filtro video dello SFONDO di una scena: dall'input `inputIdx` → label `out`, dimensioni REEL e
// fps fisso. C) Ken Burns VARIATO per scena (`sceneIdx`): zoom-in centro / pan sx→dx / pan alto→basso /
// zoom-out. Frame a gradiente (no immagine) = statici.
function sceneVideoFilter(
  inputIdx: number,
  sceneIdx: number,
  out: string,
  sec: number,
  zoom: boolean,
  fps: number,
): string {
  const frameCount = Math.max(1, Math.round(Math.max(1, sec) * fps));
  if (!zoom) {
    return (
      `[${inputIdx}:v]scale=${REEL_W}:${REEL_H}:force_original_aspect_ratio=increase,` +
      `crop=${REEL_W}:${REEL_H},fps=${fps},setsar=1,format=yuv420p${out}`
    );
  }
  const SS = 2; // sovracampiona per uno zoompan nitido
  // IMPORTANTE: trim=end_frame=1 passa UN solo frame a zoompan; con d=frameCount l'output dura
  // ESATTAMENTE la scena (senza, l'immagine in -loop moltiplicherebbe i frame → video lunghissimo).
  const head =
    `[${inputIdx}:v]scale=${REEL_W * SS}:${REEL_H * SS}:force_original_aspect_ratio=increase,` +
    `crop=${REEL_W * SS}:${REEL_H * SS},trim=end_frame=1,setpts=PTS-STARTPTS,`;
  const tail = `:d=${frameCount}:s=${REEL_W}x${REEL_H}:fps=${fps},setsar=1,format=yuv420p${out}`;
  const center = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  let zp: string;
  switch (sceneIdx % 4) {
    case 0: // zoom IN, centrato
      zp = `zoompan=z='min(zoom+0.0010,1.10)':${center}`;
      break;
    case 1: // pan SINISTRA→DESTRA, zoom fisso
      zp = `zoompan=z='1.08':x='(iw-iw/zoom)*on/${frameCount}':y='ih/2-(ih/zoom/2)'`;
      break;
    case 2: // pan ALTO→BASSO, zoom fisso
      zp = `zoompan=z='1.08':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/${frameCount}'`;
      break;
    default: // zoom OUT, centrato (parte da 1.10 e rientra)
      zp = `zoompan=z='if(eq(on,0),1.10,max(1.001,zoom-0.0010))':${center}`;
      break;
  }
  return head + zp + tail;
}

async function framesToMp4(
  bin: string,
  frames: { file: string; textFile?: string; sec: number; zoom?: boolean }[],
  outPath: string,
  audioPath?: string | null,
): Promise<void> {
  const FPS = 30;
  const XFADE = 0.5; // B) durata del crossfade tra una scena e l'altra
  const TFADE = 0.6; // D) durata della dissolvenza in entrata del testo
  const n = frames.length;
  // Input: per ogni scena lo SFONDO e (se presente) il LAYER TESTO. Indici tracciati per scena.
  const inputs: string[] = [];
  const idxMap: { bg: number; txt?: number }[] = [];
  let idx = 0;
  for (const f of frames) {
    const t = String(Math.max(1, f.sec));
    inputs.push("-loop", "1", "-t", t, "-i", f.file);
    const bg = idx++;
    let txt: number | undefined;
    if (f.textFile) {
      inputs.push("-loop", "1", "-t", t, "-i", f.textFile);
      txt = idx++;
    }
    idxMap.push({ bg, txt });
  }
  // C) sfondo (Ken Burns variato) + D) overlay testo con dissolvenza → ogni scena produce [v{i}].
  const parts: string[] = [];
  frames.forEach((f, i) => {
    const { bg, txt } = idxMap[i]!;
    if (txt == null) {
      parts.push(sceneVideoFilter(bg, i, `[v${i}]`, f.sec, !!f.zoom, FPS));
    } else {
      parts.push(sceneVideoFilter(bg, i, `[bg${i}]`, f.sec, !!f.zoom, FPS));
      parts.push(
        `[${txt}:v]scale=${REEL_W}:${REEL_H},format=rgba,` +
          `fade=t=in:st=0:d=${TFADE}:alpha=1,fps=${FPS},setsar=1[tx${i}]`,
      );
      parts.push(`[bg${i}][tx${i}]overlay=0:0,format=yuv420p,setsar=1[v${i}]`);
    }
  });
  const pre = parts.join(";");

  // B) catena di CROSSFADE tra le scene (xfade). Con 1 sola scena niente xfade.
  // offset del k-esimo xfade = durata cumulata finora − XFADE; durata totale = somma − (n−1)·XFADE.
  let vOut: string;
  let xfadeChain = "";
  let totalSec: number;
  if (n <= 1) {
    vOut = "[v0]";
    totalSec = Math.max(1, frames[0]?.sec ?? 1);
  } else {
    let prev = "[v0]";
    let cumul = Math.max(1, frames[0]!.sec);
    for (let k = 1; k < n; k++) {
      const out = k === n - 1 ? "[outv]" : `[xf${k}]`;
      const offset = Math.max(0, cumul - XFADE).toFixed(3);
      xfadeChain += `;${prev}[v${k}]xfade=transition=fade:duration=${XFADE}:offset=${offset}${out}`;
      prev = out;
      cumul += Math.max(1, frames[k]!.sec) - XFADE;
    }
    vOut = "[outv]";
    totalSec = cumul;
  }

  // Audio (best-effort): fade-in/out morbidi; -shortest taglia alla durata del video.
  const hasAudio = typeof audioPath === "string" && audioPath !== "";
  const audioInput = hasAudio ? ["-i", audioPath as string] : [];
  const audioIndex = idx; // l'audio è l'input successivo a TUTTI gli input video (bg + testi)
  const FADE_IN = 0.3;
  const FADE_OUT = Math.min(0.6, totalSec / 2);
  const fadeOutStart = Math.max(0, totalSec - FADE_OUT);
  const audioFilter = hasAudio
    ? `;[${audioIndex}:a]afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${FADE_OUT.toFixed(2)}[outa]`
    : "";

  const filter = `${pre}${xfadeChain}${audioFilter}`;
  const args = [
    "-y",
    ...inputs,
    ...audioInput,
    "-filter_complex",
    filter,
    "-map",
    vOut,
    ...(hasAudio ? ["-map", "[outa]", "-c:a", "aac", "-shortest"] : []),
    "-r",
    "30",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outPath,
  ];
  await runFfmpeg(bin, args);
}

interface FrameDesc {
  el: El; // SFONDO della scena (immagine+velo o gradiente)
  sec: number;
  zoom?: boolean; // Ken Burns: applicato da ffmpeg solo se true (scene con immagine).
  // D) Layer del TESTO su sfondo trasparente: se presente, ffmpeg lo sovrappone con una
  // dissolvenza in entrata (testo animato). Assente (es. storyboard) = `el` è il frame completo.
  textEl?: El;
}

async function renderFramesToMp4(
  descs: FrameDesc[],
  ctx: RenderContext,
  audioPath?: string | null,
): Promise<RenderOutput> {
  const fonts = await loadFonts();
  if (fonts.length === 0) {
    throw new RendererUnavailableError("Reel non disponibile: nessun font in server/assets/fonts.");
  }
  const satori = await loadSatori();
  const Resvg = await loadResvg();
  const bin = await ffmpegPath();

  const work = await mkdtemp(join(tmpdir(), "booksocial-reel-"));
  try {
    const frameFiles: { file: string; textFile?: string; sec: number; zoom?: boolean }[] = [];
    for (let i = 0; i < descs.length; i++) {
      const d = descs[i]!;
      const png = await elementToPng(satori, Resvg, d.el, REEL_W, REEL_H, fonts);
      const file = join(work, `bg-${String(i).padStart(3, "0")}.png`);
      await writeFile(file, png);
      let textFile: string | undefined;
      if (d.textEl) {
        const tpng = await elementToPng(satori, Resvg, d.textEl, REEL_W, REEL_H, fonts);
        textFile = join(work, `txt-${String(i).padStart(3, "0")}.png`);
        await writeFile(textFile, tpng);
      }
      frameFiles.push({ file, textFile, sec: d.sec ?? 3, zoom: d.zoom });
    }
    const outPath = join(ctx.outDir, `${ctx.baseName}.mp4`);
    await framesToMp4(bin, frameFiles, outPath, audioPath);
    return { path: outPath, mediaType: "REEL" };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

// Risolve spec.music.trackId nel path su disco della traccia (best-effort).
// Fallback SILENZIOSO a null se assente/non risolvibile: il reel resta muto.
async function resolveMusicPath(trackId: number | null | undefined): Promise<string | null> {
  if (trackId == null || !Number.isInteger(trackId) || trackId <= 0) return null;
  try {
    const { music } = await import("../db/repositories.js");
    const track = await music.get(trackId);
    if (!track?.path) return null;
    if (!existsSync(track.path)) return null;
    return track.path;
  } catch {
    return null;
  }
}

export async function renderReelVideo(spec: VisualSpec, ctx: RenderContext): Promise<RenderOutput> {
  if (spec.kind !== "reel_text") {
    throw new RendererUnavailableError("renderReelVideo richiede uno spec reel_text.");
  }
  const reel = spec as ReelTextSpec;
  // Risolvi le immagini di sfondo per-scena (best-effort): id non risolvibili ->
  // null -> scena a gradiente. Piu' scene con immagini diverse = slideshow.
  const descs: FrameDesc[] = [];
  for (let i = 0; i < reel.scenes.length; i++) {
    const scene = reel.scenes[i]!;
    const imageUri = await imageIdToDataUri(scene.imageId);
    // D) Sfondo e testo su DUE layer: lo sfondo prende il Ken Burns, il testo entra in dissolvenza.
    descs.push({
      el: buildReelBg(reel, imageUri),
      textEl: buildReelText(reel, i, !!imageUri),
      sec: scene.sec,
      zoom: !!imageUri, // Ken Burns solo sulle scene con foto reale.
    });
  }
  // Risolvi la traccia musicale (best-effort): se assente/non risolvibile, reel muto.
  const audioPath = await resolveMusicPath(reel.music?.trackId);
  return renderFramesToMp4(descs, ctx, audioPath);
}

// Variante video dello storyboard: un frame per pannello (3s ciascuno).
export async function renderStoryboardVideo(
  spec: VisualSpec,
  ctx: RenderContext,
): Promise<RenderOutput> {
  if (spec.kind !== "storyboard") {
    throw new RendererUnavailableError("renderStoryboardVideo richiede uno spec storyboard.");
  }
  const sb = spec as StoryboardSpec;
  // Riusa il layout storyboard (gia' 9:16-friendly) come singolo frame statico animato.
  void dimsFor; // dims gestite da REEL_W/REEL_H
  // Risolvi eventuali immagini di sfondo dei pannelli (best-effort).
  const images = new Map<number, string>();
  const ids = Array.from(
    new Set(sb.panels.map((p) => p.imageId).filter((id): id is number => id != null)),
  );
  for (const id of ids) {
    const uri = await imageIdToDataUri(id);
    if (uri) images.set(id, uri);
  }
  const frame = buildStoryboard(sb, images) as El;
  return renderFramesToMp4([{ el: frame, sec: Math.max(4, sb.panels.length * 2) }], ctx);
}
