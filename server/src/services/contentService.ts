import type { ContentEngine } from "../content/engine.js";
import { ContentError } from "../content/engine.js";
import { analyzeBook } from "../content/analyzer.js";
import {
  generatePost,
  mergeHashtags,
  type CharacterBrief,
  type GeneratedPost,
} from "../content/postGenerator.js";
import { parseModelJson } from "../content/modelJson.js";
import { readBook, joinChapters, sha256, type ImportedBook } from "../content/importer.js";
import { indexBook } from "../content/nlpIndex.js";
import { books, characters, generations, links, pages, posts, quotes } from "../db/repositories.js";
import * as aiSettings from "../content/aiSettings.js";
import { CURRENT_PROMPT_VERSION, type Book, type MediaType } from "../domain.js";

// Combina istruzioni-extra globali + per-libro in un unico blocco accodato ai prompt. Scarta i
// vuoti; "" se non c'è nulla (prompt invariato).
function combineExtras(
  global: string | null | undefined,
  perBook: string | null | undefined,
): string {
  return [global, perBook]
    .map((s) => (s ?? "").trim())
    .filter((s) => s !== "")
    .join("\n\n");
}

// Content orchestrator: import, one-time analysis (scheda), post generation.
// "Analyze once, generate many."

export type ProgressFn = (msg: string) => void;

// Etichetta leggibile per il canale di un link (usata nel blocco link dei post quando
// il link non ha una label esplicita).
function channelLabel(channel: string): string {
  switch (channel) {
    case "sito_libro":
      return "Il libro";
    case "sito_autore":
      return "L'autore";
    case "vendita":
      return "Acquista";
    case "social_autore":
      return "Seguimi";
    default:
      return "Link";
  }
}

function profileIsFresh(
  profile: { sourceContentHash: string; promptVersion: number },
  book: Book,
): boolean {
  return (
    book.contentHash === profile.sourceContentHash &&
    profile.promptVersion === CURRENT_PROMPT_VERSION
  );
}

export class ContentService {
  constructor(private readonly engine: ContentEngine) {}

  // Import veloce: importa/aggiorna il libro + capitoli. NON analizza.
  // Ritorna il libro, se serve l'analisi, e i dati parsati (imp) per l'analisi successiva.
  async importBook(
    sourcePath: string,
    fileContent: string,
    fileName: string,
    author: string | null,
    language: string | null,
  ): Promise<{ book: Book; needsAnalysis: boolean; imp: ImportedBook }> {
    const imp: ImportedBook = readBook(fileContent, fileName, author, language);

    const existing = await books.findByPath(sourcePath);
    let book: Book;
    if (existing && existing.contentHash === imp.contentHash) {
      book = existing;
    } else if (existing) {
      await books.replaceChapters(existing.id, imp.chapters);
      await books.updateContent(
        existing.id,
        imp.contentHash,
        imp.chapters.length,
        imp.charCount,
        Date.now(),
      );
      const refreshed = await books.get(existing.id);
      book = refreshed ?? existing;
    } else {
      const now = Date.now();
      const created = await books.insert({
        title: imp.title,
        author: imp.author,
        language: imp.language,
        sourcePath,
        contentHash: imp.contentHash,
        chapterCount: imp.chapters.length,
        charCount: imp.charCount,
        importedAt: now,
        updatedAt: now,
        websiteUrl: null,
        notes: null,
        baseHashtags: null,
        visualDomains: [],
        visualDirectives: null,
        visualDirectivesEn: null,
        visualProps: { props: [], drivingSide: null, country: null },
        visualExtras: { minors: [] },
        textExtraInstructions: null,
        imageExtraInstructions: null,
      });
      await books.replaceChapters(created.id, imp.chapters);
      book = created;
    }

    const profile = await books.currentProfile(book.id);
    const needsAnalysis = !(profile && profileIsFresh(profile, book));
    return { book, needsAnalysis, imp };
  }

