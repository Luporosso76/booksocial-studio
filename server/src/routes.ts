import { Hono } from "hono";
import { writeFile, mkdir } from "node:fs/promises";
import { join, basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import {
  ContentError,
  resolveBinary,
  enginePath,
  getLastTextEngine,
  type ContentEngine,
} from "./content/engine.js";
import { createImageEngine, getLastImageEngine } from "./media/imageEngine.js";
import { listTextModels } from "./content/engineApi.js";
import { modelsFor } from "./content/defaultModels.js";
import { spawn } from "node:child_process";
import { ContentService } from "./services/contentService.js";
import { WeekPlanner } from "./services/weekPlanner.js";
import * as pageConnect from "./services/pageConnectService.js";
import { publishDraft, PublishError, channelFor } from "./services/publisher.js";
import { createInstagramJob } from "./services/instagramPublisher.js";
import * as ig from "./facebook/instagramClient.js";
import {
  books,
  characters,
  contentUsage,
  insights,
  links,
  media,
  music,
  pages,
  posts,
  renderJobs,
  settings,
  slots,
  weeklyPlan,
} from "./db/repositories.js";
import * as aiSettings from "./content/aiSettings.js";
import { Director } from "./media/director.js";
import { SceneImageService } from "./services/sceneImageService.js";
import { ChapterSceneService } from "./services/chapterSceneService.js";
import { VISUAL_DOMAINS, isVisualDomainKey } from "./content/imageDomains.js";
import { generateFromPrompt, imageGenAvailable, type SceneAspect } from "./media/imageGen.js";
import { imageAspectRatio } from "./media/imageDimensions.js";
import {
  enqueueSceneBatch,
  nextSceneBatch,
  clearSceneQueue,
  bumpSceneCreated,
  finishSceneGen,
  failSceneGen,
  getSceneGen,
  listActiveSceneGen,
  type SceneBatch,
} from "./sceneGenJobs.js";
import {
  enqueueMediaRegen,
  nextMediaRegen,
  finishMediaRegen,
  bumpMediaRegenCompleted,
  cancelMediaRegen,
  clearMediaRegenQueue,
  isMediaRegenerating,
  listActiveMediaRegen,
} from "./mediaRegenJobs.js";
import { enqueue as enqueueRender } from "./media/renderQueue.js";
import { isVisualKind, ASPECTS, type Aspect } from "./media/spec.js";
import {
  fetchInsights,
  fetchPageOverview,
  fetchFollowerTrend,
  fetchTopPosts,
  fetchPageDetails,
  updatePageSettings,
  uploadPagePhoto,
  setPageCover,
  fetchManagedPosts,
  fetchScheduledPosts,
  editPostMessage,
  deletePost,
  setPostPinned,
  publishNativePost,
  fetchPostComments,
  replyToComment,
  setCommentHidden,
  deleteComment,
  setCommentLiked,
  fetchCoverageTrend,
  fetchDemographics,
  publishPhotoStory,
  publishVideoStory,
  FacebookError,
  type PageSettingsPatch,
} from "./facebook/client.js";
import * as keyring from "./secrets/keyring.js";
import {
  pageSecretKeyFor,
  DEFAULT_WEEKLY_PLAN,
  type ContentFormat,
  type ScheduledPost,
} from "./domain.js";
import { formatToVisualKind } from "./content/varietyEngine.js";
import { booksDir, mediaDir, musicDir, resolveDataPath } from "./paths.js";
import { translateDirectivesToEnglish } from "./content/translate.js";
import type { CharacterOutfits, BookVisualProps, DrivingSide, BookVisualExtras } from "./domain.js";
import {
  buildVisualBible,
  stepAppearance,
  stepOutfits,
  stepProps,
  stepMinors,
} from "./services/visualBible.js";
import {
  getVisualBible,
  isVisualBibleRunning,
  finishVisualBible,
  listActiveVisualBible,
  VB_STEP_ORDER,
  type VBStepKey,
} from "./visualBibleJobs.js";

// Normalizza l'input utente per gli oggetti/mondo del libro (PUT /books/:id).
function parseVisualPropsInput(v: unknown): BookVisualProps {
  const o = (v ?? {}) as Record<string, unknown>;
  const props = Array.isArray(o.props)
    ? o.props
        .map((p) => {
          const x = (p ?? {}) as Record<string, unknown>;
          return {
            name: typeof x.name === "string" ? x.name.trim() : "",
            when: typeof x.when === "string" ? x.when.trim() : "",
            description: typeof x.description === "string" ? x.description.trim() : "",
            owner: typeof x.owner === "string" && x.owner.trim() !== "" ? x.owner.trim() : null,
          };
        })
        .filter((p) => p.name !== "" && p.description !== "")
    : [];
  const ds = typeof o.drivingSide === "string" ? o.drivingSide.trim().toLowerCase() : "";
  const drivingSide: DrivingSide | null = ds === "left" || ds === "right" ? ds : null;
  const country =
    typeof o.country === "string" && o.country.trim() !== "" ? o.country.trim() : null;
  return { props, drivingSide, country };
}

// Normalizza l'input utente per i personaggi minori/incidentali del libro (PUT /books/:id).
function parseVisualExtrasInput(v: unknown): BookVisualExtras {
  const o = (v ?? {}) as Record<string, unknown>;
  const minors = Array.isArray(o.minors)
    ? o.minors
        .map((m) => {
          const x = (m ?? {}) as Record<string, unknown>;
          return {
            label: typeof x.label === "string" ? x.label.trim() : "",
            when: typeof x.when === "string" ? x.when.trim() : "",
            appearance: typeof x.appearance === "string" ? x.appearance.trim() : "",
            outfit: typeof x.outfit === "string" && x.outfit.trim() !== "" ? x.outfit.trim() : null,
          };
        })
        .filter((m) => m.label !== "" && m.appearance !== "")
    : [];
  return { minors };
}

// Normalizza l'input utente per gli abiti di un personaggio (PUT /characters/:id).
function parseOutfitsInput(v: unknown): CharacterOutfits {
  const o = (v ?? {}) as Record<string, unknown>;
  const def = typeof o.default === "string" && o.default.trim() !== "" ? o.default.trim() : null;
  const contexts = Array.isArray(o.contexts)
    ? o.contexts
        .map((x) => {
          const c = (x ?? {}) as Record<string, unknown>;
          return {
            when: typeof c.when === "string" ? c.when.trim() : "",
            outfit: typeof c.outfit === "string" ? c.outfit.trim() : "",
          };
        })
        .filter((x) => x.when !== "" && x.outfit !== "")
    : [];
  return { default: def, contexts };
}
import { reviseScenePrompt, type SceneFlashback } from "./content/imagePrompt.js";
import { verifySceneImage } from "./content/visionCheck.js";
import { appConfig } from "./config.js";
import { query } from "./db/pool.js";
import { setJob, getJob, listJobs } from "./analysisJobs.js";
import {
  startWeekGen,
  setPlanned,
  bumpCreated,
  finishWeekGen,
  failWeekGen,
  getWeekGen,
  isGenerating,
  listActiveWeekGen,
} from "./weekGenJobs.js";
import { readFile, unlink } from "node:fs/promises";
import { extname } from "node:path";
import {
  bookDto,
  profileDto,
  characterDto,
  pageDto,
  linkDto,
  mediaDto,
  slotDto,
  postDto,
  musicDto,
  generatedToPostDto,
  enumToDay,
  mediaIn,
} from "./serialize.js";

export interface AppDeps {
  engine: ContentEngine;
  content: ContentService;
  planner: WeekPlanner;
  director: Director;
  sceneImages: SceneImageService;
  chapterScenes: ChapterSceneService;
  secretsUnlocked: boolean;
}

const SCENE_ASPECTS: readonly SceneAspect[] = ["1:1", "4:5", "1.91:1", "9:16", "16:9"];
function isSceneAspect(v: unknown): v is SceneAspect {
  return typeof v === "string" && (SCENE_ASPECTS as readonly string[]).includes(v);
}

// Controller per ANNULLARE le attività in corso: generazione immagini (per libro) e
// generazione settimana (per pagina). L'endpoint /cancel abortisce il controller.
const activeSceneGen = new Map<number, AbortController>();
const activeWeekGen = new Map<string, AbortController>();
// Rigenerazione SINGOLA immagine: AbortController del job CORRENTE (per media_asset id), per poterlo
// annullare. La coda vera è in mediaRegenJobs.ts (globale, seriale). Flag = un solo worker per-processo.
const regeneratingMedia = new Map<number, AbortController>();
let mediaRegenWorkerRunning = false;
// Guard contro la doppia esecuzione concorrente del ricalcolo presenza personaggi (per libro):
// l'operazione è sincrona e lenta (1 chiamata GPT per capitolo), quindi blocchiamo i doppioni.
const recomputingChapters = new Set<number>();

// Aspect SDXL dell'immagine dal suo ratio reale (per rigenerarla nella stessa forma).
async function sceneAspectOfFile(path: string): Promise<SceneAspect> {
  const r = await imageAspectRatio(path);
  if (r == null) return "1:1";
  if (r < 0.8) return "9:16";
  if (r > 1.25) return "1.91:1";
  return "1:1";
}

function err(message: string): { error: string } {
  return { error: message };
}

// Regola d'uso link valida (always|sometimes|manual), altrimenti null.
function parseUsagePolicy(v: unknown): "always" | "sometimes" | "manual" | null {
  return v === "always" || v === "sometimes" || v === "manual" ? v : null;
}

function sanitizeFileName(name: string): string {
  const base = basename(name)
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .trim();
  return base === "" ? "book.md" : base;
}

export function buildApi(deps: AppDeps): Hono {
  const api = new Hono();

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
    } finally {
      mediaRegenWorkerRunning = false;
    }
  }

  // ---------------- state / read ----------------

  api.get("/health", (c) => c.json({ status: "ok" }));

  api.get("/status", async (c) => {
    const [allPages, allBooks] = await Promise.all([pages.all(), books.all()]);
    return c.json({
      secretsUnlocked: deps.secretsUnlocked,
      provider: deps.engine.name(),
      textProvider: deps.engine.name(),
      textActive: getLastTextEngine(),
      imageProvider: createImageEngine().name(),
      imageActive: getLastImageEngine(),
      pages: allPages.length,
      books: allBooks.length,
    });
  });

  api.get("/pages", async (c) => {
    const all = await pages.all();
    // Backfill lazy dell'igUserId per le pagine che non l'hanno ancora risolto (best-effort):
    // serve a far comparire il tab Instagram. Solo se il keyring e' sbloccato; ogni errore e'
    // ignorato (una pagina senza IG resta semplicemente con igUserId null).
    if (deps.secretsUnlocked) {
      await Promise.all(
        all
          .filter((p) => p.igUserId == null)
          .map(async (p) => {
            try {
              const token = await keyring.get(pageSecretKeyFor(p.pageId));
              if (token == null) return;
              const igId = await ig.getIgUserId(p.pageId, token);
              if (igId != null) {
                await pages.setIgUserId(p.pageId, igId);
                p.igUserId = igId;
              }
            } catch {
              /* best-effort: non bloccare l'elenco pagine */
            }
          }),
      );
    }
    return c.json(all.map(pageDto));
  });

  api.get("/books", async (c) => c.json((await books.all()).map((b) => bookDto(b))));

  api.get("/books/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const [profile, chapters, bookLinks, bookMedia] = await Promise.all([
      books.currentProfile(id),
      books.chapters(id),
      links.byBook(id),
      media.uploadsByBook(id),
    ]);
    const mediaDtos = bookMedia.map(mediaDto);
    const cover = mediaDtos.find((m) => m.scope === "GENERAL")?.url ?? null;
    return c.json({
      book: bookDto(book, cover),
      profile: profileDto(profile),
      chapters: chapters.map((ch) => ({
        id: String(ch.id),
        bookId: String(ch.bookId),
        index: ch.index,
        title: ch.title,
        summary: null,
        excluded: ch.excluded, // capitolo escluso dalla generazione immagini (anti-frontespizio/toggle)
        scene: ch.scene, // scheda visiva: null se non ancora estratta
      })),
      links: bookLinks.map(linkDto),
      media: mediaDtos,
    });
  });

  // Serve un file immagine per id (sotto /api cosi' e' proxato da Vite in dev).
  api.get("/media/file/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const rows = await query<{ path: string }>("SELECT path FROM media_asset WHERE id = ?", [id]);
    if (rows.length === 0) return c.json(err("Immagine non trovata"), 404);
    try {
      const p = resolveDataPath(rows[0]!.path);
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

  // ---------------- connection (System User token) ----------------

  function requireSecrets(): void {
    if (!deps.secretsUnlocked) {
      throw new Error(
        "Cassaforte non disponibile (keyring bloccato). Installa/avvia gnome-keyring.",
      );
    }
  }

  // Recupera il token della pagina dal keyring dopo aver verificato che la pagina esista.
  // Ritorna { token } in caso di successo, oppure { fail: {body, status} } da restituire con c.json.
  async function resolvePageToken(
    pageId: string,
  ): Promise<
    | { token: string; fail?: undefined }
    | { token?: undefined; fail: { body: Record<string, unknown>; status: 404 | 503 } }
  > {
    const pg = await pages.find(pageId);
    if (!pg) return { fail: { body: { error: "Pagina non trovata" }, status: 404 } };
    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return {
        fail: {
          body: { ok: false, error: "Token di pagina non trovato nel keyring" },
          status: 503,
        },
      };
    }
    return { token: pageToken };
  }

  // Risolve token di pagina + igUserId per gli endpoint Instagram. Se l'igUserId non e' ancora in
  // cache lo risolve via Graph e lo memorizza. Ritorna { fail } da restituire con c.json se la
  // pagina non esiste, il token manca, o la pagina non ha un account Instagram Business collegato.
  async function resolveIgContext(pageId: string): Promise<
    | { token: string; igUserId: string; fail?: undefined }
    | {
        token?: undefined;
        igUserId?: undefined;
        fail: { body: Record<string, unknown>; status: 404 | 503 };
      }
  > {
    const r = await resolvePageToken(pageId);
    if (r.fail) return { fail: r.fail };
    const pg = await pages.find(pageId);
    let igUserId = pg?.igUserId ?? null;
    if (!igUserId) {
      try {
        igUserId = await ig.getIgUserId(pageId, r.token);
      } catch {
        igUserId = null;
      }
      if (igUserId) await pages.setIgUserId(pageId, igUserId);
    }
    if (!igUserId) {
      return {
        fail: {
          body: { error: "Nessun account Instagram Business collegato a questa Pagina." },
          status: 503,
        },
      };
    }
    return { token: r.token, igUserId };
  }

  api.post("/connection/pages", async (c) => {
    requireSecrets();
    const body = await c.req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token === "") return c.json(err("token mancante"), 400);
    const managed = await pageConnect.loadManagedPages(token);
    return c.json(managed);
  });

  api.post("/connection/save", async (c) => {
    requireSecrets();
    const body = await c.req.json().catch(() => ({}));
    let saved = 0;
    if (Array.isArray(body.pages)) {
      for (const p of body.pages) {
        await pageConnect.savePage(p);
        saved++;
      }
    }
    return c.json({ saved });
  });

  api.delete("/pages/:id", async (c) => {
    requireSecrets();
    await pageConnect.removePage(c.req.param("id"));
    return c.json({ ok: true });
  });

  api.post("/connection/disconnect", async (c) => {
    requireSecrets();
    await pageConnect.disconnectAll();
    return c.json({ ok: true });
  });

  // ---------------- books CRUD / import ----------------

  // Multipart upload of a .md file -> save to <data>/books/<name>.md (see booksDir() in paths.ts)
  // -> import + one-time analysis -> Book.
  api.post("/books/import", async (c) => {
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) {
      return c.json(err("Campo 'file' (.md) mancante nel multipart"), 400);
    }
    const author =
      typeof form["author"] === "string" && form["author"].trim() !== ""
        ? (form["author"] as string)
        : null;
    const language =
      typeof form["language"] === "string" && form["language"].trim() !== ""
        ? (form["language"] as string)
        : null;

    const content = await file.text();
    const fileName = sanitizeFileName(file.name || "book.md");
    const dir = booksDir();
    await mkdir(dir, { recursive: true });
    const sourcePath = join(dir, fileName);
    await writeFile(sourcePath, content, "utf8");

    // Import VELOCE (libro + capitoli); l'analisi (lenta) parte in BACKGROUND.
    const { book, needsAnalysis, imp } = await deps.content.importBook(
      sourcePath,
      content,
      fileName,
      author,
      language,
    );
    if (needsAnalysis) {
      setJob(book.id, "analyzing");
      // Fire-and-forget: la richiesta HTTP non aspetta la fine dell'analisi.
      void deps.content
        .analyzeProfile(book, imp)
        .then(() => {
          setJob(book.id, "ready");
          // Bibbia visiva (TUTTI gli step) come job SEPARATO in background: il libro è già usabile,
          // la costruzione gira a parte ed è visibile via /visual-bible-status e /jobs.
          void buildVisualBible(
            { engine: deps.engine, chapterScenes: deps.chapterScenes },
            book.id,
            [...VB_STEP_ORDER],
          ).catch(() => {});
        })
        .catch((e: unknown) =>
          setJob(book.id, "failed", e instanceof Error ? e.message : String(e)),
        );
    } else {
      setJob(book.id, "ready");
    }
    return c.json(bookDto(book));
  });

  // POST /books/import-sample — importa il LIBRO CAMPIONE bundlato (samples/the-keeper-of-tides.md),
  // per l'onboarding/empty-state. Riusa la STESSA logica di /books/import (importBook + analisi in
  // background). Path risolto in modo robusto da routes.ts con fallback su più posizioni note.
  api.post("/books/import-sample", async (c) => {
    const here = dirname(fileURLToPath(import.meta.url));
    // routes.ts vive in server/src (dev/tsx) o server/dist (build): risali fino alla radice del repo.
    const candidates = [
      resolve(here, "..", "..", "samples", "the-keeper-of-tides.md"),
      resolve(here, "..", "..", "..", "samples", "the-keeper-of-tides.md"),
      resolve(process.cwd(), "samples", "the-keeper-of-tides.md"),
      resolve(process.cwd(), "..", "samples", "the-keeper-of-tides.md"),
    ];
    const samplePath = candidates.find((p) => existsSync(p));
    if (!samplePath) {
      return c.json(
        err("Libro campione non trovato (samples/the-keeper-of-tides.md assente)."),
        404,
      );
    }

    let content: string;
    try {
      content = await readFile(samplePath, "utf8");
    } catch (e) {
      return c.json(
        err(`Lettura libro campione fallita: ${e instanceof Error ? e.message : String(e)}`),
        500,
      );
    }

    const fileName = "the-keeper-of-tides.md";
    const dir = booksDir();
    await mkdir(dir, { recursive: true });
    const sourcePath = join(dir, fileName);
    await writeFile(sourcePath, content, "utf8");

    const { book, needsAnalysis, imp } = await deps.content.importBook(
      sourcePath,
      content,
      fileName,
      null,
      null,
    );
    if (needsAnalysis) {
      setJob(book.id, "analyzing");
      // Fire-and-forget: come /books/import, la richiesta non aspetta l'analisi (lenta).
      void deps.content
        .analyzeProfile(book, imp)
        .then(() => {
          setJob(book.id, "ready");
          void buildVisualBible(
            { engine: deps.engine, chapterScenes: deps.chapterScenes },
            book.id,
            [...VB_STEP_ORDER],
          ).catch(() => {});
        })
        .catch((e: unknown) =>
          setJob(book.id, "failed", e instanceof Error ? e.message : String(e)),
        );
    } else {
      setJob(book.id, "ready");
    }
    return c.json(bookDto(book));
  });

  // Stato dell'analisi di un libro (per il polling del frontend).
  api.get("/books/:id/analysis-status", async (c) => {
    const id = Number(c.req.param("id"));
    const job = getJob(id);
    if (job) return c.json({ status: job.status, error: job.error });
    const profile = await books.currentProfile(id);
    return c.json({ status: profile ? "ready" : "idle", error: null });
  });

  // Attività in background per l'indicatore globale: analisi libri (analyzing) +
  // render visual (queued|rendering). Il campo `kind` li distingue.
  api.get("/jobs", async (c) => {
    const analysisJobs = listJobs().filter((j) => j.status === "analyzing");
    const analysisOut = await Promise.all(
      analysisJobs.map(async (j) => {
        const book = await books.get(j.bookId);
        return {
          bookId: String(j.bookId),
          title: book?.title ?? `Libro ${j.bookId}`,
          kind: "analysis",
          status: j.status,
          startedAt: j.startedAt,
        };
      }),
    );

    const active = await renderJobs.active();
    const renderOut = active.map((j) => ({
      id: String(j.id),
      postId: j.postId == null ? null : String(j.postId),
      bookId: j.bookId == null ? null : String(j.bookId),
      title: `Render ${j.kind}`,
      kind: "render",
      renderKind: j.kind,
      status: j.status, // queued | rendering
      startedAt: j.createdAt,
    }));

    // Generazioni-settimana in corso (per l'indicatore globale + progresso).
    const weekgenOut = listActiveWeekGen().map((j) => ({
      pageId: j.pageId,
      title: "Generazione settimana",
      kind: "weekgen",
      status: j.status, // generating
      planned: j.planned,
      created: j.created,
      startedAt: j.startedAt,
    }));

    // Generazioni-immagini-di-scena in corso (per l'indicatore globale + progresso).
    const sceneOut = listActiveSceneGen().map((j) => ({
      bookId: String(j.bookId),
      title: "Generazione immagini",
      kind: "scenegen",
      status: j.status, // generating
      planned: j.planned,
      created: j.created,
      startedAt: j.startedAt,
    }));

    // Rigenerazione immagini in corso (coda GLOBALE seriale): un solo job aggregato quando c'è
    // attività (corrente o coda), con avanzamento fatte/totale per l'indicatore globale.
    const regen = listActiveMediaRegen();
    const regenOut =
      regen.current !== null || regen.queued.length > 0
        ? [
            {
              title: "Rigenerazione immagini",
              kind: "mediaRegen",
              status: "generating" as const,
              planned: regen.planned,
              created: regen.created,
              startedAt: regen.startedAt,
              ...(regen.current
                ? { mediaId: regen.current.mediaId, bookId: String(regen.current.bookId) }
                : {}),
            },
          ]
        : [];

    // Costruzioni "bibbia visiva" in corso (per l'indicatore globale + progresso per-step).
    const visualBibleOut = listActiveVisualBible().map((s) => ({
      bookId: String(s.bookId),
      title: "Bibbia visiva",
      kind: "visualBible",
      status: "generating",
      startedAt: s.startedAt,
      steps: s.steps,
    }));

    return c.json({
      jobs: [
        ...analysisOut,
        ...renderOut,
        ...weekgenOut,
        ...sceneOut,
        ...regenOut,
        ...visualBibleOut,
      ],
    });
  });

  // Rename / set base hashtags.
  api.put("/books/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.title === "string" && body.title.trim() !== "") {
      await books.rename(id, body.title.trim());
    }
    // Il frontend invia baseHashtags come string[]; lo storage e' una stringa unita da spazi.
    if (Array.isArray(body.baseHashtags)) {
      await books.setBaseHashtags(id, body.baseHashtags.map(String).join(" "));
    } else if (typeof body.baseHashtags === "string") {
      await books.setBaseHashtags(id, body.baseHashtags);
    }
    // Configurazione VISIVA per-libro. Aggiornata solo se almeno uno dei due campi è presente
    // nel body, così un PUT che tocca solo il titolo non azzera la config. I domini sono validati
    // contro le chiavi note (gli sconosciuti vengono scartati silenziosamente).
    if ("visualDomains" in body || "visualDirectives" in body) {
      const rawDomains = Array.isArray(body.visualDomains)
        ? body.visualDomains
        : typeof body.visualDomains === "string"
          ? body.visualDomains.split(",")
          : book.visualDomains;
      const domains = (rawDomains as unknown[])
        .map((d) => String(d).trim())
        .filter((d) => isVisualDomainKey(d));
      // Direttive: l'utente le scrive in italiano. Se cambiano, le TRADUCIAMO una volta in inglese
      // (la versione iniettata nel prompt); se nel body non ci sono, preserviamo originale + traduzione.
      let directives: string | null;
      let directivesEn: string | null;
      if ("visualDirectives" in body) {
        const src = body.visualDirectives == null ? "" : String(body.visualDirectives).trim();
        directives = src === "" ? null : src;
        directivesEn = src === "" ? null : await translateDirectivesToEnglish(deps.engine, src);
      } else {
        directives = book.visualDirectives;
        directivesEn = book.visualDirectivesEn;
      }
      await books.setVisualConfig(id, domains, directives, directivesEn);
    }
    // Oggetti/veicoli ricorrenti + mondo, modificabili a mano.
    if ("visualProps" in body) {
      await books.setVisualProps(id, parseVisualPropsInput(body.visualProps));
    }
    // Personaggi minori/incidentali canonici, modificabili a mano.
    if ("visualExtras" in body) {
      await books.setVisualExtras(id, parseVisualExtrasInput(body.visualExtras));
    }
    const updated = await books.get(id);
    return c.json(updated ? bookDto(updated) : err("Libro non trovato"));
  });

  // Elenco dei MODULI-DOMINIO disponibili per il prompt immagine (per la UI di configurazione libro).
  api.get("/visual-domains", (c) =>
    c.json({
      domains: VISUAL_DOMAINS.map((d) => ({
        key: d.key,
        label: d.label,
        description: d.description,
      })),
    }),
  );

  api.delete("/books/:id", async (c) => {
    const id = Number(c.req.param("id"));
    await books.delete(id);
    return c.json({ ok: true });
  });

  // Associate / dissociate book <-> page.
  api.post("/books/:id/pages", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const pageId = typeof body.pageId === "string" ? body.pageId : null;
    if (!pageId) return c.json(err("pageId mancante"), 400);
    const linked = body.linked === true;
    await pages.setBook(pageId, linked ? id : null);
    return c.json({ ok: true });
  });

  // ---------------- chapters ----------------

  // Capitoli CON testo (per la lettura nella scheda libro).
  api.get("/books/:id/chapters", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const chapters = await books.chapters(id);
    return c.json(
      chapters.map((ch) => ({
        id: String(ch.id),
        index: ch.index,
        title: ch.title,
        text: ch.text,
        charCount: ch.charCount,
        excluded: ch.excluded, // escluso dalla generazione immagini
        scene: ch.scene, // scheda visiva: null se non ancora estratta
      })),
    );
  });

  // Esclude/include un capitolo dalla generazione immagini. Body: { excluded: boolean }.
  // 404 se il capitolo non esiste. Toggle manuale che scavalca l'auto-default del frontespizio.
  api.post("/books/:id/chapters/:idx/excluded", async (c) => {
    const id = Number(c.req.param("id"));
    const idx = Number(c.req.param("idx"));
    if (!Number.isInteger(idx) || idx < 0) return c.json(err("idx non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await c.req.json().catch(() => ({}));
    const excluded = body.excluded === true;
    const ok = await books.setChapterExcluded(id, idx, excluded);
    if (!ok) return c.json(err("Capitolo non trovato"), 404);
    return c.json({ ok: true, excluded });
  });

  // ---------------- characters ----------------

  api.get("/books/:id/characters", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    return c.json((await characters.byBook(id)).map(characterDto));
  });

  // Crea un personaggio manuale (source='USER', in coda all'ordinamento).
  api.post("/books/:id/characters", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") return c.json(err("name mancante"), 400);
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v : null;
    const now = Date.now();
    const created = await characters.insert({
      bookId: id,
      name,
      role: str(body.role),
      occupation: str(body.occupation),
      personality: str(body.personality),
      physical: str(body.physical),
      notes: str(body.notes),
      source: "USER",
      sortOrder: await characters.nextSortOrder(id),
      mentions: null,
      chapters: [],
      outfits: { default: null, contexts: [] },
      createdAt: now,
      updatedAt: now,
    });
    return c.json(characterDto(created));
  });

  // Aggiorna i campi forniti; marca source='USER' (e' un'edit manuale).
  api.put("/characters/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const existing = await characters.get(id);
    if (!existing) return c.json(err("Personaggio non trovato"), 404);
    const body = await c.req.json().catch(() => ({}));
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v : null;
    const updated = {
      ...existing,
      name:
        typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : existing.name,
      role: "role" in body ? str(body.role) : existing.role,
      occupation: "occupation" in body ? str(body.occupation) : existing.occupation,
      personality: "personality" in body ? str(body.personality) : existing.personality,
      physical: "physical" in body ? str(body.physical) : existing.physical,
      notes: "notes" in body ? str(body.notes) : existing.notes,
      source: "USER" as const,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : existing.sortOrder,
      outfits: "outfits" in body ? parseOutfitsInput(body.outfits) : existing.outfits,
      updatedAt: Date.now(),
    };
    await characters.update(updated);
    const fresh = await characters.get(id);
    return c.json(fresh ? characterDto(fresh) : err("Personaggio non trovato"));
  });

  api.delete("/characters/:id", async (c) => {
    await characters.delete(Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  // POST /books/:id/characters/generate-appearance — genera/arricchisce l'ASPETTO FISICO CANONICO
  // (descrizione precisa, completa, STABILE, solo fisica) di ogni personaggio del libro e lo salva in
  // `physical` (source=AI). Serve a dare un aspetto coerente a TUTTE le immagini, colmando le
  // descrizioni deboli. Body opzionale: { onlyWeak?: boolean } = solo le descrizioni corte/assenti.
  api.post("/books/:id/characters/generate-appearance", async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await books.get(bookId);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await c.req.json().catch(() => ({}));
    const onlyWeak = body.onlyWeak === true;
    const updated = await stepAppearance(deps.engine, bookId, { onlyWeak });
    const fresh = await characters.byBook(bookId);
    return c.json({ updated, characters: fresh.map(characterDto) });
  });

  // POST /books/:id/characters/generate-outfits — genera l'ABBIGLIAMENTO CANONICO (default + abiti per
  // contesto) di ogni personaggio, legato alle ambientazioni ricorrenti del libro (dalle schede), e lo
  // salva in outfits_json. Cosi' un personaggio veste sempre uguale nella stessa scena ricorrente.
  api.post("/books/:id/characters/generate-outfits", async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await books.get(bookId);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const updated = await stepOutfits(deps.engine, bookId);
    const fresh = await characters.byBook(bookId);
    return c.json({ updated, characters: fresh.map(characterDto) });
  });

  // POST /books/:id/generate-props — genera il canone degli OGGETTI/VEICOLI ricorrenti + lato di guida
  // (dalle schede dei capitoli e dal cast) e lo salva in visual_props_json. Oggetti resi sempre uguali.
  api.post("/books/:id/generate-props", async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await books.get(bookId);
    if (!book) return c.json(err("Libro non trovato"), 404);
    await stepProps(deps.engine, bookId);
    const updated = await books.get(bookId);
    return c.json(updated ? bookDto(updated) : err("Libro non trovato"));
  });

  // POST /books/:id/generate-minors — estrae i PERSONAGGI MINORI/incidentali canonici dai capitoli
  // (look fisso da rendere sempre uguale) e li salva in visual_extras_json. Loop SERIALE sui capitoli
  // (l'engine è una risorsa singola); dedup per label.
  api.post("/books/:id/generate-minors", async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await books.get(bookId);
    if (!book) return c.json(err("Libro non trovato"), 404);
    await stepMinors(deps.engine, bookId);
    const updated = await books.get(bookId);
    return c.json(updated ? bookDto(updated) : err("Libro non trovato"));
  });

  // POST /books/:id/build-visual-bible — costruisce in BACKGROUND la "bibbia visiva" (tutti gli step
  // o quelli richiesti) e ritorna subito. Body opzionale: { steps?: VBStepKey[] }. Job resumable
  // visibile via /visual-bible-status e /jobs.
  api.post("/books/:id/build-visual-bible", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    if (isVisualBibleRunning(id)) {
      return c.json(err("Costruzione bibbia visiva già in corso"), 409);
    }
    const body = await c.req.json().catch(() => ({}));
    const requested = Array.isArray(body.steps) ? (body.steps as unknown[]).map(String) : null;
    const stepKeys: VBStepKey[] = requested
      ? VB_STEP_ORDER.filter((k) => requested.includes(k))
      : [...VB_STEP_ORDER];
    // Fire-and-forget: la richiesta HTTP non aspetta la fine della costruzione.
    void buildVisualBible(
      { engine: deps.engine, chapterScenes: deps.chapterScenes },
      id,
      stepKeys,
    ).catch((e) => finishVisualBible(id, e instanceof Error ? e.message : String(e)));
    return c.json({ started: true });
  });

  // Stato della costruzione "bibbia visiva" di un libro (per il polling del frontend).
  api.get("/books/:id/visual-bible-status", async (c) => {
    const id = Number(c.req.param("id"));
    const s = getVisualBible(id);
    if (!s) {
      return c.json({
        bookId: id,
        status: "idle",
        steps: [],
        startedAt: 0,
        updatedAt: 0,
        error: null,
      });
    }
    return c.json(s);
  });

  // Ri-lancia l'analisi (profilo + personaggi) in BACKGROUND e ritorna subito.
  api.post("/books/:id/reanalyze", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = (await c.req.json().catch(() => ({}))) as { language?: string };
    const language = typeof body.language === "string" ? body.language : undefined;
    setJob(id, "analyzing");
    // Fire-and-forget: la richiesta HTTP non aspetta la fine dell'analisi.
    void deps.content
      .reanalyzeBook(id, language)
      .then(() => setJob(id, "ready"))
      .catch((e: unknown) => setJob(id, "failed", e instanceof Error ? e.message : String(e)));
    return c.json({ status: "analyzing" });
  });

  // ---------------- schede visive capitolo ----------------

  // Scheda del capitolo: dalla cache o estratta on-demand (LAZY). Per la UI quando si apre il capitolo.
  api.get("/books/:id/chapters/:idx/scene", async (c) => {
    const id = Number(c.req.param("id"));
    const idx = Number(c.req.param("idx"));
    if (!Number.isInteger(idx) || idx < 0) return c.json(err("idx non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const scene = await deps.chapterScenes.getOrBuild(id, idx);
    if (!scene)
      return c.json(err("Scheda non disponibile (capitolo assente o estrazione fallita)"), 404);
    return c.json({ scene });
  });

  // (Ri)genera la scheda da zero, ignorando la cache. Bottone "(Ri)genera scheda".
  api.post("/books/:id/chapters/:idx/scene/generate", async (c) => {
    const id = Number(c.req.param("id"));
    const idx = Number(c.req.param("idx"));
    if (!Number.isInteger(idx) || idx < 0) return c.json(err("idx non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const scene = await deps.chapterScenes.regenerate(id, idx);
    if (!scene)
      return c.json(
        err("Estrazione scheda fallita (capitolo assente o modello non disponibile)"),
        502,
      );
    return c.json({ scene });
  });

  // Salva le modifiche manuali alla scheda (marca source='USER').
  api.put("/books/:id/chapters/:idx/scene", async (c) => {
    const id = Number(c.req.param("id"));
    const idx = Number(c.req.param("idx"));
    if (!Number.isInteger(idx) || idx < 0) return c.json(err("idx non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await c.req.json().catch(() => ({}));
    const str = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const arr = (v: unknown): string[] | undefined =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x.length > 0) : undefined;
    const scene = await deps.chapterScenes.save(id, idx, {
      ...(body.location !== undefined ? { location: str(body.location) } : {}),
      ...(body.environment !== undefined ? { environment: str(body.environment) } : {}),
      ...(arr(body.mainObjects) !== undefined ? { mainObjects: arr(body.mainObjects) } : {}),
      ...(arr(body.secondaryObjects) !== undefined
        ? { secondaryObjects: arr(body.secondaryObjects) }
        : {}),
      ...(arr(body.characters) !== undefined ? { characters: arr(body.characters) } : {}),
      ...(arr(body.physicsRules) !== undefined ? { physicsRules: arr(body.physicsRules) } : {}),
    });
    if (!scene) return c.json(err("Capitolo non trovato"), 404);
    return c.json({ scene });
  });

  // RICALCOLO COMPLETO della presenza dei personaggi per capitolo (book_character.chapters):
  // ricostruisce la presenza dalla scheda visiva di ogni capitolo (più accurato del pre-pass NLP,
  // che conta solo le menzioni esplicite del nome). Sincrono: può durare ~1 min (1 chiamata GPT per
  // capitolo non ancora in cache). Guard in-memory per bookId contro la doppia esecuzione concorrente.
  api.post("/books/:id/recompute-character-chapters", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    if (recomputingChapters.has(id)) {
      return c.json(err("Ricalcolo già in corso per questo libro"), 409);
    }
    recomputingChapters.add(id);
    try {
      const cast = await deps.chapterScenes.recomputeCharacterChapters(id);
      return c.json({ characters: cast.map(characterDto) });
    } catch (e) {
      return c.json(err(e instanceof Error ? e.message : "Ricalcolo fallito"), 500);
    } finally {
      recomputingChapters.delete(id);
    }
  });

  // ---------------- links ----------------

  api.get("/books/:id/links", async (c) => {
    const id = Number(c.req.param("id"));
    return c.json((await links.byBook(id)).map(linkDto));
  });

  api.post("/books/:id/links", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.url !== "string" || body.url.trim() === "") {
      return c.json(err("url mancante"), 400);
    }
    const link = await links.insert({
      bookId: id,
      channel: typeof body.channel === "string" ? body.channel : "altro",
      label: typeof body.label === "string" ? body.label : null,
      url: body.url,
      isDefault: body.isDefault === true,
      usagePolicy: parseUsagePolicy(body.usagePolicy),
    });
    return c.json(linkDto(link));
  });

  // PUT /books/:id/links/:linkId — modifica un link esistente (tipo/etichetta/url/regola/default).
  api.put("/books/:id/links/:linkId", async (c) => {
    const linkId = Number(c.req.param("linkId"));
    const existing = await links.get(linkId);
    if (!existing) return c.json(err("Link non trovato"), 404);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.url === "string" && body.url.trim() !== "") existing.url = body.url.trim();
    if (typeof body.channel === "string" && body.channel.trim() !== "")
      existing.channel = body.channel.trim();
    if ("label" in body)
      existing.label =
        typeof body.label === "string" && body.label.trim() !== "" ? body.label : null;
    if ("isDefault" in body) existing.isDefault = body.isDefault === true;
    if ("usagePolicy" in body) existing.usagePolicy = parseUsagePolicy(body.usagePolicy);
    await links.update(existing);
    const updated = await links.get(linkId);
    return c.json(linkDto(updated ?? existing));
  });

  api.delete("/books/:id/links/:linkId", async (c) => {
    await links.delete(Number(c.req.param("linkId")));
    return c.json({ ok: true });
  });

  // ---------------- media ----------------

  api.get("/books/:id/media", async (c) => {
    const id = Number(c.req.param("id"));
    // Solo le immagini caricate: i visual generati per i post non vanno nella libreria.
    return c.json((await media.uploadsByBook(id)).map(mediaDto));
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

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "img").replace(/[^a-zA-Z0-9]/g, "");
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

  // ---------------- generazione immagini AI di scena ----------------

  // GET /imagegen/available — il motore locale (sd-cli + modello) è installato?
  // Il frontend usa questo per mostrare/nascondere il pulsante "Genera immagini scena".
  api.get("/imagegen/available", (c) => {
    return c.json({ available: deps.sceneImages.available() });
  });

  // POST /books/:id/generate-images — genera un POOL di immagini di scena (graphic-novel) e le
  // salva nella libreria del libro (riusabili come sfondo + fallback). Body: { count, aspect }.
  // ASINCRONO (~minuti per immagine, GPU seriale): ritorna subito, il frontend fa polling.
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
    const body = await c.req.json().catch(() => ({}));
    const count = Math.max(1, Math.min(20, Math.floor(Number(body.count)) || 1));
    const aspect: SceneAspect = isSceneAspect(body.aspect) ? body.aspect : "1:1";
    // Capitoli scelti (MULTISELECT): array di indici >= 0. `count` è PER CAPITOLO quando ne scegli.
    // Vuoto/assente = AUTO (count immagini totali su capitoli vari, anti-spoiler). Accetta anche
    // `chapterIndex` singolo.
    const rawCh: unknown[] = Array.isArray(body.chapters) ? body.chapters : [];
    let chapters = [
      ...new Set(
        rawCh.map((n) => Math.floor(Number(n))).filter((n) => Number.isInteger(n) && n >= 0),
      ),
    ];
    if (chapters.length === 0) {
      const single = Math.floor(Number(body.chapterIndex));
      if (Number.isInteger(single) && single >= 0) chapters = [single];
    }
    // "Genera per personaggio" (MULTI, opzionale): nomi dal cast del libro. Se valorizzati, il batch
    // featura quei personaggi sui capitoli dove compaiono. Accetta anche `character`
    // singolo (stringa) e lo tratta come lista di uno. Validazione: OGNI nome dev'essere nel cast
    // (case-insensitive); 400 se uno non esiste. I nomi vengono normalizzati al canonico del cast.
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
        if (!normalized.includes(match.name)) normalized.push(match.name); // canonico, dedup
      }
      charNames = normalized;
      // Pool capitoli: se l'utente non ha scelto capitoli espliciti, usa l'UNIONE dei capitoli dei
      // personaggi selezionati (∩ regole anti-spoiler applicate più a valle dalla pipeline).
      // escludi dall'unione i capitoli marcati `excluded` (frontespizio/toggle). I capitoli
      // scelti ESPLICITAMENTE nel body restano onorati (questo ramo scatta solo se chapters è vuoto).
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
    // FLASHBACK/ricordo (opzionale): scena del passato → personaggi più giovani e vestiti d'epoca,
    // scavalcando età e outfit canonici per le immagini di questo batch. Attivo solo se c'è almeno un
    // dato utile (anni più giovane, ambientazione o nota).
    let flashback: SceneFlashback | undefined;
    const fbRaw = body.flashback as Record<string, unknown> | null | undefined;
    if (fbRaw && typeof fbRaw === "object") {
      const yy = Math.floor(Number(fbRaw.youngerYears));
      const fbSetting = typeof fbRaw.setting === "string" ? fbRaw.setting.trim().slice(0, 200) : "";
      const fbNote = typeof fbRaw.note === "string" ? fbRaw.note.trim().slice(0, 300) : "";
      const hasYears = Number.isInteger(yy) && yy > 0 && yy <= 120;
      if (hasYears || fbSetting || fbNote) {
        flashback = {
          ...(hasYears ? { youngerYears: yy } : {}),
          ...(fbSetting ? { setting: fbSetting } : {}),
          ...(fbNote ? { note: fbNote } : {}),
        };
      }
    }
    const batch: SceneBatch = {
      count,
      aspect,
      chapters,
      ...(charNames ? { characters: charNames } : {}),
      ...(flashback ? { flashback } : {}),
    };

    // Accoda. started=true → non era in corso: avvio il worker. started=false → già in corso: il
    // batch si aggiunge alla coda e il worker esistente lo raccoglierà (senza fermarsi).
    const started = enqueueSceneBatch(id, batch);
    if (!started) return c.json({ queued: true, started: false, batch });

    const ac = new AbortController();
    activeSceneGen.set(id, ac);
    // VARIETÀ DI COMPOSIZIONE: ruota tra più inquadrature lungo il lotto. Due assi di varietà:
    // (1) SOLO 2 slot su 8 SENZA persone (ambientazioni/oggetti iconici); 6/8 hanno persone; (2) tra quelle
    // con persone NON sempre il protagonista — spinta ai SECONDARI (Sara, Elena, Marco…), anche DA SOLI o
    // in coppia/gruppetto, scelti tra quelli realmente presenti nel capitolo. Per l'attrezzatura che
    // richiede un rider (windsurf, surf, vela condotta): o c'è la persona che la usa, o è a riposo — mai
    // vele dritte senza nessuno né rider fantasma.
    // NO-PERSON in 2 VARIANTI DISTINTE (luogo + attrezzatura a riposo): tenute diverse per non avere due
    // immagini vuote quasi-duplicate. Generico: vale anche per libri non balneari (strada/edificio/ecc.).
    const NO_PERSON_PLACE =
      "Composition: NO person in the frame — an atmospheric WIDE view of the LOCATION itself (the landscape, sea, sky, or street of THIS passage), letting light, weather and space carry the mood. Do NOT place sports equipment lying on the ground here.";
    const NO_PERSON_GEAR_REST =
      "Composition: NO person in the frame — a still, close or medium view of an ICONIC OBJECT or DETAIL that actually belongs to THIS passage, at rest on a plausible surface (a table, a shelf, a windowsill, the ground...), physically coherent with gravity and its setting. Choose an object the chapter REALLY describes; NEVER invent sports gear, beaches, sails or boards that the passage does not mention. Use this object-at-rest framing ONLY here.";
    // ANGOLI BILANCIATI: non sempre "di spalle". Si alterna behind / three-quarter FRONT (volto in parte
    // visibile) / profilo / candid frontale / figura distante. Resta vietato lo sguardo IN CAMERA e il
    // ritratto in posa: il volto può vedersi, ma lo sguardo è sull'azione/soggetto, mai sull'obiettivo.
    // 8 slot: 2 SENZA persone (PLACE, GEAR_REST) + 6 CON persone, variando soggetto/angolo.
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
    // WORKER: svuota la CODA in sequenza finché ci sono batch e non è annullato. I batch accodati
    // mentre gira vengono raccolti senza fermarsi. `compIdx` ruota le composizioni su TUTTO il flusso.
    void (async () => {
      let compIdx = 0;
      try {
        let b;
        while (!ac.signal.aborted && (b = nextSceneBatch(id))) {
          const bAspect: SceneAspect = isSceneAspect(b.aspect) ? b.aspect : "1:1";
          if (b.chapters.length === 0) {
            // AUTO: count immagini su capitoli vari (anti-spoiler).
            const usedChapters: number[] = [];
            for (let i = 0; i < b.count && !ac.signal.aborted; i++) {
              const res = await deps.sceneImages.generateForBook(id, bAspect, {
                avoidChapterIndexes: usedChapters,
                angle: COMPOSITIONS[compIdx++ % COMPOSITIONS.length],
                ...(b.characters && b.characters.length > 0
                  ? { featureCharacters: b.characters }
                  : {}),
                ...(b.flashback ? { flashback: b.flashback } : {}),
                signal: ac.signal,
              });
              if (res) bumpSceneCreated(id);
              if (res?.chapterIndex != null) usedChapters.push(res.chapterIndex);
            }
          } else {
            // count immagini PER ciascun capitolo selezionato.
            for (const ch of b.chapters) {
              for (let i = 0; i < b.count && !ac.signal.aborted; i++) {
                const res = await deps.sceneImages.generateForBook(id, bAspect, {
                  chapterIndex: ch,
                  angle: COMPOSITIONS[compIdx++ % COMPOSITIONS.length],
                  ...(b.characters && b.characters.length > 0
                    ? { featureCharacters: b.characters }
                    : {}),
                  ...(b.flashback ? { flashback: b.flashback } : {}),
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
    })();
    return c.json({ queued: true, started: true, batch });
  });

  // POST /books/:id/generate-images/cancel — ANNULLA tutto: svuota la CODA e killa sd-cli.
  api.post("/books/:id/generate-images/cancel", (c) => {
    const id = Number(c.req.param("id"));
    clearSceneQueue(id); // i batch non ancora iniziati non partiranno
    const ac = activeSceneGen.get(id);
    if (ac) ac.abort(); // interrompe l'immagine in corso
    return c.json({ cancelled: !!ac });
  });

  // GET /books/:id/scenegen — avanzamento: totale (tutti i batch) + batch corrente + coda + cronometri.
  api.get("/books/:id/scenegen", (c) => {
    const j = getSceneGen(Number(c.req.param("id")));
    if (!j)
      return c.json({
        status: "idle",
        planned: 0,
        created: 0,
        error: null,
        cancelled: false,
        startedAt: 0,
        imageStartedAt: 0,
        current: null,
        queued: [],
      });
    return c.json({
      status: j.status,
      planned: j.plannedTotal, // totale immagini di tutti i batch
      created: j.createdTotal,
      error: j.error,
      cancelled: j.cancelled,
      startedAt: j.startedAt,
      imageStartedAt: j.imageStartedAt,
      current: j.current, // { aspect, chapters, planned, created } | null
      queued: j.queue.map((b) => ({ count: b.count, aspect: b.aspect, chapters: b.chapters })),
    });
  });

  // GET/PUT /settings/ai-image-mode — modalità immagini per la generazione del programma:
  //  - "library": usa SOLO le immagini caricate del libro (default, nessuna generazione AI).
  //  - "direct":  genera l'immagine di scena AI al momento (+ fallback alle caricate se fallisce).
  api.get("/settings/ai-image-mode", async (c) => {
    const v = (await settings.get("ai_image_mode")) === "direct" ? "direct" : "library";
    return c.json({ mode: v, available: deps.sceneImages.available() });
  });
  api.put("/settings/ai-image-mode", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const mode = body.mode === "direct" ? "direct" : "library";
    await settings.set("ai_image_mode", mode);
    return c.json({ mode });
  });

  // GET/PUT /settings/qa-check — controllo qualità visivo delle immagini generate (#2). Default ACCESO;
  // se spento ("off"), nessuna verifica viene eseguita alla generazione/rigenerazione.
  api.get("/settings/qa-check", async (c) => {
    const enabled = (await settings.get("qa_enabled")) !== "off";
    return c.json({ enabled });
  });
  api.put("/settings/qa-check", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const enabled = body.enabled !== false;
    await settings.set("qa_enabled", enabled ? "on" : "off");
    return c.json({ enabled });
  });

  // GET/PUT /settings/ai — configurazione RUNTIME dei provider AI (testo + immagini).
  // GET ritorna la vista EFFETTIVA (config salvata ?? env), con le chiavi come BOOLEAN (mai i valori).
  // PUT salva i campi non-segreti (DB app_setting) e le chiavi (keyring cifrato), poi ricarica la cache.
  api.get("/settings/ai", (c) => {
    return c.json(aiSettings.effectiveView());
  });
  api.put("/settings/ai", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const TEXT_PROVIDERS = new Set(["opencode", "codex", "claude", "agy", "ollama", "none"]);
    const IMAGE_PROVIDERS = new Set([
      "local",
      "auto",
      "openai",
      "google",
      "stability",
      "bfl",
      "replicate",
      "fal",
      "agy",
      "none",
    ]);
    if (body.text?.provider !== undefined && !TEXT_PROVIDERS.has(body.text.provider)) {
      return c.json(err(`Provider testo non valido: ${body.text.provider}`), 400);
    }
    if (body.image?.provider !== undefined && !IMAGE_PROVIDERS.has(body.image.provider)) {
      return c.json(err(`Provider immagini non valido: ${body.image.provider}`), 400);
    }
    const patch: aiSettings.AiSettingsPatch = {};
    if (body.text && typeof body.text === "object") patch.text = body.text;
    if (body.image && typeof body.image === "object") patch.image = body.image;
    if (body.keys && typeof body.keys === "object") patch.keys = body.keys;
    const view = await aiSettings.save(patch);
    return c.json(view);
  });

  // POST /settings/ai/models — elenca i modelli disponibili per un provider.
  // HTTP 200 sempre: { models, error? }. Best-effort, mai eccezioni propagate.
  // - opencode/agy: spawn CLI `<binary> models` (timeout 15s)
  // - ollama: HTTP listTextModels
  // - codex/claude/openai/google/stability/bfl/replicate/fal: default-codice ∪ DB
  api.post("/settings/ai/models", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    if (provider === "") return c.json({ models: [], error: "provider mancante" });

    // Helper: esegue `binary models`, timeout 15s, ritorna righe non vuote.
    const spawnModels = (binary: string): Promise<{ models: string[]; error?: string }> =>
      new Promise((resolve) => {
        let stdout = "";
        let settled = false;
        const finish = (r: { models: string[]; error?: string }): void => {
          if (settled) return;
          settled = true;
          resolve(r);
        };
        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(resolveBinary(binary), ["models"], {
            stdio: ["ignore", "pipe", "ignore"],
            env: { ...process.env, PATH: enginePath() },
          });
        } catch (e) {
          finish({ models: [], error: e instanceof Error ? e.message : String(e) });
          return;
        }
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish({ models: [], error: "Timeout avvio CLI" });
        }, 15_000);
        child.stdout?.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        child.on("error", (e: Error) => {
          clearTimeout(timer);
          finish({ models: [], error: e.message });
        });
        child.on("close", () => {
          clearTimeout(timer);
          const models = stdout
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l !== "");
          finish({ models });
        });
      });

    try {
      if (provider === "opencode") {
        const result = await spawnModels(appConfig.opencodeBinary);
        return c.json(result);
      }

      if (provider === "agy") {
        const result = await spawnModels(appConfig.agyBinary);
        return c.json(result);
      }

      if (provider === "ollama") {
        const baseUrl: string | null = typeof body.baseUrl === "string" ? body.baseUrl : null;
        const cfg = aiSettings.getText();
        const resolvedBaseUrl = baseUrl ?? cfg.ollamaBaseUrl;
        const models = await listTextModels({ provider: "ollama", baseUrl: resolvedBaseUrl });
        if (models.length === 0) {
          return c.json({ models: [], error: "Nessun modello: verifica la connessione Ollama." });
        }
        return c.json({ models });
      }

      const DB_PROVIDERS = new Set([
        "codex",
        "claude",
        "openai",
        "google",
        "stability",
        "bfl",
        "replicate",
        "fal",
      ]);
      if (DB_PROVIDERS.has(provider)) {
        const models = await modelsFor(provider, aiSettings.getModels);
        return c.json({ models });
      }

      return c.json({ models: [] });
    } catch (e) {
      return c.json({ models: [], error: e instanceof Error ? e.message : String(e) });
    }
  });

  // POST /settings/ai/models/add — aggiunge un modello alla lista DB del provider.
  // Body: { provider, model }. HTTP 200: { models }.
  api.post("/settings/ai/models/add", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (provider === "" || model === "") {
      return c.json(err("provider e model sono obbligatori"), 400);
    }
    const models = await aiSettings.addModel(provider, model);
    return c.json({ models });
  });

  // POST /settings/ai/models/remove — rimuove un modello dalla lista DB del provider.
  // Body: { provider, model }. HTTP 200: { models }.
  api.post("/settings/ai/models/remove", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (provider === "" || model === "") {
      return c.json(err("provider e model sono obbligatori"), 400);
    }
    const models = await aiSettings.removeModel(provider, model);
    return c.json({ models });
  });

  // GET /settings/ai/cli-status?tool=opencode|codex|claude|agy — presenza del binario CLI (NON il login).
  // Esegue `<binary> --version` con timeout breve via spawn: installed=true se esce 0 (stdout=version).
  api.get("/settings/ai/cli-status", async (c) => {
    const tool = c.req.query("tool") ?? "";
    const binary =
      tool === "opencode"
        ? appConfig.opencodeBinary
        : tool === "codex"
          ? appConfig.codexBinary
          : tool === "claude"
            ? appConfig.claudeBinary
            : tool === "agy"
              ? appConfig.agyBinary
              : null;
    if (binary == null) return c.json(err("tool non valido"), 400);
    // Helper spawn inline minimale: risolve con { installed, version, error }.
    const result = await new Promise<{
      installed: boolean;
      version: string | null;
      error?: string;
    }>((resolve) => {
      let stdout = "";
      let settled = false;
      const finish = (r: { installed: boolean; version: string | null; error?: string }): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(resolveBinary(binary), ["--version"], {
          stdio: ["ignore", "pipe", "ignore"],
          env: { ...process.env, PATH: enginePath() },
        });
      } catch (e) {
        finish({
          installed: false,
          version: null,
          error: e instanceof Error ? e.message : String(e),
        });
        return;
      }
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish({ installed: false, version: null, error: "Timeout avvio CLI" });
      }, 5_000);
      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.on("error", (e: Error) => {
        clearTimeout(timer);
        finish({ installed: false, version: null, error: e.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          const version = stdout.trim().split("\n")[0]?.trim() || null;
          finish({ installed: true, version });
        } else {
          finish({ installed: false, version: null, error: `Uscita CLI con codice ${code}` });
        }
      });
    });
    return c.json({ tool, ...result });
  });

  // POST /settings/ai/cli-login { tool: opencode|codex|claude|agy } — AVVIA il login del CLI ad
  // abbonamento. DIFENSIVO: non blocca MAI la richiesta. Cattura stdout+stderr per ~5s e poi
  // RISOLVE (il login OAuth prosegue nel browser/terminale per conto suo). Estrae la PRIMA URL
  // https:// dall'output (per mostrarla cliccabile). NON logga token o output oltre l'URL.
  // - codex → `codex login`
  // - agy/claude → primo avvio interattivo che lancia l'OAuth; se non pilotabile l'utente completa a mano.
  // - opencode → `opencode auth login` è un picker TUI: ritorna started:false + hint (non pilotabile).
  api.post("/settings/ai/cli-login", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const tool = typeof body.tool === "string" ? body.tool : "";
    if (tool !== "opencode" && tool !== "codex" && tool !== "claude" && tool !== "agy") {
      return c.json(err("tool non valido"), 400);
    }

    // opencode: TUI interattiva non pilotabile da spawn → istruzione esplicita all'utente.
    if (tool === "opencode") {
      return c.json({
        tool,
        started: false,
        hint: "Esegui `opencode auth login` in un terminale e completa il login.",
      });
    }

    const binary =
      tool === "codex"
        ? appConfig.codexBinary
        : tool === "claude"
          ? appConfig.claudeBinary
          : appConfig.agyBinary;
    // codex login; agy/claude: primo avvio in modalità interattiva fa l'OAuth.
    const args = tool === "codex" ? ["login"] : [];

    // Estrae la PRIMA URL https:// dall'output combinato (best-effort).
    const firstUrl = (text: string): string | null => {
      const m = text.match(/https:\/\/[^\s"'`]+/);
      return m ? m[0] : null;
    };

    const result = await new Promise<{
      started: boolean;
      output?: string;
      url?: string | null;
      hint?: string;
      error?: string;
    }>((resolve) => {
      let combined = "";
      let settled = false;
      const finish = (r: {
        started: boolean;
        output?: string;
        url?: string | null;
        hint?: string;
        error?: string;
      }): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      let child: ReturnType<typeof spawn>;
      try {
        // stdin ignorato: niente prompt interattivi pilotati; il login prosegue per conto suo.
        child = spawn(resolveBinary(binary), args, {
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
          env: { ...process.env, PATH: enginePath() },
        });
      } catch (e) {
        finish({
          started: false,
          error: e instanceof Error ? e.message : String(e),
          hint:
            tool === "codex"
              ? "Esegui `codex login` in un terminale."
              : `Esegui \`${tool}\` in un terminale e completa il login.`,
        });
        return;
      }

      // Dopo ~5s RISOLVIAMO comunque: la cattura basta a estrarre l'eventuale URL OAuth.
      const timer = setTimeout(() => {
        // Stacchiamo il processo dalla pipe: continua a vivere per completare l'OAuth.
        child.stdout?.removeAllListeners("data");
        child.stderr?.removeAllListeners("data");
        child.unref();
        const url = firstUrl(combined);
        finish({
          started: true,
          url,
          output: url ?? undefined, // NON esponiamo l'output grezzo: solo l'URL.
          hint:
            (tool === "agy" || tool === "claude") && url == null
              ? `Se il login non si apre, esegui \`${tool}\` in un terminale e completa l'OAuth.`
              : undefined,
        });
      }, 5_000);

      child.stdout?.on("data", (d: Buffer) => {
        combined += d.toString();
      });
      child.stderr?.on("data", (d: Buffer) => {
        combined += d.toString();
      });
      child.on("error", (e: Error) => {
        clearTimeout(timer);
        finish({
          started: false,
          error: e.message,
          hint:
            tool === "codex"
              ? "Esegui `codex login` in un terminale."
              : `Esegui \`${tool}\` in un terminale e completa il login.`,
        });
      });
      child.on("close", () => {
        clearTimeout(timer);
        const url = firstUrl(combined);
        finish({ started: true, url, output: url ?? undefined });
      });
    });

    return c.json({ tool, ...result });
  });

  // POST /settings/ai/test-text — verifica il MOTORE TESTO corrente con una mini-chiamata.
  // HTTP 200 SEMPRE: l'esito sta nel body { ok, provider, sample? , error? }. Timeout breve
  // (race) così un CLI/HTTP lento non blocca la UI. Le chiavi non vengono MAI loggate/esposte.
  api.post("/settings/ai/test-text", async (c) => {
    // deps.engine è il WRAPPER DINAMICO: run() ricostruisce il motore dalla config CORRENTE
    // (aiSettings.getText()), quindi riflette sempre il provider attivo senza riavvio.
    const provider = aiSettings.getText().provider;
    try {
      const TEST_TIMEOUT_MS = 20_000;
      const answer = await Promise.race([
        deps.engine.run("Reply with: OK"),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new ContentError(`Timeout dopo ${TEST_TIMEOUT_MS / 1000}s`)),
            TEST_TIMEOUT_MS,
          ),
        ),
      ]);
      const sample = answer.trim().slice(0, 60);
      return c.json({ ok: true, provider, sample });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return c.json({ ok: false, provider, error });
    }
  });

  // POST /settings/ai/test-image — verifica LEGGERA di raggiungibilità/auth del provider IMMAGINI
  // corrente (NON genera un'immagine vera). HTTP 200 sempre: esito nel body { ok, provider, error? }.
  api.post("/settings/ai/test-image", async (c) => {
    const cfg = aiSettings.getImage();
    const provider = cfg.provider;
    const TEST_TIMEOUT_MS = 12_000;
    // GET con timeout breve: ritorna lo status HTTP, oppure null su errore di rete/timeout.
    async function probe(url: string, headers?: Record<string, string>): Promise<number | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
        return res.status;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      if (provider === "local" || provider === "auto") {
        if (imageGenAvailable()) return c.json({ ok: true, provider });
        return c.json({ ok: false, provider, error: "Motore immagini locale non disponibile." });
      }
      if (provider === "openai") {
        if (cfg.openaiApiKey == null || cfg.openaiApiKey === "") {
          return c.json({ ok: false, provider, error: "Chiave OpenAI non configurata." });
        }
        const root = cfg.openaiBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
        const status = await probe(`${root}/v1/models`, {
          Authorization: `Bearer ${cfg.openaiApiKey}`,
        });
        if (status === 200) return c.json({ ok: true, provider });
        return c.json({
          ok: false,
          provider,
          error: status == null ? "Endpoint non raggiungibile." : `HTTP ${status}`,
        });
      }
      if (provider === "google") {
        if (cfg.googleApiKey == null || cfg.googleApiKey === "") {
          return c.json({ ok: false, provider, error: "Chiave Google non configurata." });
        }
        const root = cfg.googleBaseUrl.replace(/\/+$/, "");
        const status = await probe(`${root}/models?key=${encodeURIComponent(cfg.googleApiKey)}`);
        if (status === 200) return c.json({ ok: true, provider });
        return c.json({
          ok: false,
          provider,
          error: status == null ? "Endpoint non raggiungibile." : `HTTP ${status}`,
        });
      }
      // stability/bfl/replicate/fal: ok se la chiave è presente (best-effort).
      const keyMap: Record<string, string | null | undefined> = {
        stability: cfg.stabilityApiKey,
        bfl: cfg.bflApiKey,
        replicate: cfg.replicateApiKey,
        fal: cfg.falApiKey,
      };
      if (provider in keyMap) {
        const key = keyMap[provider];
        if (key == null || key === "") {
          return c.json({ ok: false, provider, error: `Chiave ${provider} non configurata.` });
        }
        return c.json({ ok: true, provider });
      }
      // none (o sconosciuto): nessun provider immagini configurato.
      return c.json({ ok: false, provider, error: "Nessun provider immagini configurato." });
    } catch (e) {
      return c.json({ ok: false, provider, error: e instanceof Error ? e.message : String(e) });
    }
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
    const body = await c.req.json().catch(() => ({}));
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
    const body = await c.req.json().catch(() => ({}));
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
    const body = await c.req.json().catch(() => ({}));

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

  // ---------------- planner: slots ----------------

  api.get("/pages/:id/slots", async (c) => {
    return c.json((await slots.byPage(c.req.param("id"))).map(slotDto));
  });

  api.post("/pages/:id/slots", async (c) => {
    const pageId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    // Il frontend invia dayOfWeek come enum 'MON'..'SUN'; supporta anche int 1..7.
    const dayOfWeek =
      typeof body.dayOfWeek === "string" && /[A-Za-z]/.test(body.dayOfWeek)
        ? enumToDay(body.dayOfWeek)
        : Number(body.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      return c.json(err("dayOfWeek non valido"), 400);
    }
    const HHMM = /^\d{1,2}:\d{2}$/;
    const toMin = (t: string): number => {
      const [h, m] = t.split(":").map((x) => Number(x));
      return (h ?? 0) * 60 + (m ?? 0);
    };
    const toHHMM = (min: number): string => {
      const h = Math.floor(min / 60) % 24;
      const m = min % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };
    // Fascia oraria opzionale: se timeStart+timeEnd validi, lo slot è una FASCIA e
    // timeOfDay diventa il centro (fallback). Altrimenti serve timeOfDay singolo.
    const hasStart = typeof body.timeStart === "string" && HHMM.test(body.timeStart);
    const hasEnd = typeof body.timeEnd === "string" && HHMM.test(body.timeEnd);
    let timeStart: string | null = null;
    let timeEnd: string | null = null;
    let timeOfDay: string;
    if (hasStart && hasEnd) {
      const a = toMin(body.timeStart as string);
      const b = toMin(body.timeEnd as string);
      if (b <= a) return c.json(err("timeEnd deve essere successivo a timeStart"), 400);
      timeStart = toHHMM(a);
      timeEnd = toHHMM(b);
      timeOfDay =
        typeof body.timeOfDay === "string" && HHMM.test(body.timeOfDay)
          ? body.timeOfDay
          : toHHMM(Math.floor((a + b) / 2));
    } else if (typeof body.timeOfDay === "string" && HHMM.test(body.timeOfDay)) {
      timeOfDay = body.timeOfDay;
    } else {
      return c.json(
        err("Indica un orario 'HH:mm' (timeOfDay) o una fascia (timeStart+timeEnd)"),
        400,
      );
    }
    const slot = await slots.insert({
      pageId,
      dayOfWeek,
      timeOfDay,
      timeStart,
      timeEnd,
      mediaType: mediaIn(body.mediaType),
      enabled: body.enabled === undefined ? true : body.enabled === true,
    });
    return c.json(slotDto(slot));
  });

  api.delete("/slots/:id", async (c) => {
    await slots.delete(Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  // ---------------- planner: quote settimanali ----------------

  // GET /pages/:id/weekly-plan — quote correnti (o default se non impostate).
  api.get("/pages/:id/weekly-plan", async (c) => {
    const pageId = c.req.param("id");
    const plan = await weeklyPlan.get(pageId);
    return c.json({
      postsPerWeek: plan?.postsPerWeek ?? DEFAULT_WEEKLY_PLAN.postsPerWeek,
      reelsPerWeek: plan?.reelsPerWeek ?? DEFAULT_WEEKLY_PLAN.reelsPerWeek,
      storiesPerWeek: plan?.storiesPerWeek ?? DEFAULT_WEEKLY_PLAN.storiesPerWeek,
    });
  });

  // PUT /pages/:id/weekly-plan — salva le quote settimanali.
  api.put("/pages/:id/weekly-plan", async (c) => {
    const pageId = c.req.param("id");
    if (!(await pages.find(pageId))) return c.json(err("Pagina non trovata"), 404);
    const body = await c.req.json().catch(() => ({}));
    const clamp = (v: unknown): number => {
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= 0 ? Math.min(n, 100) : 0;
    };
    const postsPerWeek = clamp(body.postsPerWeek);
    const reelsPerWeek = clamp(body.reelsPerWeek);
    const storiesPerWeek = clamp(body.storiesPerWeek);
    await weeklyPlan.upsert({
      pageId,
      postsPerWeek,
      reelsPerWeek,
      storiesPerWeek,
      updatedAt: Date.now(),
    });
    return c.json({ postsPerWeek, reelsPerWeek, storiesPerWeek });
  });

  // ---------------- planner: generate week ----------------

  // La generazione è LENTA (una chiamata al modello per contenuto). Parte in BACKGROUND:
  // la richiesta ritorna subito, le bozze compaiono progressivamente (il frontend fa polling
  // della lista + di /pages/:id/weekgen per avanzamento e motivo finale). Una per pagina.
  api.post("/planner/generate-week", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const pageId = typeof body.pageId === "string" ? body.pageId : null;
    const bookId = Number(body.bookId);
    if (!pageId) return c.json(err("pageId mancante"), 400);
    if (!Number.isInteger(bookId)) return c.json(err("bookId mancante o non valido"), 400);
    const page = await pages.find(pageId);
    if (!page) return c.json(err("Pagina non trovata"), 404);
    if (isGenerating(pageId)) {
      return c.json({ started: false, alreadyRunning: true });
    }

    // Periodo: 'week' (7g), 'month' (~28g) o 'custom' (range start..end). start default = oggi.
    // `from` non è mai nel passato (max tra adesso e la mezzanotte di start).
    const periodBody = (body.period ?? {}) as { kind?: string; start?: string; end?: string };
    const parseDay = (s: unknown): Date | null => {
      if (typeof s !== "string") return null;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
      return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
    };
    const DAY_MS = 86400000;
    const startDay = parseDay(periodBody.start);
    const startMidnight = (startDay ?? new Date(new Date().setHours(0, 0, 0, 0))).getTime();
    const from = new Date(Math.max(Date.now(), startMidnight));
    let horizonDays = 7;
    if (periodBody.kind === "month") {
      horizonDays = 28;
    } else if (periodBody.kind === "custom") {
      const endDay = parseDay(periodBody.end) ?? startDay ?? new Date();
      const endMid = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate()).getTime();
      horizonDays = Math.min(90, Math.max(1, Math.floor((endMid - startMidnight) / DAY_MS) + 1));
    }

    startWeekGen(pageId);
    const ac = new AbortController();
    activeWeekGen.set(pageId, ac);
    // Fire-and-forget: NON attendere. Aggiorna il job man mano (planned/created) e a fine.
    void deps.planner
      .planWeek(
        pageId,
        page.name,
        bookId,
        from,
        {
          onPlanned: (n) => setPlanned(pageId, n),
          onCreated: () => bumpCreated(pageId),
        },
        { horizonDays },
        ac.signal,
      )
      .then((result) =>
        finishWeekGen(pageId, {
          created: result.created,
          ...(ac.signal.aborted
            ? { reason: "Annullato" }
            : result.reason !== undefined
              ? { reason: result.reason }
              : {}),
          ...(result.messages !== undefined ? { messages: result.messages } : {}),
        }),
      )
      .catch((e: unknown) => failWeekGen(pageId, e instanceof Error ? e.message : String(e)))
      .finally(() => activeWeekGen.delete(pageId));

    return c.json({ started: true });
  });

  // POST /pages/:id/generate-week/cancel — ANNULLA la generazione del programma in corso.
  // Il ciclo si ferma al prossimo contenuto (le bozze già create restano).
  api.post("/pages/:id/generate-week/cancel", (c) => {
    const pageId = c.req.param("id");
    const ac = activeWeekGen.get(pageId);
    if (ac) ac.abort();
    return c.json({ cancelled: !!ac });
  });

  // GET /pages/:id/weekgen — stato della generazione-settimana (avanzamento + esito finale).
  api.get("/pages/:id/weekgen", async (c) => {
    const j = getWeekGen(c.req.param("id"));
    if (!j) return c.json({ status: "idle" });
    return c.json({
      status: j.status, // generating | ready | failed
      planned: j.planned,
      created: j.created,
      reason: j.reason,
      messages: j.messages,
      error: j.error,
      startedAt: j.startedAt,
    });
  });

  // POST /pages/:id/schedule-drafts — PROGRAMMA tutte le bozze (DRAFT) con orario futuro:
  //  - POST (testo/foto) → programmati NATIVAMENTE su Facebook (scheduled_publish_time): FB li
  //    pubblica alla data, anche a server spento. Caricati adesso, status SCHEDULED + fb_post_id.
  //  - REEL e STORIE → FB non li programma: status SCHEDULED senza fb_post_id, li pubblica il
  //    JOB INTERNO (publishScheduler) al loro orario (richiede il server acceso).
  //  - post troppo vicini (<~10 min, limite FB) o con visual non ancora pronto → job interno.
  // Dietro conferma esplicita lato UI.
  api.post("/pages/:id/schedule-drafts", async (c) => {
    const pageId = c.req.param("id");
    if (!(await pages.find(pageId))) return c.json(err("Pagina non trovata"), 404);
    const all = await posts.byPage(pageId, 500);
    const now = Date.now();
    const FB_MIN_AHEAD = 11 * 60 * 1000; // FB richiede scheduled_publish_time >= ~10 min nel futuro

    let fbScheduled = 0; // post programmati nativamente su Facebook
    let jobScheduled = 0; // reel/storie (+ fallback) gestiti dal job interno
    let skipped = 0;
    const messages: string[] = [];

    // Token recuperato in modo lazy: serve solo se c'è almeno un post FB-programmabile.
    let token: string | null | undefined;
    const getToken = async (): Promise<string | null> => {
      if (token === undefined) token = await keyring.get(pageSecretKeyFor(pageId));
      return token ?? null;
    };

    const setStatus = async (post: (typeof all)[number], fbId: string | null): Promise<void> => {
      post.status = "SCHEDULED";
      post.fbPostId = fbId;
      post.attempts = 0;
      post.lastError = null;
      post.updatedAt = Date.now();
      await posts.update(post);
    };

    for (const post of all) {
      if (post.status !== "DRAFT") continue;
      if (!(post.scheduledAt > now)) {
        skipped++; // orario già passato/assente: usa "Pubblica adesso"
        continue;
      }
      const channel = channelFor(post);
      const hasMedia = post.mediaPath != null && post.mediaPath !== "";
      // Programmazione NATIVA FB: testo, foto (con media) e ora anche Reel (con media).
      // Le storie restano sempre sul job interno (FB non le programma).
      const fbSchedulable =
        (channel === "TEXT" ||
          (channel === "PHOTO" && hasMedia) ||
          (channel === "REEL" && hasMedia)) &&
        post.scheduledAt >= now + FB_MIN_AHEAD;

      if (fbSchedulable) {
        requireSecrets();
        const tk = await getToken();
        if (tk == null) return c.json(err("Token di pagina non trovato nel keyring"), 503);
        try {
          const fbId = await publishDraft(post, tk, Math.floor(post.scheduledAt / 1000));
          await setStatus(post, fbId);
          fbScheduled++;
          continue;
        } catch (e) {
          // Programmazione nativa fallita (incluso reel rifiutato) → ripiega sul job interno.
          messages.push(`#${post.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // Job interno: storie, post troppo vicini/non pronti, o fallback.
      await setStatus(post, null);
      jobScheduled++;
    }

    return c.json({
      ok: true,
      scheduled: fbScheduled + jobScheduled,
      fbScheduled,
      jobScheduled,
      skipped,
      ...(messages.length ? { messages } : {}),
    });
  });

  // ---------------- posts ----------------

  api.get("/pages/:id/posts", async (c) => {
    return c.json((await posts.byPage(c.req.param("id"))).map(postDto));
  });

  // Generate a draft post (shows base + specific + final hashtags).
  api.post("/posts/generate", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    if (!Number.isInteger(bookId)) return c.json(err("bookId mancante o non valido"), 400);
    if (typeof body.angle !== "string" || body.angle.trim() === "") {
      return c.json(err("angle mancante"), 400);
    }
    const pageId = typeof body.pageId === "string" ? body.pageId : null;
    let pageName = "la pagina";
    if (pageId) {
      const page = await pages.find(pageId);
      if (page) pageName = page.name;
    }
    const mediaType = mediaIn(body.mediaType);
    const generated = await deps.content.generatePost(
      bookId,
      pageId,
      pageName,
      body.angle,
      mediaType,
    );
    return c.json(generatedToPostDto(generated as unknown as Record<string, unknown>));
  });

  // Le bozze restano LOCALI: queste route non pubblicano mai su Facebook.
  // La modifica e' consentita solo finche' il post e' DRAFT o SCHEDULED.
  const isEditable = (status: string): boolean => status === "DRAFT" || status === "SCHEDULED";

  // PUT /posts/:id — modifica i campi editabili di una bozza (message/hashtags/scheduledAt/mediaType).
  api.put("/posts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const post = await posts.get(id);
    if (!post) return c.json(err("Bozza non trovata"), 404);
    if (!isEditable(post.status)) {
      return c.json(err(`Bozza non modificabile (stato ${post.status})`), 409);
    }
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.message === "string" && body.message.trim() !== "") {
      post.message = body.message;
    }
    if (typeof body.hashtags === "string") {
      post.hashtags = body.hashtags.trim() === "" ? null : body.hashtags;
    }
    if (typeof body.scheduledAt === "number" && Number.isFinite(body.scheduledAt)) {
      post.scheduledAt = Math.floor(body.scheduledAt);
    }
    if (typeof body.mediaType === "string") {
      post.mediaType = mediaIn(body.mediaType);
    }
    post.updatedAt = Date.now();
    await posts.update(post);
    const updated = await posts.get(id);
    return c.json(postDto(updated ?? post));
  });

  // DELETE /posts/:id — elimina una bozza locale.
  api.delete("/posts/:id", async (c) => {
    const id = Number(c.req.param("id"));
    // Prima di eliminare la bozza, ripulisci il visual generato che le appartiene:
    // rimuovi la riga media_asset e il file su disco, così non resta orfano nella libreria.
    const post = await posts.get(id);
    if (post?.mediaPath) {
      await media.deleteByPath(post.mediaPath).catch(() => {});
      await unlink(resolveDataPath(post.mediaPath)).catch(() => {});
    }
    await posts.delete(id);
    return c.json({ ok: true });
  });

  // Ri-renderizza il VISUAL di una bozza dal suo contentFormat salvato (best-effort).
  // Usato da "Rigenera" perché aggiorni ANCHE video/foto + musica (col testo nuovo),
  // non solo il testo. Se il formato è solo-testo o manca, non fa nulla. Il render è
  // asincrono: la coda sovrascrive il media della bozza quando finisce.
  async function rerenderDraftVisual(post: ScheduledPost): Promise<void> {
    if (!post.contentFormat) return;
    let cf: ContentFormat;
    try {
      cf = JSON.parse(post.contentFormat) as ContentFormat;
    } catch {
      return;
    }
    const kind = formatToVisualKind(cf);
    if (!kind) return; // formato solo-testo: nessun visual da rigenerare
    const useImages = cf.visualContent === "images" || cf.visualContent === "mixed";
    const isVideo = cf.visualKind === "reel" || cf.visualKind === "story";
    const target: "reel" | "story" = cf.visualKind === "story" ? "story" : "reel";
    // Musica per i video (reel/storia): una traccia a caso del libro, così varia a ogni rigenera.
    let musicTrackId: number | null = null;
    if (isVideo && post.bookId != null) {
      const tracks = await music.byBook(post.bookId);
      if (tracks.length > 0) musicTrackId = tracks[Math.floor(Math.random() * tracks.length)]!.id;
    }
    // Recupera il capitolo di origine del post (registrato in content_usage) per la selezione
    // per pertinenza dell'immagine di sfondo. Best-effort: se assente, il director ripiega su aspect.
    const usage = await contentUsage.latestByPost(post.id);
    const result = await deps.director.generaVisualSpec(post, {
      kind,
      useImages,
      ...(cf.aspect ? { aspect: cf.aspect } : {}),
      musicTrackId,
      target,
      chapterIndex: usage?.chapterIndex ?? null,
    });
    if (musicTrackId != null) await posts.setMusic(post.id, musicTrackId);
    await enqueueRender(result.spec, { postId: post.id, bookId: post.bookId });
  }

  // POST /posts/:id/regenerate — rigenera message+hashtags di una bozza (resta locale).
  api.post("/posts/:id/regenerate", async (c) => {
    const id = Number(c.req.param("id"));
    const post = await posts.get(id);
    if (!post) return c.json(err("Bozza non trovata"), 404);
    if (!isEditable(post.status)) {
      return c.json(err(`Bozza non modificabile (stato ${post.status})`), 409);
    }
    const body = await c.req.json().catch(() => ({}));
    const angle = typeof body.angle === "string" ? body.angle : undefined;
    let regenerated: { message: string; hashtags: string };
    try {
      regenerated = await deps.content.regeneratePost(id, angle);
    } catch (e) {
      return c.json(err(e instanceof Error ? e.message : String(e)), 422);
    }
    post.message = regenerated.message;
    post.hashtags = regenerated.hashtags.trim() === "" ? null : regenerated.hashtags;
    post.updatedAt = Date.now();
    await posts.update(post);
    // Aggiorna ANCHE il visual (video/foto + musica) col testo nuovo: il render è asincrono,
    // la coda sovrascrive il media quando finisce. Best-effort: non blocca la risposta testo.
    try {
      await rerenderDraftVisual(post);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[regenerate] re-render visual saltato per post ${id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const updated = await posts.get(id);
    return c.json(postDto(updated ?? post));
  });

  // GET /posts/:id/media — stream del visual renderizzato della bozza (immagine o video),
  // per l'anteprima "come su Facebook". 404 se la bozza non ha ancora un media.
  api.get("/posts/:id/media", async (c) => {
    const post = await posts.get(Number(c.req.param("id")));
    if (!post || !post.mediaPath) return c.json(err("Nessun visual per questa bozza"), 404);
    try {
      const p = resolveDataPath(post.mediaPath);
      const buf = await readFile(p);
      const ext = extname(p).toLowerCase();
      const type =
        ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : ext === ".gif"
              ? "image/gif"
              : ext === ".mp4"
                ? "video/mp4"
                : ext === ".webm"
                  ? "video/webm"
                  : ext === ".mov"
                    ? "video/quicktime"
                    : "image/jpeg";
      c.header("Content-Type", type);
      c.header("Cache-Control", "private, max-age=3600");
      return c.body(buf);
    } catch {
      return c.json(err("File del visual assente su disco"), 404);
    }
  });

  // ---------------- visual / render (BK2) ----------------

  // POST /posts/:id/visual — l'IA-regista genera uno SPEC e lo accoda al render.
  // Body: { kind, template?, aspect? }. NON pubblica: l'asset resta sulla bozza.
  api.post("/posts/:id/visual", async (c) => {
    const id = Number(c.req.param("id"));
    const post = await posts.get(id);
    if (!post) return c.json(err("Bozza non trovata"), 404);
    const body = await c.req.json().catch(() => ({}));
    if (!isVisualKind(body.kind)) {
      return c.json(err("kind non valido (quote_card|reel_text|storyboard)"), 400);
    }
    const template =
      typeof body.template === "string" && body.template.trim() !== "" ? body.template : undefined;
    const aspect =
      typeof body.aspect === "string" && (ASPECTS as string[]).includes(body.aspect)
        ? (body.aspect as Aspect)
        : undefined;
    // useImages: usa le immagini gia' caricate del libro come sfondo (default true).
    const useImages = body.useImages === false ? false : true;
    // Musica opzionale (solo reel): deve riferirsi a una traccia reale della libreria.
    let musicTrackId: number | null = null;
    if (body.musicId != null) {
      const mid = Number(body.musicId);
      if (Number.isInteger(mid) && mid > 0 && (await music.get(mid))) {
        musicTrackId = mid;
      }
    }

    let result;
    try {
      const usage = await contentUsage.latestByPost(id);
      result = await deps.director.generaVisualSpec(post, {
        kind: body.kind,
        template,
        aspect,
        useImages,
        musicTrackId,
        // Capitolo del post (se registrato) → immagine di sfondo pertinente; altrimenti ripiego aspect.
        chapterIndex: usage?.chapterIndex ?? null,
      });
    } catch (e) {
      return c.json(err(e instanceof Error ? e.message : String(e)), 422);
    }
    // Persisti la scelta musicale sulla bozza (per mostrarla in UI), best-effort.
    if (musicTrackId != null) await posts.setMusic(id, musicTrackId);
    const job = await enqueueRender(result.spec, { postId: id, bookId: post.bookId });
    return c.json({
      jobId: String(job.id),
      spec: result.spec,
      availableImageIds: result.availableImageIds,
    });
  });

  // GET /render-jobs — job attivi (per l'indicatore).
  api.get("/render-jobs", async (c) => {
    const active = await renderJobs.active();
    return c.json({
      jobs: active.map((j) => ({
        id: String(j.id),
        kind: j.kind,
        status: j.status,
        postId: j.postId == null ? null : String(j.postId),
      })),
    });
  });

  // GET /render-jobs/:id — stato + outputUrl (se done e registrato come media).
  api.get("/render-jobs/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const job = await renderJobs.get(id);
    if (!job) return c.json(err("Render job non trovato"), 404);
    // Risali all'eventuale media_asset prodotto (per servire l'anteprima via /media/file/:id).
    let outputUrl: string | null = null;
    if (job.outputPath && job.bookId != null) {
      const rows = await query<{ id: number }>(
        "SELECT id FROM media_asset WHERE path = ? ORDER BY id DESC LIMIT 1",
        [job.outputPath],
      );
      if (rows.length > 0) outputUrl = `/api/media/file/${rows[0]!.id}`;
    }
    return c.json({
      id: String(job.id),
      kind: job.kind,
      status: job.status,
      postId: job.postId == null ? null : String(job.postId),
      bookId: job.bookId == null ? null : String(job.bookId),
      error: job.error,
      outputUrl,
    });
  });

  // ---------------- usage stats (motore di varietà) ----------------

  // GET /pages/:id/usage-stats — statistiche d'uso aggregate dal registro content_usage.
  api.get("/pages/:id/usage-stats", async (c) => {
    const stats = await contentUsage.statsByPage(c.req.param("id"));
    return c.json(stats);
  });

  // ---------------- libreria musicale (per-libro) ----------------

  // GET /music — tutte le tracce (libreria globale).
  api.get("/music", async (c) => {
    return c.json((await music.all()).map(musicDto));
  });

  // GET /books/:id/music — tracce del libro (+ eventuali globali).
  api.get("/books/:id/music", async (c) => {
    return c.json((await music.byBook(Number(c.req.param("id")))).map(musicDto));
  });

  // POST /music — upload di una traccia (multipart: file, title?, mood?, bookId?).
  api.post("/music", async (c) => {
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) return c.json(err("file mancante"), 400);
    const titleRaw = typeof form["title"] === "string" ? (form["title"] as string).trim() : "";
    const mood =
      typeof form["mood"] === "string" && (form["mood"] as string).trim() !== ""
        ? (form["mood"] as string).trim()
        : null;
    const bookId =
      form["bookId"] != null && Number.isInteger(Number(form["bookId"]))
        ? Number(form["bookId"])
        : null;
    const title = titleRaw !== "" ? titleRaw : file.name.replace(/\.[^.]+$/, "") || "Traccia";

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "mp3").replace(/[^a-zA-Z0-9]/g, "");
    const dir = musicDir();
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${randomUUID()}.${ext}`);
    await writeFile(path, buf);

    const track = await music.insert({
      bookId,
      title,
      path,
      durationSec: null, // best-effort: durata non calcolata.
      mood,
      addedAt: Date.now(),
    });
    return c.json(musicDto(track));
  });

  // DELETE /music/:id — rimuove la traccia dalla libreria (file lasciato su disco).
  api.delete("/music/:id", async (c) => {
    await music.delete(Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  // GET /music/:id/file — stream del file audio.
  api.get("/music/:id/file", async (c) => {
    const track = await music.get(Number(c.req.param("id")));
    if (!track) return c.json(err("Traccia non trovata"), 404);
    try {
      const p = resolveDataPath(track.path);
      const buf = await readFile(p);
      const ext = extname(p).toLowerCase();
      const type =
        ext === ".wav"
          ? "audio/wav"
          : ext === ".ogg"
            ? "audio/ogg"
            : ext === ".m4a" || ext === ".aac"
              ? "audio/aac"
              : ext === ".flac"
                ? "audio/flac"
                : "audio/mpeg";
      c.header("Content-Type", type);
      c.header("Cache-Control", "private, max-age=3600");
      return c.body(buf);
    } catch {
      return c.json(err("File audio assente su disco"), 404);
    }
  });

  // ---------------- pubblicazione bozze (adesso o programmata, su conferma) ----------------

  // POST /posts/:id/publish — pubblica una bozza CON il suo media (foto→post-foto, video→Reel,
  // storia→story, altrimenti testo+link) ADESSO, oppure la PROGRAMMA (scheduledAt futuro →
  // status SCHEDULED, la pubblica lo scheduler quando scade). SCRIVE su Facebook: chiamata
  // SOLO dopo conferma esplicita lato UI.
  api.post("/posts/:id/publish", async (c) => {
    const id = Number(c.req.param("id"));
    const post = await posts.get(id);
    if (!post) return c.json(err("Bozza non trovata"), 404);
    if (post.status !== "DRAFT" && post.status !== "SCHEDULED") {
      return c.json(err(`Bozza non pubblicabile (stato ${post.status})`), 409);
    }
    const body = await c.req.json().catch(() => ({}));

    // PROGRAMMA: scheduledAt (epoch ms) ben nel futuro → la pubblica lo scheduler interno.
    const sched =
      typeof body.scheduledAt === "number" && Number.isFinite(body.scheduledAt)
        ? Math.floor(body.scheduledAt)
        : null;
    if (sched != null && sched > Date.now() + 30000) {
      post.status = "SCHEDULED";
      post.scheduledAt = sched;
      post.attempts = 0;
      post.lastError = null;
      post.updatedAt = Date.now();
      await posts.update(post);
      return c.json({ ok: true, scheduled: true, scheduledAt: sched });
    }

    // PUBBLICA ADESSO.
    requireSecrets();
    const pageToken = await keyring.get(pageSecretKeyFor(post.pageId));
    if (pageToken == null) return c.json(err("Token di pagina non trovato nel keyring"), 503);
    try {
      const fbId = await publishDraft(post, pageToken);
      post.status = "PUBLISHED";
      post.fbPostId = fbId;
      post.lastError = null;
      post.updatedAt = Date.now();
      await posts.update(post);
      return c.json({ ok: true, fbPostId: fbId });
    } catch (e) {
      if (e instanceof PublishError) return c.json(err(e.message), 422);
      const msg =
        e instanceof FacebookError ? e.message : e instanceof Error ? e.message : String(e);
      return c.json(err(`Pubblicazione fallita: ${msg}`), 502);
    }
  });

  // ---------------- storie (pubblicazione su conferma esplicita) ----------------

  // POST /posts/:id/publish-story — pubblica come Storia il visual 9:16 già renderizzato
  // della bozza (foto o video per estensione). SCRIVE su Facebook: chiamata SOLO dopo
  // conferma esplicita lato UI. Mai dallo scheduler.
  api.post("/posts/:id/publish-story", async (c) => {
    requireSecrets();
    const id = Number(c.req.param("id"));
    const post = await posts.get(id);
    if (!post) return c.json(err("Bozza non trovata"), 404);
    if (!post.mediaPath) {
      return c.json(err("La bozza non ha un visual renderizzato da pubblicare come Storia"), 422);
    }
    const pageToken = await keyring.get(pageSecretKeyFor(post.pageId));
    if (pageToken == null) {
      return c.json(err("Token di pagina non trovato nel keyring"), 503);
    }
    const resolvedMediaPath = resolveDataPath(post.mediaPath);
    const ext = extname(resolvedMediaPath).toLowerCase();
    const isVideo = ext === ".mp4" || ext === ".mov" || ext === ".webm";
    try {
      const fbStoryId = isVideo
        ? await publishVideoStory(post.pageId, pageToken, resolvedMediaPath)
        : await publishPhotoStory(post.pageId, pageToken, resolvedMediaPath);
      const now = Date.now();
      post.status = "PUBLISHED";
      post.fbPostId = fbStoryId;
      post.lastError = null;
      post.updatedAt = now;
      await posts.update(post);
      return c.json({ ok: true, fbStoryId });
    } catch (e) {
      const msg =
        e instanceof FacebookError ? e.message : e instanceof Error ? e.message : String(e);
      return c.json(err(`Pubblicazione storia fallita: ${msg}`), 502);
    }
  });

  // POST /posts/:id/instagram — crea il job IG gemello (Reel/Storia 9:16) di un post Facebook.
  api.post("/posts/:id/instagram", async (c) => {
    const id = Number(c.req.param("id"));
    const post = await posts.get(id);
    if (!post) return c.json(err("Bozza non trovata"), 404);
    if (post.platform === "instagram") {
      return c.json(err("Questo è già un job Instagram."), 409);
    }
    try {
      const igJob = await createInstagramJob(post);
      return c.json(postDto(igJob));
    } catch (e) {
      if (e instanceof PublishError) return c.json(err(e.message), 422);
      const msg = e instanceof Error ? e.message : String(e);
      return c.json(err(`Creazione job Instagram fallita: ${msg}`), 500);
    }
  });

  // DELETE /posts/:id/instagram — rimuove il job IG gemello di un post FB (se ancora SCHEDULED,
  // non pubblicato). L'id può essere quello del post FB (gemello) o direttamente quello del job IG.
  api.delete("/posts/:id/instagram", async (c) => {
    const id = Number(c.req.param("id"));
    const post = await posts.get(id);
    if (!post) return c.json(err("Post non trovato"), 404);

    const igJob = post.platform === "instagram" ? post : await posts.findByLinkedPostId(post.id);
    if (!igJob) return c.json(err("Nessun job Instagram collegato a questo post."), 404);
    if (igJob.status === "PUBLISHED" || igJob.status === "PUBLISHING") {
      return c.json(err(`Job Instagram non rimovibile (stato ${igJob.status}).`), 409);
    }
    await posts.delete(igJob.id);
    return c.json({ ok: true, deletedId: String(igJob.id) });
  });

  // ---------------- insights ----------------

  // KPI snapshot metrics fetched from the Graph API and persisted.
  // v21 (giu 2026): page_impressions/page_fans deprecate -> usiamo le nuove "media view".
  // I totali follower/like arrivano dai campi del nodo Page (fetchPageOverview), non da qui.
  // fetchInsights e' resiliente: le metriche non valide vengono scartate, non bloccano le altre.
  const KPI_METRICS = [
    "page_total_media_view_unique", // copertura/visualizzazioni pagina (sostituisce page_impressions*)
    "page_post_engagements", // interazioni (se ancora attiva su questa pagina)
  ];

  // GET /pages/:id/insights?period=day
  // Fetches live metrics, page totals, and follower trend; persists KPI snapshot.
  // Each sub-call has an independent try/catch: partial failures don't zero the whole response.
  api.get("/pages/:id/insights", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const period = c.req.query("period") ?? "day";
    const fetchedAt = Date.now();

    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);

    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json(
        {
          pageId,
          fetchedAt,
          totals: null,
          metrics: [],
          followerTrend: [],
          error: "Token di pagina non trovato nel keyring",
        },
        503,
      );
    }

    // Sub-call 1: page overview (nodo Page — nome, follower, fan).
    let totals: {
      followersCount: number | null;
      fanCount: number | null;
      name: string | null;
    } | null = null;
    let totalsError: string | null = null;
    try {
      const overview = await fetchPageOverview(pageId, pageToken);
      totals = {
        name: overview.name,
        followersCount: overview.followersCount,
        fanCount: overview.fanCount,
      };
    } catch (e) {
      totalsError = e instanceof FacebookError ? e.message : String(e);
    }

    // Sub-call 2: KPI snapshot metrics (page_impressions, page_impressions_unique, page_post_engagements).
    let insightRows: Awaited<ReturnType<typeof fetchInsights>> = [];
    let metricsError: string | null = null;
    try {
      insightRows = await fetchInsights(pageId, pageToken, KPI_METRICS, period);
      // Persist snapshot (fire-and-forget; errors logged, not surfaced).
      await insights.insertMany(insightRows).catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[insights] insertMany fallito:", e);
      });
    } catch (e) {
      metricsError = e instanceof FacebookError ? e.message : String(e);
    }

    // Sub-call 3: follower trend (serie giornaliera ultimi 28 giorni).
    let followerTrend: Awaited<ReturnType<typeof fetchFollowerTrend>> = [];
    let trendError: string | null = null;
    try {
      followerTrend = await fetchFollowerTrend(pageId, pageToken);
    } catch (e) {
      trendError = e instanceof FacebookError ? e.message : String(e);
    }

    const metrics = insightRows.map((r) => ({
      metric: r.metric,
      value: r.value,
      periodEnd: r.periodEnd,
    }));

    // Surface a top-level error only if ALL sub-calls failed.
    const allFailed = totalsError !== null && metricsError !== null && trendError !== null;
    const topError = allFailed
      ? `overview: ${totalsError}; metrics: ${metricsError}; trend: ${trendError}`
      : undefined;

    return c.json({
      pageId,
      fetchedAt,
      totals,
      metrics,
      followerTrend,
      ...(topError !== undefined ? { error: topError } : {}),
    });
  });

  // GET /pages/:id/top-posts?limit=10
  // Returns the page's top posts ranked by impressions, with per-post insight metrics.
  api.get("/pages/:id/top-posts", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const limitParam = c.req.query("limit");
    const limit =
      limitParam != null && /^\d+$/.test(limitParam) ? Math.min(Number(limitParam), 100) : 10;

    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);

    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json({ pageId, posts: [], error: "Token di pagina non trovato nel keyring" }, 503);
    }

    try {
      const topPosts = await fetchTopPosts(pageId, pageToken, limit);
      return c.json({ pageId, posts: topPosts });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, posts: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/insights/history
  // Returns recent snapshots from the DB (no live call).
  api.get("/pages/:id/insights/history", async (c) => {
    const pageId = c.req.param("id");
    const snapshots = await insights.history(pageId);
    return c.json({ pageId, snapshots });
  });

  // GET /pages/:id/coverage-trend?days=28 — serie giornaliera visualizzazioni pagina (B3).
  api.get("/pages/:id/coverage-trend", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const daysParam = c.req.query("days");
    const days =
      daysParam != null && /^\d+$/.test(daysParam) ? Math.min(Number(daysParam), 90) : 28;
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json({ pageId, points: [], ...r.fail.body }, r.fail.status);
    try {
      const points = await fetchCoverageTrend(pageId, r.token, days);
      return c.json({ pageId, points });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, points: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/demographics — paesi/genere-eta'/citta' dei fan (B5).
  // Molte demografiche sono deprecate dal 2024: il client ritorna liste vuote senza crash.
  api.get("/pages/:id/demographics", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const r = await resolvePageToken(pageId);
    if (r.fail)
      return c.json(
        { pageId, countries: [], genderAge: [], cities: [], ...r.fail.body },
        r.fail.status,
      );
    try {
      const demo = await fetchDemographics(pageId, r.token);
      return c.json({ pageId, ...demo });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, countries: [], genderAge: [], cities: [], error: msg }, 502);
    }
  });

  // ---------------- gestione post pubblicati (A1/A4/A5) ----------------

  // GET /pages/:id/managed-posts?limit=25 — post gia' presenti sulla pagina FB.
  api.get("/pages/:id/managed-posts", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const limitParam = c.req.query("limit");
    const limit =
      limitParam != null && /^\d+$/.test(limitParam) ? Math.min(Number(limitParam), 100) : 25;
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json({ pageId, posts: [], ...r.fail.body }, r.fail.status);
    try {
      const posts = await fetchManagedPosts(pageId, r.token, limit);
      return c.json({ pageId, posts });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, posts: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/scheduled-posts — contenuti PROGRAMMATI sulla pagina FB (live, lato Facebook),
  // distinti dai "post locali" programmati nel nostro DB.
  api.get("/pages/:id/scheduled-posts", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json({ pageId, posts: [], ...r.fail.body }, r.fail.status);
    try {
      const posts = await fetchScheduledPosts(pageId, r.token);
      return c.json({ pageId, posts });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, posts: [], error: msg }, 502);
    }
  });

  // POST /pages/:id/posts/:postId/edit — modifica il testo di un post.
  api.post("/pages/:id/posts/:postId/edit", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const postId = c.req.param("postId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "message mancante" }, 400);
    }
    try {
      await editPostMessage(postId, r.token, body.message);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // DELETE /pages/:id/posts/:postId — elimina un post dalla pagina.
  api.delete("/pages/:id/posts/:postId", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const postId = c.req.param("postId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    try {
      await deletePost(postId, r.token);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/posts/:postId/pin — fissa/sblocca un post.
  api.post("/pages/:id/posts/:postId/pin", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const postId = c.req.param("postId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.pinned !== "boolean") {
      return c.json({ ok: false, error: "pinned (boolean) mancante" }, 400);
    }
    try {
      await setPostPinned(postId, r.token, body.pinned);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/publish — pubblica/programma un post nativo.
  // SCRIVE su una pagina pubblica reale: la conferma esplicita la gestisce il frontend.
  // scheduledPublishTime e' epoch in SECONDI (come richiede Graph scheduled_publish_time).
  api.post("/pages/:id/publish", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "message mancante" }, 400);
    }
    const link = typeof body.link === "string" && body.link.trim() !== "" ? body.link : null;
    const scheduledPublishTime =
      typeof body.scheduledPublishTime === "number" && Number.isFinite(body.scheduledPublishTime)
        ? Math.floor(body.scheduledPublishTime)
        : null;
    try {
      const fbPostId = await publishNativePost(
        pageId,
        r.token,
        body.message,
        link,
        scheduledPublishTime,
      );
      return c.json({ ok: true, fbPostId });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // ---------------- gestione commenti (A2) ----------------
  // Il :id pagina serve solo a recuperare il token dal keyring; gli id post/commento sono FB.

  // GET /pages/:id/posts/:postId/comments — commenti di un post.
  api.get("/pages/:id/posts/:postId/comments", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const postId = c.req.param("postId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json({ comments: [], ...r.fail.body }, r.fail.status);
    try {
      const comments = await fetchPostComments(postId, r.token);
      return c.json({ comments });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ comments: [], error: msg }, 502);
    }
  });

  // POST /pages/:id/comments/:commentId/reply — risponde a un commento.
  api.post("/pages/:id/comments/:commentId/reply", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "message mancante" }, 400);
    }
    try {
      await replyToComment(commentId, r.token, body.message);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/comments/:commentId/hide — nasconde/mostra un commento.
  api.post("/pages/:id/comments/:commentId/hide", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.hidden !== "boolean") {
      return c.json({ ok: false, error: "hidden (boolean) mancante" }, 400);
    }
    try {
      await setCommentHidden(commentId, r.token, body.hidden);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // DELETE /pages/:id/comments/:commentId — elimina un commento.
  api.delete("/pages/:id/comments/:commentId", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    try {
      await deleteComment(commentId, r.token);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/comments/:commentId/like — mette/toglie like della pagina a un commento.
  api.post("/pages/:id/comments/:commentId/like", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.like !== "boolean") {
      return c.json({ ok: false, error: "like (boolean) mancante" }, 400);
    }
    try {
      await setCommentLiked(commentId, r.token, body.like);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // ---------------- Instagram (tab IG: account, insight, media, commenti) ----------------
  // Mirror IG degli endpoint FB. Tutti risolvono token di pagina + igUserId via resolveIgContext;
  // se la pagina non ha un IG collegato rispondono 503 con un messaggio leggibile.

  // GET /pages/:id/ig/account — info profilo dell'account Instagram Business.
  api.get("/pages/:id/ig/account", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json({ pageId, account: null, ...r.fail.body }, r.fail.status);
    try {
      const account = await ig.getIgAccount(r.igUserId, r.token);
      return c.json({ pageId, igUserId: r.igUserId, account });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, account: null, error: msg }, 502);
    }
  });

  // GET /pages/:id/ig/insights?period=day — insight di account IG (degrada per-metrica).
  api.get("/pages/:id/ig/insights", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const period = c.req.query("period") ?? "day";
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json({ pageId, metrics: [], ...r.fail.body }, r.fail.status);
    try {
      const metrics = await ig.fetchIgAccountInsights(r.igUserId, r.token, period);
      return c.json({ pageId, igUserId: r.igUserId, metrics });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, metrics: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/ig/media?limit=25 — media pubblicati dall'account IG.
  api.get("/pages/:id/ig/media", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const limitParam = c.req.query("limit");
    const limit =
      limitParam != null && /^\d+$/.test(limitParam) ? Math.min(Number(limitParam), 100) : 25;
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json({ pageId, media: [], ...r.fail.body }, r.fail.status);
    try {
      const media = await ig.fetchIgMedia(r.igUserId, r.token, limit);
      return c.json({ pageId, media });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, media: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/ig/media/:mediaId/comments — commenti (con risposte) di un media IG.
  api.get("/pages/:id/ig/media/:mediaId/comments", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const mediaId = c.req.param("mediaId");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json({ comments: [], ...r.fail.body }, r.fail.status);
    try {
      const comments = await ig.fetchIgComments(mediaId, r.token);
      return c.json({ comments });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ comments: [], error: msg }, 502);
    }
  });

  // POST /pages/:id/ig/comments/:commentId/reply — risponde a un commento IG.
  api.post("/pages/:id/ig/comments/:commentId/reply", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "message mancante" }, 400);
    }
    try {
      await ig.replyToIgComment(commentId, r.token, body.message);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/ig/comments/:commentId/hide — nasconde/mostra un commento IG.
  api.post("/pages/:id/ig/comments/:commentId/hide", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await c.req.json().catch(() => ({}));
    if (typeof body.hidden !== "boolean") {
      return c.json({ ok: false, error: "hidden (boolean) mancante" }, 400);
    }
    try {
      await ig.setIgCommentHidden(commentId, r.token, body.hidden);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // DELETE /pages/:id/ig/comments/:commentId — elimina un commento IG.
  api.delete("/pages/:id/ig/comments/:commentId", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    try {
      await ig.deleteIgComment(commentId, r.token);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // ---------------- gestione pagina (richiede pages_manage_metadata) ----------------

  // GET /pages/:id/details — campi modificabili (about/description/website/visibilita'/cover).
  api.get("/pages/:id/details", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);
    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json({ pageId, error: "Token di pagina non trovato nel keyring" }, 503);
    }
    try {
      return c.json(await fetchPageDetails(pageId, pageToken));
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, error: msg }, 502);
    }
  });

  // POST /pages/:id/settings — aggiorna i campi della pagina.
  // SCRIVE su una pagina pubblica reale: invocata solo su submit esplicito dal frontend.
  // Invia esclusivamente i campi forniti nel body.
  api.post("/pages/:id/settings", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);
    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json({ ok: false, error: "Token di pagina non trovato nel keyring" }, 503);
    }
    const body = await c.req.json().catch(() => ({}));
    const patch: PageSettingsPatch = {};
    if (typeof body.about === "string") patch.about = body.about;
    if (typeof body.description === "string") patch.description = body.description;
    if (typeof body.website === "string") patch.website = body.website;
    if (typeof body.phone === "string") patch.phone = body.phone;
    if (Array.isArray(body.emails)) patch.emails = body.emails.map((e: unknown) => String(e));
    if (typeof body.isPublished === "boolean") patch.isPublished = body.isPublished;
    if (Object.keys(patch).length === 0) {
      return c.json({ ok: false, error: "Nessun campo da aggiornare" }, 400);
    }
    try {
      await updatePageSettings(pageId, pageToken, patch);
      const updated = await fetchPageDetails(pageId, pageToken);
      return c.json({ ok: true, updated });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/cover — carica una nuova immagine di copertina (multipart, campo 'file').
  // SCRIVE su una pagina pubblica reale: solo su azione esplicita dell'utente.
  api.post("/pages/:id/cover", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);
    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json({ ok: false, error: "Token di pagina non trovato nel keyring" }, 503);
    }
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) {
      return c.json({ ok: false, error: "Campo 'file' (immagine) mancante nel multipart" }, 400);
    }
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const photoId = await uploadPagePhoto(pageId, pageToken, bytes, file.name || "cover.jpg");
      await setPageCover(pageId, pageToken, photoId);
      const details = await fetchPageDetails(pageId, pageToken);
      return c.json({ ok: true, coverUrl: details.cover?.url ?? null });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  return api;
}
