import type { ContentService } from "./contentService.js";
import {
  books,
  contentUsage,
  links,
  media,
  music,
  posts,
  quotes,
  settings,
  slots,
  weeklyPlan,
} from "../db/repositories.js";
import {
  DEFAULT_WEEKLY_PLAN,
  type ContentFormat,
  type ContentUsage,
  type MediaType,
  type ScheduledPost,
} from "../domain.js";
import {
  allowedKindsForType,
  chooseFormat,
  formatToMediaType,
  formatToVisualKind,
  type Availability,
} from "../content/varietyEngine.js";
import { buildSchedule, defaultWindows, slotsToWindows } from "./weekScheduler.js";
import { Director, normalizeQuoteKey } from "../media/director.js";
import { SceneImageService } from "./sceneImageService.js";
import type { SceneAspect } from "../media/imageGen.js";

// Aspect dell'immagine di scena per un formato: reel/storia = 9:16 verticale, le card seguono
// il loro aspect (1:1/4:5/1.91:1), default 1:1.
function sceneAspectFor(cf: ContentFormat): SceneAspect {
  if (cf.visualKind === "reel" || cf.visualKind === "story") return "9:16";
  if (cf.aspect === "4:5" || cf.aspect === "1.91:1" || cf.aspect === "1:1") return cf.aspect;
  return "1:1";
}
import { enqueue as enqueueRender } from "../media/renderQueue.js";

// Genera una settimana di bozze a partire dalle QUOTE settimanali (quanti post/reel/storie):
// lo scheduler decide AUTOMATICAMENTE date+ore (dentro le finestre permesse) e il TIPO di
// ogni contenuto; per ciascuno il motore di varietà sceglie le sotto-dimensioni (card/
// storyboard/immagine/musica/aspect), si genera il testo, si crea una bozza DRAFT, si accoda
// l'eventuale render del visual (mai pubblicato) e si registra l'uso. Tutto resta BOZZA.

export interface PlanResult {
  created: number;
  skipped: number;
  drafts: ScheduledPost[];
  reason?: string;
  messages?: string[];
}

// Callback di avanzamento (per la generazione in background): planned all'avvio, una
// chiamata onCreated per ogni bozza creata, così l'indicatore mostra "N/M" in tempo reale.
export interface PlanHooks {
  onPlanned?: (planned: number) => void;
  onCreated?: () => void;
}

const DAY_NAMES = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const USAGE_HISTORY_LIMIT = 40;

export class WeekPlanner {
  constructor(
    private readonly content: ContentService,
    private readonly director?: Director,
    private readonly sceneImages?: SceneImageService,
  ) {}

