import type { VisualSpec } from "../spec.js";

// Contratto comune dei renderer. Ogni renderer riceve uno spec gia' validato e
// una directory di output, e ritorna il percorso del file prodotto.
//
// I renderer concreti (Satori per le card, Remotion per i reel) sono caricati in
// modo OPZIONALE via dynamic import: se la loro dipendenza npm non e' installata,
// il modulo lancia/rifiuta e la coda segna il job 'failed' con messaggio chiaro,
// SENZA mai far crashare l'app.

export interface RenderContext {
  outDir: string; // directory dove scrivere il file
  baseName: string; // nome file senza estensione (univoco per job)
  brand: {
    title: string | null;
    accent: string | null;
  };
}

export interface RenderOutput {
  path: string; // percorso assoluto del file prodotto
  mediaType: "PHOTO" | "REEL"; // come registrarlo (immagine vs video)
}

export type RenderFn = (spec: VisualSpec, ctx: RenderContext) => Promise<RenderOutput>;

// Errore "dipendenza non disponibile": la coda lo distingue per il messaggio utente.
export class RendererUnavailableError extends Error {}
