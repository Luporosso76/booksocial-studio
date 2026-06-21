import { appConfig } from "../config.js";
import type { TextCfg } from "./aiSettings.js";
import { ContentError, type ContentEngine } from "./engine.js";

// Provider via API HTTP (NIENTE SDK, niente dipendenze): usano la global `fetch` (Node 20+).
// Ricevono SOLO testo (scheda libro / prompt), mai token applicativi.

// AbortController condiviso: applica `appConfig.engineTimeoutMs` a una `fetch`.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ContentError(`Richiesta API oltre il timeout di ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new ContentError(`Errore di rete verso ${url}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Motore OpenAI-compatibile PARAMETRICO: copre OpenAI, OpenRouter/Groq/LMStudio/vLLM
 * ("openai-compatible" con OPENAI_BASE_URL custom) e Ollama locale (apiKey=null).
 * POST `${baseURL}/chat/completions`; se `apiKey` è non-null aggiunge `Authorization: Bearer`.
 */
export class OpenAICompatibleEngine implements ContentEngine {
  constructor(
    private readonly providerName: string,
    private readonly baseURL: string,
    private readonly apiKey: string | null,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return this.providerName;
  }

  async run(prompt: string): Promise<string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey !== null) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    const url = `${this.baseURL}/chat/completions`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
        }),
      },
      this.timeoutMs,
    );
    const body = await res.text();
    if (!res.ok) {
      throw new ContentError(`${this.providerName} HTTP ${res.status}: ${body.trim()}`);
    }
    let data: { choices?: { message?: { content?: string } }[] };
    try {
      data = JSON.parse(body);
    } catch {
      throw new ContentError(`${this.providerName}: risposta non in JSON valido: ${body.trim()}`);
    }
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      throw new ContentError(`${this.providerName} non ha prodotto alcuna risposta`);
    }
    return answer;
  }
}

// POST https://api.anthropic.com/v1/messages  (x-api-key + anthropic-version).
export class AnthropicEngine implements ContentEngine {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly maxTokens: number = 4096,
  ) {}

  name(): string {
    return "anthropic";
  }

  async run(prompt: string): Promise<string> {
    const res = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [{ role: "user", content: prompt }],
        }),
      },
      this.timeoutMs,
    );
    const body = await res.text();
    if (!res.ok) {
      throw new ContentError(`Anthropic HTTP ${res.status}: ${body.trim()}`);
    }
    let data: { content?: { text?: string }[] };
    try {
      data = JSON.parse(body);
    } catch {
      throw new ContentError(`Anthropic: risposta non in JSON valido: ${body.trim()}`);
    }
    const answer = data.content?.[0]?.text?.trim();
    if (!answer) {
      throw new ContentError("Anthropic non ha prodotto alcuna risposta");
    }
    return answer;
  }
}

/**
 * Google Gemini (Generative Language API).
 * POST `${baseURL}/models/${model}:generateContent?key=${apiKey}`.
 * Body `{ contents: [{ parts: [{ text: prompt }] }] }`; la risposta unisce i `.text` delle parts.
 */
export class GoogleGeminiEngine implements ContentEngine {
  constructor(
    private readonly baseURL: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "google";
  }

