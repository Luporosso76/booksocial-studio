// Domain types. Timestamps are epoch ms (number).

export type MediaType = "TEXT" | "LINK" | "PHOTO" | "REEL" | "STORY";
export const MEDIA_TYPES: MediaType[] = ["TEXT", "LINK", "PHOTO", "REEL", "STORY"];

export type PostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELLED";

export interface Book {
  id: number;
  title: string;
  author: string | null;
  language: string;
  sourcePath: string;
  contentHash: string;
  chapterCount: number;
  charCount: number;
  importedAt: number;
  updatedAt: number;
  websiteUrl: string | null;
  notes: string | null;
  baseHashtags: string | null;
  // Configurazione VISIVA per-libro: moduli-dominio del prompt immagine attivi (CSV in DB →
  // string[]) e direttive d'arte libere. Scoppiano i blocchi specifici per libro. Vedi imageDomains.ts.
  visualDomains: string[];
  visualDirectives: string | null; // testo ORIGINALE scritto dall'utente (in italiano), per la UI
  visualDirectivesEn: string | null; // traduzione EN iniettata nel prompt immagine
  // Oggetti/veicoli ricorrenti canonici + fatti del mondo (lato guida). Vedi BookVisualProps.
  visualProps: BookVisualProps;
  // Personaggi minori/incidentali con un look canonico fisso. Vedi BookVisualExtras.
  visualExtras: BookVisualExtras;
  // Istruzioni-extra per-libro: testo libero accodato ai prompt generati (guida aggiuntiva, non
  // sostituisce il core). La controparte globale vive in app_setting (content/aiSettings).
  textExtraInstructions: string | null;
  imageExtraInstructions: string | null;
}

// Personaggio MINORE/incidentale (non nel cast principale, spesso senza nome): un look FISSO per
// ruolo+contesto, da rendere coerente nelle scene dove compare. Persistito in book.visual_extras_json.
export interface MinorCharacter {
  label: string; // es. "compagna di Roberto (scena del bar)" o "operatrice reiki"
  when: string; // keyword (IT/EN) matchate sulla scheda del capitolo (luogo/ambiente/oggetti)
  appearance: string; // aspetto fisico FISSO (eta, corporatura, capelli, viso, carnagione)
  outfit: string | null; // abbigliamento per quel contesto (opzionale)
}
export interface BookVisualExtras {
  minors: MinorCharacter[];
}

// Oggetto/veicolo RICORRENTE e importante di un libro, con aspetto CANONICO fisso (es. "BMW Serie M6
// nera"): va reso sempre uguale. Scatta quando le keyword `when` combaciano con la scheda del capitolo.
export interface VisualProp {
  name: string; // etichetta, es. "auto di Roberto"
  when: string; // keyword (IT/EN) matchate sulla scheda del capitolo (luogo/ambiente/oggetti)
  description: string; // aspetto canonico fisso da rendere sempre uguale
  owner: string | null; // personaggio proprietario (opzionale), per legarlo a chi è in scena
}

export type DrivingSide = "left" | "right";

// Canone degli oggetti + fatti visivi del MONDO del libro. Persistito in book.visual_props_json.
export interface BookVisualProps {
  props: VisualProp[];
  drivingSide: DrivingSide | null; // lato di guida del paese (volante/auto), per scene con strade/auto
  country: string | null; // paese principale dell'ambientazione
}

export interface BookChapter {
  id: number;
  bookId: number;
  index: number;
  title: string | null;
  text: string;
  charCount: number;
  // Escluso dalla generazione immagini: true → il capitolo NON entra nel pool di selezione
  // (anti-frontespizio + toggle manuale). Default false; auto-true sui capitoli cortissimi all'import.
  excluded: boolean;
  // Scheda visiva del capitolo: estratta on-demand dal testo e messa in cache.
  // null = non ancora estratta. Vedi ChapterScene.
  scene: ChapterScene | null;
}

