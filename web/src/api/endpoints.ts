import { apiGet, apiPost, apiPut, apiDelete, apiUpload } from "./client";
import type {
  AppStatus,
  BackgroundJob,
  Book,
  BookChapterFull,
  BookVisualExtras,
  BookVisualProps,
  ChapterScene,
  BookCharacter,
  BookDetail,
  BookLink,
  CharacterInput,
  CharacterOutfits,
  CoverageTrend,
  Demographics,
  IgAccountResponse,
  IgInsightsResponse,
  IgMediaResponse,
  IgComments,
  AiImageMode,
  AiImageModeState,
  AiModelsResponse,
  AiSettings,
  AiSettingsPatch,
  CliLoginResponse,
  CliStatus,
  FacebookPage,
  GenerateImagesResult,
  GeneratePeriod,
  GenerateVisualResult,
  GenerateWeekResult,
  LinkUsagePolicy,
  ManagedPage,
  MediaAsset,
  MediaRegenStatusGlobal,
  ManagedPosts,
  MediaScope,
  MediaType,
  Music,
  MutationResult,
  PageDetails,
  PageInsights,
  PageInsightsHistory,
  PageSettingsPatch,
  PageTopPosts,
  PostComments,
  PostingSlot,
  PostingSlotInput,
  PublishNativeInput,
  PublishNativeResult,
  PublishResult,
  PublishStoryResult,
  RenderJob,
  SceneAspect,
  SceneGenStatus,
  ScheduleDraftsResult,
  ScheduledFbPosts,
  ScheduledPost,
  UpdatePageSettingsResult,
  UsageStats,
  VisualDomainInfo,
  VisualRequest,
  WeeklyPlan,
  WeekGenStatus,
} from "./types";

// --- Stato / lettura ---
export const getHealth = () => apiGet<{ status: string }>("/health");
export const getStatus = (signal?: AbortSignal) => apiGet<AppStatus>("/status", signal);
export const getPages = (signal?: AbortSignal) => apiGet<FacebookPage[]>("/pages", signal);
export const getBooks = (signal?: AbortSignal) => apiGet<Book[]>("/books", signal);
export const getBook = (id: string, signal?: AbortSignal) =>
  apiGet<BookDetail>(`/books/${id}`, signal);

// --- Connessione ---
export const fetchManagedPages = (token: string) =>
  apiPost<ManagedPage[]>("/connection/pages", { token });
export const saveConnection = (pages: ManagedPage[]) =>
  apiPost<{ saved: number }>("/connection/save", { pages });
export const removePage = (id: string) => apiDelete<{ ok: boolean }>(`/pages/${id}`);
export const disconnectAll = () => apiPost<{ ok: boolean }>("/connection/disconnect");

// --- Libri ---
export function importBook(
  file: File,
  opts: { author?: string; language?: string } = {},
  signal?: AbortSignal,
) {
  const form = new FormData();
  form.append("file", file);
  if (opts.author) form.append("author", opts.author);
  if (opts.language) form.append("language", opts.language);
  return apiUpload<Book>("/books/import", form, signal);
}

// Importa il libro campione bundlato (onboarding/empty-state). Nessun upload: il server
// risolve il file da samples/ e riusa la stessa logica di import + analisi in background.
export const importSampleBook = (signal?: AbortSignal) =>
  apiPost<Book>("/books/import-sample", {}, signal);

export type AnalysisStatus = "analyzing" | "ready" | "failed" | "idle";
export const getAnalysisStatus = (id: string, signal?: AbortSignal) =>
  apiGet<{ status: AnalysisStatus; error: string | null }>(`/books/${id}/analysis-status`, signal);

export const renameBook = (
  id: string,
  patch: {
    title?: string;
    baseHashtags?: string[];
    visualDomains?: string[];
    visualDirectives?: string | null;
    visualProps?: BookVisualProps;
    visualExtras?: BookVisualExtras;
  },
) => apiPut<Book>(`/books/${id}`, patch);

