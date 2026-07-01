import type { SceneFlashback } from "./content/imagePrompt.js";

export interface MediaRegenJob {
  mediaId: number;
  bookId: number;
  changes?: string;
  prompt?: string;
  rebuild?: boolean;

  characters?: string[];

  flashback?: SceneFlashback;

  verify?: boolean;
}

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
  queue: MediaRegenJob[];
  current: MediaRegenCurrent | null;
  startedAt: number;
  completedTotal: number;
  plannedTotal: number;
  updatedAt: number;
}

const state: MediaRegenState = {
  queue: [],
  current: null,
  startedAt: 0,
  completedTotal: 0,
  plannedTotal: 0,
  updatedAt: 0,
};

export function enqueueMediaRegen(job: MediaRegenJob): boolean {
  const now = Date.now();
  const wasIdle = state.current === null && state.queue.length === 0;

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

export function bumpMediaRegenCompleted(): void {
  state.completedTotal += 1;
  state.updatedAt = Date.now();
}

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

export function finishMediaRegen(): void {
  state.current = null;
  if (state.queue.length === 0) {
    state.startedAt = 0;
    state.completedTotal = 0;
    state.plannedTotal = 0;
  }
  state.updatedAt = Date.now();
}

export function cancelMediaRegen(mediaId: number): "queued" | "current" | "none" {
  const before = state.queue.length;
  state.queue = state.queue.filter((j) => j.mediaId !== mediaId);
  if (state.queue.length !== before) {
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

export function clearMediaRegenQueue(): void {
  state.queue = [];

  state.plannedTotal = state.completedTotal + (state.current ? 1 : 0);
  state.updatedAt = Date.now();
}

export function getMediaRegen(): MediaRegenState {
  return state;
}

export function isMediaRegenerating(mediaId?: number): boolean {
  if (mediaId === undefined) {
    return state.current !== null || state.queue.length > 0;
  }
  if (state.current?.mediaId === mediaId) return true;
  return state.queue.some((j) => j.mediaId === mediaId);
}

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
