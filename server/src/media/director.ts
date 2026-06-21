import type { ContentEngine } from "../content/engine.js";
import { ContentError } from "../content/engine.js";
import { parseModelJson } from "../content/modelJson.js";
import { imageAspectRatio } from "./imageDimensions.js";
import { books, characters, media, quotes } from "../db/repositories.js";
import type { MediaAsset, ScheduledPost } from "../domain.js";
import {
  type Aspect,
  type VisualKind,
  type VisualSpec,
  ASPECTS,
  TEMPLATES,
  validateSpec,
} from "./spec.js";

// IA-REGISTA: NON disegna pixel. Costruisce un prompt per il content engine passando
// testo del post + scheda + personaggi + CITAZIONI REALI (book_quote) + brand, e
// chiede SOLO uno spec JSON valido scegliendo tra TEMPLATE FISSI. La risposta viene
// validata con default su ogni campo errato (vedi spec.ts). Usa SEMPRE citazioni
// reali dal DB, mai testo inventato.

export interface DirectorDeps {
  engine: ContentEngine;
}

export interface DirectorOpts {
  kind: VisualKind;
  template?: string;
  aspect?: Aspect;
  // Se true (default), il regista puo' usare le immagini GIA' CARICATE del libro
  // (media_asset). Se false o il libro non ne ha, comportamento solo-testo attuale.
  useImages?: boolean;
  // Traccia musicale opzionale (music_track.id) da montare sul reel: se passata,
  // sopravvive nello spec (music.trackId). Non obbligatorio: il regista non ne sceglie una.
  musicTrackId?: number | null;
  // Destinazione del video (reel vs storia): determina quante scene e quanto durano.
  // Le durate seguono il TEMPO DI LETTURA di ogni frase (non un valore fisso): le storie
  // restano corte (poche frasi), i reel un po' più lunghi. Default: "reel".
  target?: "reel" | "story";
  // Chiavi normalizzate delle citazioni già usate DI RECENTE (vedi normalizeQuoteKey):
  // il regista le mette in fondo alla lista e preferisce quelle "fresche", così post/reel/
  // storia non mostrano sempre la stessa frase del libro. Best-effort.
  avoidQuotes?: string[];
  // Se valorizzato, FORZA questo media_asset come sfondo del visual (usato dalla "Generazione
  // diretta": l'immagine di scena AI appena creata diventa lo sfondo, non una a caso della libreria).
  forceImageId?: number | null;
  // Indice del capitolo da cui è stato tratto il post: usato per SELEZIONARE PER PERTINENZA
  // l'immagine di sfondo (capitolo esatto → vicinanza di capitolo → overlap tag → ripiego aspect).
  // Best-effort: se null si ricade sul comportamento storico (solo filtro aspect, ordine d'inserimento).
  chapterIndex?: number | null;
  // Id delle immagini usate DI RECENTE come sfondo: vengono deprioritizzate (spostate in fondo),
  // preferendo le fresche, così post/reel successivi non riusano sempre gli stessi sfondi.
  // Best-effort: assente/[] → comportamento INVARIATO (nessuna deprioritizzazione).
  avoidImages?: number[];
}

// Immagine disponibile del libro (sottoinsieme di MediaAsset utile al regista).
interface AvailableImage {
  id: number;
  caption: string | null;
  scope: string;
  // Capitolo illustrato (catalogazione V14) + tag soggetto/luogo/mood (in INGLESE: vengono
  // prodotti per il modello immagini). Usati per la selezione per pertinenza.
  chapterIdx: number | null;
  tags: string[];
}

export interface DirectorResult {
  spec: VisualSpec;
  // Citazioni reali disponibili (per debug/UI): il renderer usa quelle nello spec.
  realQuotes: string[];
  // Id delle immagini reali del libro messe a disposizione del regista (per UI/debug).
  availableImageIds: number[];
  // Id delle immagini EFFETTIVAMENTE usate come sfondo nello spec finale (card/scene/pannelli):
  // serve al planner per la rotazione (avoidImages) reale, non il solo pool offerto. [] se nessuna.
  chosenImageIds: number[];
  // Citazione EFFETTIVAMENTE finita sul visual (per tracciare la varietà ed evitare di
  // ripeterla nei contenuti successivi). null se il visual non ha testo da citazione.
  chosenQuote: string | null;
}

// Chiave normalizzata di una citazione: usata sia per evitare le ripetizioni sia come
// quoteKey nello storico d'uso. Deve restare coerente tra director e weekPlanner.
export function normalizeQuoteKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 180);
}