// Scheda visiva di un capitolo: fonda il prompt immagine (soggetto iconico + ambientazione
// + personaggi presenti) invece di farlo dedurre al modello dal grezzo del capitolo.
// Persistita come JSON in book_chapter.scene_json.
export interface ChapterScene {
  location: string | null; // luogo concreto (es. "spiaggia di Cabarete", "appartamento a Roma")
  environment: string | null; // interno/esterno, atmosfera, ora/periodo
  mainObjects: string[]; // oggetti/soggetti iconici principali del capitolo
  secondaryObjects: string[]; // oggetti comuni/di contorno
  characters: string[]; // personaggi presenti nel capitolo (nomi)
  // Vincoli CONCRETI di fisica/realismo per illustrare scene di QUESTO capitolo (come si comportano
  // gravità/acqua/onde/vento/luce nel contesto; cosa NON deve accadere). In lingua del libro,
  // editabili. Si COMBINANO con la baseline universale del prompt (vedi imagePrompt.ts).
  physicsRules: string[];
  // Momento/azione centrale visivo (non-spoiler) del capitolo: fonda il soggetto dell'immagine
  // quando è più forte di un semplice oggetto iconico. null = non estratto.
  keyMoment: string | null;
  source: CharacterSource; // 'AI' = estratta dal modello, 'USER' = editata a mano
  model: string | null; // motore che l'ha estratta
  updatedAt: number;
}

export type CharacterSource = "AI" | "USER";

// Abbigliamento CANONICO di un personaggio: un abito di DEFAULT + abiti per CONTESTO che
// scattano quando le loro keyword combaciano con la scheda del capitolo (luogo/ambiente/oggetti),
// così "stessa scena → stesso vestito". Persistito in book_character.outfits_json.
export interface CharacterOutfit {
  when: string; // keyword (IT/EN) cercate nella scheda del capitolo per attivare questo abito
  outfit: string; // descrizione dell'abbigliamento per quel contesto
}
export interface CharacterOutfits {
  default: string | null; // abito di default (quando nessun contesto combacia)
  contexts: CharacterOutfit[]; // abiti per contesto/scena ricorrente
}

export interface BookCharacter {
  id: number;
  bookId: number;
  name: string;
  role: string | null;
  occupation: string | null;
  personality: string | null;
  physical: string | null;
  notes: string | null;
  source: CharacterSource;
  sortOrder: number;
  // Metriche del pre-pass NLP (spaCy): quante menzioni e in quali capitoli compare.
  // null/[] se il pre-pass non è stato eseguito.
  mentions: number | null;
  chapters: number[];
  // Abbigliamento canonico: default + abiti per contesto. Vedi CharacterOutfits.
  outfits: CharacterOutfits;
  createdAt: number;
  updatedAt: number;
}

// Citazione/dialogo REALE estratto dal pre-pass NLP (spaCy). Usato dai renderer
// visivi: il testo proviene SEMPRE dal libro, mai inventato dall'AI.
export type QuoteKind = "quote" | "dialogue";

export interface BookQuote {
  id: number;
  bookId: number;
  chapterId: number | null;
  text: string;
  kind: QuoteKind;
  speaker: string | null;
  score: number;
  createdAt: number;
}

export interface BookProfile {
  id: number;
  bookId: number;
  synopsisShort: string | null;
  synopsisLong: string | null;
  genres: string | null;
  tone: string | null;
  targetAudience: string | null;
  analysisJson: string;
  sourceContentHash: string;
  promptVersion: number;
  model: string | null;
  createdAt: number;
}

// v2 prompt: conflicts, themes, central question, anti-spoiler policy.
export const CURRENT_PROMPT_VERSION = 2;

export interface FacebookPage {
  pageId: string;
  name: string;
  category: string | null;
  tokenSecretKey: string;
  bookId: number | null;
  addedAt: number;
  // instagram_business_account.id collegato alla Pagina (cache): serve a pubblicare Reel/Storie su
  // Instagram. null = non ancora risolto via Graph API. Vedi facebook/instagramClient.ts.
  igUserId: string | null;
}

export function pageSecretKeyFor(pageId: string): string {
  return `fb.page.${pageId}`;
}

// Canale del link: tipo semantico usato per decidere se/quando inserirlo nei post.
// Valori noti (la UI propone questi, ma il campo resta libero per compatibilità):
//  sito_libro · sito_autore · vendita · social_autore · altro
export type LinkChannel =
  | "sito_libro"
  | "sito_autore"
  | "vendita"
  | "social_autore"
  | "altro"
  | string;

// Regola d'uso del link nei POST (testo/foto; reel/storie non hanno link cliccabili):
//  always    → inserito SEMPRE (es. sito del libro)
//  sometimes → inserito a volte (~45%), per varietà (es. sito autore, Acquista)
//  manual    → mai automatico (lo aggiunge l'utente)
export type LinkUsagePolicy = "always" | "sometimes" | "manual";

export interface BookLink {
  id: number;
  bookId: number;
  channel: LinkChannel;
  label: string | null;
  url: string;
  isDefault: boolean;
  usagePolicy: LinkUsagePolicy | null;
}

