import { Hono } from "hono";
import { ContentError, resolveBinary, enginePath } from "../content/engine.js";
import { listTextModels } from "../content/engineApi.js";
import { modelsFor } from "../content/defaultModels.js";
import { spawn } from "node:child_process";
import { settings } from "../db/repositories.js";
import { imageGenAvailable } from "../media/imageGen.js";
import { appConfig } from "../config.js";
import * as aiSettings from "../content/aiSettings.js";
import { err, jsonBody, type RouteContext } from "./_shared.js";

export function mountSettings(api: Hono, ctx: RouteContext): void {
  const { deps } = ctx;

  // GET/PUT /settings/ai-image-mode — modalità immagini per la generazione del programma:
  //  - "library": usa SOLO le immagini caricate del libro (default, nessuna generazione AI).
  //  - "direct":  genera l'immagine di scena AI al momento (+ fallback alle caricate se fallisce).
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

  // GET/PUT /settings/qa-check — controllo qualità visivo delle immagini generate (#2). Default ACCESO;
  // se spento ("off"), nessuna verifica viene eseguita alla generazione/rigenerazione.
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

  // GET/PUT /settings/ai — configurazione RUNTIME dei provider AI (testo + immagini).
  // GET ritorna la vista EFFETTIVA (config salvata ?? env), con le chiavi come BOOLEAN (mai i valori).
  // PUT salva i campi non-segreti (DB app_setting) e le chiavi (keyring cifrato), poi ricarica la cache.
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
      "google",
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

  // POST /settings/ai/models — elenca i modelli disponibili per un provider.
  // HTTP 200 sempre: { models, error? }. Best-effort, mai eccezioni propagate.
  // - opencode/agy: spawn CLI `<binary> models` (timeout 15s)
  // - ollama: HTTP listTextModels
  // - codex/claude/openai/google/stability/bfl/replicate/fal: default-codice ∪ DB
  api.post("/settings/ai/models", async (c) => {
    const body = await jsonBody(c);
    const provider = typeof body.provider === "string" ? body.provider.trim() : "";
    if (provider === "") return c.json({ models: [], error: "provider mancante" });

    // Helper: esegue `binary models`, timeout 15s, ritorna righe non vuote.
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
          finish({ models: [], error: e instanceof Error ? e.message : String(e) });
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
        const models = await listTextModels({ provider: "ollama", baseUrl: resolvedBaseUrl });
        if (models.length === 0) {
          return c.json({ models: [], error: "Nessun modello: verifica la connessione Ollama." });
        }
        return c.json({ models });
      }

      const DB_PROVIDERS = new Set([
        "codex",
        "claude",
        "openai",
        "google",
        "stability",
        "bfl",
        "replicate",
        "fal",
      ]);
      if (DB_PROVIDERS.has(provider)) {
        const models = await modelsFor(provider, aiSettings.getModels);
        return c.json({ models });
      }

      return c.json({ models: [] });
    } catch (e) {
      return c.json({ models: [], error: e instanceof Error ? e.message : String(e) });
    }
  });

  // POST /settings/ai/models/add — aggiunge un modello alla lista DB del provider.
  // Body: { provider, model }. HTTP 200: { models }.
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

  // POST /settings/ai/models/remove — rimuove un modello dalla lista DB del provider.
  // Body: { provider, model }. HTTP 200: { models }.
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

  // GET /settings/ai/cli-status?tool=opencode|codex|claude|agy — presenza del binario CLI (NON il login).
  // Esegue `<binary> --version` con timeout breve via spawn: installed=true se esce 0 (stdout=version).
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
    // Helper spawn inline minimale: risolve con { installed, version, error }.
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
          finish({ installed: false, version: null, error: `Uscita CLI con codice ${code}` });
        }
      });
    });
    return c.json({ tool, ...result });
  });

  // POST /settings/ai/cli-login { tool: opencode|codex|claude|agy } — AVVIA il login del CLI ad
  // abbonamento. DIFENSIVO: non blocca MAI la richiesta. Cattura stdout+stderr per ~5s e poi
  // RISOLVE (il login OAuth prosegue nel browser/terminale per conto suo). Estrae la PRIMA URL
  // https:// dall'output (per mostrarla cliccabile). NON logga token o output oltre l'URL.
  // - codex → `codex login`
  // - agy/claude → primo avvio interattivo che lancia l'OAuth; se non pilotabile l'utente completa a mano.
  // - opencode → `opencode auth login` è un picker TUI: ritorna started:false + hint (non pilotabile).
  api.post("/settings/ai/cli-login", async (c) => {
    const body = await jsonBody(c);
    const tool = typeof body.tool === "string" ? body.tool : "";
    if (tool !== "opencode" && tool !== "codex" && tool !== "claude" && tool !== "agy") {
      return c.json(err("tool non valido"), 400);
    }

    // opencode: TUI interattiva non pilotabile da spawn → istruzione esplicita all'utente.
    if (tool === "opencode") {
      return c.json({
        tool,
        started: false,
        hint: "Esegui `opencode auth login` in un terminale e completa il login.",
      });
    }

    const binary =
      tool === "codex"
        ? appConfig.codexBinary
        : tool === "claude"
          ? appConfig.claudeBinary
          : appConfig.agyBinary;
    // codex login; agy/claude: primo avvio in modalità interattiva fa l'OAuth.
    const args = tool === "codex" ? ["login"] : [];

    // Estrae la PRIMA URL https:// dall'output combinato (best-effort).
    const firstUrl = (text: string): string | null => {
      const m = text.match(/https:\/\/[^\s"'`]+/);
      return m ? m[0] : null;
    };

    const result = await new Promise<{
      started: boolean;
      output?: string;
      url?: string | null;
      hint?: string;
      error?: string;
    }>((resolve) => {
      let combined = "";
      let settled = false;
      const finish = (r: {
        started: boolean;
        output?: string;
        url?: string | null;
        hint?: string;
        error?: string;
      }): void => {
        if (settled) return;
        settled = true;
        resolve(r);
      };

      let child: ReturnType<typeof spawn>;
      try {
        // stdin ignorato: niente prompt interattivi pilotati; il login prosegue per conto suo.
        child = spawn(resolveBinary(binary), args, {
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
          env: { ...process.env, PATH: enginePath() },
        });
      } catch (e) {
        finish({
          started: false,
          error: e instanceof Error ? e.message : String(e),
          hint:
            tool === "codex"
              ? "Esegui `codex login` in un terminale."
              : `Esegui \`${tool}\` in un terminale e completa il login.`,
        });
        return;
      }

      // Dopo ~5s RISOLVIAMO comunque: la cattura basta a estrarre l'eventuale URL OAuth.
      const timer = setTimeout(() => {
        // Stacchiamo il processo dalla pipe: continua a vivere per completare l'OAuth.
        child.stdout?.removeAllListeners("data");
        child.stderr?.removeAllListeners("data");
        child.unref();
        const url = firstUrl(combined);
        finish({
          started: true,
          url,
          output: url ?? undefined, // NON esponiamo l'output grezzo: solo l'URL.
          hint:
            (tool === "agy" || tool === "claude") && url == null
              ? `Se il login non si apre, esegui \`${tool}\` in un terminale e completa l'OAuth.`
              : undefined,
        });
      }, 5_000);

      child.stdout?.on("data", (d: Buffer) => {
        combined += d.toString();
      });
      child.stderr?.on("data", (d: Buffer) => {
        combined += d.toString();
      });
      child.on("error", (e: Error) => {
        clearTimeout(timer);
        finish({
          started: false,
          error: e.message,
          hint:
            tool === "codex"
              ? "Esegui `codex login` in un terminale."
              : `Esegui \`${tool}\` in un terminale e completa il login.`,
        });
      });
      child.on("close", () => {
        clearTimeout(timer);
        const url = firstUrl(combined);
        finish({ started: true, url, output: url ?? undefined });
      });
    });

    return c.json({ tool, ...result });
  });

  // POST /settings/ai/test-text — verifica il MOTORE TESTO corrente con una mini-chiamata.
  // HTTP 200 SEMPRE: l'esito sta nel body { ok, provider, sample? , error? }. Timeout breve
  // (race) così un CLI/HTTP lento non blocca la UI. Le chiavi non vengono MAI loggate/esposte.
  api.post("/settings/ai/test-text", async (c) => {
    // deps.engine è il WRAPPER DINAMICO: run() ricostruisce il motore dalla config CORRENTE
    // (aiSettings.getText()), quindi riflette sempre il provider attivo senza riavvio.
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

  // POST /settings/ai/test-image — verifica LEGGERA di raggiungibilità/auth del provider IMMAGINI
  // corrente (NON genera un'immagine vera). HTTP 200 sempre: esito nel body { ok, provider, error? }.
  api.post("/settings/ai/test-image", async (c) => {
    const cfg = aiSettings.getImage();
    const provider = cfg.provider;
    const TEST_TIMEOUT_MS = 12_000;
    // GET con timeout breve: ritorna lo status HTTP, oppure null su errore di rete/timeout.
    async function probe(url: string, headers?: Record<string, string>): Promise<number | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
      try {
        const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
        return res.status;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
    try {
      if (provider === "local" || provider === "auto") {
        if (imageGenAvailable()) return c.json({ ok: true, provider });
        return c.json({ ok: false, provider, error: "Motore immagini locale non disponibile." });
      }
      if (provider === "openai") {
        if (cfg.openaiApiKey == null || cfg.openaiApiKey === "") {
          return c.json({ ok: false, provider, error: "Chiave OpenAI non configurata." });
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
      if (provider === "google") {
        if (cfg.googleApiKey == null || cfg.googleApiKey === "") {
          return c.json({ ok: false, provider, error: "Chiave Google non configurata." });
        }
        const root = cfg.googleBaseUrl.replace(/\/+$/, "");
        const status = await probe(`${root}/models?key=${encodeURIComponent(cfg.googleApiKey)}`);
        if (status === 200) return c.json({ ok: true, provider });
        return c.json({
          ok: false,
          provider,
          error: status == null ? "Endpoint non raggiungibile." : `HTTP ${status}`,
        });
      }
      // stability/bfl/replicate/fal: ok se la chiave è presente (best-effort).
      const keyMap: Record<string, string | null | undefined> = {
        stability: cfg.stabilityApiKey,
        bfl: cfg.bflApiKey,
        replicate: cfg.replicateApiKey,
        fal: cfg.falApiKey,
      };
      if (provider in keyMap) {
        const key = keyMap[provider];
        if (key == null || key === "") {
          return c.json({ ok: false, provider, error: `Chiave ${provider} non configurata.` });
        }
        return c.json({ ok: true, provider });
      }
      // none (o sconosciuto): nessun provider immagini configurato.
      return c.json({ ok: false, provider, error: "Nessun provider immagini configurato." });
    } catch (e) {
      return c.json({ ok: false, provider, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