  async run(prompt: string): Promise<string> {
    const url = `${this.baseURL}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
      this.timeoutMs,
    );
    const body = await res.text();
    if (!res.ok) {
      throw new ContentError(`Google HTTP ${res.status}: ${body.trim()}`);
    }
    let data: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try {
      data = JSON.parse(body);
    } catch {
      throw new ContentError(`Google: risposta non in JSON valido: ${body.trim()}`);
    }
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const answer = parts
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!answer) {
      throw new ContentError("Google non ha prodotto alcuna risposta");
    }
    return answer;
  }
}

/**
 * Elenca i MODELLI di testo realmente disponibili per un provider, interrogando la sua API HTTP.
 * Best-effort: su errore/timeout ritorna [] (NON lancia), così la UI può degradare a input libero.
 * Solo `fetch` globale + AbortController (~15s). Niente SDK.
 */
export async function listTextModels(input: {
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
}): Promise<string[]> {
  const timeoutMs = 15_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const provider = input.provider;
    const apiKey = input.apiKey ?? null;
    const baseUrl = input.baseUrl ?? null;

    if (provider === "openai" || provider === "openai-compatible" || provider === "compatible") {
      const root = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
      const res = await fetch(`${root}/models`, {
        method: "GET",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: { id?: unknown }[] };
      return (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string")
        .sort((a, b) => a.localeCompare(b));
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: { id?: unknown }[] };
      return (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string")
        .sort((a, b) => a.localeCompare(b));
    }

    if (provider === "google" || provider === "gemini") {
      const root = (baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(
        /\/+$/,
        "",
      );
      const res = await fetch(`${root}/models?key=${encodeURIComponent(apiKey ?? "")}`, {
        method: "GET",
        signal: controller.signal,
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        models?: { name?: unknown; supportedGenerationMethods?: unknown }[];
      };
      return (data.models ?? [])
        .filter((m) => {
          const methods = m.supportedGenerationMethods;
          // Se il campo è assente teniamo il modello; se presente filtriamo su generateContent.
          return !Array.isArray(methods) || methods.includes("generateContent");
        })
        .map((m) => (typeof m.name === "string" ? m.name.replace(/^models\//, "") : null))
        .filter((name): name is string => name !== null && name !== "")
        .sort((a, b) => a.localeCompare(b));
    }

    if (provider === "ollama") {
      const root = (baseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
      const res = await fetch(`${root}/models`, { method: "GET", signal: controller.signal });
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: { id?: unknown }[] };
      return (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string")
        .sort((a, b) => a.localeCompare(b));
    }

    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Costruttori usati da createEngine(): falliscono con messaggio esplicito se manca la API key.
// Ricevono la config EFFETTIVA (TextCfg = cache aiSettings ?? env): chiavi/model/baseUrl a runtime.
export function buildOpenAIEngine(cfg: TextCfg): OpenAICompatibleEngine {
  if (!cfg.openaiApiKey) {
    throw new ContentError(
      "CONTENT_PROVIDER=openai ma OPENAI_API_KEY non è impostata. Aggiungila al file .env.",
    );
  }
  return new OpenAICompatibleEngine(
    "openai",
    cfg.openaiBaseUrl,
    cfg.openaiApiKey,
    cfg.openaiModel,
    appConfig.engineTimeoutMs,
  );
}

// OpenAI-compatible: OpenRouter/Groq/LMStudio/vLLM via OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL.
export function buildOpenAICompatibleEngine(cfg: TextCfg): OpenAICompatibleEngine {
  if (!cfg.openaiApiKey) {
    throw new ContentError(
      "CONTENT_PROVIDER=openai-compatible ma OPENAI_API_KEY non è impostata. Aggiungila al file .env.",
    );
  }
  return new OpenAICompatibleEngine(
    "openai-compatible",
    cfg.openaiBaseUrl,
    cfg.openaiApiKey,
    cfg.openaiModel,
    appConfig.engineTimeoutMs,
  );
}

// Ollama locale: nessuna chiave (apiKey=null).
export function buildOllamaEngine(cfg: TextCfg): OpenAICompatibleEngine {
  return new OpenAICompatibleEngine(
    "ollama",
    cfg.ollamaBaseUrl,
    null,
    cfg.ollamaModel,
    appConfig.engineTimeoutMs,
  );
}

export function buildAnthropicEngine(cfg: TextCfg): AnthropicEngine {
  if (!cfg.anthropicApiKey) {
    throw new ContentError(
      "CONTENT_PROVIDER=anthropic ma ANTHROPIC_API_KEY non è impostata. Aggiungila al file .env.",
    );
  }
  return new AnthropicEngine(cfg.anthropicApiKey, cfg.anthropicModel, appConfig.engineTimeoutMs);
}

export function buildGoogleGeminiEngine(cfg: TextCfg): GoogleGeminiEngine {
  if (!cfg.googleApiKey) {
    throw new ContentError(
      "CONTENT_PROVIDER=google ma GOOGLE_API_KEY non è impostata. Aggiungila al file .env.",
    );
  }
  return new GoogleGeminiEngine(
    cfg.googleBaseUrl,
    cfg.googleApiKey,
    cfg.googleModel,
    appConfig.engineTimeoutMs,
  );
}
