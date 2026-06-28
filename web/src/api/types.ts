// Types mirroring the backend REST contract.
// These are intentionally permissive (optional fields) because the backend
// shape may still evolve; the UI degrades gracefully on missing fields.

export interface AppStatus {
  secretsUnlocked: boolean;
  provider: string;
  // Provider TESTO: configurato vs ultimo realmente usato (può contenere " (fallback)").
  textProvider?: string | null;
  textActive?: string | null;
  // Provider IMMAGINI: configurato vs ultimo realmente usato (può contenere " (fallback)").
  imageProvider?: string | null;
  imageActive?: string | null;
  pages: number;
  books: number;
}

export interface FacebookPage {
  id: string;
  pageId?: string;
  name: string;
  category?: string | null;
  connectedAt?: number | null;
  bookId?: string | null;
  // Instagram Business account collegato (null = nessun IG → niente tab Instagram).
  igUserId?: string | null;
}

// Page returned by /me/accounts before saving (carries a token client-side only,
// never persisted to our state beyond the connection flow).
export interface ManagedPage {
  id: string;
  name: string;
  category?: string | null;
  accessToken?: string;
  tasks?: string[];
}

export interface Book {
  id: string;
  title: string;
  author?: string | null;
  language?: string | null;
  baseHashtags?: string[];
  visualDomains?: string[];
  visualDirectives?: string | null;
  visualDirectivesEn?: string | null;
  sourcePath?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  coverUrl?: string | null;
  visualProps?: BookVisualProps;
  visualExtras?: BookVisualExtras;
  textExtraInstructions?: string | null;
  imageExtraInstructions?: string | null;
}

// Canone visivo per-libro: abiti dei personaggi, oggetti/mondo
// ricorrenti e personaggi minori incidentali.
export interface CharacterOutfit {
  when: string;
  outfit: string;
}
export interface CharacterOutfits {
  default: string | null;
  contexts: CharacterOutfit[];
  signature?: string | null;
}
export interface VisualProp {
  name: string;
  when: string;
  description: string;
  owner: string | null;
}
export type DrivingSide = "left" | "right";
export interface BookVisualProps {
  props: VisualProp[];
  drivingSide: DrivingSide | null;
  country: string | null;
}
export interface MinorCharacter {
  label: string;
  when: string;
  appearance: string;
  outfit: string | null;
}
export interface BookVisualExtras {
  minors: MinorCharacter[];
}

export interface VisualDomainInfo {
  key: string;
  label: string;
  description: string;
}

export interface VisualDirective {
  id: string;
  bookId: string;
  title: string;
  triggers: string[];
  intent: string | null;
  body: string | null;
  bodyEn: string | null;
  enabled: boolean;
  sortOrder: number;
}

// Attività di lavoro in background. Il backend restituisce via GET /jobs sia le
// analisi AI dei libri sia i render dei visual. I due tipi si distinguono dal
// campo `kind`: 'analysis' porta bookId/title, i render portano postId/renderKind.
export interface BackgroundJob {
  // Comuni
  kind: "analysis" | "render" | "weekgen" | "scenegen" | "mediaRegen" | "visualBible";
  startedAt: number;
  // Analisi libro (kind === 'analysis')
  bookId?: string;
  title?: string;
  status?: "analyzing" | "generating";
  // Render visual (kind === 'render')
  jobId?: string;
  postId?: string;
  renderKind?: VisualKind;
  // Generazione settimana (kind === 'weekgen')
  pageId?: string;
  planned?: number;
  created?: number;
  waiting?: boolean;
  // Rigenerazione immagini (kind === 'mediaRegen'): id dell'immagine in lavorazione (corrente).
  mediaId?: number;
  // Bibbia visiva (kind === 'visualBible'): avanzamento per-step (lo step in corso
  // ha status:'running'). Opzionali e non-breaking per gli altri kind.
  steps?: { key: string; label: string; status: string; done: number; total: number }[];
  step?: string;
}

// --- Generazione visual dalle bozze (Genera visual) ---

export type VisualKind = "quote_card" | "reel_text" | "storyboard";
export type VisualAspect = "1:1" | "4:5" | "9:16" | "1.91:1";
export type RenderStatus = "queued" | "rendering" | "done" | "failed";

