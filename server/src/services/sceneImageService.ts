import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mediaDir } from "../paths.js";
import { books, characters, media, settings } from "../db/repositories.js";
import type { ContentEngine } from "../content/engine.js";
import { buildSceneDescription, type SceneFlashback } from "../content/imagePrompt.js";
import {
  buildScenePrompt,
  generateSceneImage,
  imageGenAvailable,
  type SceneAspect,
} from "../media/imageGen.js";
import { verifySceneImage } from "../content/visionCheck.js";
import { appConfig } from "../config.js";
import type { ChapterSceneService } from "./chapterSceneService.js";
import type { BookCharacter, ChapterScene } from "../domain.js";

// Confronto lasco fra nomi (scheda vs cast): "Marco" combacia con "Marco Romidi".
function namesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === "" || y === "") return false;
  return x === y || x.includes(y) || y.includes(x);
}

// LIVELLO 1: sceglie i personaggi ELEGGIBILI per il capitolo, così il prompt non riceve l'intero
// cast ma solo chi è davvero presente. Priorità: (1) la scheda visiva del capitolo se elenca
// personaggi; (2) le metriche NLP (book_character.chapters); (3) fallback = tutti (NLP assente).
// Il PROTAGONISTA è sempre eleggibile: è narratore in prima persona e l'NLP lo conta poco.
function pickCastForChapter(
  chars: BookCharacter[],
  chapterIndex: number,
  card: ChapterScene | null,
  featureCharacters?: readonly string[] | null,
): BookCharacter[] {
  if (chars.length === 0) return [];
  const protagIdx = chars.findIndex((c) => /protagon|principale|\bmain\b/i.test(c.role ?? ""));
  const protagonist = chars[protagIdx >= 0 ? protagIdx : 0]!;
  const cardNames = (card?.characters ?? []).map((n) => n.trim()).filter((n) => n.length > 0);

  let picked: BookCharacter[];
  if (cardNames.length > 0) {
    picked = chars.filter((c) => cardNames.some((n) => namesMatch(c.name, n)));
  } else {
    const haveNlp = chars.some((c) => c.chapters.length > 0);
    picked = haveNlp ? chars.filter((c) => c.chapters.includes(chapterIndex)) : chars.slice();
  }
  if (!picked.some((c) => c.id === protagonist.id)) picked = [protagonist, ...picked];
  // "Genera per personaggio" (MULTI): GARANTISCE che OGNI personaggio richiesto sia tra gli eleggibili
  // anche se i filtri (scheda/NLP) lo escluderebbero, così il prompt li conosce e può featurarli.
  for (const name of featureCharacters ?? []) {
    if (!name || name.trim() === "") continue;
    const wanted = chars.find((c) => namesMatch(c.name, name));
    if (wanted && !picked.some((c) => c.id === wanted.id)) picked = [...picked, wanted];
  }
  return picked;
}

// Risolve una lista di nomi richiesti (dal cast) nei rispettivi BookCharacter, dedup per id e
// nell'ordine d'ingresso. Nomi che non combaciano con nessuno del cast vengono ignorati.
function resolveWanted(chars: BookCharacter[], names: readonly string[]): BookCharacter[] {
  const out: BookCharacter[] = [];
  for (const name of names) {
    if (!name || name.trim() === "") continue;
    const found = chars.find((c) => namesMatch(c.name, name));
    if (found && !out.some((c) => c.id === found.id)) out.push(found);
  }
  return out;
}

// Orchestratore: da un libro produce UNA immagine di scena (illustrazione graphic-novel) e la
// salva come media_asset (scope GENERAL = upload riusabile), così entra nel matching aspect e
// può fare da sfondo a card/reel/storia, oltre a servire da pool/fallback.

export interface SceneImageDeps {
  engine: ContentEngine;
  chapterScenes: ChapterSceneService;
}

export interface SceneImageResult {
  mediaId: number;
  path: string;
  aspect: SceneAspect;
  chapterIndex: number | null;
}

export class SceneImageService {
  constructor(private readonly deps: SceneImageDeps) {}

  // True se il motore locale (sd-cli + modello) è installato.
  available(): boolean {
    return imageGenAvailable();
  }