  async planWeek(
    pageId: string,
    pageName: string,
    bookId: number,
    from: Date,
    hooks?: PlanHooks,
    period?: { horizonDays?: number },
    signal?: AbortSignal,
  ): Promise<PlanResult> {
    // La generazione richiede la scheda del libro (book_profile).
    const profile = await books.currentProfile(bookId);
    if (!profile) {
      return {
        created: 0,
        skipped: 0,
        drafts: [],
        reason:
          "Il libro non ha ancora una scheda analizzata: importa/analizza il libro prima di generare la settimana.",
      };
    }

    // Quote SETTIMANALI: l'unica cosa impostata dall'utente. Default prudenti se assenti.
    const plan = await weeklyPlan.get(pageId);
    const weekly = {
      posts: plan?.postsPerWeek ?? DEFAULT_WEEKLY_PLAN.postsPerWeek,
      reels: plan?.reelsPerWeek ?? DEFAULT_WEEKLY_PLAN.reelsPerWeek,
      stories: plan?.storiesPerWeek ?? DEFAULT_WEEKLY_PLAN.storiesPerWeek,
    };
    if (weekly.posts + weekly.reels + weekly.stories <= 0) {
      return {
        created: 0,
        skipped: 0,
        drafts: [],
        reason:
          "Imposta quante pubblicazioni vuoi a settimana (post/reel/storie) nel Pianificatore.",
      };
    }

    // Orizzonte: settimana (7), mese (~28) o range personalizzato. Le quote sono il TOTALE per il
    // periodo scelto (nessuna scalatura): imposti 2 post / 2 reel / 1 storia → generi esattamente
    // quello nel periodo, qualunque sia la sua durata. "vedi = ottieni".
    const horizonDays = Math.max(1, Math.floor(period?.horizonDays ?? 7));
    const quotas = {
      posts: Math.max(0, weekly.posts),
      reels: Math.max(0, weekly.reels),
      stories: Math.max(0, weekly.stories),
    };

    // Finestre orarie permesse: dagli slot della pagina, o default best-practice.
    const pageSlots = await slots.byPage(pageId);
    let windows = slotsToWindows(pageSlots);
    if (windows.length === 0) windows = defaultWindows();

    // Lo SCHEDULER decide date+ore+tipo di ogni contenuto della settimana.
    const schedule = buildSchedule({ from, quotas, windows, horizonDays });
    hooks?.onPlanned?.(schedule.length);
    if (schedule.length === 0) {
      return {
        created: 0,
        skipped: 0,
        drafts: [],
        reason:
          "Nessuna finestra oraria utilizzabile nei prossimi 7 giorni. Controlla le finestre nel Pianificatore.",
      };
    }

    const angles = await this.contentAngles(bookId);
    const defaultLinkUrl = await this.defaultLink(bookId);
    const baseAvailability = await this.availability(bookId);
    const musicTracks = await music.byBook(bookId);
    // Modalità immagini: "direct" = genera lo sfondo AI al momento; altrimenti solo libreria.
    // Attiva solo se il motore locale è installato (altrimenti si ricade sulla libreria).
    const aiDirect =
      (await settings.get("ai_image_mode")) === "direct" &&
      (this.sceneImages?.available() ?? false);

    // Storico d'uso per la varietà; lo arricchiamo man mano con le scelte di QUESTA
    // settimana così i contenuti successivi non si ripetono (formati/immagini/capitoli/musica).
    const recent = await contentUsage.recentByPage(pageId, USAGE_HISTORY_LIMIT);
    // ROTAZIONE LRU (least-recently-used) su TUTTO lo storico pagina+libro: per citazioni,
    // immagini, capitoli e musica si sceglie SEMPRE il MENO usato (random tra i pari-merito) e si
    // incrementa il conteggio man mano. Così rigenerazioni e programmi consecutivi (es. una
    // settimana dopo l'altra) ciclano l'intero materiale prima di ripeterlo, invece di ricadere
    // ogni volta sulla stessa frase/immagine "preferita". (`recent` resta per la varietà di FORMATO.)
    const usageCounts = await contentUsage.usageCounts(pageId, bookId);
    const bump = <K>(m: Map<K, number>, k: K): void => {
      m.set(k, (m.get(k) ?? 0) + 1);
    };
    // Capitoli già usati DAL TESTO in QUESTO programma: hard-avoid per la scelta del capitolo del
    // testo (così il testo non ripete capitolo nello stesso run). La rotazione cross-run dei
    // capitoli del VISUAL passa invece da usage.chapters (LRU).
    const usedChaptersRun = new Set<number>();

    let created = 0;
    let skipped = 0;
    const drafts: ScheduledPost[] = [];
    const genErrors: string[] = [];
    let angleIdx = 0;

    for (const item of schedule) {
      if (signal?.aborted) break; // ANNULLATO: interrompi la generazione del programma
      const when = item.when;
      const idem = `week|${pageId}|${Math.floor(when.getTime() / 1000)}`;
      if (await posts.existsByIdempotencyKey(idem)) {
        skipped++;
        continue;
      }
      const angle =
        angles.length === 0
          ? "presenta il libro in modo coinvolgente, senza spoiler"
          : angles[angleIdx % angles.length];
      angleIdx++;

      try {
        // 1) Formato variato, VINCOLATO al tipo deciso dallo scheduler (post/reel/storia).
        const availability: Availability = { ...baseAvailability, musicCount: musicTracks.length };
        const cf = chooseFormat({
          availability,
          recent,
          allowedVisualKinds: allowedKindsForType(item.type),
        });
        const mediaType = formatToMediaType(cf);

        // 2) Testo coerente col textMode; evita i capitoli già usati (anche di questa settimana).
        const { message, hashtags, chapterIndex, chosenAngleKey } = await this.generateText(
          cf,
          bookId,
          pageId,
          pageName,
          angle,
          mediaType,
          [...usedChaptersRun],
        );

        // Capitolo per il VISUAL: se il testo non ha capitolo (textMode 'none'), scegli il capitolo
        // MENO usato sull'intero storico (LRU, random tra i pari-uso), così la citazione del visual
        // è PER-CAPITOLO e ruota tra i programmi (non ricade sempre sul libro intero/sugli stessi).
        const visualChapterIndex =
          chapterIndex ?? (await this.pickLeastUsedChapter(bookId, usageCounts.chapters));

        // 3) Musica variata (LRU) se è un formato video (reel/storia video).
        const musicId = this.pickMusic(cf, musicTracks, usageCounts.music);

        // 4) Bozza DRAFT con orario deciso dallo scheduler + formato + musica.
        const now = Date.now();
        // Link di default su TUTTI i tipi che ne beneficiano (PHOTO/REEL/STORY/TEXT/LINK), per
        // trovabilità: per TEXT/LINK resta gestito come campo separato in publishFeedPost, mentre
        // per i canali visual (PHOTO/REEL/STORY) il publisher lo inserisce NEL testo della caption.
        const link = defaultLinkUrl;
        const draft = await posts.insert({
          pageId,
          bookId,
          generationId: null,
          message,
          hashtags,
          mediaType,
          link,
          mediaPath: null,
          scheduledAt: when.getTime(),
          status: "DRAFT",
          fbPostId: null,
          attempts: 0,
          lastError: null,
          idempotencyKey: idem,
          musicId,
          contentFormat: JSON.stringify(cf),
          platform: "facebook",
          linkedPostId: null,
          igMediaId: null,
          dashboardHidden: false,
          createdAt: now,
          updatedAt: now,
        });

        // 5) Eventuale render del visual (resta sulla bozza, MAI pubblicato). Passa le
        //    citazioni già usate così il regista ne sceglie una diversa.
        const { imageIds: imageIdsUsed, chosenQuote } = await this.maybeRender(
          draft,
          cf,
          musicId,
          usageCounts.quotes,
          aiDirect,
          [...usedChaptersRun],
          visualChapterIndex,
          usageCounts.images,
          signal,
        );
        const quoteKey = chosenQuote ? normalizeQuoteKey(chosenQuote) : null;

        // 6) Registra l'uso (memoria del motore di varietà + statistiche) e arricchisce
        //    lo storico in-memory così i contenuti successivi della settimana variano.
        const usage: Omit<ContentUsage, "id"> = {
          pageId,
          bookId,
          postId: draft.id,
          textMode: cf.textMode,
          visualKind: cf.visualKind,
          visualContent: cf.visualContent,
          aspect: cf.aspect,
          imageIds: imageIdsUsed,
          quoteKey,
          musicId,
          // Registra il capitolo del VISUAL (per textMode 'none' coincide col capitolo fresco
          // scelto sopra): così la rotazione per-capitolo persiste anche tra run successive.
          chapterIndex: visualChapterIndex,
          // Angolo marketing-card usato dal TESTO (null per textMode 'none'): abilita la rotazione LRU
          // degli angoli per capitolo. Scoped allo stesso chapter_index del testo (quando c'è testo).
          angleKey: chosenAngleKey,
          createdAt: now,
        };
        await contentUsage.insert(usage).catch((e: unknown) => {
          // eslint-disable-next-line no-console
          console.warn(`[planner] log uso fallito: ${e instanceof Error ? e.message : String(e)}`);
        });
        recent.unshift({ id: draft.id, ...usage });
        // Incrementa i conteggi LRU così i contenuti successivi (di questo programma E dei
        // prossimi) preferiscono ciò che è stato usato meno.
        if (visualChapterIndex != null) {
          usedChaptersRun.add(visualChapterIndex);
          bump(usageCounts.chapters, visualChapterIndex);
        }
        if (quoteKey) bump(usageCounts.quotes, quoteKey);
        for (const id of imageIdsUsed) bump(usageCounts.images, id);
        if (musicId != null) bump(usageCounts.music, musicId);

        drafts.push(draft);
        created++;
        hooks?.onCreated?.();
      } catch (e) {
        const label = `${DAY_NAMES[(item.when.getDay() === 0 ? 7 : item.when.getDay()) - 1]} ${pad2(
          item.when.getHours(),
        )}:${pad2(item.when.getMinutes())} (${item.type})`;
        const msg = (e as Error).message;
        genErrors.push(`${label}: ${msg}`);
        // eslint-disable-next-line no-console
        console.warn(`[planner] generazione fallita per ${label}: ${msg}`);
      }
    }

    let reason: string | undefined;
    if (created === 0) {
      if (genErrors.length > 0) {
        reason = `Generazione fallita per tutti i contenuti (${genErrors.length}). Controlla provider/modello e la scheda del libro.`;
      } else if (skipped > 0) {
        reason =
          "Tutti i contenuti pianificati risultano gia' presenti (nessuna nuova bozza da creare).";
      }
    }

    return {
      created,
      skipped,
      drafts,
      ...(reason !== undefined ? { reason } : {}),
      ...(genErrors.length > 0 ? { messages: genErrors } : {}),
    };
  }

