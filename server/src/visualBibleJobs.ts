// Stato (in memoria) del job "bibbia visiva" per-libro. Il job è LUNGO (più chiamate GPT seriali:
// aspetto, schede, abiti, oggetti, minori, presenza) e RESUMABLE per step: la richiesta HTTP ritorna
// subito e il lavoro gira in background; il frontend fa polling su /visual-bible-status e /jobs.
// Ogni step è best-effort: una failure non blocca gli altri (status 'failed' sul singolo step).

export type VBStepKey = "appearance" | "sceneCards" | "outfits" | "props" | "minors" | "presence";
export type VBStepStatus = "pending" | "running" | "done" | "failed";

export interface VBStep {
  key: VBStepKey;
  label: string;
  status: VBStepStatus;
  done: number;
  total: number;
}

export type VBStatus = "running" | "done" | "failed";

export interface VBState {
  bookId: number;
  status: VBStatus;
  steps: VBStep[];
  startedAt: number;
  updatedAt: number;
  error: string | null;
}

// Ordine canonico degli step. outfits/props/minors leggono le schede capitolo: sceneCards prima.
export const VB_STEP_ORDER: VBStepKey[] = [
  "appearance",
  "sceneCards",
  "outfits",
  "props",
  "minors",
  "presence",
];

const VB_STEP_LABELS: Record<VBStepKey, string> = {
  appearance: "Aspetto fisico",
  sceneCards: "Schede capitolo",
  outfits: "Abiti",
  props: "Oggetti & mondo",
  minors: "Personaggi minori",
  presence: "Presenza personaggi",
};

const jobs = new Map<number, VBState>();

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

// Crea (o sostituisce) lo stato del job per il libro: steps nei soli stepKeys richiesti, ordinati
// secondo VB_STEP_ORDER, ciascuno 'pending' con contatori a zero.
export function startVisualBible(bookId: number, stepKeys: VBStepKey[]): void {
  const now = Date.now();
  cancelReap(bookId);
  const ordered = VB_STEP_ORDER.filter((k) => stepKeys.includes(k));
  jobs.set(bookId, {
    bookId,
    status: "running",
    steps: ordered.map((key) => ({
      key,
      label: VB_STEP_LABELS[key],
      status: "pending",
      done: 0,
      total: 0,
    })),
    startedAt: now,
    updatedAt: now,
    error: null,
  });
}

function patchStep(bookId: number, key: VBStepKey, patch: Partial<VBStep>): void {
  const j = jobs.get(bookId);
  if (!j) return;
  const step = j.steps.find((s) => s.key === key);
  if (!step) return;
  Object.assign(step, patch);
  j.updatedAt = Date.now();
}

export function setStepTotal(bookId: number, key: VBStepKey, total: number): void {
  patchStep(bookId, key, { total });
}

export function setStepRunning(bookId: number, key: VBStepKey): void {
  patchStep(bookId, key, { status: "running" });
}

export function bumpStep(bookId: number, key: VBStepKey): void {
  const j = jobs.get(bookId);
  if (!j) return;
  const step = j.steps.find((s) => s.key === key);
  if (!step) return;
  step.done += 1;
  j.updatedAt = Date.now();
}

export function setStepStatus(bookId: number, key: VBStepKey, status: VBStepStatus): void {
  patchStep(bookId, key, { status });
}

export function finishVisualBible(bookId: number, error: string | null = null): void {
  const j = jobs.get(bookId);
  if (!j) return;
  j.status = error ? "failed" : "done";
  j.error = error ?? j.error;
  j.updatedAt = Date.now();
  scheduleReap(bookId);
}

export function getVisualBible(bookId: number): VBState | undefined {
  return jobs.get(bookId);
}

export function isVisualBibleRunning(bookId: number): boolean {
  return jobs.get(bookId)?.status === "running";
}

// Job attivi (per l'indicatore globale delle attività in background).
export function listActiveVisualBible(): VBState[] {
  return [...jobs.values()].filter((j) => j.status === "running");
}
