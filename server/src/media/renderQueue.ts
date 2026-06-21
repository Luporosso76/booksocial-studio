import { mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { mediaDir } from "../paths.js";
import { books, media, posts, renderJobs } from "../db/repositories.js";
import type { RenderJob } from "../domain.js";
import { validateSpec, type VisualKind, type VisualSpec } from "./spec.js";
import { renderSpec } from "./renderers/index.js";
import { RendererUnavailableError } from "./renderers/types.js";

// Coda render IN-PROCESS (app mono-utente: niente BullMQ/Redis). Un solo worker
// processa un job alla volta. Per ogni job:
//  1) carica lo spec, chiama il renderer giusto (Satori/Remotion);
//  2) salva il file in mediaDir, registra in media_asset legato a libro/post;
//  3) se postId: imposta media_path della bozza;
//  4) segna 'done'. Errori -> 'failed' con messaggio. Renderer non disponibile
//     (dipendenza assente) -> 'failed' con messaggio chiaro. MAI crash dell'app.

let working = false;

function specKindToVisualKind(kind: string): VisualKind {
  if (kind === "reel_text" || kind === "storyboard") return kind;
  return "quote_card";
}

/**
 * Accoda un nuovo job render: inserisce render_job 'queued' e avvia il worker se idle.
 * Ritorna il job creato (status 'queued').
 */
export async function enqueue(
  spec: VisualSpec,
  opts: { postId: number | null; bookId: number | null },
): Promise<RenderJob> {
  const job = await renderJobs.insert({
    postId: opts.postId,
    bookId: opts.bookId,
    kind: spec.kind,
    specJson: JSON.stringify(spec),
  });
  // Avvia il worker in background (non blocca la risposta HTTP).
  void pump();
  return job;
}

/** Riavvia il worker se ci sono job in coda (es. dopo un restart). */
export function kick(): void {
  void pump();
}

async function pump(): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (;;) {
      const job = await renderJobs.nextQueued();
      if (!job) break;
      await processOne(job);
    }
  } finally {
    working = false;
  }
}

async function processOne(job: RenderJob): Promise<void> {
  await renderJobs.setStatus(job.id, "rendering");
  try {
    const spec = validateSpec(specKindToVisualKind(job.kind), safeParse(job.specJson));

    const outDir = mediaDir();
    await mkdir(outDir, { recursive: true });
    const baseName = `render-${job.id}-${randomUUID()}`;

    // Brand: accent dallo spec quote_card se presente; titolo dal libro.
    let title: string | null = null;
    if (job.bookId != null) {
      const book = await books.get(job.bookId);
      title = book?.title ?? null;
    }
    const accent = spec.kind === "quote_card" ? spec.accent : null;

    const out = await renderSpec(spec, {
      outDir,
      baseName,
      brand: { title, accent },
    });

    // Registra l'asset in media_asset col scope dedicato 'GENERATED': è un visual creato
    // per un post, NON un'immagine caricata. Così non compare nella libreria del libro,
    // non viene scelto come cover e non viene riusato come sfondo (vedi media.uploadsByBook).
    if (job.bookId != null) {
      await media.insert({
        bookId: job.bookId,
        chapterId: null,
        scope: "GENERATED",
        path: out.path,
        caption: `visual ${job.kind}`,
        genPrompt: null,
        chapterIdx: null,
        tags: [],
        addedAt: Date.now(),
      });
    }

    // Se legato a una bozza, imposta media_path. NON sovrascrivere il mediaType per le
    // STORIE: una storia viene renderizzata col renderer reel/card (out.mediaType REEL/PHOTO),
    // ma la DESTINAZIONE resta la Storia. Il tipo lo decide il pianificatore, non il render.
    if (job.postId != null) {
      const post = await posts.get(job.postId);
      if (post) {
        const oldPath = post.mediaPath;
        post.mediaPath = out.path;
        if (post.mediaType !== "STORY") post.mediaType = out.mediaType;
        post.updatedAt = Date.now();
        await posts.update(post);
        // Se la bozza aveva già un visual (es. dopo "Rigenera"), rimuovi il vecchio file e
        // la sua riga media_asset: altrimenti resta orfano a ogni rigenerazione.
        if (oldPath && oldPath !== out.path) {
          await media.deleteByPath(oldPath).catch(() => {});
          await unlink(oldPath).catch(() => {});
        }
      }
    }

    await renderJobs.setStatus(job.id, "done", { outputPath: out.path });
  } catch (e) {
    const msg =
      e instanceof RendererUnavailableError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    // eslint-disable-next-line no-console
    console.warn(`[render] job ${job.id} (${job.kind}) fallito: ${msg}`);
    await renderJobs.setStatus(job.id, "failed", { error: msg });
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