// --- Generazione immagini AI di scena ---

// Proporzione richiesta per le immagini di scena generate dall'AI.
export type SceneAspect = "1:1" | "4:5" | "9:16" | "1.91:1" | "16:9";

// Modalità con cui i contenuti scelgono le immagini: solo libreria caricata
// oppure generazione diretta AI al momento della creazione del programma.
export type AiImageMode = "library" | "direct";

// Stato della generazione immagini di scena per un libro (GET /books/:id/scenegen).
// `planned`/`created` danno l'avanzamento N/M; `error` valorizzato se status='failed'.
// Un batch di generazione: count immagini PER CAPITOLO (se chapters non vuoto), oppure count
// totali su capitoli vari (chapters vuoto = Auto).
export interface SceneBatch {
  id: string;
  count: number;
  aspect: SceneAspect;
  chapters: number[];
}

export interface SceneGenStatus {
  status: "idle" | "generating" | "ready" | "failed";
  planned: number; // totale immagini di TUTTI i batch (coda inclusa)
  created: number; // immagini create finora
  waiting?: boolean;
  error: string | null;
  // Timestamp epoch-ms per i cronometri (tempo reale, sopravvive ai cambi pagina).
  // startedAt = inizio del primo batch; imageStartedAt = inizio dell'immagine in corso. 0 se idle.
  startedAt?: number;
  imageStartedAt?: number;
  // Batch attualmente in lavorazione e batch ancora in coda.
  current?: { aspect: SceneAspect; chapters: number[]; planned: number; created: number } | null;
  queued?: SceneBatch[];
}

// Stato GLOBALE della coda di rigenerazione immagini (GET /media/regen-status).
// `current` = immagine in rigenerazione ora (null se idle); `queued` = id in coda.
// startedAt(current) = cronometro dell'immagine in corso; startedAt(root) = cronometro
// totale della coda (0 se idle).
export interface MediaRegenStatusGlobal {
  current: { mediaId: number; bookId: number; startedAt: number } | null;
  queued: number[];
  startedAt: number;
}

// Esito dell'avvio della generazione (POST /books/:id/generate-images).
export interface GenerateImagesResult {
  started: true;
  count: number;
  aspect: SceneAspect;
  // Capitolo richiesto (null = copertura automatica di capitoli diversi).
  chapterIndex: number | null;
}

// Stato/disponibilità del toggle modalità immagini (GET /settings/ai-image-mode).
export interface AiImageModeState {
  mode: AiImageMode;
  available: boolean;
}

// --- Impostazioni provider AI (testo + immagini) ---
// Provider testo: CLI agentici (opencode/codex/claude/agy, login via CLI, nessuna
// chiave) + Ollama locale (baseUrl + modello). I provider ad API diretta sono stati rimossi.
export type AiTextProvider = "opencode" | "codex" | "claude" | "agy" | "ollama";

// Fallback testo: come AiTextProvider piu 'none' (nessun fallback).
export type AiTextFallback = AiTextProvider | "none";

// Provider immagini: motore locale, CLI agentici (agy/codex) e API a chiave dedicata.
export type AiImageProvider =
  | "local"
  | "agy"
  | "codex"
  | "openai"
  | "google"
  | "stability"
  | "bfl"
  | "replicate"
  | "fal";

// Fallback immagini: come AiImageProvider piu 'none' (nessun fallback).
export type AiImageFallback = AiImageProvider | "none";

