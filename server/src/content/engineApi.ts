import { appConfig } from "../config.js";
import type { TextCfg } from "./aiSettings.js";
import { ContentError, type ContentEngine } from "./engine.js";

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

    if (provider === "gemini") {
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

export function buildOllamaEngine(cfg: TextCfg): OpenAICompatibleEngine {
  return new OpenAICompatibleEngine(
    "ollama",
    cfg.ollamaBaseUrl,
    null,
    cfg.ollamaModel,
    appConfig.engineTimeoutMs,
  );
}
