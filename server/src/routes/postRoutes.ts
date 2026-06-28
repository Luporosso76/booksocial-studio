import { Hono } from "hono";
import { readFile, unlink } from "node:fs/promises";
import { extname } from "node:path";
import { publishDraft, PublishError, channelFor } from "../services/publisher.js";
import { createInstagramJob } from "../services/instagramPublisher.js";
import { contentUsage, media, music, pages, posts, slots, weeklyPlan } from "../db/repositories.js";
import { enqueue as enqueueRender } from "../media/renderQueue.js";
import { isVisualKind, ASPECTS, type Aspect } from "../media/spec.js";
import { publishPhotoStory, publishVideoStory, FacebookError } from "../facebook/client.js";
import {
  pageSecretKeyFor,
  DEFAULT_WEEKLY_PLAN,
  type ContentFormat,
  type ScheduledPost,
} from "../domain.js";
import { formatToVisualKind } from "../content/varietyEngine.js";
import { resolveDataPath, resolveInsideDataDir } from "../paths.js";
import {
  startWeekGen,
  setPlanned,
  bumpCreated,
  finishWeekGen,
  failWeekGen,
  getWeekGen,
  isGenerating,
} from "../weekGenJobs.js";
import { slotDto, postDto, generatedToPostDto, enumToDay, mediaIn } from "../serialize.js";
import * as keyring from "../secrets/keyring.js";
import { err, jsonBody, type RouteContext } from "./_shared.js";

const activeWeekGen = new Map<string, AbortController>();

