import type { ContentEngine } from "../content/engine.js";
import {
  extractMarketingCard,
  MARKETING_CARD_SCHEMA_VERSION,
} from "../content/chapterMarketingCard.js";
import { books, characters, marketingCards } from "../db/repositories.js";
import type { ChapterMarketingCard } from "../domain.js";

// Servizio SCHEDA MARKETING DI CAPITOLO: build/cache/rigenerazione della comprensione
// narrativa persistente usata per fondare i post. Pattern analogo a ChapterSceneService.

export interface ChapterMarketingDeps {
  engine: ContentEngine;
}

export class ChapterMarketingService {
  constructor(private readonly deps: ChapterMarketingDeps) {}

  // Ritorna la scheda dalla cache se presente e con schema corrente; altrimenti la costruisce.
  async getOrBuild(bookId: number, chapterIndex: number): Promise<ChapterMarketingCard | null> {
    const existing = await marketingCards.get(bookId, chapterIndex);
    if (existing && existing.schemaVersion === MARKETING_CARD_SCHEMA_VERSION) return existing;
    return this.build(bookId, chapterIndex);
  }

  // Forza la ricostruzione (ignora la cache).
  async regenerate(bookId: number, chapterIndex: number): Promise<ChapterMarketingCard | null> {
    return this.build(bookId, chapterIndex);
  }

  // Costruisce TUTTE le schede dei capitoli (non esclusi). Ritorna gli indici costruiti.
  async buildAll(
    bookId: number,
    hooks?: { onTotal?: (n: number) => void; onItem?: () => void },
  ): Promise<number[]> {
    const chapters = await books.chapters(bookId);
    const eligible = chapters.filter((ch) => ch.excluded !== true && ch.index != null);
    hooks?.onTotal?.(eligible.length);
    const done: number[] = [];
    for (const ch of eligible) {
      const card = await this.build(bookId, ch.index);
      if (card) done.push(ch.index);
      hooks?.onItem?.();
    }
    return done;
  }

  private async build(bookId: number, chapterIndex: number): Promise<ChapterMarketingCard | null> {
    const [book, chapters, cast, profile] = await Promise.all([
      books.get(bookId),
      books.chapters(bookId),
      characters.byBook(bookId),
      books.currentProfile(bookId),
    ]);
    const chapter = chapters.find((c) => c.index === chapterIndex);
    if (!chapter || !chapter.text || chapter.text.trim() === "") return null;
    if (!book) return null;
    const data = await extractMarketingCard(this.deps.engine, {
      chapterText: chapter.text,
      chapterTitle: chapter.title,
      language: book.language,
      knownCharacters: cast.map((c) => c.name),
      keyMoment: chapter.scene?.keyMoment ?? null,
      spoilerPolicy: profile?.analysisJson ?? null,
    });
    if (!data) return null;
    await marketingCards.upsert({
      bookId,
      chapterIndex,
      schemaVersion: MARKETING_CARD_SCHEMA_VERSION,
      data,
      model: this.deps.engine.name(),
    });
    return marketingCards.get(bookId, chapterIndex);
  }
}
