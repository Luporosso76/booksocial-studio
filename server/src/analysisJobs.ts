// Stato delle analisi-libro in corso (in memoria). L'import e' asincrono: la richiesta HTTP
// ritorna subito e l'analisi (lenta sui libri grandi) gira in background; il frontend fa polling.

export type AnalysisStatus = "analyzing" | "ready" | "failed";

export interface AnalysisJob {
  status: AnalysisStatus;
  error: string | null;
  startedAt: number;
  updatedAt: number;
}

const jobs = new Map<number, AnalysisJob>();

export function setJob(bookId: number, status: AnalysisStatus, error: string | null = null): void {
  const now = Date.now();
  const prev = jobs.get(bookId);
  jobs.set(bookId, { status, error, startedAt: prev?.startedAt ?? now, updatedAt: now });
}

export function getJob(bookId: number): AnalysisJob | undefined {
  return jobs.get(bookId);
}

// Tutti i job noti (per l'indicatore globale delle attività in background).
export function listJobs(): Array<{ bookId: number } & AnalysisJob> {
  return [...jobs.entries()].map(([bookId, j]) => ({ bookId, ...j }));
}