  // Estratto di un capitolo SICURO (evita ultimi 2 = anti-spoiler e quelli da evitare).
  private async safeExcerpt(
    bookId: number,
    avoid: ReadonlySet<number>,
    prefer: number | null = null,
    // "Genera per personaggio": se valorizzato, il pool dei capitoli si RESTRINGE a quelli in cui il
    // personaggio compare (BookCharacter.chapters), intersecati con i capitoli sicuri quando possibile.
    restrictChapters: ReadonlySet<number> | null = null,
  ): Promise<{ text: string; chapterIndex: number; title: string | null } | null> {
    const chapters = await books.chapters(bookId);
    if (chapters.length === 0) return null;
    // ESCLUSIONE capitoli (V23): i capitoli esclusi (frontespizio/toggle) NON entrano nel pool di
    // selezione random né nell'intersezione con restrictChapters. ECCEZIONE più sotto: un capitolo
    // `prefer` esplicito viene onorato comunque (cerca su `chapters` interi, non sul pool eleggibile).
    const eligibleChapters = chapters.filter((ch) => !ch.excluded);
    const base = eligibleChapters.length > 0 ? eligibleChapters : chapters;
    const safe = base.slice(0, Math.max(0, base.length - 2));
    let pool = safe.length > 0 ? safe : base;
    if (restrictChapters && restrictChapters.size > 0) {
      // Capitoli del personaggio ∩ sicuri; se vuoto (compare solo negli ultimi 2) ripiega ai suoi
      // capitoli a prescindere dalla regola anti-spoiler — meglio illustrarlo che cadere su altro.
      const inSafe = pool.filter((ch) => restrictChapters.has(ch.index));
      const inAll = base.filter((ch) => restrictChapters.has(ch.index));
      pool = inSafe.length > 0 ? inSafe : inAll.length > 0 ? inAll : pool;
    }
    // Capitolo PREFERITO (scelta esplicita: capitolo del post o capitolo scelto dall'utente in UI):
    // se indicato ed esiste, l'immagine illustra PROPRIO quel capitolo — onorato anche se è uno
    // degli ultimi (scelta deliberata; gli sfondi sono evocativi, non testo). Senza prefer: scelta
    // variata ANTI-SPOILER (capitolo fresco tra quelli sicuri).
    let chosen = prefer != null ? (chapters.find((ch) => ch.index === prefer) ?? null) : null;
    if (!chosen) {
      const fresh = pool.filter((ch) => !avoid.has(ch.index));
      const candidates = fresh.length > 0 ? fresh : pool;
      chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]!;
    }
    const clean = chosen.text.replace(/\s+/g, " ").trim();
    if (clean === "") return null;
    return {
      // Passa il capitolo INTERO: GPT deve poter scegliere QUALE scena del capitolo illustrare
      // (il cap a monte era 2000 → vedeva solo l'inizio). Il cap di sicurezza vero è in imagePrompt.
      text: clean,
      chapterIndex: chosen.index,
      title: chosen.title ?? null,
    };
  }

  // Costruisce la DESCRIZIONE-scena (soggetto+scena) + tag per un capitolo, rifacendo la pipeline
  // completa (excerpt → scheda visiva → cast eleggibile → buildSceneDescription) MA senza generare
  // né salvare nulla. Riusato sia da generateForBook sia da buildPromptForChapter (no duplicazione).
  private async buildSceneForChapter(
    bookId: number,
    opts?: {
      angle?: string | null;
      avoidChapterIndexes?: number[];
      chapterIndex?: number | null;
      // Nomi dei personaggi da FEATURARE (MULTI): ne restringe i capitoli all'UNIONE, li garantisce
      // eleggibili e forza un angle che li rende prominenti. Assente/[] = comportamento normale.
      featureCharacters?: readonly string[] | null;
      // Override FLASHBACK/ricordo (manuale): rende i personaggi più giovani e vestiti per l'epoca,
      // scavalcando età e outfit canonici SOLO per queste immagini.
      flashback?: SceneFlashback | null;
      signal?: AbortSignal;
    },
  ): Promise<{ description: string; tags: string[]; chapterIndex: number | null } | null> {
    const avoid = new Set(opts?.avoidChapterIndexes ?? []);
    const features = (opts?.featureCharacters ?? []).map((n) => n.trim()).filter((n) => n !== "");
    const allChars = await characters.byBook(bookId);
    // Se chiediamo dei personaggi: restringi il pool dei capitoli all'UNIONE di quelli dove compaiono
    // (BookCharacter.chapters). I nomi non risolti vengono ignorati.
    const wanted = features.length > 0 ? resolveWanted(allChars, features) : [];
    const union = new Set<number>();
    for (const w of wanted) for (const ch of w.chapters) union.add(ch);
    const restrict = union.size > 0 ? union : null;
    const [excerpt, book] = await Promise.all([
      this.safeExcerpt(bookId, avoid, opts?.chapterIndex ?? null, restrict),
      books.get(bookId),
    ]);
    // LIVELLO 2: scheda visiva del capitolo (cache o estrazione on-demand) come grounding del prompt.
    const card =
      excerpt != null
        ? await this.deps.chapterScenes.getOrBuild(bookId, excerpt.chapterIndex)
        : null;
    if (opts?.signal?.aborted) return null;
    // LIVELLO 1: passa solo i personaggi presenti nel capitolo (+ protagonista), non l'intero cast.
    // Con featureCharacters, quei personaggi sono GARANTITI tra gli eleggibili anche se i filtri li scartano.
    const eligible =
      excerpt != null
        ? pickCastForChapter(allChars, excerpt.chapterIndex, card, features)
        : allChars;
    // Composition directive: se sono richiesti dei personaggi, ANTEPONI una direttiva che li featura in
    // modo prominente (mai col nome, niente ritratto in posa né sguardo in camera), eventualmente
    // integrando l'angle già passato dal chiamante.
    const angle = this.composeAngle(opts?.angle ?? null, wanted);
    const scene = await buildSceneDescription(this.deps.engine, {
      chapterExcerpt: excerpt?.text ?? null,
      chapterTitle: excerpt?.title ?? null,
      characters: eligible.map((c) => ({
        name: c.name,
        physical: c.physical,
        role: c.role,
        outfits: c.outfits,
      })),
      bookTitle: book?.title ?? null,
      angle,
      sceneCard: card,
      visualDomains: book?.visualDomains ?? [],
      // Nel prompt va la traduzione EN (il modello rende meglio in inglese); fallback all'originale.
      visualDirectives: book?.visualDirectivesEn ?? book?.visualDirectives ?? null,
      visualProps: book?.visualProps,
      visualExtras: book?.visualExtras,
      flashback: opts?.flashback ?? null,
    });
    if (!scene) return null;
    return {
      description: scene.description,
      tags: scene.tags,
      chapterIndex: excerpt?.chapterIndex ?? null,
    };
  }

  // Costruisce la composition directive quando si genera "per personaggio" (MULTI): featura i
  // personaggi selezionati (per aspetto, mai col nome) in modo prominente, in interazione naturale con
  // la scena. CAP a 3 personaggi per immagine (oltre diventa una folla illeggibile): se ne sono passati
  // di più, ne featura i primi 3. Se è già passato un angle dal chiamante, lo integra anteponendo
  // l'indicazione dei personaggi. Lista vuota → ritorna l'angle invariato (comportamento normale).
  private composeAngle(angle: string | null, wanted: readonly BookCharacter[]): string | null {
    if (wanted.length === 0) return angle;
    const MAX = 3;
    const featured = wanted.slice(0, MAX);
    const describe = (c: BookCharacter): string => {
      const look = (c.physical ?? "").trim();
      const short = look.length > 280 ? `${look.slice(0, 280).trimEnd()}…` : look;
      return short.length > 0
        ? `one rendered by appearance as: ${short}`
        : "one specific character";
    };
    let directive: string;
    if (featured.length === 1) {
      const look = (featured[0]!.physical ?? "").trim();
      const desc =
        look.length > 0
          ? ` (render by appearance: ${look.length > 280 ? `${look.slice(0, 280).trimEnd()}…` : look})`
          : "";
      directive =
        `Composition: FEATURE this specific character prominently in the frame${desc}, INTERACTING with ` +
        `the scene (using, touching, reaching toward or moving with the iconic subject) in a candid, alive ` +
        `pose — NOT a posed portrait, gaze on the action/subject and NEVER toward the camera. Render the ` +
        `person ONLY by physical appearance, never by name. They are the clear focal subject of the image.`;
    } else {
      const list = featured.map(describe).join("; ");
      directive =
        `Composition: FEATURE these ${featured.length} specific characters TOGETHER in the frame ` +
        `(${list}), in a candid natural INTERACTION with each other or the scene (talking, walking, ` +
        `working or moving with the iconic subject) — NOT posed portraits, faces turned toward each ` +
        `other or the action and NEVER toward the camera. Include ONLY characters actually present in ` +
        `THIS passage; render each person ONLY by physical appearance, never by name. They are the clear ` +
        `focal subjects of the image.`;
    }
    return angle && angle.trim() !== "" ? `${directive} ${angle.trim()}` : directive;
  }

  // Costruisce SOLO il prompt finale (scena + STYLE_TAIL) per un capitolo, applicando la pipeline
  // ATTUALE (e quindi tutte le regole correnti: fisica/realismo, postura windsurf, ecc.) — senza
  // generare né inserire nulla. Serve alla rigenerazione "dal capitolo" (D-rebuild) per NON riusare
  // il vecchio gen_prompt salvato. Ritorna null se il capitolo/motore non producono una scena.
  async buildPromptForChapter(
    bookId: number,
    chapterIndex: number,
    opts?: {
      angle?: string | null;
      featureCharacters?: readonly string[] | null;
      flashback?: SceneFlashback | null;
    },
  ): Promise<string | null> {
    const scene = await this.buildSceneForChapter(bookId, {
      chapterIndex,
      ...(opts?.angle != null ? { angle: opts.angle } : {}),
      ...(opts?.featureCharacters != null ? { featureCharacters: opts.featureCharacters } : {}),
      ...(opts?.flashback != null ? { flashback: opts.flashback } : {}),
    });
    if (!scene) return null;
    return buildScenePrompt(scene.description);
  }

  // Genera e salva una immagine di scena. Ritorna null se il motore non è disponibile o fallisce.
  async generateForBook(
    bookId: number,
    aspect: SceneAspect,
    opts?: {
      angle?: string | null;
      avoidChapterIndexes?: number[];
      // Capitolo da illustrare (quello del post): se indicato, l'immagine viene generata su quel
      // capitolo invece che su uno casuale, così lo sfondo AI è pertinente al post.
      chapterIndex?: number | null;
      // "Genera per personaggio" (MULTI): nomi (dal cast) da featurare; restringe i capitoli all'UNIONE
      // di quelli dove compaiono, li garantisce eleggibili e forza un angle che li rende prominenti.
      featureCharacters?: readonly string[] | null;
      // Override FLASHBACK/ricordo (manuale): personaggi più giovani + vestiti d'epoca, solo qui.
      flashback?: SceneFlashback | null;
      signal?: AbortSignal;
    },
  ): Promise<SceneImageResult | null> {
    if (!imageGenAvailable() || opts?.signal?.aborted) return null;
    const scene = await this.buildSceneForChapter(bookId, opts);
    if (!scene) return null;

    if (opts?.signal?.aborted) return null;
    const outPath = join(mediaDir(), `scene-${bookId}-${randomUUID()}.png`);
    const ok = await generateSceneImage({
      subjectScene: scene.description,
      aspect,
      outPath,
      signal: opts?.signal,
    });
    if (!ok) return null;

    const asset = await media.insert({
      bookId,
      chapterId: null,
      scope: "GENERAL", // upload riusabile (NON 'GENERATED': dev'essere usabile come sfondo)
      path: outPath,
      caption: null, // caption PULITA: niente prompt nei campi user-facing
      // Il prompt completo va nel campo dedicato gen_prompt (ispezionabile, non pubblicabile).
      genPrompt: buildScenePrompt(scene.description),
      chapterIdx: scene.chapterIndex, // capitolo di riferimento (catalogazione)
      tags: scene.tags, // soggetti/mood (catalogazione + selezione per pertinenza)
      addedAt: Date.now(), // qa: default null; il verdetto QA è riempito sotto (best-effort)
    });
    // QUALITY CHECK visivo (V22): un modello multimodale GUARDA l'immagine e segnala i problemi.
    // Best-effort: la QA è opzionale e NON deve mai far fallire la generazione (batch = solo flag,
    // nessun auto-retry: quello è opt-in lato rigenerazione). Usa opencode direttamente via config.
    try {
      // Gate globale: il controllo qualità si può disattivare dal pulsante in Impostazioni.
      if ((await settings.get("qa_enabled")) !== "off") {
        const verdict = await verifySceneImage({
          imagePath: outPath,
          genPrompt: scene.description,
          binary: appConfig.opencodeBinary,
          model: appConfig.opencodeModel,
          timeoutMs: appConfig.visionTimeoutMs,
        });
        await media.setQa(asset.id, verdict);
      }
    } catch {
      /* QA best-effort: ignora qualunque errore */
    }
    return { mediaId: asset.id, path: outPath, aspect, chapterIndex: scene.chapterIndex };
  }
}
