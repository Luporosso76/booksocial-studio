// Stato della RIGENERAZIONE di immagini singole (in memoria), modello a CODA GLOBALE seriale.
// Diversamente dalla generazione-di-scena (che è per-libro, vedi sceneGenJobs.ts), qui la coda è
// UNICA per tutto il processo: la rigenerazione di una singola immagine è un'operazione GPU come le
// altre e la GPU è SERIALE e condivisa. Si possono accodare più rigenerazioni (anche di libri
// diversi, anche in blocco da multi-selezione) e un solo worker per-processo le svuota in sequenza.
// Vedi routes.ts per la serializzazione incrociata con la generazione-di-scena.

// Un job di rigenerazione accodato. `changes` (italiano) = modifiche da fondere nel vecchio prompt;
// `prompt` = prompt già editato dall'utente (sostituisce quello salvato). Si tengono entrambi così
// il worker può ricostruire il prompt finale e la UI può ri-mostrare il testo (D4).
// `rebuild` = ricostruisci il prompt dal CAPITOLO con la pipeline attuale (applica le regole
// aggiornate: fisica/realismo, postura windsurf, ecc.) invece di riusare il gen_prompt salvato.
import type { SceneFlashback } from "./content/imagePrompt.js";

export interface MediaRegenJob {
  mediaId: number;
  bookId: number;
  changes?: string;
  prompt?: string;
  rebuild?: boolean;
  // Personaggi (nomi dal cast) da featurare nella ricostruzione dal capitolo (rebuild=true): la
  // pipeline li rende prominenti sul capitolo dell'immagine. Assente/[] = ricostruzione normale.
  characters?: string[];
  // Override FLASHBACK/ricordo (manuale): rende i personaggi più giovani e vestiti per l'epoca,
  // scavalcando età e outfit canonici. Forza la ricostruzione dal capitolo (serve la pipeline).
  flashback?: SceneFlashback;
  // QUALITY CHECK visivo (V22): se true, dopo la rigenerazione il modello GUARDA l'immagine e, se
  // bocciata (ok=false), la rigenera UNA volta sola con un nuovo seed. Assente/false = solo verdetto.
  verify?: boolean;
}

// Job correntemente in lavorazione: oltre a mediaId/bookId, espone startedAt per il cronometro UI.
export interface MediaRegenCurrent {
  mediaId: number;
  bookId: number;
  changes?: string;
  prompt?: string;
  rebuild?: boolean;
  characters?: string[];
  flashback?: SceneFlashback;
  verify?: boolean;
  startedAt: number;
}

export interface MediaRegenState {
  queue: MediaRegenJob[]; // job ANCORA da iniziare (escluso quello corrente)
  current: MediaRegenCurrent | null; // job in lavorazione (null = nessuno)
  startedAt: number; // inizio del PRIMO job della sessione corrente (cronometro "totale")
  completedTotal: number; // rigenerazioni completate con SUCCESSO nel "run" corrente
  plannedTotal: number; // totale accodato nel "run" corrente (completati + corrente + coda)
  updatedAt: number;
}

// Stato GLOBALE per-processo (coda unica, non per-libro).
const state: MediaRegenState = {
  queue: [],
  current: null,
  startedAt: 0,
  completedTotal: 0,
  plannedTotal: 0,
  updatedAt: 0,
};

// Accoda una rigenerazione. Ritorna `true` se la coda era inattiva (nessun worker in corso): il
// chiamante deve avviare il worker. Ritorna `false` se un worker sta già girando (basta accodare).
export function enqueueMediaRegen(job: MediaRegenJob): boolean {
  const now = Date.now();
  const wasIdle = state.current === null && state.queue.length === 0;
  // Nuovo "run": azzera i contatori di avanzamento prima di accodare il primo job.
  if (wasIdle) {
    state.startedAt = now;
    state.completedTotal = 0;
    state.plannedTotal = 0;
  }
  state.queue.push(job);
  state.plannedTotal += 1;
  state.updatedAt = now;
  return wasIdle;
}

// Una rigenerazione è stata completata con SUCCESSO: avanza il contatore "fatte" del run corrente.
export function bumpMediaRegenCompleted(): void {
  state.completedTotal += 1;
  state.updatedAt = Date.now();
}

// Estrae il prossimo job dalla coda e lo imposta come "corrente" (con startedAt per il cronometro).
// null se la coda è vuota.
export function nextMediaRegen(): MediaRegenCurrent | null {
  const job = state.queue.shift() ?? null;
  const now = Date.now();
  if (job) {
    state.current = { ...job, startedAt: now };
  } else {
    state.current = null;
  }
  state.updatedAt = now;
  return state.current;
}

// Il job corrente è finito: azzera `current`. Se la coda è vuota, il run è concluso: azzera anche il
// cronometro totale e i contatori planned/completed (pronti per il prossimo run).
export function finishMediaRegen(): void {
  state.current = null;
  if (state.queue.length === 0) {
    state.startedAt = 0;
    state.completedTotal = 0;
    state.plannedTotal = 0;
  }
  state.updatedAt = Date.now();
}

// Annulla la rigenerazione di una specifica immagine: se è in coda, la rimuove (e ritorna 'queued');
// se è quella corrente, segnala al chiamante di abortire (ritorna 'current'); altrimenti 'none'.
export function cancelMediaRegen(mediaId: number): "queued" | "current" | "none" {
  const before = state.queue.length;
  state.queue = state.queue.filter((j) => j.mediaId !== mediaId);
  if (state.queue.length !== before) {
    // Job rimosso dalla coda: scala il totale previsto del run (mai sotto i già completati).
    state.plannedTotal = Math.max(
      state.completedTotal,
      state.plannedTotal - (before - state.queue.length),
    );
    state.updatedAt = Date.now();
    return "queued";
  }
  if (state.current?.mediaId === mediaId) return "current";
  return "none";
}

// Svuota la coda (Annulla tutto): i job non ancora iniziati non partiranno. Il corrente va abortito
// dal chiamante via AbortController.
export function clearMediaRegenQueue(): void {
  state.queue = [];
  // Tutta la coda è stata svuotata: il totale previsto si riduce a corrente + già completati.
  state.plannedTotal = state.completedTotal + (state.current ? 1 : 0);
  state.updatedAt = Date.now();
}

export function getMediaRegen(): MediaRegenState {
  return state;
}

// True se una rigenerazione è in corso o accodata. Con `mediaId`: solo per QUELLA immagine
// (corrente o in coda) — retrocompat con GET /media/:id/regen-status.
export function isMediaRegenerating(mediaId?: number): boolean {
  if (mediaId === undefined) {
    return state.current !== null || state.queue.length > 0;
  }
  if (state.current?.mediaId === mediaId) return true;
  return state.queue.some((j) => j.mediaId === mediaId);
}

// Per l'indicatore globale: job corrente + id in coda + cronometro totale + avanzamento del run
// (created = rigenerazioni completate, planned = totale del run, coda inclusa).
export function listActiveMediaRegen(): {
  current: { mediaId: number; bookId: number; startedAt: number } | null;
  queued: number[];
  startedAt: number;
  created: number;
  planned: number;
} {
  return {
    current: state.current
      ? {
          mediaId: state.current.mediaId,
          bookId: state.current.bookId,
          startedAt: state.current.startedAt,
        }
      : null,
    queued: state.queue.map((j) => j.mediaId),
    startedAt: state.startedAt,
    created: state.completedTotal,
    planned: state.plannedTotal,
  };
}
