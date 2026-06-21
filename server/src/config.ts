import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load server/.env relative to this file (works regardless of cwd).
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "..", ".env") });

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Variabile d'ambiente mancante: ${name}`);
  }
  return v;
}

export interface AppConfig {
  port: number;
  host: string;
  contentProvider: string; // opencode | codex | gemini | openai | openai-compatible | ollama | anthropic | google
  // Provider via API HTTP (opzionali): se selezionati ma senza chiave, createEngine() fallisce.
  openaiApiKey: string | null;
  openaiModel: string;
  openaiBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  anthropicApiKey: string | null;
  anthropicModel: string;
  googleApiKey: string | null;
  googleModel: string;
  googleBaseUrl: string;
  // Generazione IMMAGINI: provider attivo (auto|local|openai|google|stability|bfl|replicate|fal|none)
  // e modelli/chiavi HTTP. openai/google riusano le stesse chiavi del testo (stesso account).
  imageProvider: string;
  openaiImageModel: string;
  googleImageModel: string;
  // Provider immagine dedicati (solo immagini): chiave propria + modello.
  stabilityApiKey: string | null;
  stabilityImageModel: string;
  bflApiKey: string | null;
  bflImageModel: string;
  replicateApiKey: string | null;
  replicateImageModel: string;
  falApiKey: string | null;
  falImageModel: string;
  opencodeModel: string;
  opencodeBinary: string;
  codexBinary: string;
  codexModel: string | null;
  // Gemini come provider CLI ad ABBONAMENTO (login via CLI ufficiale). NON è il modello dell'API a
  // key: quello è `googleModel`. `geminiModel` è il modello passato al CLI `gemini -m`.
  geminiBinary: string;
  geminiModel: string | null;
  engineTimeoutMs: number;
  // Timeout (ms) per il QUALITY CHECK visivo delle immagini generate (modello multimodale).
  visionTimeoutMs: number;
  schedulerPollSeconds: number;
  maxPublishAttempts: number;
  apiVersion: string;
  // HTTP Basic Auth opzionale (self-host): se ENTRAMBI valorizzati, l'app la richiede su tutto.
  authUser: string | null;
  authPass: string | null;
}

export const appConfig: AppConfig = {
  port: Number(env("PORT", "8770")),
  host: env("HOST", "127.0.0.1"),
  // Default NEUTRO: 'none' = nessun provider configurato → l'utente lo sceglie dall'onboarding /
  // Impostazioni (niente provider personale preimpostato nel repo pubblico).
  contentProvider: env("CONTENT_PROVIDER", "none").toLowerCase(),
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  // Nessun modello hardcoded: l'utente lo sceglie dalla connessione (list-models) o lo digita.
  openaiModel: env("OPENAI_MODEL", ""),
  openaiBaseUrl: env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
  ollamaBaseUrl: env("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
  ollamaModel: env("OLLAMA_MODEL", ""),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  anthropicModel: env("ANTHROPIC_MODEL", ""),
  googleApiKey: process.env.GOOGLE_API_KEY || null,
  googleModel: env("GOOGLE_MODEL", ""),
  googleBaseUrl: env("GOOGLE_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
  imageProvider: env("IMAGE_PROVIDER", "auto").toLowerCase(),
  // Modelli immagine: nessun default hardcoded (i nomi corretti dipendono dal provider/piano).
  openaiImageModel: env("OPENAI_IMAGE_MODEL", ""),
  googleImageModel: env("GOOGLE_IMAGE_MODEL", ""),
  stabilityApiKey: process.env.STABILITY_API_KEY || null,
  stabilityImageModel: env("STABILITY_IMAGE_MODEL", ""),
  bflApiKey: process.env.BFL_API_KEY || null,
  bflImageModel: env("BFL_IMAGE_MODEL", ""),
  replicateApiKey: process.env.REPLICATE_API_TOKEN || null,
  replicateImageModel: env("REPLICATE_IMAGE_MODEL", ""),
  falApiKey: process.env.FAL_API_KEY || null,
  falImageModel: env("FAL_IMAGE_MODEL", ""),
  opencodeModel: env("OPENCODE_MODEL", ""),
  opencodeBinary: env("OPENCODE_BINARY", "opencode"),
  codexBinary: env("CODEX_BINARY", "codex"),
  codexModel: process.env.CODEX_MODEL || null,
  geminiBinary: env("GEMINI_BINARY", "gemini"),
  geminiModel: process.env.GEMINI_CLI_MODEL || null,
  engineTimeoutMs: Number(env("ENGINE_TIMEOUT_MS", "300000")),
  visionTimeoutMs: Number(env("VISION_TIMEOUT_MS", "120000")),
  schedulerPollSeconds: Number(env("SCHEDULER_POLL_SECONDS", "30")),
  maxPublishAttempts: Number(env("MAX_PUBLISH_ATTEMPTS", "4")),
  apiVersion: env("FB_API_VERSION", "v21.0"),
  authUser: process.env.AUTH_USER || null,
  authPass: process.env.AUTH_PASS || null,
};
