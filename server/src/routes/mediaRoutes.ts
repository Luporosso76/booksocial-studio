import { Hono } from "hono";
import { appConfig } from "../config.js";
import { reviseScenePrompt, type SceneFlashback } from "../content/imagePrompt.js";
import { verifySceneImage } from "../content/visionCheck.js";
import { query } from "../db/pool.js";
import { characters, media, settings } from "../db/repositories.js";
import { createImageEngine } from "../media/imageEngine.js";
import { applyStyleForProvider } from "../media/imageGen.js";
import {
  bumpMediaRegenCompleted,
  cancelMediaRegen,
  clearMediaRegenQueue,
  enqueueMediaRegen,
  finishMediaRegen,
  isMediaRegenerating,
  listActiveMediaRegen,
  nextMediaRegen,
} from "../mediaRegenJobs.js";
import { mediaDir, resolveDataPath, resolveInsideDataDir } from "../paths.js";
import { mediaDto } from "../serialize.js";
import { validateUpload } from "../uploads.js";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import * as aiSettings from "../content/aiSettings.js";
import { err, jsonBody, sceneAspectOfFile, type RouteContext } from "./_shared.js";

const regeneratingMedia = new Map<number, AbortController>();
let mediaRegenWorkerRunning = false;

export function mountMedia(api: Hono, ctx: RouteContext): void {
  const { deps, runImageGenExclusive } = ctx;

  async function runMediaRegenWorker(): Promise<void> {
    if (mediaRegenWorkerRunning) return;
    mediaRegenWorkerRunning = true;
    try {
      await runImageGenExclusive(async () => {
        let job;
        while ((job = nextMediaRegen())) {
          const ac = new AbortController();
          regeneratingMedia.set(job.mediaId, ac);
          try {
            const m = await media.get(job.mediaId);
            if (!m || !m.genPrompt || ac.signal.aborted) continue;

            let basePrompt: string;
            let rebuiltTags: string[] | null = null;

            if ((job.rebuild || job.flashback) && m.chapterIdx != null) {
              const plainChapterRebuild =
                job.rebuild === true &&
                !job.flashback &&
                (!job.characters || job.characters.length === 0);
              const selectedScene = plainChapterRebuild
                ? await deps.sceneImages.selectFreshSceneForChapter(m.bookId, m.chapterIdx)
                : null;

              const rebuilt = await deps.sceneImages.buildPromptDataForChapter(
                m.bookId,
                m.chapterIdx,
                {
                  ...(job.characters && job.characters.length > 0
                    ? { featureCharacters: job.characters }
                    : {}),
                  ...(job.flashback ? { flashback: job.flashback } : {}),
                  ...(selectedScene ? { selectedScene } : {}),
                },
              );
              basePrompt = rebuilt && rebuilt.prompt.trim() !== "" ? rebuilt.prompt : m.genPrompt;
              rebuiltTags = rebuilt?.tags ?? null;
            } else if (job.prompt && job.prompt.trim() !== "") {
              basePrompt = job.prompt.trim();
            } else {
              basePrompt = m.genPrompt;
            }
            if (ac.signal.aborted) continue;

            let prompt = basePrompt;
            if (job.changes && job.changes.trim() !== "") {
              const revised = await reviseScenePrompt(deps.engine, {
                oldPrompt: applyStyleForProvider(basePrompt, aiSettings.getImage().provider),
                changes: job.changes.trim(),
              });
              if (revised && !ac.signal.aborted) prompt = revised;
            }
            if (ac.signal.aborted) continue;
            const aspect = await sceneAspectOfFile(resolveDataPath(m.path));

            const genPromptStore = applyStyleForProvider(prompt, aiSettings.getImage().provider);
            const newPath = join(mediaDir(), `scene-${m.bookId}-${randomUUID()}.png`);
            const ok = await createImageEngine().generate({
              prompt,
              aspect,
              outPath: newPath,
              signal: ac.signal,
            });
            if (ok && !ac.signal.aborted) {
              const oldPath = resolveDataPath(m.path);
              await media.updateAfterRegen(job.mediaId, {
                path: newPath,
                genPrompt: genPromptStore,
                ...(rebuiltTags ? { tags: rebuiltTags } : {}),
                addedAt: Date.now(),
              });
              if (oldPath !== newPath) await unlink(oldPath).catch(() => {});
              bumpMediaRegenCompleted();

              try {
                if ((await settings.get("qa_enabled")) !== "off") {
                  let curPath = newPath;
                  let verdict = await verifySceneImage({
                    imagePath: curPath,
                    genPrompt: genPromptStore,
                    binary: appConfig.opencodeBinary,
                    model: appConfig.opencodeModel,
                    timeoutMs: appConfig.visionTimeoutMs,
                  });

                  if (
                    job.verify === true &&
                    verdict != null &&
                    verdict.ok === false &&
                    !ac.signal.aborted
                  ) {
                    const retryPath = join(mediaDir(), `scene-${m.bookId}-${randomUUID()}.png`);
                    const retryOk = await createImageEngine().generate({
                      prompt,
                      aspect,
                      outPath: retryPath,
                      signal: ac.signal,
                    });
                    if (retryOk && !ac.signal.aborted) {
                      await media.updateAfterRegen(job.mediaId, {
                        path: retryPath,
                        genPrompt: genPromptStore,
                        ...(rebuiltTags ? { tags: rebuiltTags } : {}),
                        addedAt: Date.now(),
                      });
                      if (curPath !== retryPath) await unlink(curPath).catch(() => {});
                      curPath = retryPath;
                      verdict = await verifySceneImage({
                        imagePath: curPath,
                        genPrompt: genPromptStore,
                        binary: appConfig.opencodeBinary,
                        model: appConfig.opencodeModel,
                        timeoutMs: appConfig.visionTimeoutMs,
                      });
                    }
                  }
                  await media.setQa(job.mediaId, verdict);
                }
              } catch {}
            }
          } catch (e) {
            console.warn(
              `[media] rigenerazione ${job.mediaId} fallita: ${e instanceof Error ? e.message : String(e)}`,
            );
          } finally {
            regeneratingMedia.delete(job.mediaId);
            finishMediaRegen();
          }
        }
      });
    } finally {
      mediaRegenWorkerRunning = false;
    }
  }

  api.get("/media/file/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const rows = await query<{ path: string }>("SELECT path FROM media_asset WHERE id = ?", [id]);
    if (rows.length === 0) return c.json(err("Immagine non trovata"), 404);
    try {
      const p = resolveInsideDataDir(rows[0]!.path);
      const buf = await readFile(p);
      const ext = extname(p).toLowerCase();
      const type =
        ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : "image/jpeg";
      c.header("Content-Type", type);
      c.header("Cache-Control", "private, max-age=3600");
      return c.body(buf);
    } catch {
      return c.json(err("File immagine assente su disco"), 404);
    }
  });

  api.get("/books/:id/media", async (c) => {
    const id = Number(c.req.param("id"));

    const usageMap = await media.usageByBook(id);
    return c.json((await media.uploadsByBook(id)).map((m) => mediaDto(m, usageMap.get(m.id))));
  });

  api.post("/books/:id/media", async (c) => {
    const id = Number(c.req.param("id"));
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) {
      return c.json(err("Campo 'file' (immagine) mancante nel multipart"), 400);
    }
    const scope =
      typeof form["scope"] === "string" && form["scope"] === "CHAPTER" ? "CHAPTER" : "GENERAL";
    const chapterId =
      typeof form["chapterId"] === "string" && form["chapterId"].trim() !== ""
        ? Number(form["chapterId"])
        : null;
    const caption =
      typeof form["caption"] === "string" && form["caption"].trim() !== ""
        ? (form["caption"] as string)
        : null;

    const { buffer: buf, ext } = await validateUpload(file, "image");
    const dir = mediaDir();
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${id}-${randomUUID()}.${ext}`);
    await writeFile(path, buf);

    const asset = await media.insert({
      bookId: id,
      chapterId,
      scope,
      path,
      caption,
      genPrompt: null,
      chapterIdx: null,
      tags: [],
      addedAt: Date.now(),
    });
    return c.json(mediaDto(asset));
  });

  api.delete("/books/:id/media/:mediaId", async (c) => {
    await media.delete(Number(c.req.param("mediaId")));
    return c.json({ ok: true });
  });

  api.get("/media/regen-status", (c) => {
    return c.json(listActiveMediaRegen());
  });

  api.post("/media/regenerate-batch", async (c) => {
    if (!deps.sceneImages.available())
      return c.json(err("Generazione immagini non disponibile."), 503);
    const body = await jsonBody(c);
    const rawIds: unknown[] = Array.isArray(body.mediaIds) ? body.mediaIds : [];
    const ids = [
      ...new Set(
        rawIds.map((n) => Math.floor(Number(n))).filter((n) => Number.isInteger(n) && n > 0),
      ),
    ];
    if (ids.length === 0) return c.json(err("Nessuna immagine valida (mediaIds mancante)"), 400);
    const changes =
      typeof body.changes === "string" && body.changes.trim() !== ""
        ? body.changes.trim()
        : undefined;

    const verify = body.verify === true;
    let queued = 0;
    for (const id of ids) {
      if (isMediaRegenerating(id)) continue;
      const m = await media.get(id);
      if (!m || !m.genPrompt) continue;
      enqueueMediaRegen({
        mediaId: id,
        bookId: m.bookId,
        ...(changes ? { changes } : {}),
        ...(verify ? { verify: true } : {}),
      });
      queued++;
    }
    if (queued > 0) void runMediaRegenWorker();
    return c.json({ queued });
  });

  api.post("/media/regenerate/cancel-all", (c) => {
    clearMediaRegenQueue();
    for (const ac of regeneratingMedia.values()) ac.abort();
    return c.json({ cancelled: true });
  });

  api.post("/media/:id/regenerate", async (c) => {
    const id = Number(c.req.param("id"));
    const m = await media.get(id);
    if (!m) return c.json(err("Immagine non trovata"), 404);
    if (!m.genPrompt) return c.json(err("Immagine non rigenerabile (nessun prompt salvato)."), 400);
    if (!deps.sceneImages.available())
      return c.json(err("Generazione immagini non disponibile."), 503);
    if (isMediaRegenerating(id))
      return c.json(err("Rigenerazione già in corso o accodata per questa immagine"), 409);
    const body = await jsonBody(c);
    const edited =
      typeof body.prompt === "string" && body.prompt.trim() !== "" ? body.prompt.trim() : undefined;
    const changes =
      typeof body.changes === "string" && body.changes.trim() !== ""
        ? body.changes.trim()
        : undefined;

    const rebuild = body.rebuild === true;

    const verify = body.verify === true;

    const rawRegenNames: string[] = Array.isArray(body.characters)
      ? body.characters.filter((n: unknown): n is string => typeof n === "string")
      : [];
    const wantedRegen = [...new Set(rawRegenNames.map((n) => n.trim()).filter((n) => n !== ""))];
    let regenChars: string[] | undefined;
    if (wantedRegen.length > 0) {
      const cast = await characters.byBook(m.bookId);
      const normalized: string[] = [];
      for (const name of wantedRegen) {
        const match = cast.find((cc) => cc.name.toLowerCase() === name.toLowerCase());
        if (!match) return c.json(err(`Personaggio non trovato nel cast del libro: ${name}`), 400);
        if (!normalized.includes(match.name)) normalized.push(match.name);
      }
      regenChars = normalized;
    }

    let regenFlashback: SceneFlashback | undefined;
    const rfbRaw = body.flashback as Record<string, unknown> | null | undefined;
    if (rfbRaw && typeof rfbRaw === "object") {
      const yy = Math.floor(Number(rfbRaw.youngerYears));
      const fbSetting =
        typeof rfbRaw.setting === "string" ? rfbRaw.setting.trim().slice(0, 200) : "";
      const fbNote = typeof rfbRaw.note === "string" ? rfbRaw.note.trim().slice(0, 300) : "";
      const hasYears = Number.isInteger(yy) && yy > 0 && yy <= 120;
      if (hasYears || fbSetting || fbNote) {
        regenFlashback = {
          ...(hasYears ? { youngerYears: yy } : {}),
          ...(fbSetting ? { setting: fbSetting } : {}),
          ...(fbNote ? { note: fbNote } : {}),
        };
      }
    }
    enqueueMediaRegen({
      mediaId: id,
      bookId: m.bookId,
      ...(edited ? { prompt: edited } : {}),
      ...(changes ? { changes } : {}),
      ...(rebuild ? { rebuild: true } : {}),
      ...(regenChars ? { characters: regenChars } : {}),
      ...(regenFlashback ? { flashback: regenFlashback } : {}),
      ...(verify ? { verify: true } : {}),
    });
    void runMediaRegenWorker();
    return c.json({ started: true, queued: true });
  });

  api.get("/media/:id/regen-status", (c) => {
    return c.json({
      regenerating: isMediaRegenerating(Number(c.req.param("id"))),
    });
  });

  api.post("/media/:id/regenerate/cancel", (c) => {
    const id = Number(c.req.param("id"));
    const where = cancelMediaRegen(id);
    if (where === "current") {
      const ac = regeneratingMedia.get(id);
      if (ac) ac.abort();
    }
    return c.json({ cancelled: where !== "none", where });
  });

  api.put("/media/:id/catalog", async (c) => {
    const id = Number(c.req.param("id"));
    const m = await media.get(id);
    if (!m) return c.json(err("Immagine non trovata"), 404);
    const body = await jsonBody(c);

    let tags = m.tags;
    if (Array.isArray(body.tags)) {
      const seen = new Set<string>();
      tags = (body.tags as unknown[])
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t) => t.length > 0 && t.length <= 30)
        .filter((t) => {
          const k = t.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 20);
    }

    let chapterIdx = m.chapterIdx;
    if ("chapterIdx" in body) {
      if (body.chapterIdx === null) chapterIdx = null;
      else {
        const n = Math.floor(Number(body.chapterIdx));
        chapterIdx = Number.isInteger(n) && n >= 0 ? n : m.chapterIdx;
      }
    }

    await media.updateCatalog(id, { tags, chapterIdx });
    const updated = await media.get(id);
    return c.json(mediaDto(updated ?? m));
  });
}