// Verdetto del QUALITY CHECK visivo: un modello multimodale GUARDA l'immagine generata e
// segnala i problemi (testo/scritte, anatomia, nudità, gi/karate fuori contesto, collage, soggetto
// assente/sbagliato). `ok` è true SOLO se `issues` è vuoto. Persistito in media_asset.qa_json.
export interface SceneQa {
  ok: boolean;
  issues: string[]; // problemi rilevati, frasi brevi in italiano (vuoto = nessun problema)
}

export interface MediaAsset {
  id: number;
  bookId: number;
  chapterId: number | null;
  scope: string; // GENERAL | CHAPTER | GENERATED
  path: string;
  caption: string | null;
  genPrompt: string | null; // prompt dei visual generati (interno, NON user-facing)
  chapterIdx: number | null; // capitolo di riferimento (per scegliere l'immagine giusta per un post)
  tags: string[]; // tag/soggetti (megattere, mare, tartaruga, mood, personaggi…)
  // Verdetto del QA visivo, o null se non eseguito / non disponibile (best-effort).
  qa: SceneQa | null;
  // Seed di generazione (backend locale sd-cli), per riproducibilità. null = upload o provider HTTP.
  seed: number | null;
  addedAt: number;
}

// ---- SCHEDA MARKETING DI CAPITOLO ----
// Comprensione NARRATIVA persistente del capitolo (separata dalla scheda scena, che è visiva), usata
// per fondare la generazione dei post. Vedi `content/chapterMarketingCard.ts`.
export type SpoilerLevel = "low" | "medium" | "high";

export interface MarketingSafeQuote {
  quote: string;
  whyItWorks: string;
  spoilerRisk: SpoilerLevel;
}

export interface MarketingCharacterFocus {
  name: string;
  stateInChapter: string;
  desire: string;
  fear: string;
  changeWithoutSpoiler: string;
}

export interface MarketingPostAngle {
  type: string; // micro-scene | reader-question | character | symbol | quote | conflict
  hook: string;
  reason: string;
  concreteness: number; // 0-10
  emotionalStrength: number; // 0-10
  spoilerSafety: number; // 0-10 (10 = totalmente sicuro)
  freshness: number; // 0-10
}

export interface ChapterMarketingCardData {
  spoilerLevel: SpoilerLevel;
  nonSpoilerSummary: string;
  emotionalCore: string;
  humanTruth: string;
  readerQuestion: string;
  mainTension: string;
  visualMoment: string;
  safeQuotes: MarketingSafeQuote[];
  characterFocus: MarketingCharacterFocus[];
  postAngles: MarketingPostAngle[];
}

export interface ChapterMarketingCard {
  bookId: number;
  chapterIndex: number;
  schemaVersion: number;
  data: ChapterMarketingCardData;
  model: string | null;
  updatedAt: number;
}

// Tipo di pubblicazione di alto livello, deciso dalle QUOTE settimanali. Le sotto-scelte
// (card/storyboard/immagine/musica/aspect) restano al motore di varietà.
export type ContentType = "post" | "reel" | "story";

// Quote settimanali per pagina: l'unica cosa che l'utente imposta. Lo scheduler decide
// giorni, orari (dentro le finestre = PostingSlot) e formati a partire da questi numeri.
export interface WeeklyPlan {
  pageId: string;
  postsPerWeek: number;
  reelsPerWeek: number;
  storiesPerWeek: number;
  updatedAt: number;
}

// Quote di default quando una pagina non ne ha ancora impostate (best-practice prudente
// per una pagina-libro: poche pubblicazioni di qualità + qualche storia).
export const DEFAULT_WEEKLY_PLAN: Omit<WeeklyPlan, "pageId" | "updatedAt"> = {
  postsPerWeek: 3,
  reelsPerWeek: 1,
  storiesPerWeek: 2,
};

export interface PostingSlot {
  id: number;
  pageId: string;
  dayOfWeek: number; // 1=Mon .. 7=Sun (ISO-8601)
  timeOfDay: string; // HH:mm — orario di fallback (centro della fascia)
  // Fascia oraria (HH:mm): se entrambi presenti, la generazione assegna un orario
  // VARIATO dentro [timeStart, timeEnd], diverso ogni settimana. Se null, usa timeOfDay.
  timeStart: string | null;
  timeEnd: string | null;
  mediaType: MediaType;
  enabled: boolean;
}