// --- Canone visivo: generazione testuale di aspetti/abiti/oggetti/minori ---
// NB: queste rigenerano SOLO il canone testuale, non immagini. generate-minors è lenta
// (scansione per capitolo, può richiedere qualche minuto).
export const generateCharacterAppearance = (bookId: string, onlyWeak = false) =>
  apiPost<{ updated: string[]; characters: BookCharacter[] }>(
    `/books/${bookId}/characters/generate-appearance`,
    { onlyWeak },
  );
export const generateCharacterOutfits = (bookId: string) =>
  apiPost<{ updated: string[]; characters: BookCharacter[] }>(
    `/books/${bookId}/characters/generate-outfits`,
    {},
  );
export const generateBookProps = (bookId: string) =>
  apiPost<Book>(`/books/${bookId}/generate-props`, {});
export const generateBookMinors = (bookId: string) =>
  apiPost<Book>(`/books/${bookId}/generate-minors`, {});

export const getVisualDomains = (signal?: AbortSignal) =>
  apiGet<{ domains: VisualDomainInfo[] }>(`/visual-domains`, signal);

export const deleteBook = (id: string) => apiDelete<{ ok: boolean }>(`/books/${id}`);

export const linkBookToPage = (bookId: string, pageId: string, linked: boolean) =>
  apiPost<{ ok: boolean }>(`/books/${bookId}/pages`, { pageId, linked });

export const getBookLinks = (bookId: string) => apiGet<BookLink[]>(`/books/${bookId}/links`);

export const addBookLink = (
  bookId: string,
  link: {
    channel: string;
    label?: string;
    url: string;
    isDefault?: boolean;
    usagePolicy?: LinkUsagePolicy;
  },
) => apiPost<BookLink>(`/books/${bookId}/links`, link);

export const updateBookLink = (
  bookId: string,
  linkId: string,
  patch: {
    channel?: string;
    label?: string;
    url?: string;
    isDefault?: boolean;
    usagePolicy?: LinkUsagePolicy;
  },
) => apiPut<BookLink>(`/books/${bookId}/links/${linkId}`, patch);

export const deleteBookLink = (bookId: string, linkId: string) =>
  apiDelete<{ ok: boolean }>(`/books/${bookId}/links/${linkId}`);

export const getBookMedia = (bookId: string) => apiGet<MediaAsset[]>(`/books/${bookId}/media`);

export function uploadBookMedia(
  bookId: string,
  file: File,
  opts: { scope: MediaScope; chapterId?: string; caption?: string },
  signal?: AbortSignal,
) {
  const form = new FormData();
  form.append("file", file);
  form.append("scope", opts.scope);
  if (opts.chapterId) form.append("chapterId", opts.chapterId);
  if (opts.caption) form.append("caption", opts.caption);
  return apiUpload<MediaAsset>(`/books/${bookId}/media`, form, signal);
}

export const deleteBookMedia = (bookId: string, mediaId: string) =>
  apiDelete<{ ok: boolean }>(`/books/${bookId}/media/${mediaId}`);

// Modifica la catalogazione (tag + capitolo) di un'immagine: arricchisce i dati usati dalla
// selezione per pertinenza (utile soprattutto sugli upload, che di base non hanno tag/capitolo).
export const updateMediaCatalog = (
  mediaId: string,
  body: { tags?: string[]; chapterIdx?: number | null },
) => apiPut<MediaAsset>(`/media/${mediaId}/catalog`, body);