  // Disponibilità reale del libro: #immagini reali, #citazioni reali, reel renderizzabile.
  private async availability(bookId: number): Promise<Omit<Availability, "musicCount">> {
    const [assets, bookQuotes, profile] = await Promise.all([
      media.uploadsByBook(bookId),
      quotes.byBook(bookId),
      books.currentProfile(bookId),
    ]);
    // uploadsByBook esclude già i visual generati; il conteggio è delle sole immagini reali.
    const imageCount = assets.length;
    let quoteCount = bookQuotes.length;
    if (quoteCount === 0) quoteCount = this.keyQuotesCount(profile);
    return { imageCount, quoteCount, reelAvailable: await reelRendererAvailable() };
  }

  private keyQuotesCount(profile: { analysisJson?: string | null } | null): number {
    if (!profile?.analysisJson) return 0;
    try {
      const j = JSON.parse(profile.analysisJson) as Record<string, unknown>;
      return Array.isArray(j.key_quotes) ? j.key_quotes.length : 0;
    } catch {
      return 0;
    }
  }

  // Genera message+hashtags coerenti col textMode del formato (full/short/none).
  private async generateText(
    cf: ContentFormat,
    bookId: number,
    pageId: string,
    pageName: string,
    angle: string,
    mediaType: MediaType,
    avoidChapterIndexes: number[],
  ): Promise<{
    message: string;
    hashtags: string | null;
    chapterIndex: number | null;
    chosenAngleKey: string | null;
  }> {
    if (cf.textMode === "none") {
      // Niente testo, ma SEMPRE hashtag nella caption (trovabilità): base del libro o derivati.
      return {
        message: "",
        hashtags: await this.bookHashtags(bookId),
        chapterIndex: null,
        chosenAngleKey: null,
      };
    }
    const effAngle =
      cf.textMode === "short"
        ? `${angle}. Scrivi MOLTO breve e incisivo: una o due frasi al massimo.`
        : angle;
    const g = await this.content.generatePost(bookId, pageId, pageName, effAngle, mediaType, {
      avoidChapterIndexes,
    });
    return {
      message: g.message,
      hashtags: g.hashtags,
      chapterIndex: g.sourceChapterIndex ?? null,
      chosenAngleKey: g.chosenAngleKey ?? null,
    };
  }

