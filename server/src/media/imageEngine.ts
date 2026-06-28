import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, delimiter, dirname } from "node:path";
import { appConfig } from "../config.js";
import * as aiSettings from "../content/aiSettings.js";
import { resolveBinary, enginePath } from "../content/engine.js";
import { dimsForAspect, type SceneAspect } from "./imageGen.js";
import { dataDir } from "../paths.js";

// Astrazione PLUGGABLE del motore IMMAGINI (analoga a ContentEngine per il testo).
// Un solo ImageEngine attivo, scelto da `createImageEngine()` in base a IMAGE_PROVIDER.
// generate() produce UN'immagine al percorso outPath dal prompt COMPLETO (già con lo stile):
// ritorna outPath se ok, null se fallisce / non disponibile (il chiamante ripiega).

// Input di generate(): prompt COMPLETO + aspect + outPath. seed/steps/cfg sono opzionali e
// usati SOLO dal backend locale sd-cli (i backend HTTP li ignorano).
export interface ImageGenInput {
  prompt: string;
  aspect: SceneAspect;
  outPath: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  signal?: AbortSignal;
}

export interface ImageEngine {
  name(): string;
  available(): boolean;
  // genera UN'immagine al percorso outPath: ritorna outPath se ok, null se fallisce/non disponibile.
  generate(input: ImageGenInput): Promise<string | null>;
}

// Ultimo motore IMMAGINI realmente usato da generate() (primario o fallback), col nome concreto.
// I name in fallback portano il suffisso " (fallback)" per evidenziare il cambio nella UI.
let lastImageEngine: string | null = null;
export function getLastImageEngine(): string | null {
  return lastImageEngine;
}

// =====================================================================================
// Backend LOCALE: sd-cli (stable-diffusion.cpp) + Z-Image Turbo. Incapsula la logica
// spawn storica. Tutti gli env SDCPP_* restano invariati. La GPU regge UNA generazione
// alla volta → coda SERIALE (mutex). Lo stile è già nel prompt (via buildScenePrompt).
// =====================================================================================

function sdRoot(): string {
  return process.env.SDCPP_DIR || join(dataDir(), "sdcpp");
}
function sdCliPath(): string {
  return process.env.SDCPP_CLI || join(sdRoot(), "sd-cli");
}
function backendArg(): string {
  return process.env.SDCPP_BACKEND || "te=cpu,vae=cpu,diffusion=vulkan0";
}
function timeoutMs(): number {
  const v = Number(process.env.SDCPP_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 1_200_000; // 20 min: la CPU sul VAE è lenta
}

// ---- Z-IMAGE TURBO (Tongyi, 6B): file GGUF in models/zimage/. ----
function zimageDir(): string {
  return process.env.SDCPP_ZIMAGE_DIR || join(sdRoot(), "models", "zimage");
}
function zDiffusionPath(): string {
  return process.env.SDCPP_ZIMAGE_MODEL || join(zimageDir(), "z_image_turbo-Q8_0.gguf");
}
function zLlmPath(): string {
  return process.env.SDCPP_ZIMAGE_LLM || join(zimageDir(), "qwen_3_4b-Q8_0.gguf");
}
function zVaePath(): string {
  return process.env.SDCPP_ZIMAGE_VAE || join(zimageDir(), "ae_bf16.safetensors");
}
function zimageInstalled(): boolean {
  return existsSync(zDiffusionPath()) && existsSync(zLlmPath()) && existsSync(zVaePath());
}

// ---- coda SERIALE: una generazione alla volta (1 GPU, altrimenti OOM) ----
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

function richPath(): string {
  const home = homedir();
  const candidates = [
    dirname(process.execPath),
    "/usr/local/bin",
    "/usr/bin",
    join(home, ".local", "bin"),
    ...(process.env.PATH ? process.env.PATH.split(delimiter) : []),
  ];
  const seen = new Set<string>();
  return candidates.filter((d) => d && !seen.has(d) && seen.add(d)).join(delimiter);
}

function runSdCli(
  args: string[],
  signal?: AbortSignal,
): Promise<{ code: number | null; stderr: string; timedOut: boolean; aborted: boolean }> {
  return new Promise((resolveP, reject) => {
    let child;
    try {
      child = spawn(sdCliPath(), args, {
        cwd: sdRoot(),
        stdio: ["ignore", "pipe", "pipe"],
        // LD_LIBRARY_PATH: libstable-diffusion.so sta accanto al binario.
        env: {
          ...process.env,
          PATH: richPath(),
          LD_LIBRARY_PATH: `${sdRoot()}${delimiter}${process.env.LD_LIBRARY_PATH ?? ""}`,
        },
      });
    } catch (e) {
      reject(e);
      return;
    }
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs());
    // ANNULLA: se il segnale viene abortito, killiamo subito il processo sd-cli in corso.
    const onAbort = () => {
      aborted = true;
      child.kill("SIGKILL");
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    child.stdout.on("data", () => {});
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolveP({ code, stderr, timedOut, aborted });
    });
  });
}