// --- Rigenerazione di una singola immagine generata dall'AI (async, ~minuti) ---
// Senza `prompt` riusa quello salvato; con `prompt` rigenera con uno nuovo.
// Errori: 404 (non trovata), 400 (non rigenerabile), 503 (motore assente), 409 (già in corso).
// Rigenera l'immagine. `changes` (testo in ITALIANO) = modifiche da applicare: il server fonde
// (vecchio prompt + modifiche) in un nuovo prompt. `prompt` = override diretto del prompt (avanzato).
// `rebuild` = ricostruisci il prompt dal CAPITOLO con la pipeline attuale (applica le regole
// aggiornate: fisica/realismo, postura windsurf, ecc.) invece di riusare quello salvato.
export const regenerateMediaImage = (
  mediaId: string,
  body?: {
    prompt?: string;
    changes?: string;
    rebuild?: boolean;
    characters?: string[];
    // Override FLASHBACK/ricordo: rende i personaggi più giovani e vestiti d'epoca (scavalca età e
    // outfit canonici). Forza la ricostruzione dal capitolo lato server.
    flashback?: { youngerYears?: number; setting?: string; note?: string };
    verify?: boolean;
  },
) =>
  apiPost<{ started: true }>(`/media/${mediaId}/regenerate`, {
    ...(body?.prompt !== undefined ? { prompt: body.prompt } : {}),
    ...(body?.changes !== undefined ? { changes: body.changes } : {}),
    ...(body?.rebuild ? { rebuild: true } : {}),
    ...(body?.characters && body.characters.length ? { characters: body.characters } : {}),
    ...(body?.flashback ? { flashback: body.flashback } : {}),
    ...(body?.verify ? { verify: true } : {}),
  });

export const getMediaRegenStatus = (mediaId: string, signal?: AbortSignal) =>
  apiGet<{ regenerating: boolean }>(`/media/${mediaId}/regen-status`, signal);

export const cancelMediaRegen = (mediaId: string) =>
  apiPost<{ cancelled: boolean }>(`/media/${mediaId}/regenerate/cancel`);

// Stato GLOBALE della coda di rigenerazione (immagine in corso + coda). Serve per i
// badge sulla griglia e i cronometri a tempo reale senza poll per-immagine.
export const getMediaRegenStatusGlobal = (signal?: AbortSignal) =>
  apiGet<MediaRegenStatusGlobal>("/media/regen-status", signal);

// Accoda la rigenerazione di PIÙ immagini in un colpo solo (con eventuali `changes` in IT
// condivise). Ritorna quante ne sono state messe in coda.
export const regenerateMediaBatch = (body: {
  mediaIds: number[];
  changes?: string;
  verify?: boolean;
}) =>
  apiPost<{ queued: number }>("/media/regenerate-batch", {
    mediaIds: body.mediaIds,
    ...(body.changes !== undefined ? { changes: body.changes } : {}),
    ...(body.verify ? { verify: true } : {}),
  });

// Annulla TUTTE le rigenerazioni (quella in corso + l'intera coda).
export const cancelAllMediaRegen = () =>
  apiPost<{ cancelled: true }>("/media/regenerate/cancel-all");

// --- Generazione immagini AI di scena (motore locale, lenta e asincrona) ---

// Disponibilità del motore locale: se false, NON mostrare i controlli di generazione.
export const imageGenAvailable = (signal?: AbortSignal) =>
  apiGet<{ available: boolean }>("/imagegen/available", signal);

// ACCODA un batch di generazione (count immagini per ciascun capitolo scelto; chapters vuoto = Auto,
// count totale su capitoli vari). Se una generazione è già in corso il batch si aggiunge alla coda.
// `characters` (opzionale, = nomi dal cast): genera immagini che FEATURANO quei personaggi sui
// capitoli dove compaiono (vale sia in Auto con chapters vuoto, sia coi capitoli selezionati).
// Avanzamento via getSceneGen. Errori: 503 (motore assente), 400 (personaggio non nel cast).
export const generateBookImages = (
  bookId: string,
  body: {
    count: number;
    aspect: SceneAspect;
    chapters: number[];
    characters?: string[];
    // Override FLASHBACK/ricordo (opzionale): scena del passato → personaggi più giovani e vestiti
    // per l'epoca, scavalcando età e outfit canonici per le immagini di questo batch.
    flashback?: { youngerYears?: number; setting?: string; note?: string };
  },
) => apiPost<GenerateImagesResult>(`/books/${bookId}/generate-images`, body);