  // Analisi lenta: analisi col modello e salvataggio scheda. Pensata per girare in BACKGROUND,
  // cosi' la richiesta HTTP di import non resta appesa su libri grandi.
  async analyzeProfile(book: Book, imp: ImportedBook, outputLanguage?: string): Promise<void> {
    const fullText = joinChapters(imp.chapters);

    // Pre-pass NLP (OPZIONALE) PRIMA dell'analisi: estrae citazioni/dialoghi REALI
    // e i nomi dei personaggi. I nomi servono da SEEDING al prompt; le citazioni
    // verranno persistite dopo l'analisi. Se non disponibile, ritorna null e tutto
    // procede come prima (nessun seeding, nessuna citazione).
    const nlp = await this.runNlpPrePass(imp);
    const seedCharacters = nlp ? nlp.characters.map((c) => c.name) : [];

    const analyzed = await analyzeBook(
      this.engine,
      {
        title: book.title,
        author: book.author,
        language: book.language,
        contentHash: book.contentHash,
      },
      fullText,
      seedCharacters,
      outputLanguage,
    );
    await books.upsertProfile({
      bookId: book.id,
      synopsisShort: analyzed.synopsisShort,
      synopsisLong: analyzed.synopsisLong,
      genres: analyzed.genres,
      tone: analyzed.tone,
      targetAudience: analyzed.targetAudience,
      analysisJson: analyzed.analysisJson,
      sourceContentHash: book.contentHash,
      promptVersion: analyzed.promptVersion,
      model: analyzed.model,
      createdAt: Date.now(),
    });

    // Personaggi: oltre a restare dentro analysisJson, vengono persistiti nella tabella
    // strutturata (solo le righe source='AI', preservando quelle editate dall'utente).
    await this.persistAiCharacters(book.id, analyzed.analysisJson);

    // Persiste i risultati del pre-pass NLP (citazioni reali + metriche personaggi),
    // se il pre-pass aveva prodotto dati. DOPO persistAiCharacters cosi' il match
    // mentions/chapters trova le righe appena salvate.
    if (nlp) await this.persistNlp(book.id, nlp);
  }