export class LocalSdCliImageEngine implements ImageEngine {
  name(): string {
    return "local-sdcli";
  }

  // sd-cli + file Z-Image presenti e non disabilitato via env (logica storica di imageGenAvailable).
  available(): boolean {
    const v = (process.env.IMAGEGEN_ENABLED ?? "true").toLowerCase();
    if (v === "false" || v === "0" || v === "no") return false;
    return existsSync(sdCliPath()) && zimageInstalled();
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (!this.available() || input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    const { w, h } = dimsForAspect(input.aspect);
    const seed = Number.isFinite(input.seed)
      ? Number(input.seed)
      : Math.floor(Math.random() * 1_000_000_000);
    // Z-IMAGE TURBO: cfg-scale 1.0 (a cfg 1 i negative sono ignorati), 8 step (minimo per il turbo),
    // flash-attention + offload-to-cpu per stare nella RAM dell'iGPU. Verificato a 1024² in ~7m30s.
    const steps = Number.isFinite(input.steps) && Number(input.steps) > 0 ? Number(input.steps) : 8;
    const cfg = Number.isFinite(input.cfg) && Number(input.cfg) > 0 ? Number(input.cfg) : 1.0;
    const args = [
      "--diffusion-model",
      zDiffusionPath(),
      "--vae",
      zVaePath(),
      "--llm",
      zLlmPath(),
      "-p",
      input.prompt,
      "--cfg-scale",
      String(cfg),
      "--steps",
      String(steps),
      "--sampling-method",
      "euler",
      "--diffusion-fa",
      "--offload-to-cpu",
      "-W",
      String(w),
      "-H",
      String(h),
      "--seed",
      String(seed),
      "--backend",
      backendArg(),
      "-o",
      input.outPath,
    ];
    // eslint-disable-next-line no-console
    console.log(`[imagegen] local ${input.aspect} seed=${seed}`);
    return serial(async () => {
      if (input.signal?.aborted) return null;
      let res;
      try {
        res = await runSdCli(args, input.signal);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          `[imagegen] sd-cli non avviabile: ${e instanceof Error ? e.message : String(e)}`,
        );
        return null;
      }
      if (res.aborted) return null;
      if (res.timedOut || res.code !== 0 || !existsSync(input.outPath)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[imagegen] generazione fallita (code ${res.code}, timeout ${res.timedOut}): ${res.stderr.trim().split("\n").pop() ?? ""}`,
        );
        return null;
      }
      return input.outPath;
    });
  }
}

// =====================================================================================
// Backend HTTP: helpers comuni (NIENTE SDK; usa la global `fetch` di Node 20+).
// =====================================================================================

async function fetchImageWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
  signal?: AbortSignal,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null; // timeout, abort o errore di rete: best-effort, il chiamante ripiega.
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// =====================================================================================
// Backend OPENAI Images: POST /v1/images/generations (model gpt-image-1), risposta b64_json.
// =====================================================================================

// OpenAI Images supporta solo poche size: mappiamo l'aspect alla più vicina.
function openaiSizeForAspect(aspect: SceneAspect): string {
  switch (aspect) {
    case "4:5":
    case "9:16":
      return "1024x1536"; // verticale
    case "1.91:1":
    case "16:9":
      return "1536x1024"; // orizzontale
    case "1:1":
    default:
      return "1024x1024";
  }
}

// Deriva l'endpoint /v1/images/generations dalla openaiBaseUrl (togli un eventuale /v1 finale).
function openaiImagesUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  return `${root}/v1/images/generations`;
}

export class OpenAIImageEngine implements ImageEngine {
  constructor(
    private readonly apiKey: string | null,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "openai";
  }

  available(): boolean {
    return this.apiKey != null;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (!this.available() || input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    const url = openaiImagesUrl(this.baseUrl);
    const res = await fetchImageWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: input.prompt,
          size: openaiSizeForAspect(input.aspect),
          n: 1,
        }),
      },
      this.timeoutMs,
      input.signal,
    );
    if (!res) return null;
    const body = await res.text();
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[imagegen] OpenAI HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let data: { data?: { b64_json?: string }[] };
    try {
      data = JSON.parse(body);
    } catch {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] OpenAI: risposta non in JSON valido");
      return null;
    }
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] OpenAI: nessun b64_json nella risposta");
      return null;
    }
    try {
      await writeFile(input.outPath, Buffer.from(b64, "base64"));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[imagegen] OpenAI: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

// =====================================================================================
// Backend GOOGLE Imagen: POST ${baseUrl}/models/${model}:predict?key=...
// risposta predictions[0].bytesBase64Encoded.
// =====================================================================================

// Imagen accetta aspectRatio specifici: mappiamo l'aspect dell'app a quelli supportati.
function imagenAspectRatio(aspect: SceneAspect): string {
  switch (aspect) {
    case "4:5":
      return "3:4"; // verticale più vicino supportato
    case "9:16":
      return "9:16";
    case "1.91:1":
    case "16:9":
      return "16:9";
    case "1:1":
    default:
      return "1:1";
  }
}

export class GoogleImagenImageEngine implements ImageEngine {
  constructor(
    private readonly apiKey: string | null,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "google";
  }

  available(): boolean {
    return this.apiKey != null;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (!this.available() || input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    const url = `${this.baseUrl}/models/${this.model}:predict?key=${encodeURIComponent(this.apiKey as string)}`;
    const res = await fetchImageWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: input.prompt }],
          parameters: { sampleCount: 1, aspectRatio: imagenAspectRatio(input.aspect) },
        }),
      },
      this.timeoutMs,
      input.signal,
    );
    if (!res) return null;
    const body = await res.text();
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[imagegen] Google HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let data: { predictions?: { bytesBase64Encoded?: string }[] };
    try {
      data = JSON.parse(body);
    } catch {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] Google: risposta non in JSON valido");
      return null;
    }
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] Google: nessun bytesBase64Encoded nella risposta");
      return null;
    }
    try {
      await writeFile(input.outPath, Buffer.from(b64, "base64"));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[imagegen] Google: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

// =====================================================================================
// Backend STABILITY (Stability AI): POST /v2beta/stable-image/generate/${model}
// body multipart FormData, risposta = BYTE immagine grezzi (Accept: image/*).
// =====================================================================================

// Stability accetta aspect_ratio specifici: mappiamo l'aspect dell'app a quelli supportati.
function stabilityAspectRatio(aspect: SceneAspect): string {
  switch (aspect) {
    case "4:5":
      return "4:5";
    case "9:16":
      return "9:16";
    case "1.91:1":
    case "16:9":
      return "16:9";
    case "1:1":
    default:
      return "1:1";
  }
}

export class StabilityImageEngine implements ImageEngine {
  constructor(
    private readonly apiKey: string | null,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "stability";
  }

  available(): boolean {
    return this.apiKey != null;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (!this.available() || input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    // Body multipart: usa la FormData globale (Node 20+), niente SDK.
    const form = new FormData();
    form.set("prompt", input.prompt);
    form.set("aspect_ratio", stabilityAspectRatio(input.aspect));
    form.set("output_format", "png");
    const url = `https://api.stability.ai/v2beta/stable-image/generate/${this.model}`;
    const res = await fetchImageWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "image/*",
        },
        body: form,
      },
      this.timeoutMs,
      input.signal,
    );
    if (!res) return null;
    if (!res.ok) {
      const body = await res.text();
      // eslint-disable-next-line no-console
      console.warn(`[imagegen] Stability HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    try {
      const bytes = Buffer.from(await res.arrayBuffer());
      await writeFile(input.outPath, bytes);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[imagegen] Stability: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

// =====================================================================================
// Backend BFL (Black Forest Labs / FLUX): POST /v1/${model} → {id, polling_url?},
// poi POLL finché status==="Ready" → result.sample è un URL da scaricare.
// =====================================================================================

export class BflImageEngine implements ImageEngine {
  constructor(
    private readonly apiKey: string | null,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "bfl";
  }

  available(): boolean {
    return this.apiKey != null;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (!this.available() || input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    const { w, h } = dimsForAspect(input.aspect);
    // 1) richiesta di generazione → ottieni id e (opzionale) polling_url.
    const submit = await fetchImageWithTimeout(
      `https://api.bfl.ml/v1/${this.model}`,
      {
        method: "POST",
        headers: { "x-key": this.apiKey as string, "content-type": "application/json" },
        body: JSON.stringify({ prompt: input.prompt, width: w, height: h }),
      },
      this.timeoutMs,
      input.signal,
    );
    if (!submit) return null;
    if (!submit.ok) {
      const body = await submit.text();
      // eslint-disable-next-line no-console
      console.warn(`[imagegen] BFL HTTP ${submit.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let task: { id?: string; polling_url?: string };
    try {
      task = JSON.parse(await submit.text());
    } catch {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] BFL: risposta submit non in JSON valido");
      return null;
    }
    if (!task.id) {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] BFL: nessun id nella risposta");
      return null;
    }
    const pollUrl = task.polling_url ?? `https://api.bfl.ml/v1/get_result?id=${task.id}`;
    // 2) POLL ogni ~1500ms entro il timeout finché lo status è terminale.
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      if (input.signal?.aborted) return null;
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetchImageWithTimeout(
        pollUrl,
        { method: "GET", headers: { "x-key": this.apiKey as string } },
        this.timeoutMs,
        input.signal,
      );
      if (!poll) return null;
      if (!poll.ok) continue; // errore transitorio: riprova entro il deadline.
      let result: { status?: string; result?: { sample?: string } };
      try {
        result = JSON.parse(await poll.text());
      } catch {
        continue;
      }
      const status = result.status;
      if (status === "Ready") {
        const sample = result.result?.sample;
        if (!sample) return null;
        // 3) scarica l'URL dell'immagine pronta e scrivi i byte.
        const img = await fetchImageWithTimeout(
          sample,
          { method: "GET" },
          this.timeoutMs,
          input.signal,
        );
        if (!img || !img.ok) return null;
        try {
          await writeFile(input.outPath, Buffer.from(await img.arrayBuffer()));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(
            `[imagegen] BFL: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
          );
          return null;
        }
        return input.outPath;
      }
      if (status === "Error" || status === "Content Moderated" || status === "Task not found") {
        // eslint-disable-next-line no-console
        console.warn(`[imagegen] BFL: status terminale ${status}`);
        return null;
      }
      // altri status (es. "Pending"/"Processing"): continua il poll.
    }
    // eslint-disable-next-line no-console
    console.warn("[imagegen] BFL: timeout in attesa del risultato");
    return null;
  }
}

// =====================================================================================
// Backend REPLICATE: POST /v1/models/${owner}/${name}/predictions con Prefer: wait
// → la prediction è già completata: `output` è un URL (o array di URL) da scaricare.
// =====================================================================================

// Replicate/FLUX usa aspect_ratio: mappiamo l'aspect dell'app a quelli supportati.
function fluxAspectRatio(aspect: SceneAspect): string {
  switch (aspect) {
    case "4:5":
      return "4:5";
    case "9:16":
      return "9:16";
    case "1.91:1":
    case "16:9":
      return "16:9";
    case "1:1":
    default:
      return "1:1";
  }
}

export class ReplicateImageEngine implements ImageEngine {
  constructor(
    private readonly apiKey: string | null,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "replicate";
  }

  available(): boolean {
    return this.apiKey != null;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (!this.available() || input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    // Il model è "owner/name": senza "/" non possiamo costruire l'endpoint.
    const slash = this.model.indexOf("/");
    if (slash <= 0 || slash >= this.model.length - 1) {
      // eslint-disable-next-line no-console
      console.warn(`[imagegen] Replicate: model non in formato owner/name: ${this.model}`);
      return null;
    }
    const owner = this.model.slice(0, slash);
    const nm = this.model.slice(slash + 1);
    const url = `https://api.replicate.com/v1/models/${owner}/${nm}/predictions`;
    const res = await fetchImageWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          // Prefer: wait → Replicate attende e ritorna la prediction completata.
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: { prompt: input.prompt, aspect_ratio: fluxAspectRatio(input.aspect) },
        }),
      },
      this.timeoutMs,
      input.signal,
    );
    if (!res) return null;
    if (!res.ok) {
      const body = await res.text();
      // eslint-disable-next-line no-console
      console.warn(`[imagegen] Replicate HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let data: { status?: string; output?: string | string[] };
    try {
      data = JSON.parse(await res.text());
    } catch {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] Replicate: risposta non in JSON valido");
      return null;
    }
    if (data.status !== "succeeded") {
      // eslint-disable-next-line no-console
      console.warn(`[imagegen] Replicate: status ${data.status ?? "?"}`);
      return null;
    }
    const out = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!out) {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] Replicate: nessun output nella prediction");
      return null;
    }
    const img = await fetchImageWithTimeout(out, { method: "GET" }, this.timeoutMs, input.signal);
    if (!img || !img.ok) return null;
    try {
      await writeFile(input.outPath, Buffer.from(await img.arrayBuffer()));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[imagegen] Replicate: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

// =====================================================================================
// Backend FAL (fal.ai): POST https://fal.run/${model} → {images:[{url}]} da scaricare.
// =====================================================================================

// fal usa image_size simboliche: mappiamo l'aspect dell'app a quelle supportate.
function falImageSize(aspect: SceneAspect): string {
  switch (aspect) {
    case "4:5":
      return "portrait_4_3";
    case "9:16":
      return "portrait_16_9";
    case "1.91:1":
    case "16:9":
      return "landscape_16_9";
    case "1:1":
    default:
      return "square_hd";
  }
}

export class FalImageEngine implements ImageEngine {
  constructor(
    private readonly apiKey: string | null,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "fal";
  }

  available(): boolean {
    return this.apiKey != null;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (!this.available() || input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    const res = await fetchImageWithTimeout(
      `https://fal.run/${this.model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ prompt: input.prompt, image_size: falImageSize(input.aspect) }),
      },
      this.timeoutMs,
      input.signal,
    );
    if (!res) return null;
    if (!res.ok) {
      const body = await res.text();
      // eslint-disable-next-line no-console
      console.warn(`[imagegen] fal HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let data: { images?: { url?: string }[] };
    try {
      data = JSON.parse(await res.text());
    } catch {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] fal: risposta non in JSON valido");
      return null;
    }
    const out = data.images?.[0]?.url;
    if (!out) {
      // eslint-disable-next-line no-console
      console.warn("[imagegen] fal: nessuna immagine nella risposta");
      return null;
    }
    const img = await fetchImageWithTimeout(out, { method: "GET" }, this.timeoutMs, input.signal);
    if (!img || !img.ok) return null;
    try {
      await writeFile(input.outPath, Buffer.from(await img.arrayBuffer()));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(
        `[imagegen] fal: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

// =====================================================================================
// Backend NOOP: nessun motore disponibile (IMAGE_PROVIDER=none o auto senza locale).
// =====================================================================================

export class NoopImageEngine implements ImageEngine {
  name(): string {
    return "none";
  }
  available(): boolean {
    return false;
  }
  async generate(): Promise<string | null> {
    return null;
  }
}

/** Base dir per le work dir temporanee degli agenti: dentro il data dir (scrivibile in Docker). */
function agentWorkBase(): string {
  const base = join(dataDir(), ".agent-work");
  mkdirSync(base, { recursive: true });
  return base;
}

// =====================================================================================
// Backend AGENTICO (agy): CLI AI che salva direttamente il PNG su disco. NON è un backend
// HTTP: si spawna il binario passandogli l'istruzione di salvare il file ESATTAMENTE a
// outPath, poi si verifica che il file esista e sia plausibile. Best-effort: ogni errore
// (binario assente, timeout, abort, file non scritto/troppo piccolo) → null e il chiamante ripiega.
// =====================================================================================

// Istruzione testuale per l'agente: genera l'immagine col MODELLO immagine (mai con codice)
// alle dimensioni richieste e salvala esattamente a outPath come PNG, senza altro output.
function agentImageInstruction(input: ImageGenInput): string {
  const { w, h } = dimsForAspect(input.aspect);
  return (
    `Use your built-in IMAGE GENERATION model to render a real raster illustration. ` +
    `Do NOT draw it with code, Python, Pillow, matplotlib, SVG, canvas or any script: if you ` +
    `cannot use the image-generation model (e.g. quota exhausted), produce NOTHING and do not ` +
    `create any placeholder file. ` +
    `Generate ONE image with aspect ratio ${w}x${h} (width ${w} px, height ${h} px) — ` +
    `respect this aspect ratio, do NOT output a square if a non-square ratio is requested. ` +
    `Depict EXACTLY this scene, reproducing it faithfully: ${input.prompt} ` +
    `Keep every described detail — the setting, the framing/point of view, the poses and ` +
    `especially the CLOTHING of each person. Do NOT simplify, omit, restyle away or invent ` +
    `elements that are not described. ` +
    `Save it exactly to the file ${input.outPath} as a PNG. ` +
    `Overwrite if it exists. Do not output anything else.`
  );
}

// Spawn di un agente CLI che scrive un file: attende la chiusura del processo (entro un
// timeout) onorando l'eventuale AbortSignal, poi verifica l'esistenza di outPath.
// Ritorna outPath se il file esiste a fine processo, altrimenti null. Non lancia mai.
function spawnImageAgent(
  cmd: string,
  args: string[],
  input: ImageGenInput,
  timeoutMs: number,
  cwd?: string,
): Promise<string | null> {
  if (input.signal?.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(resolveBinary(cmd), args, {
        stdio: ["ignore", "ignore", "ignore"],
        env: { ...process.env, PATH: enginePath() },
        detached: true, // gruppo di processi: l'agente (agy) lancia sotto-processi (python/tool)
        ...(cwd ? { cwd } : {}),
      });
    } catch {
      resolve(null);
      return;
    }
    // Uccide l'INTERO gruppo (agente + figli): un semplice child.kill lascerebbe orfani i tool
    // lanciati dall'agente, che continuerebbero a scrivere su outPath sovrapponendosi al fallback.
    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* già terminato */
        }
      }
    };
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => {
      killTree();
      finish(null);
    };
    const timer = setTimeout(() => {
      killTree();
      finish(null);
    }, timeoutMs);
    if (input.signal) input.signal.addEventListener("abort", onAbort, { once: true });
    child.on("error", () => finish(null));
    child.on("close", () => {
      // Rete di sicurezza: un'immagine vera (modello AI) pesa centinaia di KB; un placeholder
      // disegnato via codice (es. agy che ripiega su PIL quando la quota immagine è finita) è
      // di pochi KB → lo trattiamo come fallimento così scatta il fallback (z-image).
      let ok = existsSync(input.outPath);
      if (ok) {
        try {
          if (statSync(input.outPath).size < 20_000) ok = false;
        } catch {
          ok = false;
        }
      }
      finish(ok ? input.outPath : null);
    });
  });
}

export class AgyImageEngine implements ImageEngine {
  constructor(
    private readonly binary: string,
    private readonly model: string,
  ) {}