// Estrae la citazione principale finita nello spec (per kind), per tracciarne l'uso.
function primaryQuoteOf(spec: VisualSpec): string | null {
  if (spec.kind === "quote_card") return spec.quote.trim() || null;
  if (spec.kind === "reel_text") {
    const s = spec.scenes.find((x) => (x.quote ?? x.text ?? "").trim() !== "");
    return (s?.quote ?? s?.text ?? "").trim() || null;
  }
  if (spec.kind === "storyboard") {
    const p = spec.panels.find((x) => x.dialogue.trim() !== "");
    return p?.dialogue.trim() || null;
  }
  return null;
}

// Estrae gli imageId EFFETTIVAMENTE usati come sfondo nello spec finale (card/scene/pannelli),
// deduplicati nell'ordine d'apparizione. Serve a tracciare gli sfondi REALI per la rotazione
// (avoidImages) invece del solo pool offerto. [] se il visual è solo-testo.
function imageIdsOf(spec: VisualSpec): number[] {
  const ids: number[] = [];
  const push = (id: number | null | undefined): void => {
    if (id != null && Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  };
  if (spec.kind === "quote_card") push(spec.imageId);
  else if (spec.kind === "reel_text") for (const s of spec.scenes) push(s.imageId);
  else if (spec.kind === "storyboard") for (const p of spec.panels) push(p.imageId);
  return ids;
}

const MAX_QUOTES = 12;
const MAX_IMAGES = 12;

type AspectCategory = "vertical" | "square" | "landscape";

// Categoria d'aspetto di un'immagine dal suo ratio (larghezza/altezza). null se sconosciuto.
function aspectCategory(ratio: number | null): AspectCategory | null {
  if (ratio == null) return null;
  if (ratio < 0.8) return "vertical"; // più alta che larga (9:16, 3:4 spinto)
  if (ratio > 1.25) return "landscape"; // più larga che alta (1.91:1, 16:9)
  return "square"; // ~1:1 / 4:5
}

// Categoria di immagine ADATTA al visual richiesto, così l'immagine non viene ritagliata:
// i 9:16 (reel/storia) vogliono immagini VERTICALI, le card 1.91:1 ORIZZONTALI, tutto il
// resto (1:1, 4:5, default) QUADRATE. Se nessuna immagine combacia → composizione solo-testo.
function targetAspectCategory(opts: DirectorOpts): AspectCategory {
  if (opts.aspect === "9:16") return "vertical";
  if (opts.aspect === "1.91:1") return "landscape";
  if (opts.aspect === "1:1" || opts.aspect === "4:5") return "square";
  return opts.kind === "reel_text" ? "vertical" : "square";
}

// Normalizza un tag per il confronto. I tag sono GIA' in inglese (vengono prodotti per il
// modello immagini locale, vedi imagePrompt.ts), quindi il confronto resta inglese-vs-inglese.
function normTag(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

// SELEZIONE PER PERTINENZA: ordina le immagini (gia' filtrate per aspect) in base al capitolo da
// cui nasce il post. Priorita': capitolo ESATTO → VICINANZA di capitolo (capitoli adiacenti
// condividono ambientazione/soggetti) → overlap dei TAG col "profilo soggetti" del capitolo come
// SPAREGGIO (es. cap.7 = {sea turtle, reef}: un'immagine di un altro capitolo taggata "sea turtle"
// sale). Se il capitolo del post e' ignoto (chapterIndex null) si mantiene l'ordine d'inserimento
// (comportamento storico). Ordinamento STABILE: a parita' di punteggio resta l'ordine originale.
function rankImagesByRelevance(images: MediaAsset[], chapterIndex: number | null): MediaAsset[] {
  if (chapterIndex == null) return images;
  // Profilo soggetti del capitolo del post: i tag delle immagini che illustrano QUEL capitolo.
  const profile = new Set<string>();
  for (const m of images) {
    if (m.chapterIdx === chapterIndex) for (const t of m.tags) profile.add(normTag(t));
  }
  const scored = images.map((m, i) => {
    // Punteggio capitolo: esatto = 1000, poi cala di 50 per ogni capitolo di distanza (min 0).
    // Capitolo ignoto sull'immagine (chapterIdx null) = 0 → finisce nel ripiego aspect.
    let score = 0;
    if (m.chapterIdx != null) {
      const distance = Math.abs(m.chapterIdx - chapterIndex);
      score = Math.max(0, 1000 - distance * 50);
    }
    // Spareggio: numero di tag dell'immagine presenti nel profilo del capitolo. Resta SEMPRE
    // sotto lo step di distanza (50), quindi non scavalca mai un capitolo piu' vicino.
    if (profile.size > 0) for (const t of m.tags) if (profile.has(normTag(t))) score++;
    return { m, score, i };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.m);
}

// ROTAZIONE SFONDI: a parità d'ordine (già pertinenza), sposta IN FONDO le immagini usate di
// recente (avoidImages), preferendo le "fresche". Ordinamento STABILE: tra fresche e tra usate
// l'ordine relativo (pertinenza) resta invariato. avoidImages vuoto → lista INVARIATA.
function deprioritizeImages(images: MediaAsset[], avoidImages: number[]): MediaAsset[] {
  if (avoidImages.length === 0) return images;
  const avoid = new Set(avoidImages);
  const fresh = images.filter((m) => !avoid.has(m.id));
  const used = images.filter((m) => avoid.has(m.id));
  return [...fresh, ...used];
}

function brandFor(bookTitle: string | null, accent: string | null) {
  return { title: bookTitle, accent: accent ?? "#c8553d" };
}

// I visual che generiamo noi vengono registrati in media_asset con caption "visual <kind>"
// (vedi renderQueue.ts). Vanno esclusi dalle immagini "vere" del libro offerte al regista,
// per non riciclare card/reel generati come sfondi.
function isGeneratedVisual(caption: string | null): boolean {
  return typeof caption === "string" && caption.startsWith("visual ");
}

// Fallback citazioni: estrae le key_quotes (non-spoiler) gia' presenti nella scheda
// (analysisJson), usate quando il pre-pass NLP non ha popolato book_quote.
function keyQuotesFromProfile(profile: { analysisJson?: string | null } | null): string[] {
  if (!profile?.analysisJson) return [];
  try {
    const j = JSON.parse(profile.analysisJson) as Record<string, unknown>;
    const kq = Array.isArray(j.key_quotes) ? j.key_quotes : [];
    const out: string[] = [];
    for (const item of kq) {
      if (typeof item === "string") {
        if (item.trim()) out.push(item.trim());
      } else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        if (o.is_spoiler === true) continue;
        const q = typeof o.quote === "string" ? o.quote : "";
        if (q.trim()) out.push(q.trim());
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Tempo di lettura stimato (secondi) per una frase da mostrare a schermo: ~0.5s a parola
// (lettura "a colpo d'occhio" + un momento per registrarla) + 1.5s di respiro. Clamp 3.5-8s
// così anche una frase brevissima resta leggibile e una lunga non blocca troppo il video.
function readingSeconds(text: string): number {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  const sec = 1.5 + words * 0.5;
  return Math.min(8, Math.max(3.5, Math.round(sec * 10) / 10));
}

export class Director {
  constructor(private readonly deps: DirectorDeps) {}

  async generaVisualSpec(post: ScheduledPost, opts: DirectorOpts): Promise<DirectorResult> {
    const bookId = post.bookId;
    // Raccogli i materiali REALI dal DB (best-effort: liste vuote se mancano).
    const realQuotes: string[] = [];
    let charNames: string[] = [];
    let bookTitle: string | null = null;
    let images: AvailableImage[] = [];

    const useImages = opts.useImages !== false; // default true

    if (bookId != null) {
      const [book, bookQuotes, chars, profile, mediaAssets] = await Promise.all([
        books.get(bookId),
        quotes.byBook(bookId),
        characters.byBook(bookId),
        books.currentProfile(bookId),
        useImages ? media.uploadsByBook(bookId) : Promise.resolve([]),
      ]);
      bookTitle = book?.title ?? null;
      // POOL CITAZIONI: se il post nasce da un capitolo noto, attingi alle citazioni di QUEL
      // capitolo (cosi' post di capitoli diversi mostrano frasi diverse); se il capitolo non ne
      // ha, ripiega su TUTTO il libro (comportamento storico). Best-effort.
      let pool = bookQuotes;
      if (opts.chapterIndex != null) {
        const chapterQuotes = await quotes.byChapter(bookId, opts.chapterIndex);
        if (chapterQuotes.length > 0) pool = chapterQuotes;
      }
      for (const q of pool.slice(0, MAX_QUOTES)) realQuotes.push(q.text);
      // Se il pre-pass NLP non ha popolato book_quote, usa le key_quotes della scheda.
      if (realQuotes.length === 0) {
        for (const q of keyQuotesFromProfile(profile).slice(0, MAX_QUOTES)) realQuotes.push(q);
      }
      charNames = chars.map((c) => c.name);
      // Usa SOLO immagini reali del libro (upload, non i 'visual' generati) il cui ASPECT
      // combacia con quello del visual: una 1:1 dentro un 9:16 verrebbe ritagliata. Se
      // nessuna immagine ha l'aspect giusto, si resta in solo-testo.
      const wantCat = targetAspectCategory(opts);
      const uploads = mediaAssets.filter((m) => !isGeneratedVisual(m.caption));
      const rated = await Promise.all(
        uploads.map(async (m) => ({ m, cat: aspectCategory(await imageAspectRatio(m.path)) })),
      );
      // SELEZIONE PER PERTINENZA: tra le immagini dell'aspect giusto, ordina per pertinenza al
      // capitolo del post (capitolo esatto → vicinanza → overlap tag) PRIMA di tagliare a
      // MAX_IMAGES, così le più pertinenti sopravvivono al taglio e finiscono in cima all'elenco.
      const matching = rated.filter((x) => x.cat === wantCat).map((x) => x.m);
      const ranked = rankImagesByRelevance(matching, opts.chapterIndex ?? null);
      // ROTAZIONE SFONDI: a parità di pertinenza, sposta in fondo le immagini usate di recente
      // (avoidImages), preferendo le fresche. avoidImages assente/[] → ordine INVARIATO.
      const rotated = deprioritizeImages(ranked, opts.avoidImages ?? []);
      images = rotated.slice(0, MAX_IMAGES).map((m) => ({
        id: m.id,
        caption: m.caption,
        scope: m.scope,
        chapterIdx: m.chapterIdx,
        tags: m.tags,
      }));
    }

    const validImageIds = new Set(images.map((m) => m.id));
    const availableImageIds = images.map((m) => m.id);

    // ESCLUSIONE CITAZIONI: usa SOLO quelle non viste di recente (fresche). Cosi' il modello
    // NON puo' ripescare una frase gia' usata finche' ce ne sono di fresche. Solo se TUTTE
    // sono gia' state usate si ricade sull'intero pool (per non restare senza testo reale).
    const avoid = new Set(opts.avoidQuotes ?? []);
    const fresh = realQuotes.filter((q) => !avoid.has(normalizeQuoteKey(q)));
    const orderedQuotes = fresh.length > 0 ? fresh : realQuotes;

    // Testo reale GARANTITO non vuoto: citazione FRESCA → testo del post → titolo libro.
    const fallbackText = (orderedQuotes[0] ?? post.message ?? bookTitle ?? "").trim();
    // CITAZIONE FORZATA: la prima FRESCA (o il fallback). È quella che IMPONIAMO come testo
    // principale dello spec, SCAVALCANDO la frase che ha scritto il modello (che tendeva a
    // ripescare sempre la sua preferita ignorando l'esclusione). Vuota solo se non c'è proprio nulla.
    // Scelta a CASO tra le citazioni fresche (non sempre la prima/top): se un capitolo torna o il
    // pool è piccolo, evita che esca deterministicamente sempre la stessa frase.
    const forcedQuote = (
      orderedQuotes.length > 0
        ? orderedQuotes[Math.floor(Math.random() * orderedQuotes.length)]!
        : fallbackText
    ).trim();

    const prompt = this.buildPrompt(post, opts, {
      realQuotes: orderedQuotes,
      charNames,
      bookTitle,
      images,
      useImages,
    });

    let spec: VisualSpec;
    try {
      const response = await this.deps.engine.run(prompt);
      const raw = parseModelJson(response);
      // Forza kind/aspect/template ai valori richiesti se l'utente li ha specificati.
      const merged = this.applyOverrides(raw, opts);
      spec = validateSpec(opts.kind, merged);
      // IMPONI la citazione fresca come testo principale, SCAVALCANDO la frase del modello
      // (così non ripete sempre la sua preferita). Per i reel con più scene ruota anche le
      // scene successive su citazioni fresche distinte. Salta se forcedQuote è vuota.
      this.forcePrimaryQuote(spec, forcedQuote, orderedQuotes);
      // Rete di sicurezza: se per qualunque motivo il testo principale è ancora vuoto
      // (es. forcedQuote vuota), inietta testo reale (citazione o post).
      this.ensureRealText(spec, orderedQuotes, fallbackText);
    } catch (e) {
      // Se il modello non e' disponibile o non risponde in JSON, costruiamo uno
      // spec di fallback DETERMINISTICO usando un testo reale (la prima citazione FRESCA),
      // cosi' la generazione visual non dipende in modo rigido dal modello.
      if (!(e instanceof ContentError)) throw e;
      spec = this.fallbackSpec(opts, {
        realQuotes: orderedQuotes,
        charNames,
        bookTitle,
        fallbackText,
        images,
      });
      // Coerenza col percorso modello: imponi la citazione fresca come testo principale.
      this.forcePrimaryQuote(spec, forcedQuote, orderedQuotes);
    }

    // Scarta gli imageId inventati dal modello: tieni SOLO id reali del libro.
    this.sanitizeImageIds(spec, validImageIds);
    // Sfondo FORZATO (Generazione diretta): l'immagine di scena AID appena creata. Dopo la
    // sanitize, così non viene scartata (è un media_asset reale, anche se non nella lista offerta).
    this.applyForcedImage(spec, opts.forceImageId);
    // Lascia sopravvivere un'eventuale traccia musicale richiesta (solo per i reel).
    this.applyMusicTrack(spec, opts.musicTrackId);
    // Durata scene = tempo di lettura + numero scene per tipo (reel/storia).
    this.applyReelTiming(spec, opts.target);
    // A) SLIDESHOW: dopo aver fissato le scene definitive, dà a ciascuna un'immagine DIVERSA e
    // pertinente (se non è forzata un'immagine specifica). Il reel diventa un vero racconto visivo.
    this.applyReelImageVariety(spec, images, opts.forceImageId);
    // chosenQuote = la citazione forzata (coincide con primaryQuoteOf dopo forcePrimaryQuote);
    // chosenImageIds = gli sfondi EFFETTIVAMENTE usati nello spec finale (per la rotazione reale).
    const chosenQuote = forcedQuote || primaryQuoteOf(spec);
    return { spec, realQuotes, availableImageIds, chosenImageIds: imageIdsOf(spec), chosenQuote };
  }

  // Forza un media_asset come sfondo su tutti i contenitori del visual (card/scene/pannelli).
  private applyForcedImage(spec: VisualSpec, imageId: number | null | undefined): void {
    if (imageId == null || !Number.isInteger(imageId) || imageId <= 0) return;
    if (spec.kind === "quote_card") spec.imageId = imageId;
    else if (spec.kind === "reel_text") for (const s of spec.scenes) s.imageId = imageId;
    else if (spec.kind === "storyboard") for (const p of spec.panels) p.imageId = imageId;
  }

  // A) Distribuisce immagini DIVERSE (ordinate per pertinenza) sulle scene del reel, così ogni
  // scena ha uno sfondo PROPRIO invece dello stesso ripetuto → vero slideshow. Salta se è stata
  // forzata un'immagine specifica (Generazione diretta) o se non ci sono immagini disponibili.
  // Cicla se le scene sono più delle immagini (raro: la 1ª immagine è la più pertinente).
  private applyReelImageVariety(
    spec: VisualSpec,
    images: AvailableImage[],
    forcedImageId: number | null | undefined,
  ): void {
    if (spec.kind !== "reel_text") return;
    if (forcedImageId != null && Number.isInteger(forcedImageId) && forcedImageId > 0) return;
    const ids = images.map((m) => m.id);
    if (ids.length === 0) return;
    spec.scenes.forEach((s, i) => {
      s.imageId = ids[i % ids.length]!;
    });
  }

  // Se è stato passato un music.trackId e lo spec è un reel, impostalo sullo spec.
  // Best-effort: id non validi (<=0) -> nessun montaggio musicale.
  private applyMusicTrack(spec: VisualSpec, trackId: number | null | undefined): void {
    if (spec.kind !== "reel_text") return;
    if (trackId == null || !Number.isInteger(trackId) || trackId <= 0) return;
    spec.music = { ...spec.music, trackId };
  }

  // Imposta durata delle scene e numero di scene per i video (reel/storia). Le nostre scene
  // sono FRASI DA LEGGERE: ogni scena resta in video il tempo necessario per leggerla (in
  // base alla lunghezza del testo), non un valore fisso. Storie = poche frasi e brevi
  // (sweet spot 5-10s, max ~15s); reel = qualche frase in più (~15s, dati engagement 2026).
  private applyReelTiming(spec: VisualSpec, target: "reel" | "story" | undefined): void {
    if (spec.kind !== "reel_text") return;
    const isStory = target === "story";
    const maxScenes = isStory ? 2 : 4;
    const totalCap = isStory ? 14 : 26; // tetto durata: storia <15s (limite FB), reel non troppo lungo

    // Tieni al massimo `maxScenes` scene (le prime, già ordinate dal regista).
    if (spec.scenes.length > maxScenes) spec.scenes = spec.scenes.slice(0, maxScenes);

    // Durata di ogni scena = tempo di lettura del suo testo (clamp 3.5-8s).
    for (const s of spec.scenes) {
      s.sec = readingSeconds(s.quote ?? s.text ?? "");
    }
    // Rispetta il tetto totale: rimuovi scene dalla coda finché si rientra (min 1 scena).
    while (spec.scenes.length > 1 && spec.scenes.reduce((a, s) => a + s.sec, 0) > totalCap) {
      spec.scenes.pop();
    }
    spec.durationSec = Math.round(spec.scenes.reduce((a, s) => a + s.sec, 0));
  }

  // Azzera ogni imageId che non corrisponda a un media_asset reale del libro
  // (il modello potrebbe inventarne): cosi' il renderer non prova a caricare id falsi.
  private sanitizeImageIds(spec: VisualSpec, validIds: Set<number>): void {
    const keep = (id: number | null | undefined): number | null =>
      id != null && validIds.has(id) ? id : null;
    if (spec.kind === "quote_card") {
      spec.imageId = keep(spec.imageId);
    } else if (spec.kind === "reel_text") {
      for (const s of spec.scenes) s.imageId = keep(s.imageId);
    } else if (spec.kind === "storyboard") {
      for (const p of spec.panels) p.imageId = keep(p.imageId);
    }
  }

  // Se l'utente ha imposto template/aspect, scrivili nell'oggetto grezzo prima di validare.
  private applyOverrides(raw: unknown, opts: DirectorOpts): Record<string, unknown> {
    const o = (
      raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {}
    ) as Record<string, unknown>;
    o.kind = opts.kind;
    if (opts.template && TEMPLATES[opts.kind].includes(opts.template)) o.template = opts.template;
    if (opts.aspect && ASPECTS.includes(opts.aspect)) o.aspect = opts.aspect;
    return o;
  }

  // IMPONE la citazione fresca come testo principale dello spec, SCAVALCANDO ciò che ha scritto
  // il modello (che tendeva a ripescare sempre la sua frase preferita ignorando l'esclusione).
  // Per i reel con più scene, assegna citazioni FRESCHE DISTINTE anche alle scene successive
  // (rotazione interna, senza ripetere), pescando da orderedQuotes. Salta se forcedQuote è vuota.
  private forcePrimaryQuote(spec: VisualSpec, forcedQuote: string, orderedQuotes: string[]): void {
    const primary = (forcedQuote ?? "").trim();
    if (!primary) return;
    if (spec.kind === "quote_card") {
      spec.quote = primary;
    } else if (spec.kind === "reel_text") {
      // Citazioni fresche distinte (ordinate), forcedQuote in testa: una per scena senza ripetere.
      const distinct: string[] = [];
      for (const q of [primary, ...orderedQuotes]) {
        const t = (q ?? "").trim();
        if (t && !distinct.includes(t)) distinct.push(t);
      }
      spec.scenes.forEach((s, i) => {
        // Se ci sono abbastanza citazioni fresche le ruoto sulle scene; altrimenti riuso l'ultima
        // disponibile (mai una frase del modello). La scena 0 resta sempre la citazione forzata.
        s.quote = distinct[Math.min(i, distinct.length - 1)]!;
        delete s.text; // il testo principale è la citazione: rimuovi un eventuale text del modello
      });
    } else if (spec.kind === "storyboard") {
      spec.panels[0]!.dialogue = primary;
    }
  }

  private ensureRealText(spec: VisualSpec, realQuotes: string[], fallbackText: string): void {
    const text = (realQuotes[0] ?? fallbackText ?? "").trim();
    if (!text) return;
    if (spec.kind === "quote_card" && spec.quote.trim() === "") {
      spec.quote = text;
    } else if (spec.kind === "reel_text") {
      const hasText = spec.scenes.some((s) => (s.text ?? s.quote ?? "").trim() !== "");
      if (!hasText && spec.scenes[0]) spec.scenes[0].quote = text;
    } else if (spec.kind === "storyboard") {
      const hasText = spec.panels.some((p) => p.dialogue.trim() !== "");
      if (!hasText && spec.panels[0]) spec.panels[0].dialogue = text;
    }
  }

  // Spec deterministico senza modello: usa la prima citazione reale disponibile.
  // Se il libro ha immagini reali, le usa come sfondo (card singola / slideshow reel).
  private fallbackSpec(
    opts: DirectorOpts,
    ctx: {
      realQuotes: string[];
      charNames: string[];
      bookTitle: string | null;
      fallbackText: string;
      images: AvailableImage[];
    },
  ): VisualSpec {
    // Testi reali da usare: le citazioni se presenti, altrimenti il testo garantito.
    const texts =
      ctx.realQuotes.length > 0 ? ctx.realQuotes : ctx.fallbackText ? [ctx.fallbackText] : [];
    const quote = texts[0] ?? "";
    const source = ctx.bookTitle ?? "";
    const imageIds = ctx.images.map((m) => m.id);
    if (opts.kind === "reel_text") {
      // Slideshow: assegna un'immagine diversa a ogni scena (cicla se poche).
      return validateSpec("reel_text", {
        template: opts.template,
        scenes: texts.slice(0, 3).map((q, i) => ({
          quote: q,
          anim: "fade",
          sec: 3,
          imageId: imageIds.length > 0 ? imageIds[i % imageIds.length] : null,
        })),
        background: { type: "gradient", palette: "ink" },
        music: { mood: "calm" },
      });
    }
    if (opts.kind === "storyboard") {
      return validateSpec("storyboard", {
        aspect: opts.aspect,
        panels: texts.slice(0, 4).map((q, i) => ({
          speaker: ctx.charNames[i] ?? "",
          dialogue: q,
          bg: "ink",
          imageId: imageIds.length > 0 ? imageIds[i % imageIds.length] : null,
        })),
      });
    }
    return validateSpec("quote_card", {
      template: opts.template,
      aspect: opts.aspect,
      quote,
      source,
      palette: "ink",
      imageId: imageIds[0] ?? null,
    });
  }

  private buildPrompt(
    post: ScheduledPost,
    opts: DirectorOpts,
    ctx: {
      realQuotes: string[];
      charNames: string[];
      bookTitle: string | null;
      images: AvailableImage[];
      useImages: boolean;
    },
  ): string {
    const templates = TEMPLATES[opts.kind].join(", ");
    const quotesBlock =
      ctx.realQuotes.length > 0
        ? ctx.realQuotes.map((q, i) => `${i + 1}. ${q}`).join("\n")
        : "(nessuna citazione estratta dal libro: usa UNA frase breve e incisiva presa dal TESTO DEL POST qui sotto, copiata alla lettera; NON inventare e NON lasciare i campi testo vuoti)";
    const charsBlock = ctx.charNames.length > 0 ? ctx.charNames.join(", ") : "(nessuno)";
    const brand = brandFor(ctx.bookTitle, null);

    const schema = this.schemaHint(opts.kind);
    const imagesSection = this.imagesSection(
      opts.kind,
      ctx.images,
      ctx.useImages,
      opts.chapterIndex ?? null,
    );

    return `Sei un ART DIRECTOR per social. NON disegnare pixel: scegli un TEMPLATE FISSO e
produci ESCLUSIVAMENTE un oggetto JSON (uno SPEC) che un renderer eseguira'. Nessun testo
prima o dopo il JSON.

REGOLA FERREA: i testi visivi (citazioni/dialoghi) devono provenire da testo REALE,
copiato alla lettera: preferisci le CITAZIONI REALI qui sotto; se l'elenco e' vuoto,
usa UNA frase breve presa dal TESTO DEL POST qui sotto (e' testo reale). NON inventare,
NON parafrasare e NON lasciare i campi testo vuoti.

TIPO RICHIESTO: ${opts.kind}
TEMPLATE AMMESSI (scegline uno): ${templates}
ASPECT AMMESSI: ${ASPECTS.join(", ")}
${opts.template ? `Usa il template: ${opts.template}` : ""}
${opts.aspect ? `Usa l'aspect: ${opts.aspect}` : ""}

BRAND: titolo libro = ${brand.title ?? "(non indicato)"}; accent suggerito = ${brand.accent}
PERSONAGGI (nomi reali, usa SOLO questi come speaker): ${charsBlock}

CITAZIONI REALI (usa SOLO queste, alla lettera; sono ORDINATE: PREFERISCI le prime, non
ancora usate di recente, per non ripetere sempre la stessa frase tra post/reel/storia):
${quotesBlock}
${imagesSection}
TESTO DEL POST (usalo per il tono; se non ci sono citazioni reali, copiane UNA frase breve nei campi testo):
${post.message}

Rispondi con un JSON di questa forma (riempi i campi mancanti con valori sensati):
${schema}`;
  }

  // Sezione "immagini disponibili" + istruzioni di COMPOSIZIONE. Se non ci sono
  // immagini (o useImages=false) istruisce esplicitamente a NON usare imageId.
  private imagesSection(
    kind: VisualKind,
    images: AvailableImage[],
    useImages: boolean,
    chapterIndex: number | null,
  ): string {
    if (!useImages || images.length === 0) {
      return `\nIMMAGINI DEL LIBRO: nessuna disponibile. NON usare alcun campo imageId (lascialo null o omettilo): la composizione sara' SOLO TESTO.\n`;
    }
    // Ogni voce mostra capitolo illustrato e tag soggetto (per scegliere con cognizione).
    const list = images
      .map((m) => {
        const label = (m.caption && m.caption.trim()) || m.scope;
        const ch = m.chapterIdx != null ? ` [cap.${m.chapterIdx}]` : "";
        const tags = m.tags.length > 0 ? ` {${m.tags.join(", ")}}` : "";
        return `- ${m.id}: ${label}${ch}${tags}`;
      })
      .join("\n");
    // L'elenco è già ORDINATO PER PERTINENZA al capitolo del post: la prima è la più pertinente.
    const relevanceNote =
      chapterIndex != null
        ? `Le immagini sono ORDINATE PER PERTINENZA al post (capitolo ${chapterIndex} e soggetti): a parità di adeguatezza PREFERISCI le PRIME dell'elenco.\n`
        : "";
    const guidance =
      kind === "reel_text"
        ? `Scegli la COMPOSIZIONE: (a) solo testo (nessun imageId), (b) slideshow con piu' scene, ognuna con un imageId DIVERSO scelto dall'elenco (effetto presentazione). Assegna gli imageId al campo "imageId" delle scene.`
        : kind === "storyboard"
          ? `Puoi opzionalmente assegnare un "imageId" di sfondo a ciascun pannello, scelto dall'elenco.`
          : `Scegli la COMPOSIZIONE: (a) solo testo (nessun imageId), (b) sfondo singolo: imposta "imageId" con UN id dall'elenco (la citazione andra' sopra un velo scuro per leggibilita').`;
    return `
IMMAGINI DISPONIBILI DEL LIBRO (usa SOLO questi id, NON inventarne altri):
${list}
${relevanceNote}COMPOSIZIONE IMMAGINI: ${guidance}
Le immagini sono SOLO sfondo: il testo resta la citazione reale, leggibile sopra un velo scuro.
`;
  }

  private schemaHint(kind: VisualKind): string {
    if (kind === "reel_text") {
      return `{
  "kind": "reel_text",
  "template": "<uno dei template ammessi>",
  "aspect": "9:16",
  "durationSec": 9,
  "scenes": [{ "quote": "<citazione reale>", "anim": "fade|slide|zoom|none", "sec": 3, "cta": "<opzionale>", "imageId": <id immagine dall'elenco o null> }],
  "music": { "mood": "calm|epic|warm" },
  "background": { "type": "gradient|solid", "palette": "ink|warm|cool|mono|brand" }
}`;
    }
    if (kind === "storyboard") {
      return `{
  "kind": "storyboard",
  "aspect": "<uno degli aspect ammessi>",
  "panels": [{ "speaker": "<nome personaggio reale o vuoto>", "dialogue": "<dialogo reale>", "bg": "ink|warm|cool|mono|brand", "imageId": <id immagine dall'elenco o null> }]
}`;
    }
    return `{
  "kind": "quote_card",
  "template": "<uno dei template ammessi>",
  "aspect": "<uno degli aspect ammessi>",
  "quote": "<citazione reale, alla lettera>",
  "source": "<titolo libro o autore>",
  "palette": "ink|warm|cool|mono|brand",
  "accent": "#rrggbb",
  "imageId": <id immagine di sfondo dall'elenco o null>
}`;
  }
}