export interface AiSettings {
  text: {
    provider: AiTextProvider;
    // Modello forzato per provider (null/'' = default del CLI/provider).
    opencodeModel: string;
    codexModel: string | null;
    claudeModel: string | null;
    agyModel: string | null;
    ollamaBaseUrl: string;
    ollamaModel: string;
    // Provider di ripiego su rate-limit/quota esaurita del primario ('none' = nessuno).
    fallbackProvider: AiTextFallback;
    // Modello forzato per il provider di fallback (''/default del provider).
    fallbackModel: string;
  };
  image: {
    provider: AiImageProvider;
    openaiBaseUrl: string;
    googleBaseUrl: string;
    openaiImageModel: string;
    googleImageModel: string;
    stabilityImageModel: string;
    bflImageModel: string;
    replicateImageModel: string;
    falImageModel: string;
    agyImageModel: string | null;
    codexImageModel: string | null;
    // Provider di ripiego su rate-limit/quota esaurita del primario ('none' = nessuno).
    fallbackProvider: AiImageFallback;
    // Modello forzato per il provider di fallback (''/default del provider).
    fallbackModel: string;
  };
  // Stato "chiave configurata" (mai il valore). Solo boolean.
  keys: {
    openai: boolean;
    anthropic: boolean;
    google: boolean;
    stability: boolean;
    bfl: boolean;
    replicate: boolean;
    fal: boolean;
  };
  // Istruzioni-extra globali: testo accodato a tutti i prompt. '' = nessun extra.
  extra: {
    textPrompt: string;
    imagePrompt: string;
  };
  imageStyle: Record<string, ImageStyleCfg>;
}

export type ImageStylePreset =
  | "graphic-novel"
  | "cel-anime"
  | "painterly"
  | "photorealistic"
  | "cinematic"
  | "watercolor"
  | "oil"
  | "3d-render"
  | "flat-vector"
  | "storybook"
  | "pencil-sketch"
  | "concept-art"
  | "line-art"
  | "custom";

export interface ImageStyleCfg {
  preset: ImageStylePreset;
  customStyle: string;
  intensity: number;
  vividness: number;
  steps: number | null;
  cfg: number | null;
}

// Patch PUT /settings/ai: sottoinsiemi opzionali. Le chiavi si inviano SOLO se digitate
// (string) o esplicitamente rimosse (null); assenti = invariate.
export interface AiSettingsPatch {
  text?: Partial<AiSettings["text"]>;
  image?: Partial<AiSettings["image"]>;
  keys?: {
    openai?: string | null;
    anthropic?: string | null;
    google?: string | null;
    stability?: string | null;
    bfl?: string | null;
    replicate?: string | null;
    fal?: string | null;
  };
  extra?: {
    textPrompt?: string;
    imagePrompt?: string;
  };
  imageStyle?: Record<string, Partial<ImageStyleCfg>>;
}

// Risposta di POST /settings/ai/models: elenco modelli del provider (vuoto su errore).
export interface AiModelsResponse {
  models: string[];
  error?: string;
}

// Risposta di GET /settings/ai/cli-status: stato del CLI di un provider ad abbonamento.
export interface CliStatus {
  tool: string;
  installed: boolean;
  version: string | null;
  error?: string;
}

// Corpo della richiesta POST /posts/:id/visual.
export interface VisualRequest {
  kind: VisualKind;
  template?: string;
  aspect?: VisualAspect;
  // Se vero (default), il backend può usare le immagini caricate del libro
  // come sfondo (card) o slideshow (reel); altrimenti genera solo testo.
  useImages?: boolean;
  // Traccia musicale opzionale per i reel; assente/omessa = silenzioso.
  musicId?: number | null;
}

// Spec prodotta dall'IA-regista (forma libera lato backend): la mostriamo solo
// come anteprima diagnostica, quindi resta volutamente permissiva.
export type VisualSpec = Record<string, unknown>;

export interface GenerateVisualResult {
  jobId: string;
  spec: VisualSpec;
}

// Job di render nella coda globale. GET /render-jobs restituisce la forma
// compatta; GET /render-jobs/:id aggiunge outputUrl/error a render concluso.
export interface RenderJob {
  id: string;
  kind: VisualKind;
  status: RenderStatus;
  postId: string;
  outputUrl?: string | null;
  error?: string | null;
}

export interface SpoilerPolicy {
  doNotReveal?: string[];
}

export interface BookProfile {
  bookId?: string;
  synopsis?: string | null;
  genres?: string[];
  tone?: string | null;
  themes?: string[];
  characters?: string[];
  conflicts?: string[];
  spoilerPolicy?: SpoilerPolicy | null;
}