  name(): string {
    return "agy(image)";
  }

  // La verifica reale del binario la fa generate() (esistenza del file a fine processo).
  available(): boolean {
    return true;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    const outDir = dirname(input.outPath);
    mkdirSync(outDir, { recursive: true });
    const work = await mkdtemp(join(agentWorkBase(), "agy-img-")).catch(() => null);
    if (!work) return null;
    try {
      const instruction = agentImageInstruction(input);
      const args = [
        ...(this.model ? ["--model", this.model] : []),
        "--dangerously-skip-permissions",
        "--add-dir",
        outDir,
        "--print",
        instruction,
      ];
      return await spawnImageAgent(this.binary, args, input, 600_000, work);
    } finally {
      rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Registry centrale dei provider del motore IMMAGINI. È l'UNICO punto di estensione:
 * per aggiungere un provider immagini, implementa l'interfaccia `ImageEngine` (qui)
 * e aggiungi un `case` in questo switch, instradato da aiSettings.getImage().provider.
 *
 *  - local     -> LocalSdCliImageEngine (sd-cli/Z-Image, default storico quando disponibile)
 *  - openai    -> OpenAIImageEngine (POST /v1/images/generations, gpt-image-1)
 *  - google    -> GoogleImagenImageEngine (POST :predict, imagen-3.0)
 *  - stability -> StabilityImageEngine (POST /v2beta/stable-image/generate, byte grezzi)
 *  - bfl       -> BflImageEngine (Black Forest Labs/FLUX, submit + polling → URL)
 *  - replicate -> ReplicateImageEngine (POST predictions con Prefer: wait → URL)
 *  - fal       -> FalImageEngine (fal.ai, POST https://fal.run/${model} → URL)
 *  - agy       -> AgyImageEngine (agente CLI che salva il PNG su disco)
 *  - none      -> NoopImageEngine (available()=false, generate()=null)
 *  - auto      -> local se disponibile, altrimenti none (DEFAULT)
 */
function buildImageEngine(provider: string, modelOverride?: string): ImageEngine {
  // Config EFFETTIVA a RUNTIME: cache aiSettings (DB/keyring) ?? env. Si rilegge a ogni
  // operazione, quindi i cambi via Impostazioni si applicano subito senza riavvio.
  const base = aiSettings.getImage();
  // modelOverride (usato dal fallback): rimpiazza il modello del provider scelto.
  const ov = modelOverride && modelOverride.trim() !== "" ? modelOverride : null;
  const cfg = ov
    ? {
        ...base,
        openaiImageModel: ov,
        googleImageModel: ov,
        stabilityImageModel: ov,
        bflImageModel: ov,
        replicateImageModel: ov,
        falImageModel: ov,
        agyImageModel: ov,
      }
    : base;
  switch (provider) {
    case "local":
      return new LocalSdCliImageEngine();
    case "openai":
      return new OpenAIImageEngine(
        cfg.openaiApiKey,
        cfg.openaiBaseUrl,
        cfg.openaiImageModel,
        appConfig.engineTimeoutMs,
      );
    case "google":
      return new GoogleImagenImageEngine(
        cfg.googleApiKey,
        cfg.googleBaseUrl,
        cfg.googleImageModel,
        appConfig.engineTimeoutMs,
      );
    case "stability":
      return new StabilityImageEngine(
        cfg.stabilityApiKey,
        cfg.stabilityImageModel,
        appConfig.engineTimeoutMs,
      );
    case "bfl":
      return new BflImageEngine(cfg.bflApiKey, cfg.bflImageModel, appConfig.engineTimeoutMs);
    case "replicate":
      return new ReplicateImageEngine(
        cfg.replicateApiKey,
        cfg.replicateImageModel,
        appConfig.engineTimeoutMs,
      );
    case "fal":
      return new FalImageEngine(cfg.falApiKey, cfg.falImageModel, appConfig.engineTimeoutMs);
    case "agy":
      return new AgyImageEngine(appConfig.agyBinary, cfg.agyImageModel);
    case "none":
      return new NoopImageEngine();
    case "auto":
    default: {
      const local = new LocalSdCliImageEngine();
      return local.available() ? local : new NoopImageEngine();
    }
  }
}

// Wrapper FALLBACK-AWARE attorno al motore primario. name()/available() restano quelli
// del primario; generate() prova il primario e, SOLO se quello ritorna null o lancia,
// ripiega UNA volta sul fallbackProvider (se valorizzato, != "none" e != primario).
// L'eventuale outPath scritto a metà dal primario viene sovrascritto dal fallback.
class FallbackImageEngine implements ImageEngine {
  constructor(
    private readonly primary: ImageEngine,
    private readonly primaryProvider: string,
    private readonly fallbackProvider: string,
    private readonly fallbackModel: string,
  ) {}

  name(): string {
    return this.primary.name();
  }

  available(): boolean {
    return this.primary.available();
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    let primaryResult: string | null = null;
    try {
      primaryResult = await this.primary.generate(input);
    } catch {
      primaryResult = null;
    }
    if (primaryResult) {
      lastImageEngine = this.primary.name();
      return primaryResult;
    }
    const fb = this.fallbackProvider;
    if (!fb || fb === "none" || fb === this.primaryProvider) return null;
    // eslint-disable-next-line no-console
    console.warn(`[image] fallback a ${fb}`);
    const fallbackEngine = buildImageEngine(fb, this.fallbackModel);
    try {
      const result = await fallbackEngine.generate(input);
      if (result) lastImageEngine = `${fallbackEngine.name()} (fallback)`;
      return result;
    } catch {
      return null;
    }
  }
}

/**
 * Motore IMMAGINI attivo, FALLBACK-AWARE. Costruisce il primario da
 * aiSettings.getImage().provider e lo avvolge in un wrapper che ripiega una volta sul
 * fallbackProvider se il primario fallisce. Con provider "local" + fallback "none" il
 * comportamento è IDENTICO al motore locale puro (nessun fallback, nessun wrapper inutile).
 */
export function createImageEngine(): ImageEngine {
  const cfg = aiSettings.getImage();
  const primary = buildImageEngine(cfg.provider);
  const fb = cfg.fallbackProvider;
  if (!fb || fb === "none" || fb === cfg.provider) {
    lastImageEngine = primary.name();
    return primary;
  }
  return new FallbackImageEngine(primary, cfg.provider, fb, cfg.fallbackModel);
}

export function imagePromptProfile(): string {
  const cfg = aiSettings.getImage();
  const p = cfg.provider;
  const model =
    p === "openai"
      ? cfg.openaiImageModel
      : p === "google"
        ? cfg.googleImageModel
        : p === "stability"
          ? cfg.stabilityImageModel
          : p === "bfl"
            ? cfg.bflImageModel
            : p === "replicate"
              ? cfg.replicateImageModel
              : p === "fal"
                ? cfg.falImageModel
                : p === "agy"
                  ? cfg.agyImageModel
                  : "";
  const tag = model && model.trim() !== "" ? `${p} (${model})` : p;
  switch (p) {
    case "local":
    case "auto":
      return `${tag} = Z-Image Turbo via stable-diffusion.cpp. Its text encoder is a SMALL LLM and it runs in FEW denoising steps, so it reads NATURAL-LANGUAGE sentences (not tag lists) and ANCHORS hard on the FIRST sentence, losing detail buried late. Lead the FIRST sentence with the main subject as the anchor and its most important shape and posture; then add the OTHER required people and elements concisely after it — do NOT drop any character or canonical element the scene requires, just order them after the anchor. State each visual fact ONCE, concretely, with no repeated adjectives and no contradictions. It renders overall composition, posture, light and colour well but CANNOT resolve very fine mechanical geometry, exact counts or precise angles — so spend the words on the few most identity-defining details and place them EARLY.`;
    case "openai":
      return `${tag} = a large instruction-following image model. It understands rich, ordered natural-language descriptions and explicit spatial relations (left/right, behind, attached-to, above) and counts well — you may write longer, precise prose and name exact relations; it follows them more faithfully than a small diffusion model.`;
    case "google":
      return `${tag} = Google Imagen. It handles detailed natural-language and spatial relations well; write clear subject-first descriptive prose with explicit composition, relations and lighting.`;
    case "stability":
      return `${tag} = a Stable-Diffusion-family model. It prefers a COMPACT, front-loaded style over long prose: lead with subject plus medium plus the key concrete descriptors, most important first; favour concrete nouns and strong adjectives over long subordinate clauses; never bury the subject.`;
    case "bfl":
      return `${tag} = a FLUX model. It reads natural language of medium length; write a clear subject-first description with concrete spatial detail and avoid overly long tails.`;
    default:
      return `${tag}: write a clear, subject-first natural-language description of ONE coherent scene; state each visual fact once, concretely, most important detail first.`;
  }
}
