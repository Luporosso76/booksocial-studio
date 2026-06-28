import { Hono } from "hono";
import { writeFile, mkdir, readFile, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { characters, media, settings } from "../db/repositories.js";
import { generateFromPrompt } from "../media/imageGen.js";
import {
  enqueueMediaRegen,
  nextMediaRegen,
  finishMediaRegen,
  bumpMediaRegenCompleted,
  cancelMediaRegen,
  clearMediaRegenQueue,
  isMediaRegenerating,
  listActiveMediaRegen,
} from "../mediaRegenJobs.js";
import { mediaDir, resolveDataPath, resolveInsideDataDir } from "../paths.js";
import { validateUpload } from "../uploads.js";
import { reviseScenePrompt, type SceneFlashback } from "../content/imagePrompt.js";
import { verifySceneImage } from "../content/visionCheck.js";
import { appConfig } from "../config.js";
import { query } from "../db/pool.js";
import { mediaDto } from "../serialize.js";
import { sceneAspectOfFile, err, jsonBody, type RouteContext } from "./_shared.js";

// Rigenerazione SINGOLA immagine: AbortController del job CORRENTE (per media_asset id), per poterlo
// annullare. La coda vera è in mediaRegenJobs.ts (globale, seriale). Flag = un solo worker per-processo.
const regeneratingMedia = new Map<number, AbortController>();
let mediaRegenWorkerRunning = false;

export function mountMedia(api: Hono, ctx: RouteContext): void {
  const { deps, runImageGenExclusive } = ctx;

  // WORKER seriale per-processo della CODA di rigenerazione singola (mediaRegenJobs). Svuota la coda
  // GLOBALE un job alla volta: per ciascuno, se `changes` rivede il prompt con l'IA, poi genera e
  // sostituisce il file dell'immagine (id invariato). SERIALIZZAZIONE GPU: ogni chiamata al modello
  // (qui e nella generazione-di-scena) passa per la stessa coda seriale di basso livello in
  // media/imageGen.ts (`serial()` → 1 sola GPU), quindi rigenerazioni e batch di scena NON girano
  // mai in parallelo e si interlacciano immagine-per-immagine senza rischio di deadlock.
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
            // REBUILD: ricostruisce il prompt dal CAPITOLO con la pipeline attuale (regole aggiornate),
            // così un semplice "Rigenera dal capitolo" NON riusa il vecchio gen_prompt. Fallback al
            // gen_prompt salvato se la ricostruzione non è disponibile (capitolo assente, ecc.).
            let basePrompt: string;
            // Il FLASHBACK richiede la ricostruzione dal capitolo (l'override vive nella pipeline del
            // prompt), quindi forza il ramo rebuild anche senza flag rebuild esplicito.
            if ((job.rebuild || job.flashback) && m.chapterIdx != null) {
              // Con personaggi selezionati: la ricostruzione li featura sul capitolo dell'immagine.
              const rebuilt = await deps.sceneImages.buildPromptForChapter(m.bookId, m.chapterIdx, {
                ...(job.characters && job.characters.length > 0
                  ? { featureCharacters: job.characters }
                  : {}),
                ...(job.flashback ? { flashback: job.flashback } : {}),
              });
              basePrompt = rebuilt && rebuilt.trim() !== "" ? rebuilt : m.genPrompt;
            } else if (job.prompt && job.prompt.trim() !== "") {
              // Prompt esplicito passato dal chiamante: usalo tale e quale.
              basePrompt = job.prompt.trim();
            } else if (job.changes && job.changes.trim() !== "" && m.chapterIdx != null) {
              // #5: "Rigenera con modifiche" parte dal CANONE AGGIORNATO (non dal vecchio gen_prompt),
              // così le tue variazioni si applicano sopra le configurazioni correnti (aspetto/abiti/oggetti).
              const rebuilt = await deps.sceneImages.buildPromptForChapter(m.bookId, m.chapterIdx, {
                ...(job.characters && job.characters.length > 0
                  ? { featureCharacters: job.characters }
                  : {}),
              });
              basePrompt = rebuilt && rebuilt.trim() !== "" ? rebuilt : m.genPrompt;
            } else {
              // Re-roll semplice (nessuna modifica): riusa il prompt salvato, cambia solo il seed.
              basePrompt = m.genPrompt;
            }
            if (ac.signal.aborted) continue;
            // Modifiche in ITALIANO: l'IA fonde (vecchio prompt + modifiche) → nuovo prompt. Con rebuild
            // si applicano DOPO la ricostruzione (eventuale ritocco sul prompt già aggiornato).
            let prompt = basePrompt;
            if (job.changes && job.changes.trim() !== "") {
              const revised = await reviseScenePrompt(deps.engine, {
                oldPrompt: basePrompt,
                changes: job.changes.trim(),
              });
              if (revised && !ac.signal.aborted) prompt = revised;
            }
            if (ac.signal.aborted) continue;
            const aspect = await sceneAspectOfFile(resolveDataPath(m.path));
            const newPath = join(mediaDir(), `scene-${m.bookId}-${randomUUID()}.png`);
            const ok = await generateFromPrompt({
              prompt,
              aspect,
              outPath: newPath,
              signal: ac.signal,
            });
            if (ok && !ac.signal.aborted) {
              const oldPath = resolveDataPath(m.path);
              await media.updateAfterRegen(job.mediaId, {
                path: newPath,
                genPrompt: prompt,
                addedAt: Date.now(),
              });
              if (oldPath !== newPath) await unlink(oldPath).catch(() => {});
              bumpMediaRegenCompleted(); // avanza il contatore "fatte" del run (indicatore globale)

              // QUALITY CHECK visivo: un modello multimodale GUARDA la nuova immagine e segnala i
              // problemi. Best-effort: non far MAI fallire la rigenerazione se la QA si rompe.
              try {
                // Gate globale: il controllo qualità si può disattivare dal pulsante in Impostazioni.
                if ((await settings.get("qa_enabled")) !== "off") {
                  let curPath = newPath;
                  let verdict = await verifySceneImage({
                    imagePath: curPath,
                    genPrompt: prompt,
                    binary: appConfig.opencodeBinary,
                    model: appConfig.opencodeModel,
                    timeoutMs: appConfig.visionTimeoutMs,
                  });
                  // AUTO-RETRY (opt-in): solo se verify=true E il verdetto è bocciato (ok=false). Una SOLA
                  // volta, con un nuovo seed: rigenera (stesso prompt), scambia il file e ri-valuta.
                  if (
                    job.verify === true &&
                    verdict != null &&
                    verdict.ok === false &&
                    !ac.signal.aborted
                  ) {
                    const retryPath = join(mediaDir(), `scene-${m.bookId}-${randomUUID()}.png`);
                    const retryOk = await generateFromPrompt({
                      prompt,
                      aspect,
                      outPath: retryPath,
                      signal: ac.signal,
                    });
                    if (retryOk && !ac.signal.aborted) {
                      await media.updateAfterRegen(job.mediaId, {
                        path: retryPath,
                        genPrompt: prompt,
                        addedAt: Date.now(),
                      });
                      if (curPath !== retryPath) await unlink(curPath).catch(() => {});
                      curPath = retryPath;
                      verdict = await verifySceneImage({
                        imagePath: curPath,
                        genPrompt: prompt,
                        binary: appConfig.opencodeBinary,
                        model: appConfig.opencodeModel,
                        timeoutMs: appConfig.visionTimeoutMs,
                      });
                    }
                  }
                  await media.setQa(job.mediaId, verdict);
                }
              } catch {
                /* QA best-effort: ignora qualunque errore */
              }
            }
          } catch (e) {
            // eslint-disable-next-line no-console
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

  // Serve un file immagine per id (sotto /api cosi' e' proxato da Vite in dev).
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

  // ---------------- media ----------------

  api.get("/books/:id/media", async (c) => {
    const id = Number(c.req.param("id"));
    // Solo le immagini caricate: i visual generati per i post non vanno nella libreria.
    const usageMap = await media.usageByBook(id);
    return c.json((await media.uploadsByBook(id)).map((m) => mediaDto(m, usageMap.get(m.id))));
  });

  // Upload an image (multipart). scope GENERAL|CHAPTER, chapterId?, caption?
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
      genPrompt: null, // upload utente: nessun prompt
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

  // NOTA ROUTING (Hono): le rotte STATICHE /media/regen-status, /media/regenerate-batch e
  // /media/regenerate/cancel-all sono registrate PRIMA delle varianti con :id, così il segmento
  // letterale non viene catturato dal parametro :id.

  // GET /media/regen-status — stato GLOBALE della coda di rigenerazione (per l'indicatore + cronometro).
  // { current: { mediaId, bookId, startedAt } | null, queued: number[], startedAt }.
  api.get("/media/regen-status", (c) => {
    return c.json(listActiveMediaRegen());
  });

  // POST /media/regenerate-batch — accoda PIÙ immagini in un colpo (multi-selezione). Body:
  // { mediaIds: number[], changes?: string } (changes condiviso da tutte). Valida che ciascuna abbia
  // un prompt salvato; salta quelle già in coda/corso. Ritorna { queued } = quante effettivamente accodate.
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
    // verify: QUALITY CHECK visivo + auto-retry singolo per ciascuna immagine bocciata (opt-in).
    const verify = body.verify === true;
    let queued = 0;
    for (const id of ids) {
      if (isMediaRegenerating(id)) continue;
      const m = await media.get(id);
      if (!m || !m.genPrompt) continue; // serve un prompt salvato per rigenerare
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

  // POST /media/regenerate/cancel-all — svuota la coda e aborta la rigenerazione in corso.
  api.post("/media/regenerate/cancel-all", (c) => {
    clearMediaRegenQueue();
    for (const ac of regeneratingMedia.values()) ac.abort();
    return c.json({ cancelled: true });
  });

  // POST /media/:id/regenerate — ACCODA la rigenerazione di QUESTA immagine nella coda globale
  // seriale (mediaRegenJobs). Body opzionale: { prompt } (sostituisce il prompt salvato) o
  // { changes } (modifiche in italiano, fuse dall'IA col vecchio prompt). Async: ritorna subito con
  // la posizione in coda; il frontend fa polling su regen-status.
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
    // rebuild: ricostruisce il prompt dal capitolo (regole aggiornate) invece di riusare quello salvato.
    const rebuild = body.rebuild === true;
    // verify: QUALITY CHECK visivo + auto-retry singolo se l'immagine è bocciata (opt-in).
    const verify = body.verify === true;
    // "Rigenera per personaggio" (MULTI, opzionale): nomi dal cast da featurare nella ricostruzione dal
    // capitolo. Validati vs cast (case-insensitive, normalizzati al canonico; 400 se uno non esiste).
    // Hanno effetto solo con rebuild=true (è la pipeline dal capitolo a usarli). Senza nomi → invariato.
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
    // FLASHBACK/ricordo (opzionale): scena del passato → personaggi più giovani e vestiti d'epoca,
    // scavalcando età e outfit canonici. Attivo se almeno un campo è valorizzato; forza il rebuild
    // dal capitolo nel worker (serve un capitolo di riferimento, m.chapterIdx).
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

  // GET /media/:id/regen-status — la rigenerazione di questa immagine è in corso/accodata?
  // (risposta { regenerating } per-id).
  api.get("/media/:id/regen-status", (c) => {
    return c.json({ regenerating: isMediaRegenerating(Number(c.req.param("id"))) });
  });

  // POST /media/:id/regenerate/cancel — annulla la rigenerazione di QUESTA immagine (la rimuove dalla
  // coda se in attesa, o aborta quella in corso).
  api.post("/media/:id/regenerate/cancel", (c) => {
    const id = Number(c.req.param("id"));
    const where = cancelMediaRegen(id);
    if (where === "current") {
      const ac = regeneratingMedia.get(id);
      if (ac) ac.abort();
    }
    return c.json({ cancelled: where !== "none", where });
  });

  // PUT /media/:id/catalog — modifica la CATALOGAZIONE (tag + capitolo) di un'immagine, così
  // l'utente può arricchire i dati usati dalla selezione per pertinenza (utile anche sugli upload,
  // che di base non hanno né tag né capitolo). Body: { tags?: string[], chapterIdx?: number|null }.
  api.put("/media/:id/catalog", async (c) => {
    const id = Number(c.req.param("id"));
    const m = await media.get(id);
    if (!m) return c.json(err("Immagine non trovata"), 404);
    const body = await jsonBody(c);

    // tags: se presente dev'essere un array; normalizza (trim, scarta vuoti/lunghi, dedup case-insensitive, max 20).
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

    // chapterIdx: presente => null per azzerare, oppure intero >= 0 per impostare (indici da 0).
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