// Scheda visiva del capitolo: ambiente/luogo, oggetti, personaggi presenti.
// Serve a fondare la generazione delle immagini ed è editabile dalla UI.
export interface ChapterScene {
  location: string | null;
  environment: string | null;
  mainObjects: string[];
  secondaryObjects: string[];
  characters: string[];
  // Regole di fisica/realismo specifiche del capitolo (oltre alla baseline universale):
  // vincoli che l'immagine deve rispettare (es. «la vela è sul lato opposto al vento»).
  physicsRules: string[];
  keyMoment: string | null;
  kind: ChapterSceneKind;
  youngerYears: number | null;
  characterAges?: CharacterAge[];
  altMoments?: ChapterMoment[];
  source: "AI" | "USER";
  model: string | null;
  updatedAt: number;
}

export interface CharacterAge {
  name: string;
  age: number;
}

export type ChapterSceneKind = "waking" | "dream" | "flashback";

export type ChapterMomentType = "dream" | "flashback";
export interface ChapterMoment {
  type: ChapterMomentType;
  location: string | null;
  environment: string | null;
  mainObjects: string[];
  secondaryObjects: string[];
  characters: string[];
  physicsRules: string[];
  keyMoment: string | null;
  whose: string | null;
  youngerYears: number | null;
  characterAges?: CharacterAge[];
}

export interface BookChapter {
  id: string;
  bookId?: string;
  index?: number;
  title?: string | null;
  summary?: string | null;
  scene?: ChapterScene | null; // null = non ancora estratta
  // true = capitolo escluso manualmente dai pool di generazione (immagini/contenuti).
  excluded?: boolean;
}

// Capitolo con il testo completo (tab "Capitoli" della scheda libro).
export interface BookChapterFull {
  id: string;
  index: number;
  title?: string | null;
  text: string;
  charCount: number;
  scene?: ChapterScene | null; // scheda visiva: null se non ancora estratta
  // true = capitolo escluso manualmente dai pool di generazione (immagini/contenuti).
  excluded?: boolean;
}

export type CharacterSource = "AI" | "USER";

// Personaggio del libro (tab "Personaggi"). I campi descrittivi sono opzionali:
// l'estrazione AI puo' lasciarli vuoti e l'utente puo' compilarli a mano.
export interface BookCharacter {
  id: string;
  bookId: string;
  name: string;
  role?: string | null;
  occupation?: string | null;
  personality?: string | null;
  physical?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  notes?: string | null;
  outfits?: CharacterOutfits;
  source: CharacterSource;
  sortOrder?: number;
  // Indici (0-based) dei capitoli in cui il personaggio compare; chapters.length = conteggio.
  chapters: number[];
}

// Campi modificabili di un personaggio (create/update).
export interface CharacterInput {
  name: string;
  role?: string;
  occupation?: string;
  personality?: string;
  physical?: string;
  age?: string;
  ethnicity?: string;
  notes?: string;
}

export type LinkChannel = string;

// Regola d'uso del link nei post generati: sempre, a volte, oppure manuale
// (inserito solo su scelta esplicita). Campo libero permissivo: può mancare
// per link creati prima dell'introduzione del campo.
export type LinkUsagePolicy = "always" | "sometimes" | "manual";

export interface BookLink {
  id: string;
  bookId?: string;
  channel: LinkChannel;
  label?: string | null;
  url: string;
  isDefault?: boolean;
  usagePolicy?: LinkUsagePolicy | null;
}

export type MediaScope = "GENERAL" | "CHAPTER";

// Esito del controllo qualità (QA) su un'immagine generata dall'AI.
// ok=true → nessun problema; ok=false → `issues` elenca le anomalie in italiano.
export interface SceneQa {
  ok: boolean;
  issues: string[];
}

export interface MediaUsage {
  total: number;
  reel: number;
  story: number;
  post: number;
}

export interface MediaAsset {
  id: string;
  bookId?: string;
  scope: MediaScope;
  chapterId?: string | null;
  caption?: string | null;
  url?: string | null;
  filename?: string | null;
  // Metadati di catalogazione delle immagini generate dall'AI.
  // chapterIdx: capitolo di riferimento; tags: soggetti/mood;
  // genPrompt: prompt completo (null per gli upload utente).
  chapterIdx: number | null;
  tags: string[];
  genPrompt: string | null;
  // Esito del controllo qualità: null = check non eseguito; ok=false = problemi trovati.
  qa?: SceneQa | null;
  usage?: MediaUsage;
}