// Stato di avanzamento della generazione immagini di scena per un libro.
export const getSceneGen = (bookId: string, signal?: AbortSignal) =>
  apiGet<SceneGenStatus>(`/books/${bookId}/scenegen`, signal);

// Annulla la generazione immagini di scena del libro (killa subito sd-cli).
export const cancelBookImages = (bookId: string) =>
  apiPost<{ cancelled: boolean }>(`/books/${bookId}/generate-images/cancel`);

// --- Impostazioni: modalità immagini dei contenuti ---
export const getAiImageMode = (signal?: AbortSignal) =>
  apiGet<AiImageModeState>("/settings/ai-image-mode", signal);

export const setAiImageMode = (mode: AiImageMode) =>
  apiPut<{ mode: AiImageMode }>("/settings/ai-image-mode", { mode });

// --- Impostazioni: controllo qualità immagini (QA-check) ---
export const getQaCheck = (signal?: AbortSignal) =>
  apiGet<{ enabled: boolean }>("/settings/qa-check", signal);

export const setQaCheck = (enabled: boolean) =>
  apiPut<{ enabled: boolean }>("/settings/qa-check", { enabled });

// --- Impostazioni: provider AI (testo + immagini) ---
// Il GET non restituisce mai i valori delle chiavi: solo keys.* boolean ("configurata").
export const getAiSettings = (signal?: AbortSignal) => apiGet<AiSettings>("/settings/ai", signal);

// Il PUT accetta sottoinsiemi; le chiavi vanno inviate SOLO se digitate (string) o rimosse (null).
export const updateAiSettings = (body: AiSettingsPatch) => apiPut<AiSettings>("/settings/ai", body);

// Esito del test connessione provider. HTTP 200 sempre: l'esito vero è in `ok`.
export interface AiTestResult {
  ok: boolean;
  provider: string;
  sample?: string;
  error?: string;
}

// Prova il motore TESTO corrente (mini-chiamata "Reply with: OK").
export const testAiText = (signal?: AbortSignal) =>
  apiPost<AiTestResult>("/settings/ai/test-text", {}, signal);

// Prova la raggiungibilità/auth del provider IMMAGINI corrente (nessuna generazione vera).
export const testAiImage = (signal?: AbortSignal) =>
  apiPost<AiTestResult>("/settings/ai/test-image", {}, signal);

// Elenca i modelli disponibili per un provider testo a connessione. La chiave/baseUrl
// opzionali permettono di interrogare il provider anche prima di salvarli.
export const listAiModels = (provider: string, apiKey?: string, baseUrl?: string) =>
  apiPost<AiModelsResponse>("/settings/ai/models", {
    provider,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  });

// Stato del CLI di un provider ad abbonamento (opencode|codex|gemini): installato + versione.
export const getCliStatus = (tool: string, signal?: AbortSignal) =>
  apiGet<CliStatus>(`/settings/ai/cli-status?tool=${encodeURIComponent(tool)}`, signal);

// Avvia il login OAuth di un CLI ad abbonamento (opencode|codex|gemini). L'auth vive nel CLI:
// l'app non salva token. La risposta può portare un `url` da aprire e autorizzare nel browser.
export const cliLogin = (tool: string) =>
  apiPost<CliLoginResponse>("/settings/ai/cli-login", { tool });

// --- Capitoli (testo completo) ---
export const getChapters = (bookId: string, signal?: AbortSignal) =>
  apiGet<BookChapterFull[]>(`/books/${bookId}/chapters`, signal);

// --- Schede visive capitolo: ambiente / oggetti / personaggi ---
export const getChapterScene = (bookId: string, idx: number, signal?: AbortSignal) =>
  apiGet<{ scene: ChapterScene }>(`/books/${bookId}/chapters/${idx}/scene`, signal);