  // Sceglie una traccia musicale per i formati video (reel/storia video) con rotazione LRU:
  // la traccia MENO usata sull'intero storico (random tra le pari-uso), così ogni reel/storia ha
  // una musica diversa finché la libreria non è esaurita, poi riparte dalla meno usata.
  private pickMusic(
    cf: ContentFormat,
    tracks: { id: number }[],
    musicUsage: Map<number, number>,
  ): number | null {
    // Reel e storie sono entrambi video (reel_text): montano la musica. Card/storyboard/none no.
    const wantsVideo = cf.visualKind === "reel" || cf.visualKind === "story";
    if (!wantsVideo || tracks.length === 0) return null;
    const min = Math.min(...tracks.map((t) => musicUsage.get(t.id) ?? 0));
    const least = tracks.filter((t) => (musicUsage.get(t.id) ?? 0) === min);
    const chosen = least[Math.floor(Math.random() * least.length)];
    return chosen ? chosen.id : null;
  }

  // Se il formato richiede un visual e il Director è disponibile, genera lo spec e accoda
  // un render job legato alla bozza (mai pubblicato). Ritorna gli imageId reali offerti.
  private async maybeRender(
    post: ScheduledPost,
    cf: ContentFormat,
    musicId: number | null,
    quoteUsage: Map<string, number>,
    aiDirect: boolean,
    avoidChapterIndexes: number[],
    chapterIndex: number | null,
    imageUsage: Map<number, number>,
    signal?: AbortSignal,
  ): Promise<{ imageIds: number[]; chosenQuote: string | null }> {
    const visualKind = formatToVisualKind(cf);
    if (!visualKind || !this.director) return { imageIds: [], chosenQuote: null };
    try {
      const wantsImage = cf.visualContent === "images" || cf.visualContent === "mixed";
      // GENERAZIONE DIRETTA: se attiva e il formato usa immagini, crea ORA l'immagine di scena
      // AI (illustrazione) e la forza come sfondo. Se fallisce → fallback alle immagini caricate.
      let forceImageId: number | null = null;
      if (aiDirect && wantsImage && this.sceneImages?.available() && post.bookId != null) {
        const scene = await this.sceneImages.generateForBook(post.bookId, sceneAspectFor(cf), {
          // Genera l'immagine di scena SUL capitolo del post (pertinente per costruzione),
          // così lo sfondo AI illustra davvero ciò di cui parla il post.
          chapterIndex,
          avoidChapterIndexes,
          signal,
        });
        if (scene) forceImageId = scene.mediaId;
      }
      const useImages = wantsImage || forceImageId != null;
      const result = await this.director.generaVisualSpec(post, {
        kind: visualKind,
        useImages,
        ...(cf.aspect ? { aspect: cf.aspect } : {}),
        musicTrackId: musicId,
        // Durata video calibrata sul tipo: storia (corta) vs reel (~15s), col tempo di lettura.
        target: cf.visualKind === "story" ? "story" : "reel",
        // Rotazione LRU citazioni: il regista sceglie la frase MENO usata sull'intero storico.
        quoteUsage,
        // Capitolo del post → selezione per pertinenza dell'immagine di sfondo dalla libreria.
        chapterIndex,
        // Rotazione LRU sfondi: a parità di pertinenza, preferisce le immagini MENO usate.
        imageUsage,
        ...(forceImageId != null ? { forceImageId } : {}),
      });
      await enqueueRender(result.spec, { postId: post.id, bookId: post.bookId });
      // Ritorna gli sfondi EFFETTIVAMENTE usati (non il pool offerto): così avoidImages ruota davvero.
      return { imageIds: result.chosenImageIds, chosenQuote: result.chosenQuote };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[planner] render visual saltato per post ${post.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return { imageIds: [], chosenQuote: null };
    }
  }

  private async contentAngles(bookId: number): Promise<string[]> {
    const p = await books.currentProfile(bookId);
    if (!p) return [];
    try {
      const root = JSON.parse(p.analysisJson) as Record<string, unknown>;
      const arr = root["content_angles"];
      if (Array.isArray(arr)) return arr.map((x) => String(x));
      return [];
    } catch {
      return [];
    }
  }

  // Sceglie il capitolo MENO usato (indice) per i visual senza testo (textMode 'none',
  // chapterIndex null): rotazione LRU sull'intero storico, random tra i capitoli con lo stesso
  // conteggio minimo. null solo se il libro non ha capitoli catalogati (→ ripiego storico sul libro).
  private async pickLeastUsedChapter(
    bookId: number,
    chapterUsage: Map<number, number>,
  ): Promise<number | null> {
    const chapters = await books.chapters(bookId);
    if (chapters.length === 0) return null;
    const indexes = chapters.map((c) => c.index);
    const min = Math.min(...indexes.map((i) => chapterUsage.get(i) ?? 0));
    const least = indexes.filter((i) => (chapterUsage.get(i) ?? 0) === min);
    return least[Math.floor(Math.random() * least.length)] ?? null;
  }

  private async defaultLink(bookId: number): Promise<string | null> {
    const all = await links.byBook(bookId);
    if (all.length === 0) return null;
    // Priorità: link marcato DEFAULT → link con policy 'always' (la pagina canonica del libro) →
    // primo link disponibile. Così c'è SEMPRE un link nella caption se ne esiste almeno uno
    // (prima, senza alcun link 'default', non veniva mai messo nessun link).
    const chosen =
      all.find((l) => l.isDefault) ?? all.find((l) => l.usagePolicy === "always") ?? all[0];
    return chosen ? chosen.url : null;
  }

  // Hashtag base del libro; se non configurati (book.base_hashtags vuoto) li DERIVA da titolo +
  // generi, così i post SOLO-IMMAGINE hanno SEMPRE almeno qualche hashtag per la trovabilità.
  private async bookHashtags(bookId: number): Promise<string | null> {
    const configured = (await books.getBaseHashtags(bookId)).trim();
    if (configured !== "") return configured;
    const [book, profile] = await Promise.all([books.get(bookId), books.currentProfile(bookId)]);
    const tags: string[] = [];
    const titleTag = (book?.title ?? "").replace(/[^\p{L}\p{N}]+/gu, "");
    if (titleTag) tags.push(`#${titleTag}`);
    for (const g of (profile?.genres ?? "")
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 3)) {
      const t = g.replace(/[^\p{L}\p{N}]+/gu, "");
      if (t) tags.push(`#${t}`);
    }
    return tags.length > 0 ? tags.join(" ") : null;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Probe best-effort: il renderer reel è utilizzabile se ffmpeg-static è risolvibile.
let _reelAvailable: boolean | null = null;
async function reelRendererAvailable(): Promise<boolean> {
  if (_reelAvailable != null) return _reelAvailable;
  try {
    const { existsSync } = await import("node:fs");
    const mod = (await import("ffmpeg-static")) as { default?: unknown };
    const p = (mod.default ?? mod) as unknown;
    _reelAvailable = typeof p === "string" && p !== "" && existsSync(p);
  } catch {
    _reelAvailable = false;
  }
  return _reelAvailable;
}
