import { books, characters } from "../db/repositories.js";
import type { ContentEngine } from "../content/engine.js";
import { extractChapterScene, type ExtractedChapterScene } from "../content/chapterScene.js";
import type { BookChapter, BookCharacter, ChapterScene } from "../domain.js";

// Orchestratore della SCHEDA VISIVA per capitolo: estrae on-demand dal testo e mette in
// cache su book_chapter.scene_json. Usata sia dalla generazione immagini (grounding del prompt)
// sia dalla UI (vista/modifica per capitolo).

export interface ChapterSceneDeps {
  engine: ContentEngine;
}

export class ChapterSceneService {
  constructor(private readonly deps: ChapterSceneDeps) {}

  // Ritorna la scheda del capitolo: dalla cache se c'è, altrimenti la estrae e la salva.
  // Ritorna null se il capitolo non esiste o l'estrazione fallisce (best-effort).
  async getOrBuild(bookId: number, chapterIndex: number): Promise<ChapterScene | null> {
    const chapter = await books.chapter(bookId, chapterIndex);
    if (!chapter) return null;
    if (chapter.scene) return chapter.scene;
    return this.buildAndSave(bookId, chapter);
  }

  // Ri-estrae SEMPRE la scheda (ignora la cache) e la salva. Per il bottone "(Ri)genera scheda".
  async regenerate(bookId: number, chapterIndex: number): Promise<ChapterScene | null> {
    const chapter = await books.chapter(bookId, chapterIndex);
    if (!chapter) return null;
    return this.buildAndSave(bookId, chapter);
  }

  // Salva le modifiche manuali dell'utente (marca source='USER').
  async save(
    bookId: number,
    chapterIndex: number,
    patch: Partial<ExtractedChapterScene>,
  ): Promise<ChapterScene | null> {
    const chapter = await books.chapter(bookId, chapterIndex);
    if (!chapter) return null;
    const prev = chapter.scene;
    const scene: ChapterScene = {
      location: patch.location !== undefined ? patch.location : (prev?.location ?? null),
      environment:
        patch.environment !== undefined ? patch.environment : (prev?.environment ?? null),
      mainObjects: patch.mainObjects !== undefined ? patch.mainObjects : (prev?.mainObjects ?? []),
      secondaryObjects:
        patch.secondaryObjects !== undefined
          ? patch.secondaryObjects
          : (prev?.secondaryObjects ?? []),
      characters: patch.characters !== undefined ? patch.characters : (prev?.characters ?? []),
      physicsRules:
        patch.physicsRules !== undefined ? patch.physicsRules : (prev?.physicsRules ?? []),
      keyMoment: patch.keyMoment !== undefined ? patch.keyMoment : (prev?.keyMoment ?? null),
      source: "USER",
      model: prev?.model ?? null,
      updatedAt: Date.now(),
    };
    await books.setChapterScene(chapter.id, scene);
    return scene;
  }