export interface BookDetail {
  book: Book;
  profile: BookProfile | null;
  chapters: BookChapter[];
  links: BookLink[];
  media: MediaAsset[];
}

export type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type MediaType = "TEXT" | "LINK" | "PHOTO" | "REEL" | "STORY";

// Giorno della settimana lato slot, numerico: 1=Lunedi … 7=Domenica (contratto API).
export type SlotDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Slot del pianificatore. Può essere un orario singolo (timeOfDay) oppure una
// FASCIA oraria (timeStart + timeEnd, "HH:mm"). Quando è una fascia, il backend
// può lasciare timeOfDay nullo: l'editor invia timeStart/timeEnd.
export interface PostingSlot {
  id: string;
  pageId?: string;
  dayOfWeek: SlotDayOfWeek;
  timeOfDay?: string | null; // "HH:mm" (orario singolo)
  timeStart?: string | null; // "HH:mm" (inizio fascia)
  timeEnd?: string | null; // "HH:mm" (fine fascia)
  mediaType: MediaType;
  enabled?: boolean;
}

// Corpo per la creazione di uno slot. Per una FASCIA si inviano timeStart+timeEnd;
// per un orario singolo timeOfDay. Campi opzionali coerenti col contratto API.
export interface PostingSlotInput {
  dayOfWeek: SlotDayOfWeek;
  timeOfDay?: string;
  timeStart?: string;
  timeEnd?: string;
  mediaType?: MediaType;
  enabled?: boolean;
}

export type PostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED" | string;

// Formato editoriale scelto per la bozza: combina modalità testo, tipo di visual,
// natura del contenuto visivo e proporzione. Tutti i campi possono mancare:
// la UI degrada e mostra solo i badge disponibili.
export type TextMode = "full" | "short" | "none";
export type ContentVisualKind = "none" | "card" | "storyboard" | "reel" | "story";
export type VisualContent = "text" | "images" | "mixed";

export interface ContentFormat {
  textMode: TextMode;
  visualKind: ContentVisualKind;
  visualContent: VisualContent;
  aspect: VisualAspect | null;
}

export interface ScheduledPost {
  id: string;
  pageId?: string;
  bookId?: string;
  status: PostStatus;
  angle?: string | null;
  body?: string | null;
  baseHashtags?: string[];
  specificHashtags?: string[];
  finalHashtags?: string[];
  mediaType?: MediaType | null;
  musicId?: number | null;
  contentFormat?: ContentFormat | null;
  // true quando un visual è già renderizzato e attaccato alla bozza (mediaPath presente):
  // condizione necessaria per pubblicare come Storia.
  hasMedia?: boolean;
  // URL del visual renderizzato (es. "/api/posts/123/media"), usabile diretto in
  // <img src> / <video src>. null/assente finché il render non è pronto.
  mediaUrl?: string | null;
  // Natura del media renderizzato: immagine o video. Guida la scelta del tag.
  mediaKind?: "image" | "video" | null;
  scheduledAt?: number | null;
  createdAt?: number | null;
  fbPostId?: string | null;
  errorMessage?: string | null;
  // Piattaforma di pubblicazione del job programmato. Default 'facebook'.
  // Le righe 'instagram' sono job gemelli creati da un post FB Reel/Storia.
  platform?: "facebook" | "instagram";
  // Solo per le righe IG: id del post Facebook gemello da cui deriva il job.
  linkedPostId?: string | null;
  // Solo per le righe IG: id del media pubblicato su Instagram (quando presente).
  igMediaId?: string | null;
  // Nascosto dalle viste Dashboard: post pubblicato che l'utente non vuole più vedere.
  dashboardHidden?: boolean;
}

// Periodo di generazione passato a POST /planner/generate-week. `week`=7 giorni,
// `month`≈28 giorni, `custom`=range da `start` a `end` (inclusi, formato YYYY-MM-DD).
// `start` default = oggi se omesso; per `custom` servono entrambe le date.
export interface GeneratePeriod {
  kind: "week" | "month" | "custom";
  start?: string;
  end?: string;
}