export interface ScheduledPost {
  id: number;
  pageId: string;
  bookId: number | null;
  generationId: number | null;
  message: string;
  hashtags: string | null;
  mediaType: MediaType;
  link: string | null;
  mediaPath: string | null;
  scheduledAt: number;
  status: PostStatus;
  fbPostId: string | null;
  attempts: number;
  lastError: string | null;
  idempotencyKey: string;
  // Traccia musicale scelta (music_track.id) per reel/storie, o null.
  musicId: number | null;
  // Formato scelto dal motore di varietà, serializzato (ContentFormat JSON), o null.
  contentFormat: string | null;
  // Piattaforma: 'facebook' (default) o 'instagram' (job locale separato).
  platform: Platform;
  // Per le righe IG: id dell'item Facebook gemello da cui è nato il job (o null).
  linkedPostId: number | null;
  // Id del media Instagram dopo la pubblicazione (o null).
  igMediaId: string | null;
  // Nascosto dalle viste della Dashboard (post pubblicato che l'utente non vuole più vedere).
  // La riga resta nel DB e il post resta su FB/IG: è solo un filtro lato UI.
  dashboardHidden: boolean;
  createdAt: number;
  updatedAt: number;
}

// Piattaforma di destinazione di una riga scheduled_post. 'facebook' (default) = comportamento
// storico INVARIATO. 'instagram' = job locale SEPARATO (Reel/Storie 9:16) pubblicato dallo
// scheduler interno; Instagram non ha programmazione nativa. Vedi services/instagramPublisher.ts.
export type Platform = "facebook" | "instagram";

// ----- Motore di varietà: formato di un contenuto come combinazione di DIMENSIONI.
// Non enumeriamo una matrice a mano: il formato è il prodotto di queste dimensioni,
// vincolate dalla disponibilità reale (immagini/citazioni/reel) del libro/ambiente.
export type TextMode = "full" | "short" | "none";
export type VisualKindChoice = "none" | "card" | "storyboard" | "reel" | "story";
export type VisualContent = "text" | "images" | "mixed";
// Proporzioni ufficiali Meta: feed immagini 1:1/4:5/1.91:1; storie & reel 9:16.
export type FormatAspect = "1:1" | "4:5" | "1.91:1" | "9:16";

export interface ContentFormat {
  textMode: TextMode; // testo del post: pieno / breve / assente
  visualKind: VisualKindChoice; // nessuno · card · storyboard · reel · storia
  visualContent: VisualContent; // contenuto del visual: solo testo · solo immagini · misto
  aspect: FormatAspect | null; // 1:1 · 4:5 · 9:16 (null quando visualKind = none)
}

// Registro d'uso: memoria del motore di varietà E sorgente delle statistiche.
// Una riga per ogni contenuto creato (bozza), con il formato scelto e gli asset usati.
export interface ContentUsage {
  id: number;
  pageId: string;
  bookId: number | null;
  postId: number | null;
  textMode: TextMode;
  visualKind: VisualKindChoice;
  visualContent: VisualContent;
  aspect: FormatAspect | null;
  imageIds: number[]; // id media_asset usati (per penalizzare il riuso)
  quoteKey: string | null; // chiave normalizzata della citazione usata
  musicId: number | null; // music_track.id usata (per variare anche la musica)
  chapterIndex: number | null; // indice del capitolo da cui è nata l'idea (per variare i capitoli)
  angleKey: string | null; // angolo marketing-card usato (per ruotare gli angoli dello stesso capitolo)
  createdAt: number;
}

// Libreria musicale (globale, non legata a un libro): tracce caricate dall'utente,
// montate sui reel/storie da ffmpeg. Tracciata come media_asset ma indipendente.
export interface MusicTrack {
  id: number;
  bookId: number | null; // libro a cui appartiene la traccia (null = libreria globale)
  title: string;
  path: string;
  durationSec: number | null;
  mood: string | null;
  addedAt: number;
}

// Job di render (coda in-process). Lo spec JSON e' prodotto dall'IA-regista; il
// renderer lo esegue e salva output_path. Nessuna pubblicazione: resta sulla bozza.
export type RenderStatus = "queued" | "rendering" | "done" | "failed";

export interface RenderJob {
  id: number;
  postId: number | null;
  bookId: number | null;
  kind: string;
  status: RenderStatus;
  specJson: string;
  outputPath: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GenerationRecord {
  id: number;
  bookId: number;
  pageId: string | null;
  angle: string | null;
  promptVersion: string | null;
  inputHash: string | null;
  model: string | null;
  output: string;
  createdAt: number;
}

// Final published text: message + hashtags.
export function fullText(p: ScheduledPost): string {
  if (!p.hashtags || p.hashtags.trim() === "") return p.message;
  return `${p.message}\n\n${p.hashtags}`;
}