export const generateChapterScene = (bookId: string, idx: number) =>
  apiPost<{ scene: ChapterScene }>(`/books/${bookId}/chapters/${idx}/scene/generate`, {});

export const updateChapterScene = (
  bookId: string,
  idx: number,
  patch: Partial<
    Pick<
      ChapterScene,
      | "location"
      | "environment"
      | "mainObjects"
      | "secondaryObjects"
      | "characters"
      | "physicsRules"
    >
  >,
) => apiPut<{ scene: ChapterScene }>(`/books/${bookId}/chapters/${idx}/scene`, patch);

// Esclude/include un capitolo dai pool di generazione (immagini/contenuti).
export const setChapterExcluded = (bookId: string, idx: number, excluded: boolean) =>
  apiPost<{ ok: true; excluded: boolean }>(`/books/${bookId}/chapters/${idx}/excluded`, {
    excluded,
  });

// --- Bibbia visiva (build resumable, multi-step) ---
// Avvia la costruzione del canone visivo. `steps` opzionale = costruisce solo quegli step;
// assente/vuoto = costruisce tutto. 409 se un build è già in corso. Avanzamento via
// getVisualBibleStatus (polling, sopravvive ai cambi pagina).
export type VBStepKey = "appearance" | "sceneCards" | "outfits" | "props" | "minors" | "presence";
export interface VBStep {
  key: VBStepKey;
  label: string;
  status: "pending" | "running" | "done" | "failed";
  done: number;
  total: number;
}
export interface VisualBibleStatus {
  bookId: number;
  status: "running" | "done" | "failed" | "idle";
  steps: VBStep[];
  startedAt: number;
  updatedAt: number;
  error: string | null;
}
export const buildVisualBible = (bookId: string, steps?: VBStepKey[]) =>
  apiPost<{ started: true }>(
    `/books/${bookId}/build-visual-bible`,
    steps && steps.length ? { steps } : {},
  );
export const getVisualBibleStatus = (bookId: string, signal?: AbortSignal) =>
  apiGet<VisualBibleStatus>(`/books/${bookId}/visual-bible-status`, signal);

// --- Personaggi ---
export const getCharacters = (bookId: string, signal?: AbortSignal) =>
  apiGet<BookCharacter[]>(`/books/${bookId}/characters`, signal);

export const addCharacter = (bookId: string, input: CharacterInput) =>
  apiPost<BookCharacter>(`/books/${bookId}/characters`, input);

export const updateCharacter = (
  characterId: string,
  patch: Partial<CharacterInput> & {
    physical?: string | null;
    outfits?: CharacterOutfits;
  },
) => apiPut<BookCharacter>(`/characters/${characterId}`, patch);

export const deleteCharacter = (characterId: string) =>
  apiDelete<{ ok: boolean }>(`/characters/${characterId}`);

// Ricalcola in modo completo i capitoli in cui compare ciascun personaggio (può richiedere ~1 min:
// almeno una chiamata GPT per capitolo). Ritorna il cast aggiornato (stesso shape di getCharacters).
export const recomputeCharacterChapters = (bookId: string) =>
  apiPost<{ characters: BookCharacter[] }>(`/books/${bookId}/recompute-character-chapters`);

// --- Ri-analisi AI (rigenera scheda + personaggi) ---
export const reanalyzeBook = (bookId: string, language?: string) =>
  apiPost<{ status: AnalysisStatus }>(
    `/books/${bookId}/reanalyze`,
    language != null ? { language } : undefined,
  );

// --- Attività in background (job in corso, es. analisi AI) ---
export const getActiveJobs = (signal?: AbortSignal) =>
  apiGet<{ jobs: BackgroundJob[] }>("/jobs", signal);

// --- Pianificatore ---
export const getSlots = (pageId: string, signal?: AbortSignal) =>
  apiGet<PostingSlot[]>(`/pages/${pageId}/slots`, signal);