  // RICALCOLO COMPLETO della presenza dei personaggi per capitolo (book_character.chapters).
  // PRESENZA = presenza FISICA nelle scene, NON semplice menzione del nome. L'unica fonte affidabile
  // è la scheda visiva GPT di ogni capitolo, che estrae solo i personaggi effettivamente IN SCENA
  // (chi è soltanto nominato/ricordato/atteso è escluso dal prompt di estrazione). Quindi:
  //   - per ogni capitolo, ogni personaggio del cast che combacia (namesMatch lasco) con un nome
  //     della scheda (card.characters, già canonicalizzato sul cast da canonicalizeCharacters) è "presente".
  // Il PROTAGONISTA/narratore NON è più forzato in tutti i capitoli: vale anche per lui la presenza
  // fisica della scheda (il prompt include esplicitamente il personaggio-POV/«io» quando è in scena).
  // Così è corretto anche per libri con prologhi, flashback o capitoli dal POV di un ALTRO personaggio.
  // NB: NIENTE scan deterministico del testo né merge NLP — un nome citato non implica presenza in
  // scena (scelta utente: precisione > recall). Un presente che GPT manca si recupera editando la scheda.
  // Scrive i risultati in bulk (transazione) e ritorna il cast aggiornato.
  async recomputeCharacterChapters(bookId: number): Promise<BookCharacter[]> {
    const cast = await characters.byBook(bookId);
    const chapters = await books.chapters(bookId);
    if (cast.length === 0 || chapters.length === 0) return cast;

    // Indici di presenza accumulati per id personaggio.
    const presence = new Map<number, Set<number>>();
    for (const c of cast) presence.set(c.id, new Set<number>());

    // Per ogni capitolo: scheda visiva (cache o estrazione GPT on-demand) → match al cast.
    // Presente = combacia con un personaggio FISICAMENTE in scena secondo la scheda GPT.
    // Distinguo card NULL (estrazione fallita) da card valida ma SENZA personaggi: la prima va
    // preservata (no perdita dati su fallimenti transitori GPT), la seconda è "nessun presente".
    const failedChapters = new Set<number>();
    for (const chapter of chapters) {
      const card = await this.getOrBuild(bookId, chapter.index);
      if (!card) {
        failedChapters.add(chapter.index);
        continue;
      }
      const cardNames = card.characters.map((n) => n.trim()).filter((n) => n.length > 0);
      for (const c of cast) {
        if (cardNames.some((n) => namesMatch(c.name, n))) presence.get(c.id)!.add(chapter.index);
      }
    }

    // Capitoli senza scheda affidabile (estrazione fallita): conserva la presenza PRECEDENTE di
    // ogni personaggio per quegli indici invece di azzerarla nel salvataggio bulk.
    if (failedChapters.size > 0) {
      for (const c of cast) {
        for (const idx of c.chapters) {
          if (failedChapters.has(idx)) presence.get(c.id)!.add(idx);
        }
      }
    }

    // Persisti in bulk (transazione) e ritorna il cast aggiornato.
    await characters.setChaptersBulk(
      cast.map((c) => ({ characterId: c.id, chapters: [...presence.get(c.id)!] })),
    );
    return characters.byBook(bookId);
  }

  private async buildAndSave(bookId: number, chapter: BookChapter): Promise<ChapterScene | null> {
    const cast = await characters.byBook(bookId);
    const book = await books.get(bookId);
    const extracted = await extractChapterScene(this.deps.engine, {
      chapterText: chapter.text,
      chapterTitle: chapter.title,
      language: book?.language ?? "italiano",
      knownCharacters: cast.map((c) => c.name),
      directives: book?.visualDirectives ?? null,
    });
    if (!extracted) return null;
    const scene: ChapterScene = {
      ...extracted,
      // Personaggi = SOLO quelli estratti dal GPT (fisicamente in scena), con i nomi canonicalizzati
      // sul cast. Niente aggiunte da NLP/menzioni: un nome citato non implica presenza in scena.
      characters: canonicalizeCharacters(extracted.characters, cast),
      source: "AI",
      model: this.deps.engine.name(),
      updatedAt: Date.now(),
    };
    await books.setChapterScene(chapter.id, scene);
    return scene;
  }
}

// Confronto lasco fra nomi, ma per TOKEN INTERI (no sottostringhe): "Marco" combacia con
// "Marco Romidi", mentre "Anna" NON combacia con "Marianna" né "Sara" con "Rosaria". Combaciano
// se i token del nome più corto sono tutti presenti, come parole intere, nell'altro (così due
// nomi completi diversi con lo stesso primo nome — "Marco Rossi"/"Marco Bianchi" — restano distinti).
function namesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === "" || y === "") return false;
  if (x === y) return true;
  const tx = x.split(/\s+/);
  const ty = y.split(/\s+/);
  const [short, long] = tx.length <= ty.length ? [tx, ty] : [ty, tx];
  const longSet = new Set(long);
  return short.every((t) => longSet.has(t));
}

// Canonicalizza i nomi dei personaggi estratti dal GPT sul cast del libro: quando un nome estratto
// combacia (namesMatch lasco) con un membro del cast, usa il NOME del cast. Preserva l'ordine di
// estrazione e deduplica (case-insensitive). NON aggiunge personaggi dall'NLP/menzioni: la scheda
// elenca solo chi è FISICAMENTE in scena (scelta utente: presenza fisica, non semplice menzione).
function canonicalizeCharacters(extracted: string[], cast: BookCharacter[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of extracted) {
    const match = cast.find((c) => namesMatch(c.name, n));
    const name = match ? match.name : n;
    const key = name.toLowerCase().trim();
    if (key !== "" && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}