  // Esegue il pre-pass NLP sui capitoli e ritorna il risultato grezzo (o null se
  // non disponibile/fallisce). Nessun errore propagato: e' interamente opzionale.
  private async runNlpPrePass(imp: ImportedBook): Promise<Awaited<ReturnType<typeof indexBook>>> {
    try {
      return await indexBook(
        imp.chapters.map((ch) => ({ index: ch.index, title: ch.title, text: ch.text })),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[nlp] pre-pass saltato: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  // Salva le citazioni reali (quotes.replaceForBook) e aggiorna mentions/chapters
  // dei personaggi (match per nome). Errori qui NON rompono l'analisi.
  private async persistNlp(
    bookId: number,
    result: NonNullable<Awaited<ReturnType<typeof indexBook>>>,
  ): Promise<void> {
    try {
      // Mappa l'indice di capitolo all'id DB salvato (per la FK chapter_id).
      const dbChapters = await books.chapters(bookId);
      const idByIndex = new Map<number, number>();
      for (const ch of dbChapters) idByIndex.set(ch.index, ch.id);

      const rows = result.quotes.map((q) => ({
        chapterId: idByIndex.get(q.chapterIndex) ?? null,
        text: q.text,
        kind: q.kind,
        speaker: q.speaker,
        score: q.score,
      }));
      await quotes.replaceForBook(bookId, rows);

      if (result.characters.length > 0) {
        await characters.updateMentions(
          bookId,
          result.characters.map((c) => ({
            name: c.name,
            mentions: c.mentions,
            chapters: c.chapters,
          })),
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[nlp] persistenza pre-pass saltata per libro ${bookId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // Estrae i personaggi dal JSON di analisi e li salva via characters.replaceAi.
  // traits->personality, physical_description->physical, occupation/name/role as-is.
  private async persistAiCharacters(bookId: number, analysisJson: string): Promise<void> {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseModelJson(analysisJson) as Record<string, unknown>;
    } catch {
      return;
    }
    const raw = parsed.characters;
    if (!Array.isArray(raw)) return;
    const str = (v: unknown): string | null => {
      if (v == null) return null;
      const s = typeof v === "string" ? v : String(v);
      return s.trim() === "" ? null : s;
    };
    const list = raw
      .map((c) => {
        if (c == null || typeof c !== "object") return null;
        const o = c as Record<string, unknown>;
        const name = str(o.name);
        if (!name) return null;
        return {
          name,
          role: str(o.role),
          occupation: str(o.occupation),
          personality: str(o.traits),
          physical: str(o.physical_description),
          notes: null as string | null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    await characters.replaceAi(bookId, list);
  }

  // Ri-analizza un libro gia' importato ricostruendo profilo+personaggi dai capitoli
  // gia' salvati (con testo). Pensata per girare in BACKGROUND (vedi /books/:id/reanalyze).
  async reanalyzeBook(bookId: number, language?: string): Promise<void> {
    const book = await books.get(bookId);
    if (!book) throw new ContentError(`Libro ${bookId} non trovato.`);
    const chapters = await books.chapters(bookId);
    const imp: ImportedBook = {
      title: book.title,
      author: book.author,
      language: book.language,
      contentHash: book.contentHash,
      charCount: book.charCount,
      chapters: chapters.map((ch) => ({
        index: ch.index,
        title: ch.title,
        text: ch.text,
        charCount: ch.charCount,
      })),
    };
    await this.analyzeProfile(book, imp, language);
    // "Rigenera tutto tranne link e immagini": azzera le schede visive dei capitoli così
    // verranno ricostruite da zero on-demand. NON tocca book_link né media_asset (preservati).
    await books.clearChapterScenes(bookId);
  }

  // Ri-esegue SOLO il pre-pass NLP (citazioni reali + metriche personaggi) e lo persiste, senza
  // rifare la scheda GPT. Serve a ripopolare/arricchire book_quote. Ritorna il numero di citazioni
  // scritte, o null se l'NLP non è disponibile (in quel caso le citazioni esistenti restano invariate).
  async reindexNlp(bookId: number): Promise<{ quotes: number } | null> {
    const book = await books.get(bookId);
    if (!book) throw new ContentError(`Libro ${bookId} non trovato.`);
    const chapters = await books.chapters(bookId);
    const imp: ImportedBook = {
      title: book.title,
      author: book.author,
      language: book.language,
      contentHash: book.contentHash,
      charCount: book.charCount,
      chapters: chapters.map((ch) => ({
        index: ch.index,
        title: ch.title,
        text: ch.text,
        charCount: ch.charCount,
      })),
    };
    const nlp = await this.runNlpPrePass(imp);
    if (!nlp) return null;
    await this.persistNlp(bookId, nlp);
    return { quotes: nlp.quotes.length };
  }

  // Comodo per usi sincroni (es. CLI/test): importa e analizza in un colpo.
  async importAndEnsureProfile(
    sourcePath: string,
    fileContent: string,
    fileName: string,
    author: string | null,
    language: string | null,
    progress: ProgressFn = () => {},
  ): Promise<Book> {
    progress("Lettura del file e suddivisione in capitoli...");
    const { book, needsAnalysis, imp } = await this.importBook(
      sourcePath,
      fileContent,
      fileName,
      author,
      language,
    );
    if (needsAnalysis) {
      progress("Analisi del libro con il modello...");
      await this.analyzeProfile(book, imp);
    } else {
      progress("Scheda gia' aggiornata: nessuna ri-analisi.");
    }
    progress("Completato.");
    return book;
  }

  // Estrae il testo REALE di un capitolo, scelto in modo VARIATO: preferisce un capitolo NON
  // usato di recente (avoid) cosi' post diversi attingono a capitoli diversi e idea-extractor
  // trova idee diverse. Usa TUTTI i capitoli (anche gli ultimi due): il no-spoiler sul finale
  // resta garantito dal prompt di postGenerator, non escludendo capitoli qui.
  // Ritorna testo (fino a ~4500 char puliti) + indice del capitolo scelto, o null.
  private async safeChapterExcerpt(
    bookId: number,
    avoid: ReadonlySet<number> = new Set(),
  ): Promise<{ text: string; chapterIndex: number } | null> {
    const chapters = await books.chapters(bookId);
    if (chapters.length === 0) return null;
    // Candidati: TUTTI i capitoli (il no-spoiler è demandato al prompt, vedi postGenerator).
    const pool = chapters;
    // Preferisci capitoli non ancora usati di recente; se sono tutti usati, riparti da tutti.
    const fresh = pool.filter((ch) => !avoid.has(ch.index));
    const candidates = fresh.length > 0 ? fresh : pool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]!;
    const clean = chosen.text.replace(/\s+/g, " ").trim();
    if (clean === "") return null;
    return {
      text: clean.length > 4500 ? clean.slice(0, 4500).trimEnd() : clean,
      chapterIndex: chosen.index,
    };
  }

  // Compone il "blocco link" da appendere al post in base alla regola d'uso di ciascun
  // link tipizzato del libro: always = sempre; sometimes = ~45% per varietà; sales =
  // solo se il post è orientato alla vendita; manual = mai automatico. Ritorna testo
  // (eventualmente vuoto) da accodare al messaggio.
  // Blocco link da accodare al testo: SOLO per i post (testo/foto), dove i link sono
  // cliccabili. Nei reel il link in descrizione non è cliccabile, nelle storie il testo
  // non viene pubblicato: per quei due non si aggiungono link. Regole: always = sempre;
  // sometimes = ~45% (varietà); manual = mai automatico.
  private async composeLinkBlock(bookId: number): Promise<string> {
    const all = await links.byBook(bookId);
    const fmt = (l: (typeof all)[number]) =>
      `${(l.label && l.label.trim()) || channelLabel(l.channel)}: ${l.url}`;
    const chosen: string[] = [];
    const sales: typeof all = [];
    for (const l of all) {
      // I rivenditori (vendita) sono molti: li raccogliamo a parte per sceglierne UNO SOLO.
      if (l.channel === "vendita") {
        sales.push(l);
        continue;
      }
      const policy = l.usagePolicy;
      const include = policy === "always" || (policy === "sometimes" && Math.random() < 0.45);
      if (include) chosen.push(fmt(l));
    }
    // Link di vendita: mai tutti insieme. Si mostra al massimo UN rivenditore a caso.
    // manual = mai; se almeno uno è always lo si mostra sempre, altrimenti ~45% (sometimes).
    const eligibleSales = sales.filter((l) => l.usagePolicy !== "manual");
    if (eligibleSales.length > 0) {
      const includeSales =
        eligibleSales.some((l) => l.usagePolicy === "always") || Math.random() < 0.45;
      if (includeSales) {
        const pick = eligibleSales[Math.floor(Math.random() * eligibleSales.length)];
        chosen.push(fmt(pick));
      }
    }
    return chosen.length === 0 ? "" : `\n\n${chosen.join("\n")}`;
  }

  // Personaggi del libro (briefs concisi) da iniettare nel prompt di generazione.
  private async characterBriefs(bookId: number): Promise<CharacterBrief[]> {
    const list = await characters.byBook(bookId);
    return list.map((c) => ({
      name: c.name,
      role: c.role,
      occupation: c.occupation,
      personality: c.personality,
      physical: c.physical,
    }));
  }

  // Generates a post using the compact scheda (not the whole book) and records it.
  async generatePost(
    bookId: number,
    pageId: string | null,
    pageName: string,
    angle: string,
    mediaType: MediaType,
    opts?: { avoidChapterIndexes?: number[] },
  ): Promise<GeneratedPost> {
    const profile = await books.currentProfile(bookId);
    if (!profile) {
      throw new ContentError(
        `Nessuna scheda per il libro ${bookId}. Esegui prima l'import/analisi.`,
      );
    }

    const recent = pageId == null ? [] : await posts.recentMessages(pageId, 8);
    const book = await books.get(bookId);
    const language = book?.language ?? "it";
    const avoid = new Set(opts?.avoidChapterIndexes ?? []);
    const excerpt = await this.safeChapterExcerpt(bookId, avoid);
    const characterBriefs = await this.characterBriefs(bookId);

    const generated = await generatePost(this.engine, {
      profile,
      pageName,
      angle,
      mediaType: mediaType ?? "TEXT",
      recentMessages: recent,
      chapterExcerpt: excerpt?.text ?? null,
      characters: characterBriefs,
      language,
      extraInstructions: combineExtras(
        aiSettings.getPromptExtras().text,
        book?.textExtraInstructions,
      ),
    });

    // Accoda i link SOLO per i post (testo/foto), dove sono cliccabili. Reel/storie: niente link.
    const isPost = mediaType === "TEXT" || mediaType === "PHOTO" || mediaType === "LINK";
    const linkBlock = isPost ? await this.composeLinkBlock(bookId) : "";
    const message = generated.message + linkBlock;

    // Final hashtags = base (always) + specific (generated), dedup.
    const base = await books.getBaseHashtags(bookId);
    const merged = mergeHashtags(base, generated.specificHashtags);
    const result: GeneratedPost = {
      message,
      hashtags: merged,
      baseHashtags: base,
      specificHashtags: generated.specificHashtags,
      mediaType: generated.mediaType,
      rationale: generated.rationale,
      sourceChapterIndex: excerpt?.chapterIndex ?? null,
    };

    await generations.insert({
      bookId,
      pageId,
      angle,
      promptVersion: "post-v1",
      inputHash: sha256(`${angle}|${profile.sourceContentHash}`),
      model: this.engine.name(),
      output: result.message,
      createdAt: Date.now(),
    });
    return result;
  }

  // Rigenera il contenuto di una bozza esistente riusando bookId/pageId/mediaType/angle
  // del post salvato. Ritorna message+hashtags aggiornati (stessa logica di generatePost:
  // mergeHashtags con i baseHashtags del libro). NON pubblica nulla.
  async regeneratePost(
    postId: number,
    angleOverride?: string,
  ): Promise<{ message: string; hashtags: string }> {
    const post = await posts.get(postId);
    if (!post) {
      throw new ContentError(`Bozza ${postId} non trovata.`);
    }
    if (post.bookId == null) {
      throw new ContentError(
        "La bozza non ha un libro associato: impossibile rigenerare il contenuto.",
      );
    }
    const profile = await books.currentProfile(post.bookId);
    if (!profile) {
      throw new ContentError(
        `Nessuna scheda per il libro ${post.bookId}. Esegui prima l'import/analisi.`,
      );
    }

    const angle =
      angleOverride && angleOverride.trim() !== ""
        ? angleOverride.trim()
        : "Riformula con un taglio fresco rispetto ai post recenti.";
    const page = await pages.find(post.pageId);
    const pageName = page?.name ?? "la pagina";

    const recent = await posts.recentMessages(post.pageId, 8);
    const book = await books.get(post.bookId);
    const language = book?.language ?? "it";
    const excerpt = await this.safeChapterExcerpt(post.bookId);
    const characterBriefs = await this.characterBriefs(post.bookId);

    const generated = await generatePost(this.engine, {
      profile,
      pageName,
      angle,
      mediaType: post.mediaType ?? "TEXT",
      recentMessages: recent,
      chapterExcerpt: excerpt?.text ?? null,
      characters: characterBriefs,
      language,
      extraInstructions: combineExtras(
        aiSettings.getPromptExtras().text,
        book?.textExtraInstructions,
      ),
    });

    const isPost =
      post.mediaType === "TEXT" || post.mediaType === "PHOTO" || post.mediaType === "LINK";
    const linkBlock = isPost ? await this.composeLinkBlock(post.bookId) : "";
    const message = generated.message + linkBlock;
    const base = await books.getBaseHashtags(post.bookId);
    const merged = mergeHashtags(base, generated.specificHashtags);

    await generations.insert({
      bookId: post.bookId,
      pageId: post.pageId,
      angle,
      promptVersion: "post-v1",
      inputHash: sha256(`${angle}|${profile.sourceContentHash}`),
      model: this.engine.name(),
      output: generated.message,
      createdAt: Date.now(),
    });

    return { message, hashtags: merged };
  }
}