export const addSlot = (pageId: string, slot: PostingSlotInput) =>
  apiPost<PostingSlot>(`/pages/${pageId}/slots`, slot);

export const deleteSlot = (slotId: string) => apiDelete<{ ok: boolean }>(`/slots/${slotId}`);

// Quote settimanali: quante pubblicazioni a settimana per tipo (post/reel/storie).
// Il backend ritorna default sensati se non ancora impostate.
export const getWeeklyPlan = (pageId: string, signal?: AbortSignal) =>
  apiGet<WeeklyPlan>(`/pages/${pageId}/weekly-plan`, signal);

export const saveWeeklyPlan = (pageId: string, plan: WeeklyPlan) =>
  apiPut<WeeklyPlan>(`/pages/${pageId}/weekly-plan`, plan);

// Avvia la generazione IN BACKGROUND: ritorna subito { started }.
// Se ne esiste già una in corso per la pagina, { started:false, alreadyRunning:true }.
// `period` (opzionale) sceglie l'orizzonte: settimana (default), mese o range custom.
export const generateWeek = (pageId: string, bookId: string, period?: GeneratePeriod) =>
  apiPost<GenerateWeekResult>("/planner/generate-week", {
    pageId,
    bookId,
    ...(period ? { period } : {}),
  });

// Stato di avanzamento della generazione settimana per una pagina.
export const getWeekGenStatus = (pageId: string, signal?: AbortSignal) =>
  apiGet<WeekGenStatus>(`/pages/${pageId}/weekgen`, signal);

// Annulla la generazione del programma/settimana della pagina (si ferma al
// prossimo contenuto; le bozze già create restano).
export const cancelWeekGen = (pageId: string) =>
  apiPost<{ cancelled: boolean }>(`/pages/${pageId}/generate-week/cancel`);

// --- Statistiche d'uso dei contenuti (Dashboard) ---
export const getUsageStats = (pageId: string, signal?: AbortSignal) =>
  apiGet<UsageStats>(`/pages/${pageId}/usage-stats`, signal);

// --- Libreria musicale ---
export const getMusic = (signal?: AbortSignal) => apiGet<Music[]>("/music", signal);

// Tracce musicali di UN libro specifico (la musica è per-libro).
export const getBookMusic = (bookId: string, signal?: AbortSignal) =>
  apiGet<Music[]>(`/books/${bookId}/music`, signal);

export function uploadMusic(
  file: File,
  opts: { title?: string; mood?: string; bookId?: string } = {},
  signal?: AbortSignal,
) {
  const form = new FormData();
  form.append("file", file);
  if (opts.title) form.append("title", opts.title);
  if (opts.mood) form.append("mood", opts.mood);
  if (opts.bookId) form.append("bookId", opts.bookId);
  return apiUpload<Music>("/music", form, signal);
}

export const deleteMusic = (id: number) => apiDelete<{ ok: boolean }>(`/music/${id}`);

// --- Pubblicazione come Storia (effimera 24h) — SOLO dietro conferma esplicita. ---
export const publishStory = (postId: string) =>
  apiPost<PublishStoryResult>(`/posts/${postId}/publish-story`);

// --- Pubblicazione UNIFICATA della bozza CON il suo media — SOLO dietro conferma esplicita. ---
// Senza scheduledAt: pubblica ADESSO. Con scheduledAt (epoch ms nel futuro): PROGRAMMA.
export const publishPost = (postId: string, scheduledAt?: number) =>
  apiPost<PublishResult>(
    `/posts/${postId}/publish`,
    scheduledAt !== undefined ? { scheduledAt } : {},
  );

// --- Programmazione in blocco di tutte le bozze DRAFT della pagina (orario futuro
// → SCHEDULED, pubblicate da un job interno alle loro date). NON pubblica adesso. ---
export const scheduleDrafts = (pageId: string) =>
  apiPost<ScheduleDraftsResult>(`/pages/${pageId}/schedule-drafts`, {});

