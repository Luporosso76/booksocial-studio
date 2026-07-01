import { Hono } from "hono";
import { appConfig } from "../config.js";
import { modelsFor } from "../content/defaultModels.js";
import { ContentError, enginePath, resolveBinary } from "../content/engine.js";
import { listTextModels } from "../content/engineApi.js";
import { settings } from "../db/repositories.js";
import { imageEngineAvailable } from "../media/imageEngine.js";
import { spawn } from "node:child_process";
import * as aiSettings from "../content/aiSettings.js";
import { err, jsonBody, type RouteContext } from "./_shared.js";

export function mountSettings(api: Hono, ctx: RouteContext): void {
  const { deps } = ctx;

  api.get("/settings/ai-image-mode", async (c) => {
    const v = (await settings.get("ai_image_mode")) === "direct" ? "direct" : "library";
    return c.json({ mode: v, available: deps.sceneImages.available() });
  });

  api.put("/settings/ai-image-mode", async (c) => {
    const body = await jsonBody(c);
    const mode = body.mode === "direct" ? "direct" : "library";
    await settings.set("ai_image_mode", mode);
    return c.json({ mode });
  });

  api.get("/settings/qa-check", async (c) => {
    const enabled = (await settings.get("qa_enabled")) !== "off";
    return c.json({ enabled });
  });

  api.put("/settings/qa-check", async (c) => {
    const body = await jsonBody(c);
    const enabled = body.enabled !== false;
    await settings.set("qa_enabled", enabled ? "on" : "off");
    return c.json({ enabled });
  });

  api.get("/settings/ai", (c) => {
    return c.json(aiSettings.effectiveView());
  });

  api.put("/settings/ai", async (c) => {
    const body = await jsonBody(c);
    const TEXT_PROVIDERS = new Set(["opencode", "codex", "claude", "agy", "ollama", "none"]);
    const IMAGE_PROVIDERS = new Set([
      "local",
      "auto",
      "openai",
      "gemini",
      "stability",
      "bfl",
      "replicate",
      "fal",
      "agy",
      "none",
    ]);
    if (body.text?.provider !== undefined && !TEXT_PROVIDERS.has(body.text.provider)) {
      return c.json(err(`Provider testo non valido: ${body.text.provider}`), 400);
    }
    if (body.image?.provider !== undefined && !IMAGE_PROVIDERS.has(body.image.provider)) {
      return c.json(err(`Provider immagini non valido: ${body.image.provider}`), 400);
    }
    const patch: aiSettings.AiSettingsPatch = {};
    if (body.text && typeof body.text === "object") patch.text = body.text;
    if (body.image && typeof body.image === "object") patch.image = body.image;
    if (body.keys && typeof body.keys === "object") patch.keys = body.keys;
    if (body.extra && typeof body.extra === "object") patch.extra = body.extra;
    if (body.imageStyle && typeof body.imageStyle === "object") patch.imageStyle = body.imageStyle;
    const view = await aiSettings.save(patch);
    return c.json(view);
  });

  api.post("/settings/ai/models", async (c) => {
    const body = await jsonBody(c);
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    if (provider === "") return c.json({ models: [], error: "provider mancante" });

    const spawnModels = (binary: string): Promise<{ models: string[]; error?: string }> =>
      new Promise((resolve) => {
        let stdout = "";
        let settled = false;
        const finish = (r: { models: string[]; error?: string }): void => {
          if (settled) return;
          settled = true;
          resolve(r);
        };
        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(resolveBinary(binary), ["models"], {
            stdio: ["ignore", "pipe", "ignore"],
            env: { ...process.env, PATH: enginePath() },
          });
        } catch (e) {
          finish({
            models: [],
            error: e instanceof Error ? e.message : String(e),
          });
          return;
        }
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish({ models: [], error: "Timeout avvio CLI" });
        }, 15_000);
        child.stdout?.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        child.on("error", (e: Error) => {
          clearTimeout(timer);
          finish({ models: [], error: e.message });
        });
        child.on("close", () => {
          clearTimeout(timer);
          const models = stdout
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l !== "");
          finish({ models });
        });
      });

    try {
      if (provider === "opencode") {
        const result = await spawnModels(appConfig.opencodeBinary);
        return c.json(result);
      }

      if (provider === "agy") {
        const result = await spawnModels(appConfig.agyBinary);
        return c.json(result);
      }

      if (provider === "ollama") {
        const baseUrl: string | null = typeof body.baseUrl === "string" ? body.baseUrl : null;
        const cfg = aiSettings.getText();
        const resolvedBaseUrl = baseUrl ?? cfg.ollamaBaseUrl;
        const models = await listTextModels({
          provider: "ollama",
          baseUrl: resolvedBaseUrl,
        });
        if (models.length === 0) {
          return c.json({
            models: [],
            error: "Nessun modello: verifica la connessione Ollama.",
          });
        }
        return c.json({ models });
      }

      if (provider === "gemini") {
        const img = aiSettings.getImage();
        const fallback = await modelsFor(provider, aiSettings.getModels);
        const key = img.geminiApiKey;
        if (!key) return c.json({ models: fallback });

        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), 10_000);
        try {
          const r = await fetch(
            `${img.googleBaseUrl}/models?pageSize=300&key=${encodeURIComponent(key)}`,
            { signal: ac.signal },
          );
          if (!r.ok) return c.json({ models: fallback, error: `Gemini HTTP ${r.status}` });
          const j = (await r.json()) as {
            models?: { name: string; supportedGenerationMethods?: string[] }[];
          };
          const names = (j.models ?? [])
            .filter((m) => {
              const methods = m.supportedGenerationMethods ?? [];
              return methods.includes("generateContent") && /image/i.test(m.name);
            })
            .map((m) => m.name.replace(/^models\//, ""));
          const merged = [...new Set([...names, ...fallback])];
          return c.json({ models: merged.length > 0 ? merged : fallback });
        } catch (e) {
          return c.json({ models: fallback, error: e instanceof Error ? e.message : String(e) });
        } finally {
          clearTimeout(to);
        }
      }

      if (provider === "openai") {
        const img = aiSettings.getImage();
        const fallback = await modelsFor(provider, aiSettings.getModels);
        const key = img.openaiApiKey;
        if (!key) return c.json({ models: fallback });
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort(), 10_000);
        try {
          const root = img.openaiBaseUrl.replace(/\/+$/, "");
          const r = await fetch(`${root}/models`, {
            headers: { authorization: `Bearer ${key}` },
            signal: ac.signal,
          });
          if (!r.ok) return c.json({ models: fallback, error: `OpenAI HTTP ${r.status}` });
          const j = (await r.json()) as { data?: { id: string }[] };
          const names = (j.data ?? []).map((m) => m.id).filter((id) => /image|dall-e/i.test(id));
          const merged = [...new Set([...names, ...fallback])];
          return c.json({ models: merged.length > 0 ? merged : fallback });
        } catch (e) {
          return c.json({ models: fallback, error: e instanceof Error ? e.message : String(e) });
        } finally {
          clearTimeout(to);
        }
      }

      const DB_PROVIDERS = new Set(["codex", "claude", "stability", "bfl", "replicate", "fal"]);
      if (DB_PROVIDERS.has(provider)) {
        const models = await modelsFor(provider, aiSettings.getModels);
        return c.json({ models });
      }

      return c.json({ models: [] });
    } catch (e) {
      return c.json({
        models: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  api.post("/settings/ai/models/add", async (c) => {
    const body = await jsonBody(c);
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (provider === "" || model === "") {
      return c.json(err("provider e model sono obbligatori"), 400);
    }
    const models = await aiSettings.addModel(provider, model);
    return c.json({ models });
  });

  api.post("/settings/ai/models/remove", async (c) => {
    const body = await jsonBody(c);
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (provider === "" || model === "") {
      return c.json(err("provider e model sono obbligatori"), 400);
    }
    const models = await aiSettings.removeModel(provider, model);
    return c.json({ models });
  });

  api.get("/settings/ai/cli-status", async (c) => {
    const tool = c.req.query("tool") ?? "";
    const binary =
      tool === "opencode"
        ? appConfig.opencodeBinary
        : tool === "codex"
          ? appConfig.codexBinary
          : tool === "claude"
            ? appConfig.claudeBinary
            : tool === "agy"
              ? appConfig.agyBinary
              : null;
    if (binary == null) return c.json(err("tool non valido"), 400);
    const result = await new Promise<{
      installed: boolean;
      version: string | null;
      error?: string;
    }>((resolve) => {
      let stdout = "";
      let settled = false;
      const finish = (r: { installed: boolean; version: string | null; error?: string }): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(resolveBinary(binary), ["--version"], {
          stdio: ["ignore", "pipe", "ignore"],
          env: { ...process.env, PATH: enginePath() },
        });
      } catch (e) {
        finish({
          installed: false,
          version: null,
          error: e instanceof Error ? e.message : String(e),
        });
        return;
      }
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish({ installed: false, version: null, error: "Timeout avvio CLI" });
      }, 5_000);
      child.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
      child.on("error", (e: Error) => {
        clearTimeout(timer);
        finish({ installed: false, version: null, error: e.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          const version = stdout.trim().split("\n")[0]?.trim() || null;
          finish({ installed: true, version });
        } else {
          finish({
            installed: false,
            version: null,
            error: `Uscita CLI con codice ${code}`,
          });
        }
      });
    });
    return c.json({ tool, ...result });
  });

  api.post("/settings/ai/test-text", async (c) => {
    const provider = aiSettings.getText().provider;
    try {
      const TEST_TIMEOUT_MS = 20_000;
      const answer = await Promise.race([
        deps.engine.run("Reply with: OK"),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new ContentError(`Timeout dopo ${TEST_TIMEOUT_MS / 1000}s`)),
            TEST_TIMEOUT_MS,
          ),
        ),
      ]);
      const sample = answer.trim().slice(0, 60);
      return c.json({ ok: true, provider, sample });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return c.json({ ok: false, provider, error });
    }
  });

  api.post("/settings/ai/test-image", async (c) => {
    const cfg = aiSettings.getImage();
    const provider = cfg.provider;
    const TEST_TIMEOUT_MS = 12_000;
    async function probe(url: string, headers?: Record<string, string>): Promise<number | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "GET",
          headers,
          signal: controller.signal,
        });
        return res.status;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      if (provider === "local" || provider === "auto") {
        if (imageEngineAvailable()) return c.json({ ok: true, provider });
        return c.json({
          ok: false,
          provider,
          error: "Motore immagini locale non disponibile.",
        });
      }
      if (provider === "openai") {
        if (cfg.openaiApiKey == null || cfg.openaiApiKey === "") {
          return c.json({
            ok: false,
            provider,
            error: "Chiave OpenAI non configurata.",
          });
        }
        const root = cfg.openaiBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
        const status = await probe(`${root}/v1/models`, {
          Authorization: `Bearer ${cfg.openaiApiKey}`,
        });
        if (status === 200) return c.json({ ok: true, provider });
        return c.json({
          ok: false,
          provider,
          error: status == null ? "Endpoint non raggiungibile." : `HTTP ${status}`,
        });
      }
      if (provider === "gemini") {
        if (cfg.geminiApiKey == null || cfg.geminiApiKey === "") {
          return c.json({
            ok: false,
            provider,
            error: "Chiave Gemini non configurata.",
          });
        }
        const root = cfg.googleBaseUrl.replace(/\/+$/, "");
        const status = await probe(`${root}/models?key=${encodeURIComponent(cfg.geminiApiKey)}`);
        if (status === 200) return c.json({ ok: true, provider });
        return c.json({
          ok: false,
          provider,
          error: status == null ? "Endpoint non raggiungibile." : `HTTP ${status}`,
        });
      }

      const keyMap: Record<string, string | null | undefined> = {
        stability: cfg.stabilityApiKey,
        bfl: cfg.bflApiKey,
        replicate: cfg.replicateApiKey,
        fal: cfg.falApiKey,
      };
      if (provider in keyMap) {
        const key = keyMap[provider];
        if (key == null || key === "") {
          return c.json({
            ok: false,
            provider,
            error: `Chiave ${provider} non configurata.`,
          });
        }
        return c.json({ ok: true, provider });
      }
      return c.json({
        ok: false,
        provider,
        error: "Nessun provider immagini configurato.",
      });
    } catch (e) {
      return c.json({
        ok: false,
        provider,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}
