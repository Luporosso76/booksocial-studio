// Stato della generazione-settimana in corso (in memoria), per pagina. La generazione è
// LENTA (una chiamata al modello per contenuto): la richiesta HTTP ritorna subito e il
// lavoro gira in background; il frontend fa polling (bozze che compaiono progressivamente
// + questo stato per l'avanzamento e il motivo finale). Una pagina alla volta.

export type WeekGenStatus = "generating" | "ready" | "failed";

export interface WeekGenJob {
  status: WeekGenStatus;
  planned: number; // contenuti pianificati per la settimana
  created: number; // bozze create finora
  reason: string | null; // motivo sintetico a fine corsa (es. tutti duplicati)
  messages: string[] | null; // dettagli errori per singolo contenuto
  error: string | null; // errore fatale dell'intera generazione
  startedAt: number;
  updatedAt: number;
}

const jobs = new Map<string, WeekGenJob>();

export function startWeekGen(pageId: string): void {
  const now = Date.now();
  jobs.set(pageId, {
    status: "generating",
    planned: 0,
    created: 0,
    reason: null,
    messages: null,
    error: null,
    startedAt: now,
    updatedAt: now,
  });
}

export function setPlanned(pageId: string, planned: number): void {
  const j = jobs.get(pageId);
  if (j) jobs.set(pageId, { ...j, planned, updatedAt: Date.now() });
}

export function bumpCreated(pageId: string): void {
  const j = jobs.get(pageId);
  if (j) jobs.set(pageId, { ...j, created: j.created + 1, updatedAt: Date.now() });
}

export function finishWeekGen(
  pageId: string,
  res: { created: number; reason?: string; messages?: string[] },
): void {
  const j = jobs.get(pageId);
  const now = Date.now();
  jobs.set(pageId, {
    status: "ready",
    planned: j?.planned ?? res.created,
    created: res.created,
    reason: res.reason ?? null,
    messages: res.messages ?? null,
    error: null,
    startedAt: j?.startedAt ?? now,
    updatedAt: now,
  });
}

export function failWeekGen(pageId: string, error: string): void {
  const j = jobs.get(pageId);
  const now = Date.now();
  jobs.set(pageId, {
    status: "failed",
    planned: j?.planned ?? 0,
    created: j?.created ?? 0,
    reason: null,
    messages: j?.messages ?? null,
    error,
    startedAt: j?.startedAt ?? now,
    updatedAt: now,
  });
}

export function getWeekGen(pageId: string): WeekGenJob | undefined {
  return jobs.get(pageId);
}

export function isGenerating(pageId: string): boolean {
  return jobs.get(pageId)?.status === "generating";
}

// Job attivi (per l'indicatore globale).
export function listActiveWeekGen(): Array<{ pageId: string } & WeekGenJob> {
  return [...jobs.entries()]
    .filter(([, j]) => j.status === "generating")
    .map(([pageId, j]) => ({ pageId, ...j }));
}
