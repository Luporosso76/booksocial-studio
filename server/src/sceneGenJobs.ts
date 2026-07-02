// Stato della generazione-immagini-di-scena in corso (in memoria), per libro. La generazione è
// MOLTO lenta (~minuti per immagine, GPU seriale). Modello a CODA: si possono accodare più "batch"
// (es. 5 immagini 9:16 sui cap. scelti, poi 5 in 1:1) e un worker per libro li svuota IN SEQUENZA
// senza fermarsi tra l'uno e l'altro. Solo l'Annulla ferma tutto (svuota la coda + killa sd-cli).

export type SceneGenStatus = "generating" | "ready" | "failed";

// Un batch accodato. `count` = immagini PER CAPITOLO se `chapters` è non vuoto; se `chapters` è
// vuoto = modalità AUTO (count immagini totali su capitoli vari, anti-spoiler).
export interface SceneBatch {
  id: string;
  count: number;
  aspect: string;
  chapters: number[];
  // Se valorizzato: il batch FEATURA questi personaggi (nomi dal cast) nelle immagini, sui capitoli
  // dove compaiono (UNIONE). Vuoto/assente = comportamento normale (cast eleggibile + composizioni a
  // rotazione).
  characters?: string[];
  forceFlashback?: boolean;
  moment?: number;
}

export interface SceneGenState {
  status: SceneGenStatus;
  queue: SceneBatch[]; // batch ANCORA da iniziare (escluso quello corrente)
  current: { aspect: string; chapters: number[]; planned: number; created: number } | null;
  createdTotal: number; // immagini create finora (su tutti i batch)
  plannedTotal: number; // immagini totali previste (tutti i batch: completati + corrente + coda)
  error: string | null;
  cancelled: boolean;
  waiting: boolean;
  startedAt: number;
  imageStartedAt: number; // inizio dell'immagine in corso (cronometro "immagine"); azzerato a ogni immagine
  updatedAt: number;
}

const jobs = new Map<number, SceneGenState>();

const REAP_DELAY_MS = 30 * 60 * 1000;
const reapTimers = new Map<number, NodeJS.Timeout>();

function cancelReap(bookId: number): void {
  const t = reapTimers.get(bookId);
  if (t) {
    clearTimeout(t);
    reapTimers.delete(bookId);
  }
}

function scheduleReap(bookId: number): void {
  cancelReap(bookId);
  const t = setTimeout(() => {
    jobs.delete(bookId);
    reapTimers.delete(bookId);
  }, REAP_DELAY_MS);
  if (t.unref) t.unref();
  reapTimers.set(bookId, t);
}

// Quante immagini produce un batch: count×capitoli se selezionati, altrimenti count (Auto).
export function batchSize(b: SceneBatch): number {
  return b.chapters.length > 0 ? b.count * b.chapters.length : b.count;
}

// Accoda un batch. Se non c'è un job attivo per il libro, ne crea uno nuovo e ritorna `true`
// (il chiamante deve avviare il worker). Se è già in corso, accoda soltanto e ritorna `false`.
export function enqueueSceneBatch(bookId: number, batch: SceneBatch): boolean {
  const now = Date.now();
  const j = jobs.get(bookId);
  if (!j || j.status !== "generating") {
    cancelReap(bookId);
    jobs.set(bookId, {
      status: "generating",
      queue: [batch],
      current: null,
      createdTotal: 0,
      plannedTotal: batchSize(batch),
      error: null,
      cancelled: false,
      waiting: false,
      startedAt: now,
      imageStartedAt: now,
      updatedAt: now,
    });
    return true;
  }
  j.queue.push(batch);
  j.plannedTotal += batchSize(batch);
  j.updatedAt = now;
  return false;
}

// Estrae il prossimo batch dalla coda e lo imposta come "corrente". null se la coda è vuota.
export function nextSceneBatch(bookId: number): SceneBatch | null {
  const j = jobs.get(bookId);
  if (!j) return null;
  const b = j.queue.shift() ?? null;
  if (b) {
    j.current = { aspect: b.aspect, chapters: b.chapters, planned: batchSize(b), created: 0 };
    j.imageStartedAt = Date.now();
    j.updatedAt = Date.now();
  }
  return b;
}

// Un'immagine completata: avanza i contatori e resetta imageStartedAt (la prossima parte ORA).
export function bumpSceneCreated(bookId: number): void {
  const j = jobs.get(bookId);
  if (!j) return;
  j.createdTotal += 1;
  if (j.current) j.current.created += 1;
  j.imageStartedAt = Date.now();
  j.updatedAt = Date.now();
}

export function finishSceneGen(bookId: number, cancelled = false): void {
  const j = jobs.get(bookId);
  if (!j) return;
  j.status = "ready";
  j.cancelled = cancelled;
  j.current = null;
  j.queue = [];
  j.updatedAt = Date.now();
  scheduleReap(bookId);
}

export function failSceneGen(bookId: number, error: string): void {
  const j = jobs.get(bookId);
  if (!j) return;
  j.status = "failed";
  j.error = error;
  j.current = null;
  j.queue = [];
  j.updatedAt = Date.now();
  scheduleReap(bookId);
}

// Svuota la coda (Annulla): i batch non ancora iniziati non partiranno. Il batch corrente viene
// interrotto dall'AbortController lato chiamante.
export function clearSceneQueue(bookId: number): void {
  const j = jobs.get(bookId);
  if (j) {
    j.queue = [];
    j.updatedAt = Date.now();
  }
}

export function setSceneGenWaiting(bookId: number, waiting: boolean): void {
  const j = jobs.get(bookId);
  if (j) {
    j.waiting = waiting;
    j.updatedAt = Date.now();
  }
}

export function cancelSceneBatch(bookId: number, batchId: string): boolean {
  const j = jobs.get(bookId);
  if (!j) return false;
  const idx = j.queue.findIndex((b) => b.id === batchId);
  if (idx === -1) return false;
  const [removed] = j.queue.splice(idx, 1);
  j.plannedTotal -= batchSize(removed);
  j.updatedAt = Date.now();
  return true;
}

export function getSceneGen(bookId: number): SceneGenState | undefined {
  return jobs.get(bookId);
}

export function isSceneGenerating(bookId: number): boolean {
  return jobs.get(bookId)?.status === "generating";
}

// Per l'indicatore globale dei job attivi (mappa createdTotal/plannedTotal su created/planned).
export function listActiveSceneGen(): Array<{
  bookId: number;
  status: SceneGenStatus;
  planned: number;
  created: number;
  startedAt: number;
  waiting: boolean;
}> {
  return [...jobs.entries()]
    .filter(([, j]) => j.status === "generating")
    .map(([bookId, j]) => ({
      bookId,
      status: j.status,
      planned: j.plannedTotal,
      created: j.createdTotal,
      startedAt: j.startedAt,
      waiting: j.waiting,
    }));
}