export function mountPost(api: Hono, ctx: RouteContext): void {
  const { deps, requireSecrets } = ctx;

  // ---------------- planner: slots ----------------

  api.get("/pages/:id/slots", async (c) => {
    return c.json((await slots.byPage(c.req.param("id"))).map(slotDto));
  });

  api.post("/pages/:id/slots", async (c) => {
    const pageId = c.req.param("id");
    const body = await jsonBody(c);
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
    const body = await jsonBody(c);
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
    const body = await jsonBody(c);
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
    const page = await pages.find(pageId);
    if (!page) return c.json(err("Pagina non trovata"), 404);
    const all = await posts.byPage(pageId, 500);
    const now = Date.now();
    const FB_MIN_AHEAD = 11 * 60 * 1000; // FB richiede scheduled_publish_time >= ~10 min nel futuro

    // Se la pagina ha Instagram collegato, creiamo automaticamente il job IG gemello per ogni
    // Reel/Storia programmato (Instagram non ha programmazione nativa: lo pubblica il job interno).
    const igEnabled = page.igUserId != null && page.igUserId.trim() !== "";

    let fbScheduled = 0; // post programmati nativamente su Facebook
    let jobScheduled = 0; // reel/storie (+ fallback) gestiti dal job interno
    let igCreated = 0; // job IG gemelli creati in automatico
    let skipped = 0;
    const messages: string[] = [];

    // Crea il gemello Instagram di un Reel/Storia appena programmato (idempotente). Best-effort:
    // se non è eleggibile (niente video) o fallisce, si salta senza bloccare la programmazione.
    const maybeIg = async (post: (typeof all)[number]): Promise<void> => {
      if (!igEnabled) return;
      const ch = channelFor(post);
      if (ch !== "REEL" && ch !== "STORY") return;
      try {
        await createInstagramJob(post);
        igCreated++;
      } catch {
        /* non eleggibile / nessun video pronto: salta */
      }
    };

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
      // Niente visual pronto per un formato che lo richiede (PHOTO/REEL/STORY): NON programmare —
      // resta DRAFT. Altrimenti diventerebbe SCHEDULED senza media e poi FAILED in pubblicazione.
      if (channel !== "TEXT" && !hasMedia) {
        skipped++;
        messages.push(`#${post.id}: nessun visual pronto, resta in bozza`);
        continue;
      }
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
          await maybeIg(post);
          continue;
        } catch (e) {
          // Programmazione nativa fallita (incluso reel rifiutato) → ripiega sul job interno.
          messages.push(`#${post.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // Job interno: storie, post troppo vicini/non pronti, o fallback.
      await setStatus(post, null);
      jobScheduled++;
      await maybeIg(post);
    }

    return c.json({
      ok: true,
      scheduled: fbScheduled + jobScheduled,
      fbScheduled,
      jobScheduled,
      igCreated,
      skipped,
      ...(messages.length ? { messages } : {}),
    });
  });

  // ---------------- posts ----------------

  api.get("/pages/:id/posts", async (c) => {
    return c.json((await posts.byPage(c.req.param("id"))).map(postDto));
  });

  // Tutti i post SCHEDULED di tutte le pagine (calendario Dashboard).
  api.get("/posts/scheduled", async (c) => {
    return c.json((await posts.scheduledAll()).map(postDto));
  });

  // Generate a draft post (shows base + specific + final hashtags).
  api.post("/posts/generate", async (c) => {
    const body = await jsonBody(c);
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
    const body = await jsonBody(c);
    if (typeof body.message === "string" && body.message.trim() !== "") {
      post.message = body.message;
    }
    // Il frontend invia hashtags come ARRAY (string[]); accettiamo anche la stringa (retrocompat).
    if (Array.isArray(body.hashtags)) {
      const joined = (body.hashtags as unknown[])
        .map((t) => String(t).trim())
        .filter((t) => t !== "")
        .join(" ");
      post.hashtags = joined === "" ? null : joined;
    } else if (typeof body.hashtags === "string") {
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
    // Libera la rotazione: il materiale usato dalla bozza torna subito disponibile.
    await contentUsage.deleteByPost(id).catch(() => {});
    await posts.delete(id);
    return c.json({ ok: true });
  });

  // POST /posts/:id/dashboard-hidden — NASCONDE (o ri-mostra) un post dalle viste della
  // Dashboard SENZA cancellarlo: la riga resta nel DB e il post resta su FB/IG. Diverso dal
  // DELETE reale qui sopra (bozze SCHEDULED/DRAFT). body { hidden?: boolean } (default true).
  api.post("/posts/:id/dashboard-hidden", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json<{ hidden?: boolean }>().catch(() => ({}) as { hidden?: boolean });
    const hidden = body?.hidden ?? true;
    await posts.setDashboardHidden(id, hidden);
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
    // Rotazione LRU su tutto lo storico pagina+libro: frase/immagine/musica meno usate vengono
    // preferite, così rigenerare più volte cicla il materiale invece di ripeterlo.
    const counts =
      post.bookId != null ? await contentUsage.usageCounts(post.pageId, post.bookId) : null;
    let musicTrackId: number | null = null;
    if (isVideo && post.bookId != null) {
      const tracks = await music.byBook(post.bookId);
      if (tracks.length > 0) {
        const mc = counts?.music ?? new Map<number, number>();
        const min = Math.min(...tracks.map((t) => mc.get(t.id) ?? 0));
        const least = tracks.filter((t) => (mc.get(t.id) ?? 0) === min);
        musicTrackId = least[Math.floor(Math.random() * least.length)]!.id;
      }
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
      ...(counts ? { quoteUsage: counts.quotes, imageUsage: counts.images } : {}),
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
    const body = await jsonBody(c);
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
      const p = resolveInsideDataDir(post.mediaPath);
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
    const body = await jsonBody(c);
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
      const counts =
        post.bookId != null ? await contentUsage.usageCounts(post.pageId, post.bookId) : null;
      result = await deps.director.generaVisualSpec(post, {
        kind: body.kind,
        template,
        aspect,
        useImages,
        musicTrackId,
        // Capitolo del post (se registrato) → immagine di sfondo pertinente; altrimenti ripiego aspect.
        chapterIndex: usage?.chapterIndex ?? null,
        ...(counts ? { quoteUsage: counts.quotes, imageUsage: counts.images } : {}),
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

  // ---------------- usage stats (motore di varietà) ----------------

  // GET /pages/:id/usage-stats — statistiche d'uso aggregate dal registro content_usage.
  api.get("/pages/:id/usage-stats", async (c) => {
    const stats = await contentUsage.statsByPage(c.req.param("id"));
    return c.json(stats);
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
    const body = await jsonBody(c);

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
    const resolvedMediaPath = resolveInsideDataDir(post.mediaPath);
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
}