// --- Post ---
export const getPagePosts = (pageId: string, signal?: AbortSignal) =>
  apiGet<ScheduledPost[]>(`/pages/${pageId}/posts`, signal);

export const generatePost = (input: {
  bookId: string;
  pageId?: string;
  angle: string;
  mediaType?: MediaType;
}) => apiPost<ScheduledPost>("/posts/generate", input);

// --- Bozze: modifica / elimina / rigenera ---
export interface DraftPatch {
  message?: string;
  hashtags?: string[];
  scheduledAt?: number; // epoch ms
  mediaType?: MediaType;
}

export const updateDraft = (id: string, patch: DraftPatch) =>
  apiPut<ScheduledPost>(`/posts/${id}`, patch);

export const deleteDraft = (id: string) => apiDelete<{ ok: boolean }>(`/posts/${id}`);

export const regenerateDraft = (id: string, angle?: string) =>
  apiPost<ScheduledPost>(`/posts/${id}/regenerate`, angle ? { angle } : {});

// --- Genera visual: spec IA + render in coda + asset allegato alla bozza ---
// Accoda un render per la bozza; la coda si segue via getRenderJobs/getRenderJob
// (e i job compaiono anche nell'indicatore globale /jobs con kind 'render').
export const generateVisual = (postId: string, body: VisualRequest) =>
  apiPost<GenerateVisualResult>(`/posts/${postId}/visual`, body);

export const getRenderJobs = (signal?: AbortSignal) => apiGet<RenderJob[]>("/render-jobs", signal);

export const getRenderJob = (id: string, signal?: AbortSignal) =>
  apiGet<RenderJob>(`/render-jobs/${id}`, signal);

// URL pubblico di un media_asset (immagine/video del visual generato), servito
// come gli altri media. Relativo a /api così da passare per il proxy Vite.
export const mediaFileUrl = (mediaId: string) => `/api/media/file/${mediaId}`;

// --- Insight per pagina Facebook ---
export const getPageInsights = (pageId: string, period?: string, signal?: AbortSignal) =>
  apiGet<PageInsights>(
    `/pages/${pageId}/insights${period ? `?period=${encodeURIComponent(period)}` : ""}`,
    signal,
  );

export const getPageInsightsHistory = (pageId: string, signal?: AbortSignal) =>
  apiGet<PageInsightsHistory>(`/pages/${pageId}/insights/history`, signal);

export const getPageTopPosts = (pageId: string, limit = 10, signal?: AbortSignal) =>
  apiGet<PageTopPosts>(`/pages/${pageId}/top-posts?limit=${limit}`, signal);

// --- Impostazioni pagina Facebook ---
export const getPageDetails = (pageId: string, signal?: AbortSignal) =>
  apiGet<PageDetails>(`/pages/${pageId}/details`, signal);

export const updatePageSettings = (pageId: string, patch: PageSettingsPatch) =>
  apiPost<UpdatePageSettingsResult>(`/pages/${pageId}/settings`, patch);

export function uploadPageCover(pageId: string, file: File, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<{ ok: boolean; coverUrl?: string | null; error?: string }>(
    `/pages/${pageId}/cover`,
    form,
    signal,
  );
}

// --- Gestione pagina: post pubblicati ---
export const getManagedPosts = (pageId: string, signal?: AbortSignal) =>
  apiGet<ManagedPosts>(`/pages/${pageId}/managed-posts`, signal);

export const editPostMessage = (pageId: string, postId: string, message: string) =>
  apiPost<MutationResult>(`/pages/${pageId}/posts/${postId}/edit`, { message });

export const deletePost = (pageId: string, postId: string) =>
  apiDelete<MutationResult>(`/pages/${pageId}/posts/${postId}`);

