import { Hono } from "hono";
import { setJob } from "../analysisJobs.js";
import { translateDirectivesToEnglish } from "../content/translate.js";
import { generateVisualDirective } from "../content/visualDirectiveAssist.js";
import { books, marketingCards, visualDirectives } from "../db/repositories.js";
import { type ChapterMoment } from "../domain.js";
import { bookDto, characterDto, visualDirectiveDto } from "../serialize.js";
import { ChapterMarketingService } from "../services/chapterMarketingService.js";
import { buildVisualBible, stepMinors, stepProps } from "../services/visualBible.js";
import {
  VB_STEP_ORDER,
  finishVisualBible,
  getVisualBible,
  isVisualBibleRunning,
  type VBStepKey,
} from "../visualBibleJobs.js";
import { err, jsonBody, parseTriggersInput, type RouteContext } from "./_shared.js";

const recomputingChapters = new Set<number>();

const marketingBuilds = new Map<number, { running: boolean; done: number; total: number }>();

export function mountVisualBible(api: Hono, ctx: RouteContext): void {
  const { deps } = ctx;

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

  api.post("/books/:id/generate-props", async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await books.get(bookId);
    if (!book) return c.json(err("Libro non trovato"), 404);
    await stepProps(deps.engine, bookId);
    const updated = await books.get(bookId);
    return c.json(updated ? bookDto(updated) : err("Libro non trovato"));
  });

  api.post("/books/:id/generate-minors", async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await books.get(bookId);
    if (!book) return c.json(err("Libro non trovato"), 404);
    await stepMinors(deps.engine, bookId);
    const updated = await books.get(bookId);
    return c.json(updated ? bookDto(updated) : err("Libro non trovato"));
  });

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

    void buildVisualBible(
      { engine: deps.engine, chapterScenes: deps.chapterScenes },
      id,
      stepKeys,
    ).catch((e) => finishVisualBible(id, e instanceof Error ? e.message : String(e)));
    return c.json({ started: true });
  });

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

  api.post("/books/:id/reanalyze", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = (await jsonBody(c)) as {
      language?: string;
    };
    const language = typeof body.language === "string" ? body.language : undefined;
    setJob(id, "analyzing");

    void deps.content
      .reanalyzeBook(id, language)
      .then(() => setJob(id, "ready"))
      .catch((e: unknown) => setJob(id, "failed", e instanceof Error ? e.message : String(e)));
    return c.json({ status: "analyzing" });
  });

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
      ...(body.pov !== undefined ? { pov: str(body.pov) } : {}),
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

  api.get("/books/:id/marketing-cards", async (c) => {
    const id = Number(c.req.param("id"));
    return c.json(await marketingCards.byBook(id));
  });

  api.get("/books/:id/marketing-cards/status", async (c) => {
    const id = Number(c.req.param("id"));
    const st = marketingBuilds.get(id);
    if (st) return c.json(st);
    return c.json({
      running: false,
      done: await marketingCards.countByBook(id),
      total: 0,
    });
  });

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
