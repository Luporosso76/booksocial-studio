import { Hono } from "hono";
import { translateToEnglish } from "../content/translate.js";
import { books, characters } from "../db/repositories.js";
import { createImageEngine } from "../media/imageEngine.js";
import { type SceneAspect } from "../media/imageGen.js";
import { generatedDir, resolveInsideDataDir } from "../paths.js";
import {
  bumpSceneCreated,
  cancelSceneBatch,
  clearSceneQueue,
  enqueueSceneBatch,
  failSceneGen,
  finishSceneGen,
  getSceneGen,
  nextSceneBatch,
  setSceneGenWaiting,
  type SceneBatch,
} from "../sceneGenJobs.js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { STYLE_PRESETS, err, isSceneAspect, jsonBody, type RouteContext } from "./_shared.js";

const activeSceneGen = new Map<number, AbortController>();

interface FreeformJob {
  status: "generating" | "ready" | "failed";
  prompt: string;
  path: string | null;
  aspect: SceneAspect;
  error: string | null;

  waiting: boolean;
  createdAt: number;
}
const freeformJobs = new Map<string, FreeformJob>();
const freeformAbort = new Map<string, AbortController>();

export function mountImageGen(api: Hono, ctx: RouteContext): void {
  const { deps, runImageGenExclusive } = ctx;

  api.get("/imagegen/available", (c) => {
    return c.json({ available: deps.sceneImages.available() });
  });

  api.post("/books/:id/generate-images", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    if (!deps.sceneImages.available()) {
      return c.json(
        err("Generazione immagini non disponibile (sd-cli/modello assenti su questo ambiente)."),
        503,
      );
    }
    const body = await jsonBody(c);
    const count = Math.max(1, Math.min(20, Math.floor(Number(body.count)) || 1));
    const aspect: SceneAspect = isSceneAspect(body.aspect) ? body.aspect : "1:1";

    const rawCh: unknown[] = Array.isArray(body.chapters) ? body.chapters : [];
    let chapters = [
      ...new Set(
        rawCh.map((n) => Math.floor(Number(n))).filter((n) => Number.isInteger(n) && n >= 0),
      ),
    ];
    if (chapters.length === 0) {
      const legacy = Math.floor(Number(body.chapterIndex));
      if (Number.isInteger(legacy) && legacy >= 0) chapters = [legacy];
    }

    const rawNames: string[] = Array.isArray(body.characters)
      ? body.characters.filter((n: unknown): n is string => typeof n === "string")
      : typeof body.character === "string"
        ? [body.character]
        : [];
    const wantedNames = [...new Set(rawNames.map((n) => n.trim()).filter((n) => n !== ""))];
    let charNames: string[] | undefined;
    if (wantedNames.length > 0) {
      const cast = await characters.byBook(id);
      const normalized: string[] = [];
      for (const name of wantedNames) {
        const match = cast.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!match) return c.json(err(`Personaggio non trovato nel cast del libro: ${name}`), 400);
        if (!normalized.includes(match.name)) normalized.push(match.name);
      }
      charNames = normalized;

      if (chapters.length === 0) {
        const excludedIdx = new Set(
          (await books.chapters(id)).filter((ch) => ch.excluded).map((ch) => ch.index),
        );
        const union = new Set<number>();
        for (const name of normalized) {
          const ch = cast.find((c) => c.name === name);
          for (const idx of ch?.chapters ?? []) if (!excludedIdx.has(idx)) union.add(idx);
        }
        if (union.size > 0) chapters = [...union];
      }
    }

    const forceFlashback = body.flashback === true;

    let moment: number | undefined;
    if (body.moment != null && body.moment !== "") {
      const mRaw = Math.floor(Number(body.moment));
      if (mRaw === -1) moment = -1;
      else if (Number.isInteger(mRaw) && mRaw >= 0 && chapters.length === 1) moment = mRaw;
    }
    const batch: SceneBatch = {
      id: randomUUID(),
      count,
      aspect,
      chapters,
      ...(charNames ? { characters: charNames } : {}),
      ...(forceFlashback ? { forceFlashback: true } : {}),
      ...(moment != null ? { moment } : {}),
    };

    const started = enqueueSceneBatch(id, batch);
    if (!started) return c.json({ queued: true, started: false, batch });

    const ac = new AbortController();
    activeSceneGen.set(id, ac);

    setSceneGenWaiting(id, true);

    const NO_PERSON_PLACE =
      "Composition: NO person in the frame — an atmospheric WIDE view of the LOCATION itself (the landscape, sea, sky, or street of THIS passage), letting light, weather and space carry the mood. Do NOT place sports equipment lying on the ground here.";
    const NO_PERSON_GEAR_REST =
      "Composition: NO person in the frame — a still, close or medium view of an ICONIC OBJECT or DETAIL that actually belongs to THIS passage, at rest on a plausible surface (a table, a shelf, a windowsill, the ground...), physically coherent with gravity and its setting. Choose an object the chapter REALLY describes; NEVER invent sports gear, settings or props that the passage does not mention. Use this object-at-rest framing ONLY here.";

    const COMPOSITIONS = [
      "Composition: feature a SECONDARY character (NOT the protagonist) present in THIS passage, ALONE, in THREE-QUARTER FRONT view — face partly visible, candid, eyes on the subject/action (NOT on the camera), a natural alive pose. Render faithfully from the CAST by appearance. If no secondary character is present, feature whatever named character IS present; only if NO character appears, fall back to the iconic subject/place ALONE.",
      NO_PERSON_PLACE,
      "Composition: TWO characters who appear TOGETHER in THIS passage (protagonist + a secondary, or two secondaries), in a candid natural interaction with each other or the scene, faces turned toward what they are doing — never toward the camera, never a posed portrait. If only one is present, feature that one alone; if none, the iconic subject/place ALONE.",
      "Composition: the PROTAGONIST seen FROM BEHIND or over-the-shoulder (face not visible), actively USING the gear/equipment or walking toward the subject. No posed portrait, no eye contact.",
      "Composition: feature a SECONDARY character present in THIS passage IN CLOSE/MEDIUM SHOT in the FOREGROUND, INTERACTING with the scene (touching, handling or reaching for the iconic subject), candid, gaze on what they are doing — never on the camera, never a posed portrait. Render faithfully from the CAST by appearance. If no secondary is present, feature whatever named character IS present; only if none, the iconic subject ALONE.",
      NO_PERSON_GEAR_REST,
      "Composition: TWO DIFFERENT characters present in THIS passage, or a small GROUP of three, sharing the moment in a candid natural way (talking, walking, working together), faces turned toward each other or the action — never toward the camera. If fewer are present, feature those who are; if none, the iconic subject/place ALONE.",
      "Composition: a character present in THIS passage (prefer a SECONDARY) in PROFILE (side view) or as a SMALL DISTANT figure in a wide landscape, in motion and absorbed in the subject/action, gaze on the scene — never toward the camera. If no person fits, the iconic subject ALONE.",
    ];

    void runImageGenExclusive(async () => {
      setSceneGenWaiting(id, false);
      let compIdx = 0;
      try {
        let b;
        while (!ac.signal.aborted && (b = nextSceneBatch(id))) {
          const bAspect: SceneAspect = isSceneAspect(b.aspect) ? b.aspect : "1:1";
          if (b.chapters.length === 0) {
            const usedChapters: number[] = [];
            for (let i = 0; i < b.count && !ac.signal.aborted; i++) {
              const canSelectFreshScene =
                !(b.characters && b.characters.length > 0) && !b.forceFlashback && b.moment == null;
              const res = await deps.sceneImages.generateForBook(id, bAspect, {
                avoidChapterIndexes: usedChapters,
                angle: COMPOSITIONS[compIdx++ % COMPOSITIONS.length],
                ...(b.characters && b.characters.length > 0
                  ? { featureCharacters: b.characters }
                  : {}),
                ...(b.forceFlashback ? { forceFlashback: true } : {}),
                ...(canSelectFreshScene
                  ? { selectFreshScene: true }
                  : b.moment != null
                    ? { moment: b.moment }
                    : { randomMoment: true }),
                signal: ac.signal,
              });
              if (res) bumpSceneCreated(id);
              if (res?.chapterIndex != null) usedChapters.push(res.chapterIndex);
            }
          } else {
            for (const ch of b.chapters) {
              const canSelectScenes =
                !(b.characters && b.characters.length > 0) &&
                !b.forceFlashback &&
                (b.moment == null || b.moment < 0);
              const selectedScenes = canSelectScenes
                ? await deps.sceneImages.selectScenesForChapter(id, ch, b.count)
                : null;
              for (let i = 0; i < b.count && !ac.signal.aborted; i++) {
                const selectedScene = selectedScenes?.[i] ?? null;
                const res = await deps.sceneImages.generateForBook(id, bAspect, {
                  chapterIndex: ch,
                  angle: COMPOSITIONS[compIdx++ % COMPOSITIONS.length],
                  ...(selectedScene ? { selectedScene } : {}),
                  ...(b.characters && b.characters.length > 0
                    ? { featureCharacters: b.characters }
                    : {}),
                  ...(b.forceFlashback ? { forceFlashback: true } : {}),
                  ...(b.moment != null
                    ? { moment: b.moment }
                    : selectedScene
                      ? {}
                      : { randomMoment: true }),
                  signal: ac.signal,
                });
                if (res) bumpSceneCreated(id);
              }
            }
          }
        }
        finishSceneGen(id, ac.signal.aborted);
      } catch (e) {
        failSceneGen(id, e instanceof Error ? e.message : String(e));
      } finally {
        activeSceneGen.delete(id);
      }
    });
    return c.json({ queued: true, started: true, batch });
  });

  api.post("/books/:id/generate-images/cancel", (c) => {
    const id = Number(c.req.param("id"));
    clearSceneQueue(id);
    const ac = activeSceneGen.get(id);
    if (ac) ac.abort();
    return c.json({ cancelled: !!ac });
  });

  api.post("/books/:id/generate-images/queue/:batchId/cancel", (c) => {
    const id = Number(c.req.param("id"));
    const cancelled = cancelSceneBatch(id, c.req.param("batchId"));
    return c.json({ cancelled });
  });

  api.get("/books/:id/scenegen", (c) => {
    const j = getSceneGen(Number(c.req.param("id")));
    if (!j)
      return c.json({
        status: "idle",
        planned: 0,
        created: 0,
        error: null,
        cancelled: false,
        waiting: false,
        startedAt: 0,
        imageStartedAt: 0,
        current: null,
        queued: [],
      });
    return c.json({
      status: j.status,
      planned: j.plannedTotal,
      created: j.createdTotal,
      error: j.error,
      cancelled: j.cancelled,
      waiting: j.waiting,
      startedAt: j.startedAt,
      imageStartedAt: j.imageStartedAt,
      current: j.current,
      queued: j.queue.map((b) => ({
        id: b.id,
        count: b.count,
        aspect: b.aspect,
        chapters: b.chapters,
      })),
    });
  });

  api.post("/generate-image", async (c) => {
    if (!deps.sceneImages.available()) {
      return c.json(err("Generazione immagini non disponibile (sd-cli/modello assenti)."), 503);
    }
    const body = await jsonBody(c);
    const rawPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (rawPrompt === "") return c.json(err("Scrivi un prompt."), 400);
    const aspect: SceneAspect = isSceneAspect(body.aspect) ? body.aspect : "1:1";
    const style =
      typeof body.style === "string" && body.style in STYLE_PRESETS ? body.style : "none";
    const translate = body.translate !== false;
    const stepsN = Math.floor(Number(body.steps));
    const steps = Number.isInteger(stepsN) && stepsN > 0 && stepsN <= 30 ? stepsN : undefined;
    const seedN = Math.floor(Number(body.seed));
    const seed = Number.isInteger(seedN) && seedN >= 0 ? seedN : undefined;

    const FREEFORM_TTL_MS = 60 * 60 * 1000;
    const nowMs = Date.now();
    for (const [id, job] of freeformJobs) {
      if (nowMs - job.createdAt > FREEFORM_TTL_MS) {
        freeformJobs.delete(id);
        freeformAbort.delete(id);
      }
    }

    const jobId = randomUUID();
    freeformJobs.set(jobId, {
      status: "generating",
      prompt: rawPrompt,
      path: null,
      aspect,
      error: null,
      waiting: true,
      createdAt: Date.now(),
    });
    const ac = new AbortController();
    freeformAbort.set(jobId, ac);

    void runImageGenExclusive(async () => {
      {
        const cur0 = freeformJobs.get(jobId);
        if (cur0) freeformJobs.set(jobId, { ...cur0, waiting: false });
      }
      try {
        const base = translate ? await translateToEnglish(deps.engine, rawPrompt) : rawPrompt;

        const tail = STYLE_PRESETS[style] ?? "";
        const finalPrompt = tail ? `${base}, ${tail}` : base;
        const cur = freeformJobs.get(jobId);
        if (cur) freeformJobs.set(jobId, { ...cur, prompt: finalPrompt });
        if (ac.signal.aborted) {
          freeformJobs.delete(jobId);
          return;
        }

        const outPath = join(generatedDir(), `freeform-${jobId}.png`);
        const ok = await createImageEngine().generate({
          prompt: finalPrompt,
          aspect,
          outPath,
          ...(seed != null ? { seed } : {}),
          ...(steps != null ? { steps } : {}),
          signal: ac.signal,
        });
        if (ac.signal.aborted) {
          freeformJobs.delete(jobId);
          return;
        }
        const j = freeformJobs.get(jobId);
        const createdAt = j?.createdAt ?? Date.now();
        if (ok) {
          freeformJobs.set(jobId, {
            status: "ready",
            prompt: finalPrompt,
            path: outPath,
            aspect,
            error: null,
            waiting: false,
            createdAt,
          });
        } else {
          freeformJobs.set(jobId, {
            status: "failed",
            prompt: finalPrompt,
            path: null,
            aspect,
            error: "Generazione non riuscita.",
            waiting: false,
            createdAt,
          });
        }
      } catch (e) {
        const j = freeformJobs.get(jobId);
        freeformJobs.set(jobId, {
          status: "failed",
          prompt: rawPrompt,
          path: null,
          aspect,
          error: e instanceof Error ? e.message : String(e),
          waiting: false,
          createdAt: j?.createdAt ?? Date.now(),
        });
      } finally {
        freeformAbort.delete(jobId);
      }
    });

    return c.json({ jobId });
  });

  api.get("/generate-image/:jobId", (c) => {
    const j = freeformJobs.get(c.req.param("jobId"));
    if (!j) return c.json(err("Job non trovato"), 404);
    return c.json({
      status: j.status,
      prompt: j.prompt,
      error: j.error,
      waiting: j.waiting,
      url: j.status === "ready" ? `/api/generate-image/${c.req.param("jobId")}/file` : null,
    });
  });

  api.get("/generate-image/:jobId/file", async (c) => {
    const j = freeformJobs.get(c.req.param("jobId"));
    if (!j || !j.path) return c.json(err("Immagine non pronta"), 404);
    try {
      const buf = await readFile(resolveInsideDataDir(j.path));
      c.header("Content-Type", "image/png");
      c.header("Cache-Control", "private, max-age=3600");
      return c.body(buf);
    } catch {
      return c.json(err("File assente su disco"), 404);
    }
  });

  api.post("/generate-image/:jobId/cancel", (c) => {
    const ac = freeformAbort.get(c.req.param("jobId"));
    if (ac) ac.abort();
    return c.json({ cancelled: !!ac });
  });
}