export const setPostPinned = (pageId: string, postId: string, pinned: boolean) =>
  apiPost<MutationResult>(`/pages/${pageId}/posts/${postId}/pin`, { pinned });

export const publishNative = (pageId: string, input: PublishNativeInput) =>
  apiPost<PublishNativeResult>(`/pages/${pageId}/publish`, input);

// --- Gestione pagina: commenti ---
export const getPostComments = (pageId: string, postId: string, signal?: AbortSignal) =>
  apiGet<PostComments>(`/pages/${pageId}/posts/${postId}/comments`, signal);

export const replyComment = (pageId: string, commentId: string, message: string) =>
  apiPost<MutationResult>(`/pages/${pageId}/comments/${commentId}/reply`, {
    message,
  });

export const hideComment = (pageId: string, commentId: string, hidden: boolean) =>
  apiPost<MutationResult>(`/pages/${pageId}/comments/${commentId}/hide`, {
    hidden,
  });

export const deleteComment = (pageId: string, commentId: string) =>
  apiDelete<MutationResult>(`/pages/${pageId}/comments/${commentId}`);

export const likeComment = (pageId: string, commentId: string, like: boolean) =>
  apiPost<MutationResult>(`/pages/${pageId}/comments/${commentId}/like`, {
    like,
  });

// --- Insight avanzati ---
export const getCoverageTrend = (pageId: string, days = 28, signal?: AbortSignal) =>
  apiGet<CoverageTrend>(`/pages/${pageId}/coverage-trend?days=${days}`, signal);

export const getDemographics = (pageId: string, signal?: AbortSignal) =>
  apiGet<Demographics>(`/pages/${pageId}/demographics`, signal);

// --- Gestione pagina: post programmati su Facebook (lato Facebook) ---
export const getScheduledFbPosts = (pageId: string, signal?: AbortSignal) =>
  apiGet<ScheduledFbPosts>(`/pages/${pageId}/scheduled-posts`, signal);

// --- Pubblicazione gemella su Instagram (Reel/Storia video 9:16) ---
// Crea il job IG gemello da un post FB Reel/Storia. Errore 422 se non eleggibile.
export const addInstagramJob = (postId: string) =>
  apiPost<ScheduledPost>(`/posts/${postId}/instagram`, {});

// Rimuove il job IG gemello (accetta l'id del post FB o di quello IG). Rifiuta se già pubblicato.
export const removeInstagramJob = (postId: string) =>
  apiDelete<{ ok: boolean; deletedId: string }>(`/posts/${postId}/instagram`);

// --- Instagram (tab IG): account, insight, media, commenti ---
export const getIgAccount = (pageId: string, signal?: AbortSignal) =>
  apiGet<IgAccountResponse>(`/pages/${pageId}/ig/account`, signal);

export const getIgInsights = (pageId: string, period?: string, signal?: AbortSignal) =>
  apiGet<IgInsightsResponse>(
    `/pages/${pageId}/ig/insights${period ? `?period=${encodeURIComponent(period)}` : ""}`,
    signal,
  );

export const getIgMedia = (pageId: string, limit = 25, signal?: AbortSignal) =>
  apiGet<IgMediaResponse>(`/pages/${pageId}/ig/media?limit=${limit}`, signal);

export const getIgComments = (pageId: string, mediaId: string, signal?: AbortSignal) =>
  apiGet<IgComments>(`/pages/${pageId}/ig/media/${mediaId}/comments`, signal);

export const replyIgComment = (pageId: string, commentId: string, message: string) =>
  apiPost<MutationResult>(`/pages/${pageId}/ig/comments/${commentId}/reply`, { message });

export const hideIgComment = (pageId: string, commentId: string, hidden: boolean) =>
  apiPost<MutationResult>(`/pages/${pageId}/ig/comments/${commentId}/hide`, { hidden });

export const deleteIgComment = (pageId: string, commentId: string) =>
  apiDelete<MutationResult>(`/pages/${pageId}/ig/comments/${commentId}`);