// La generazione settimana è ASINCRONA: POST /planner/generate-week parte in
// background e ritorna subito. `started` indica se la generazione è partita;
// `alreadyRunning` è true quando ce n'è già una in corso per quella pagina.
export interface GenerateWeekResult {
  started: boolean;
  alreadyRunning?: boolean;
}

// Stato della generazione settimana per una pagina (GET /pages/:id/weekgen).
// `planned`/`created` danno l'avanzamento; `reason`/`messages` riepilogano
// l'esito (es. tutti duplicati); `error` è valorizzato quando status='failed'.
export interface WeekGenStatus {
  status: "idle" | "generating" | "ready" | "failed";
  planned: number;
  created: number;
  reason: string | null;
  messages: string[] | null;
  error: string | null;
  startedAt: number;
}

// Quote settimanali: quante pubblicazioni l'utente vuole a settimana per tipo.
// Il motore backend decide automaticamente giorni, orari e formati.
export interface WeeklyPlan {
  postsPerWeek: number;
  reelsPerWeek: number;
  storiesPerWeek: number;
}

// --- Insight per pagina Facebook ---

export interface InsightMetric {
  metric: string;
  value: number;
  periodEnd: string;
}

export interface PageTotals {
  followersCount: number;
  fanCount: number;
  name: string;
}

export interface FollowerTrendPoint {
  date: number; // epoch ms (mezzanotte UTC del giorno)
  follows: number;
  unfollows: number;
}

export interface PageInsights {
  pageId: string;
  fetchedAt: string;
  totals: PageTotals | null;
  metrics: InsightMetric[];
  followerTrend: FollowerTrendPoint[];
  error?: string | null;
}

export interface InsightSnapshot {
  metric: string;
  value: number;
  periodEnd: string;
  fetchedAt: string;
}

export interface PageInsightsHistory {
  pageId: string;
  snapshots: InsightSnapshot[];
}

// --- Top post per pagina Facebook ---

export interface TopPost {
  id: string;
  message?: string | null;
  createdTime: string;
  permalinkUrl?: string | null;
  pictureUrl?: string | null;
  impressions: number;
  reach: number;
  engagedUsers: number;
  reactions?: number;
  comments?: number;
  shares?: number;
}

export interface PageTopPosts {
  pageId: string;
  posts: TopPost[];
  error?: string | null;
}

// --- Dettagli modificabili di una pagina Facebook ---

export interface PageDetails {
  pageId: string;
  name: string;
  about?: string | null;
  description?: string | null;
  website?: string | null;
  phone?: string | null;
  emails?: string[];
  isPublished: boolean;
  cover?: { url: string } | null;
  error?: string | null;
}

export interface PageSettingsPatch {
  about?: string;
  description?: string;
  website?: string;
  phone?: string;
  emails?: string[];
  isPublished?: boolean;
}

// --- Gestione pagina: post pubblicati, commenti, pubblicazione nativa ---

export interface ManagedPost {
  id: string;
  message?: string | null;
  createdTime: string;
  permalinkUrl?: string | null;
  pictureUrl?: string | null;
  isPublished: boolean;
  pinned: boolean;
}

export interface ManagedPosts {
  pageId: string;
  posts: ManagedPost[];
  error?: string | null;
}

export interface PostComment {
  id: string;
  message?: string | null;
  fromName?: string | null;
  createdTime: string;
  likeCount: number;
  isHidden: boolean;
}

export interface PostComments {
  comments: PostComment[];
  error?: string | null;
}

// --- Instagram (tab IG: account, insight, media, commenti) ---

export interface IgAccount {
  id: string;
  username: string | null;
  name: string | null;
  biography: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
}

export interface IgAccountResponse {
  pageId: string;
  igUserId?: string;
  account: IgAccount | null;
  error?: string | null;
}

export interface IgInsightMetric {
  metric: string;
  value: number | null;
  error?: string;
}

