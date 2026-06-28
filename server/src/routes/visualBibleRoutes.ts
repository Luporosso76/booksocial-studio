import { Hono } from "hono";
import { books, marketingCards, visualDirectives } from "../db/repositories.js";
import { ChapterMarketingService } from "../services/chapterMarketingService.js";
import { VISUAL_DOMAINS } from "../content/imageDomains.js";
import { ChapterMoment } from "../domain.js";
import { translateDirectivesToEnglish } from "../content/translate.js";
import { generateVisualDirective } from "../content/visualDirectiveAssist.js";
import { buildVisualBible, stepProps, stepMinors } from "../services/visualBible.js";
import {
  getVisualBible,
  isVisualBibleRunning,
  finishVisualBible,
  VB_STEP_ORDER,
  type VBStepKey,
} from "../visualBibleJobs.js";
import { setJob } from "../analysisJobs.js";
import { bookDto, characterDto, visualDirectiveDto } from "../serialize.js";
import { parseTriggersInput, err, jsonBody, type RouteContext } from "./_shared.js";

// Guard contro la doppia esecuzione concorrente del ricalcolo presenza personaggi (per libro):
// l'operazione è sincrona e lenta (1 chiamata GPT per capitolo), quindi blocchiamo i doppioni.
const recomputingChapters = new Set<number>();
// Stato del build (per libro) delle schede marketing, esposto da /marketing-cards/status.
const marketingBuilds = new Map<number, { running: boolean; done: number; total: number }>();

