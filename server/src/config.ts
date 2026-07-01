import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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
  contentProvider: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
  googleApiKey: string | null;
  geminiApiKey: string | null;
  googleBaseUrl: string;

  imageProvider: string;
  openaiImageModel: string;
  googleImageModel: string;
  geminiImageModel: string;

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
  claudeBinary: string;
  claudeModel: string | null;

  agyBinary: string;
  agyModel: string | null;

  agyImageModel: string;
  codexImageModel: string;

  textFallbackProvider: string;
  imageFallbackProvider: string;

  textFallbackModel: string;
  imageFallbackModel: string;
  engineTimeoutMs: number;

  visionTimeoutMs: number;
  schedulerPollSeconds: number;
  maxPublishAttempts: number;
  apiVersion: string;
  tlsCertPath: string | null;
  tlsKeyPath: string | null;
  tlsCn: string;
}

export const appConfig: AppConfig = {
  port: Number(env("PORT", "8770")),
  host: env("HOST", "127.0.0.1"),

  contentProvider: env("CONTENT_PROVIDER", "none").toLowerCase(),
  ollamaBaseUrl: env("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
  ollamaModel: env("OLLAMA_MODEL", ""),
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  openaiBaseUrl: env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
  googleApiKey: process.env.GOOGLE_API_KEY || null,
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  googleBaseUrl: env("GOOGLE_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
  imageProvider: env("IMAGE_PROVIDER", "auto").toLowerCase(),

  openaiImageModel: env("OPENAI_IMAGE_MODEL", ""),
  googleImageModel: env("GOOGLE_IMAGE_MODEL", ""),
  geminiImageModel: env("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
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
  claudeBinary: env("CLAUDE_BINARY", "claude"),
  claudeModel: process.env.CLAUDE_MODEL || null,
  agyBinary: env("AGY_BINARY", "agy"),
  agyModel: process.env.AGY_MODEL || null,
  agyImageModel: env("AGY_IMAGE_MODEL", "Gemini 3.5 Flash (Medium)"),
  codexImageModel: env("CODEX_IMAGE_MODEL", "gpt-5.5"),
  textFallbackProvider: env("TEXT_FALLBACK_PROVIDER", "none").toLowerCase(),
  imageFallbackProvider: env("IMAGE_FALLBACK_PROVIDER", "none").toLowerCase(),
  textFallbackModel: env("TEXT_FALLBACK_MODEL", ""),
  imageFallbackModel: env("IMAGE_FALLBACK_MODEL", ""),
  engineTimeoutMs: Number(env("ENGINE_TIMEOUT_MS", "600000")),
  visionTimeoutMs: Number(env("VISION_TIMEOUT_MS", "600000")),
  schedulerPollSeconds: Number(env("SCHEDULER_POLL_SECONDS", "30")),
  maxPublishAttempts: Number(env("MAX_PUBLISH_ATTEMPTS", "4")),
  apiVersion: env("FB_API_VERSION", "v21.0"),
  tlsCertPath: process.env.TLS_CERT_PATH || null,
  tlsKeyPath: process.env.TLS_KEY_PATH || null,
  tlsCn: env("TLS_CN", "localhost"),
};

let httpsEnabled = false;
export function setHttpsEnabled(value: boolean): void {
  httpsEnabled = value;
}
export function isHttpsEnabled(): boolean {
  return httpsEnabled;
}
