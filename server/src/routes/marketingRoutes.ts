import { Hono } from "hono";
import { books, marketingCards, quotes } from "../db/repositories.js";
import { marketingCardDto, quoteDto } from "../serialize.js";
import type {
  ChapterMarketingCardData,
  MarketingPostAngle,
  MarketingSafeQuote,
  SpoilerLevel,
} from "../domain.js";
import { err, jsonBody, type RouteContext } from "./_shared.js";

const SPOILER_LEVELS: readonly SpoilerLevel[] = ["low", "medium", "high"];

function num0to10(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(10, Math.max(0, v));
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function sanitizeAngle(v: unknown, base: MarketingPostAngle): MarketingPostAngle {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    type: str(o.type, base.type),
    hook: str(o.hook, base.hook),
    reason: str(o.reason, base.reason),
    concreteness: num0to10(o.concreteness, base.concreteness),
    emotionalStrength: num0to10(o.emotionalStrength, base.emotionalStrength),
    spoilerSafety: num0to10(o.spoilerSafety, base.spoilerSafety),
    freshness: num0to10(o.freshness, base.freshness),
  };
}

function sanitizeSafeQuote(v: unknown, base: MarketingSafeQuote): MarketingSafeQuote {
  const o = (v ?? {}) as Record<string, unknown>;
  const risk = o.spoilerRisk;
  return {
    quote: str(o.quote, base.quote),
    whyItWorks: str(o.whyItWorks, base.whyItWorks),
    spoilerRisk: SPOILER_LEVELS.includes(risk as SpoilerLevel)
      ? (risk as SpoilerLevel)
      : base.spoilerRisk,
  };
}

function mergeEditableData(
  current: ChapterMarketingCardData,
  patch: Record<string, unknown>,
): { data: ChapterMarketingCardData; changed: boolean } {
  const next: ChapterMarketingCardData = {
    ...current,
    safeQuotes: [...current.safeQuotes],
    characterFocus: [...current.characterFocus],
    postAngles: [...current.postAngles],
  };
  let changed = false;

  const scalarKeys: (keyof ChapterMarketingCardData)[] = [
    "nonSpoilerSummary",
    "emotionalCore",
    "humanTruth",
    "readerQuestion",
    "mainTension",
    "visualMoment",
  ];
  for (const k of scalarKeys) {
    if (typeof patch[k] === "string") {
      (next[k] as string) = patch[k] as string;
      changed = true;
    }
  }

  if (SPOILER_LEVELS.includes(patch.spoilerLevel as SpoilerLevel)) {
    next.spoilerLevel = patch.spoilerLevel as SpoilerLevel;
    changed = true;
  }

  if (Array.isArray(patch.postAngles)) {
    next.postAngles = (patch.postAngles as unknown[]).map((a, i) =>
      sanitizeAngle(
        a,
        current.postAngles[i] ?? {
          type: "",
          hook: "",
          reason: "",
          concreteness: 0,
          emotionalStrength: 0,
          spoilerSafety: 0,
          freshness: 0,
        },
      ),
    );
    changed = true;
  }

  if (Array.isArray(patch.safeQuotes)) {
    next.safeQuotes = (patch.safeQuotes as unknown[]).map((q, i) =>
      sanitizeSafeQuote(
        q,
        current.safeQuotes[i] ?? {
          quote: "",
          whyItWorks: "",
          spoilerRisk: "low",
        },
      ),
    );
    changed = true;
  }

  return { data: next, changed };
}

export function mountMarketing(api: Hono, _ctx: RouteContext): void {
  api.get("/books/:id/marketing-cards", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const cards = await marketingCards.byBook(id);
    return c.json({ cards: cards.map(marketingCardDto) });
  });

  api.put("/books/:id/marketing-cards/:chapterIndex", async (c) => {
    const id = Number(c.req.param("id"));
    const chapterIndex = Number(c.req.param("chapterIndex"));
    if (!Number.isInteger(chapterIndex) || chapterIndex < 0)
      return c.json(err("chapterIndex non valido"), 400);
    const existing = await marketingCards.get(id, chapterIndex);
    if (!existing) return c.json(err("Scheda marketing non trovata"), 404);
    const body = await jsonBody(c);
    const patch =
      body && typeof body.data === "object" && body.data !== null
        ? (body.data as Record<string, unknown>)
        : (body as Record<string, unknown>);
    const { data, changed } = mergeEditableData(existing.data, patch ?? {});
    if (!changed) return c.json(err("Nessun campo editabile valido nel body"), 400);
    await marketingCards.upsert({
      bookId: id,
      chapterIndex,
      schemaVersion: existing.schemaVersion,
      data,
      model: "USER",
    });
    const updated = await marketingCards.get(id, chapterIndex);
    return c.json(updated ? marketingCardDto(updated) : err("Scheda marketing non trovata"));
  });

  api.get("/books/:id/quotes", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    return c.json({ quotes: (await quotes.byBook(id)).map(quoteDto) });
  });

  api.put("/books/:id/quotes/:quoteId", async (c) => {
    const quoteId = Number(c.req.param("quoteId"));
    const existing = await quotes.get(quoteId);
    if (!existing) return c.json(err("Citazione non trovata"), 404);
    const body = await jsonBody(c);
    const fields: { text?: string; speaker?: string | null } = {};
    if (typeof body.text === "string") {
      if (body.text.trim() === "")
        return c.json(err("Il testo della citazione non può essere vuoto"), 400);
      fields.text = body.text.trim();
    }
    if ("speaker" in body) {
      fields.speaker =
        typeof body.speaker === "string" && body.speaker.trim() !== "" ? body.speaker.trim() : null;
    }
    if (fields.text === undefined && !("speaker" in fields))
      return c.json(err("Nessun campo editabile nel body"), 400);
    await quotes.updateFields(quoteId, fields);
    const updated = await quotes.get(quoteId);
    return c.json(updated ? quoteDto(updated) : err("Citazione non trovata"));
  });

  api.delete("/books/:id/quotes/:quoteId", async (c) => {
    const quoteId = Number(c.req.param("quoteId"));
    const existing = await quotes.get(quoteId);
    if (!existing) return c.json(err("Citazione non trovata"), 404);
    await quotes.delete(quoteId);
    return c.json({ ok: true });
  });
}