export function mountVisualBible(api: Hono, ctx: RouteContext): void {
  const { deps } = ctx;

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

  api.get("/books/:id/visual-directives", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json(err("id non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const directives = await visualDirectives.byBook(id);
    return c.json({ directives: directives.map(visualDirectiveDto) });
  });

  api.post("/books/:id/visual-directives", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json(err("id non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await jsonBody(c);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (title === "") return c.json(err("title mancante"), 400);
    const triggers = parseTriggersInput(body.triggers);
    const intent =
      typeof body.intent === "string" && body.intent.trim() !== "" ? body.intent.trim() : null;
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const enabled = body.enabled === undefined ? true : body.enabled === true;
    const bodyEn = text === "" ? null : await translateDirectivesToEnglish(deps.engine, text);
    const created = await visualDirectives.create({
      bookId: id,
      title,
      triggers,
      intent,
      body: text === "" ? null : text,
      bodyEn,
      enabled,
      sortOrder: await visualDirectives.countByBook(id),
    });
    return c.json(visualDirectiveDto(created));
  });

  api.put("/books/:id/visual-directives/:did", async (c) => {
    const id = Number(c.req.param("id"));
    const did = Number(c.req.param("did"));
    if (!Number.isInteger(id) || !Number.isInteger(did)) return c.json(err("id non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const existing = await visualDirectives.get(did);
    if (!existing || existing.bookId !== id) return c.json(err("Direttiva non trovata"), 404);
    const body = await jsonBody(c);
    const title =
      typeof body.title === "string" && body.title.trim() !== ""
        ? body.title.trim()
        : existing.title;
    const triggers = "triggers" in body ? parseTriggersInput(body.triggers) : existing.triggers;
    const intent =
      "intent" in body
        ? typeof body.intent === "string" && body.intent.trim() !== ""
          ? body.intent.trim()
          : null
        : existing.intent;
    const text =
      "body" in body
        ? typeof body.body === "string"
          ? body.body.trim()
          : ""
        : (existing.body ?? "");
    const enabled = "enabled" in body ? body.enabled === true : existing.enabled;
    const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : existing.sortOrder;
    let bodyEn = existing.bodyEn;
    if (text === "") bodyEn = null;
    else if ((existing.body ?? "") !== text || existing.bodyEn == null)
      bodyEn = await translateDirectivesToEnglish(deps.engine, text);
    await visualDirectives.update(did, {
      title,
      triggers,
      intent,
      body: text === "" ? null : text,
      bodyEn,
      enabled,
      sortOrder,
    });
    const updated = await visualDirectives.get(did);
    return c.json(updated ? visualDirectiveDto(updated) : err("Direttiva non trovata"));
  });

  api.delete("/books/:id/visual-directives/:did", async (c) => {
    const id = Number(c.req.param("id"));
    const did = Number(c.req.param("did"));
    if (!Number.isInteger(id) || !Number.isInteger(did)) return c.json(err("id non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const existing = await visualDirectives.get(did);
    if (!existing || existing.bookId !== id) return c.json(err("Direttiva non trovata"), 404);
    await visualDirectives.delete(did);
    return c.json({ ok: true });
  });

  api.post("/books/:id/visual-directives/assist", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json(err("id non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await jsonBody(c);
    const intent = typeof body.intent === "string" ? body.intent.trim() : "";
    if (intent === "") return c.json(err("intent mancante"), 400);
    const title =
      typeof body.title === "string" && body.title.trim() !== "" ? body.title.trim() : undefined;
    const draft = await generateVisualDirective(deps.engine, {
      intent,
      ...(title ? { title } : {}),
      bookTitle: book.title,
      language: book.language,
    });
    return c.json(draft);
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
    const body = await jsonBody(c);
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
    const body = (await jsonBody(c)) as { language?: string };
    const language = typeof body.language === "string" ? body.language : undefined;
    setJob(id, "analyzing");
    // Fire-and-forget: la richiesta HTTP non aspetta la fine dell'analisi.
    void deps.content
      .reanalyzeBook(id, language)
      .then(() => setJob(id, "ready"))
      .catch((e: unknown) => setJob(id, "failed", e instanceof Error ? e.message : String(e)));
    return c.json({ status: "analyzing" });
  });

  // Ri-estrae solo le citazioni reali + metriche personaggi (pre-pass NLP) e le ripopola, senza
  // rifare la scheda GPT. Sincrono: ritorna quante citazioni sono state scritte.
  api.post("/books/:id/reindex-nlp", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    try {
      const r = await deps.content.reindexNlp(id);
      if (r == null) {
        return c.json(err("Pre-pass NLP non disponibile (Python/venv assente sul server)."), 503);
      }
      return c.json({ ok: true, quotes: r.quotes });
    } catch (e) {
      return c.json(err(e instanceof Error ? e.message : String(e)), 422);
    }
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
    const body = await jsonBody(c);
    const str = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const arr = (v: unknown): string[] | undefined =>
      Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x.length > 0) : undefined;
    const agesFrom = (v: unknown): { name: string; age: number }[] => {
      if (!Array.isArray(v)) return [];
      const out: { name: string; age: number }[] = [];
      for (const x of v) {
        if (x == null || typeof x !== "object") continue;
        const a = x as Record<string, unknown>;
        const name = String(a.name ?? "").trim();
        const age = Number(a.age);
        if (name !== "" && Number.isFinite(age) && age > 0)
          out.push({ name, age: Math.round(age) });
      }
      return out;
    };
    const scene = await deps.chapterScenes.save(id, idx, {
      ...(body.location !== undefined ? { location: str(body.location) } : {}),
      ...(body.environment !== undefined ? { environment: str(body.environment) } : {}),
      ...(arr(body.mainObjects) !== undefined ? { mainObjects: arr(body.mainObjects) } : {}),
      ...(arr(body.secondaryObjects) !== undefined
        ? { secondaryObjects: arr(body.secondaryObjects) }
        : {}),
      ...(arr(body.characters) !== undefined ? { characters: arr(body.characters) } : {}),
      ...(arr(body.physicsRules) !== undefined ? { physicsRules: arr(body.physicsRules) } : {}),
      ...(body.keyMoment !== undefined ? { keyMoment: str(body.keyMoment) } : {}),
      ...(body.kind === "waking" || body.kind === "dream" || body.kind === "flashback"
        ? { kind: body.kind }
        : {}),
      ...("youngerYears" in body
        ? {
            youngerYears:
              Number.isFinite(Number(body.youngerYears)) && Number(body.youngerYears) > 0
                ? Number(body.youngerYears)
                : null,
          }
        : {}),
      ...(Array.isArray(body.characterAges) ? { characterAges: agesFrom(body.characterAges) } : {}),
      ...(Array.isArray(body.altMoments)
        ? {
            altMoments: (body.altMoments as unknown[])
              .map((x): ChapterMoment | null => {
                if (x == null || typeof x !== "object") return null;
                const m = x as Record<string, unknown>;
                const type =
                  m.type === "dream" || m.type === "flashback"
                    ? m.type
                    : m.type === "memory"
                      ? "flashback"
                      : null;
                const km = str(m.keyMoment);
                if (!type || !km) return null;
                const yy = Number(m.youngerYears);
                return {
                  type,
                  location: str(m.location),
                  environment: str(m.environment),
                  mainObjects: arr(m.mainObjects) ?? [],
                  secondaryObjects: arr(m.secondaryObjects) ?? [],
                  characters: arr(m.characters) ?? [],
                  physicsRules: arr(m.physicsRules) ?? [],
                  keyMoment: km,
                  whose: str(m.whose),
                  youngerYears: Number.isFinite(yy) && yy > 0 ? yy : null,
                  characterAges: agesFrom(m.characterAges),
                };
              })
              .filter((m): m is ChapterMoment => m !== null),
          }
        : {}),
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

  // GET /books/:id/marketing-cards — tutte le schede marketing del libro (ispezione/UI futura).
  api.get("/books/:id/marketing-cards", async (c) => {
    const id = Number(c.req.param("id"));
    return c.json(await marketingCards.byBook(id));
  });

  // GET /books/:id/marketing-cards/status — progresso del build in corso, o conteggio attuale.
  api.get("/books/:id/marketing-cards/status", async (c) => {
    const id = Number(c.req.param("id"));
    const st = marketingBuilds.get(id);
    if (st) return c.json(st);
    return c.json({ running: false, done: await marketingCards.countByBook(id), total: 0 });
  });

  // POST /books/:id/marketing-cards/build — costruisce in BACKGROUND tutte le schede marketing
  // (fire-and-forget, una chiamata GPT per capitolo). Stato via /marketing-cards/status.
  api.post("/books/:id/marketing-cards/build", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    if (marketingBuilds.get(id)?.running) {
      return c.json(err("Costruzione schede marketing già in corso"), 409);
    }
    marketingBuilds.set(id, { running: true, done: 0, total: 0 });
    const svc = new ChapterMarketingService({ engine: deps.engine });
    void svc
      .buildAll(id, {
        onTotal: (n) => marketingBuilds.set(id, { running: true, done: 0, total: n }),
        onItem: () => {
          const st = marketingBuilds.get(id);
          if (st) st.done += 1;
        },
      })
      .catch(() => {})
      .finally(() => {
        const st = marketingBuilds.get(id);
        if (st) st.running = false;
      });
    return c.json({ started: true });
  });
}