export interface IgInsightsResponse {
  pageId: string;
  igUserId?: string;
  metrics: IgInsightMetric[];
  error?: string | null;
}

export interface IgMedia {
  id: string;
  caption: string | null;
  mediaType: string | null; // IMAGE | VIDEO | CAROUSEL_ALBUM
  mediaProductType: string | null; // FEED | REELS | STORY
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  likeCount: number | null;
  commentsCount: number | null;
}

export interface IgMediaResponse {
  pageId: string;
  media: IgMedia[];
  error?: string | null;
}

export interface IgComment {
  id: string;
  text: string | null;
  username: string | null;
  timestamp: string | null;
  likeCount: number;
  hidden: boolean;
  replies: IgComment[];
}

export interface IgComments {
  comments: IgComment[];
  error?: string | null;
}

export interface PublishNativeInput {
  message: string;
  link?: string;
  scheduledPublishTime?: number; // epoch SECONDS per la programmazione nativa FB
}

export interface PublishNativeResult {
  ok: boolean;
  fbPostId?: string | null;
  error?: string | null;
}

export interface MutationResult {
  ok: boolean;
  error?: string | null;
}

export interface ScheduledFbPost {
  id: string;
  message: string | null;
  scheduledPublishTime: number | null; // unix seconds
  createdTime: string | null;
  permalinkUrl: string | null;
  pictureUrl: string | null;
  mediaType: string | null;
}

export interface ScheduledFbPosts {
  pageId: string;
  posts: ScheduledFbPost[];
  error?: string;
}

// --- Insight avanzati ---

export interface CoverageTrendPoint {
  date: number; // epoch ms (mezzanotte del giorno)
  value: number;
}

export interface CoverageTrend {
  pageId: string;
  points: CoverageTrendPoint[];
  error?: string | null;
}

export interface DemographicEntry {
  key: string;
  value: number;
}

export interface Demographics {
  pageId: string;
  countries: DemographicEntry[];
  genderAge: DemographicEntry[];
  cities: DemographicEntry[];
  error?: string | null;
}

export interface UpdatePageSettingsResult {
  ok: boolean;
  updated?: Partial<PageSettingsPatch>;
  error?: string;
}

// --- Statistiche d'uso dei contenuti (Dashboard) ---

export interface UsageStats {
  totalContents: number;
  byVisualKind: Record<string, number>;
  byTextMode: Record<string, number>;
  byAspect: Record<string, number>;
  recentImageIds: number[];
  leastUsedImageIds: number[];
  recentQuoteKeys: string[];
}

// --- Libreria musicale ---

export interface Music {
  id: number;
  title: string;
  durationSec: number | null;
  mood: string | null;
  addedAt: number;
  url: string; // già prefissato /api/...
  usage?: { total: number; reel: number; story: number };
}

// --- Pubblicazione come Storia (effimera 24h) ---

export interface PublishStoryResult {
  ok: boolean;
  fbStoryId?: string | null;
  error?: string | null;
}

// --- Pubblicazione UNIFICATA (foto→post-foto, video→Reel, storia→story, altrimenti testo) ---
// Senza scheduledAt pubblica ADESSO (ritorna fbPostId); con scheduledAt (epoch ms
// nel futuro) PROGRAMMA (ritorna scheduled:true + scheduledAt). Pubblicazione REALE.
export interface PublishResult {
  ok: true;
  fbPostId?: string;
  scheduled?: boolean;
  scheduledAt?: number;
}

// --- Programmazione in blocco: porta tutte le bozze DRAFT con orario FUTURO a
// SCHEDULED (le pubblica un job interno alle loro date). NON pubblica nulla adesso.
// `scheduled` = quante programmate; `skipped` = bozze con orario già passato/assente.
export interface ScheduleDraftsResult {
  ok: true;
  scheduled: number; // totale programmati (fbScheduled + jobScheduled)
  fbScheduled?: number; // post programmati NATIVAMENTE su Facebook (testo/foto)
  jobScheduled?: number; // reel/storie (+ fallback) gestiti dal job interno
  skipped: number; // orario già passato/assente
  messages?: string[]; // eventuali avvisi (es. programmazione nativa fallita → job interno)
}
