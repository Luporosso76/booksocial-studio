import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { appConfig } from "../config.js";
import * as aiSettings from "../content/aiSettings.js";
import { resolveBinary, enginePath } from "../content/engine.js";
import { dataDir } from "../paths.js";
import {
  applyStyleForProvider,
  dimsForAspect,
  generateFromPrompt,
  imageGenAvailable,
  type SceneAspect,
} from "./imageGen.js";

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

  generate(input: ImageGenInput): Promise<string | null>;
}

export class LocalSdCliImageEngine implements ImageEngine {
  name(): string {
    return "local(z-image)";
  }

  available(): boolean {
    return imageGenAvailable();
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    return generateFromPrompt({
      prompt: input.prompt,
      aspect: input.aspect,
      outPath: input.outPath,
      ...(input.seed != null ? { seed: input.seed } : {}),
      ...(input.steps != null ? { steps: input.steps } : {}),
      ...(input.cfg != null ? { cfg: input.cfg } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    });
  }
}

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
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function openaiSizeForAspect(aspect: SceneAspect): string {
  switch (aspect) {
    case "4:5":
    case "9:16":
      return "1024x1536";
    case "1.91:1":
    case "16:9":
      return "1536x1024";
    case "1:1":
    default:
      return "1024x1024";
  }
}

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
      console.warn(`[imagegen] OpenAI HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let data: { data?: { b64_json?: string }[] };
    try {
      data = JSON.parse(body);
    } catch {
      console.warn("[imagegen] OpenAI: risposta non in JSON valido");
      return null;
    }
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      console.warn("[imagegen] OpenAI: nessun b64_json nella risposta");
      return null;
    }
    try {
      await writeFile(input.outPath, Buffer.from(b64, "base64"));
    } catch (e) {
      console.warn(
        `[imagegen] OpenAI: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

function geminiAspectRatio(aspect: SceneAspect): string {
  switch (aspect) {
    case "4:5":
      return "4:5";
    case "9:16":
      return "9:16";
    case "1.91:1":
      return "16:9";
    case "16:9":
      return "16:9";
    case "1:1":
    default:
      return "1:1";
  }
}

export class GeminiImageEngine implements ImageEngine {
  constructor(
    private readonly apiKey: string | null,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "gemini";
  }

  available(): boolean {
    return this.apiKey != null;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (!this.available() || input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey as string)}`;
    const res = await fetchImageWithTimeout(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: input.prompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: geminiAspectRatio(input.aspect) },
          },
        }),
      },
      this.timeoutMs,
      input.signal,
    );
    if (!res) return null;
    const body = await res.text();
    if (!res.ok) {
      console.warn(`[imagegen] Gemini HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let data: {
      candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
    };
    try {
      data = JSON.parse(body);
    } catch {
      console.warn("[imagegen] Gemini: risposta non in JSON valido");
      return null;
    }
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const b64 = parts.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!b64) {
      console.warn("[imagegen] Gemini: nessun inlineData.data nella risposta");
      return null;
    }
    try {
      await writeFile(input.outPath, Buffer.from(b64, "base64"));
    } catch (e) {
      console.warn(
        `[imagegen] Gemini: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

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

      console.warn(`[imagegen] Stability HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    try {
      const bytes = Buffer.from(await res.arrayBuffer());
      await writeFile(input.outPath, bytes);
    } catch (e) {
      console.warn(
        `[imagegen] Stability: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

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

      console.warn(`[imagegen] BFL HTTP ${submit.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let task: { id?: string; polling_url?: string };
    try {
      task = JSON.parse(await submit.text());
    } catch {
      console.warn("[imagegen] BFL: risposta submit non in JSON valido");
      return null;
    }
    if (!task.id) {
      console.warn("[imagegen] BFL: nessun id nella risposta");
      return null;
    }
    const pollUrl = task.polling_url ?? `https://api.bfl.ml/v1/get_result?id=${task.id}`;

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
      if (!poll.ok) continue;
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
          console.warn(
            `[imagegen] BFL: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
          );
          return null;
        }
        return input.outPath;
      }
      if (status === "Error" || status === "Content Moderated" || status === "Task not found") {
        console.warn(`[imagegen] BFL: status terminale ${status}`);
        return null;
      }
    }

    console.warn("[imagegen] BFL: timeout in attesa del risultato");
    return null;
  }
}

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

    const slash = this.model.indexOf("/");
    if (slash <= 0 || slash >= this.model.length - 1) {
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

      console.warn(`[imagegen] Replicate HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let data: { status?: string; output?: string | string[] };
    try {
      data = JSON.parse(await res.text());
    } catch {
      console.warn("[imagegen] Replicate: risposta non in JSON valido");
      return null;
    }
    if (data.status !== "succeeded") {
      console.warn(`[imagegen] Replicate: status ${data.status ?? "?"}`);
      return null;
    }
    const out = Array.isArray(data.output) ? data.output[0] : data.output;
    if (!out) {
      console.warn("[imagegen] Replicate: nessun output nella prediction");
      return null;
    }
    const img = await fetchImageWithTimeout(out, { method: "GET" }, this.timeoutMs, input.signal);
    if (!img || !img.ok) return null;
    try {
      await writeFile(input.outPath, Buffer.from(await img.arrayBuffer()));
    } catch (e) {
      console.warn(
        `[imagegen] Replicate: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

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

      console.warn(`[imagegen] fal HTTP ${res.status}: ${body.trim().slice(0, 300)}`);
      return null;
    }
    let data: { images?: { url?: string }[] };
    try {
      data = JSON.parse(await res.text());
    } catch {
      console.warn("[imagegen] fal: risposta non in JSON valido");
      return null;
    }
    const out = data.images?.[0]?.url;
    if (!out) {
      console.warn("[imagegen] fal: nessuna immagine nella risposta");
      return null;
    }
    const img = await fetchImageWithTimeout(out, { method: "GET" }, this.timeoutMs, input.signal);
    if (!img || !img.ok) return null;
    try {
      await writeFile(input.outPath, Buffer.from(await img.arrayBuffer()));
    } catch (e) {
      console.warn(
        `[imagegen] fal: scrittura outPath fallita: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    return input.outPath;
  }
}

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

class StyledImageEngine implements ImageEngine {
  constructor(
    private readonly inner: ImageEngine,
    private readonly provider: string,
  ) {}

  name(): string {
    return this.inner.name();
  }

  available(): boolean {
    return this.inner.available();
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    return this.inner.generate({
      ...input,
      prompt: applyStyleForProvider(input.prompt, this.provider),
    });
  }
}

function agentWorkBase(): string {
  const base = join(dataDir(), ".agent-work");
  mkdirSync(base, { recursive: true });
  return base;
}

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
        detached: true,
        ...(cwd ? { cwd } : {}),
      });
    } catch {
      resolve(null);
      return;
    }

    const killTree = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {}
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

export class CodexImageEngine implements ImageEngine {
  constructor(
    private readonly binary: string,
    private readonly model: string,
  ) {}

  name(): string {
    return "codex(image)";
  }

  available(): boolean {
    return true;
  }

  async generate(input: ImageGenInput): Promise<string | null> {
    if (input.signal?.aborted) return null;
    if (!input.prompt || input.prompt.trim() === "") return null;
    mkdirSync(dirname(input.outPath), { recursive: true });
    const work = await mkdtemp(join(agentWorkBase(), "codex-img-")).catch(() => null);
    if (!work) return null;
    try {
      const instruction = agentImageInstruction(input);
      const args = [
        "exec",
        "--skip-git-repo-check",
        "--dangerously-bypass-approvals-and-sandbox",
        "-C",
        work,
        ...(this.model ? ["-m", this.model] : []),
        instruction,
      ];

      return await spawnImageAgent(this.binary, args, input, 360_000, work);
    } finally {
      rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function buildImageEngine(provider: string, modelOverride?: string): ImageEngine {
  const cfg = aiSettings.getImage();

  const ov = modelOverride && modelOverride.trim() !== "" ? modelOverride : null;
  const mdl = (base: string): string => ov ?? base;

  switch (provider) {
    case "local":
      return new StyledImageEngine(new LocalSdCliImageEngine(), "local");
    case "openai":
      return new StyledImageEngine(
        new OpenAIImageEngine(
          cfg.openaiApiKey,
          cfg.openaiBaseUrl,
          mdl(cfg.openaiImageModel),
          appConfig.engineTimeoutMs,
        ),
        "openai",
      );
    case "gemini":
      return new StyledImageEngine(
        new GeminiImageEngine(
          cfg.geminiApiKey,
          cfg.googleBaseUrl,
          mdl(cfg.geminiImageModel),
          appConfig.engineTimeoutMs,
        ),
        "gemini",
      );
    case "stability":
      return new StyledImageEngine(
        new StabilityImageEngine(
          cfg.stabilityApiKey,
          mdl(cfg.stabilityImageModel),
          appConfig.engineTimeoutMs,
        ),
        "stability",
      );
    case "bfl":
      return new StyledImageEngine(
        new BflImageEngine(cfg.bflApiKey, mdl(cfg.bflImageModel), appConfig.engineTimeoutMs),
        "bfl",
      );
    case "replicate":
      return new StyledImageEngine(
        new ReplicateImageEngine(
          cfg.replicateApiKey,
          mdl(cfg.replicateImageModel),
          appConfig.engineTimeoutMs,
        ),
        "replicate",
      );
    case "fal":
      return new StyledImageEngine(
        new FalImageEngine(cfg.falApiKey, mdl(cfg.falImageModel), appConfig.engineTimeoutMs),
        "fal",
      );
    case "agy":
      return new StyledImageEngine(
        new AgyImageEngine(appConfig.agyBinary, mdl(cfg.agyImageModel)),
        "agy",
      );
    case "auto": {
      const local = new LocalSdCliImageEngine();

      return local.available() ? new StyledImageEngine(local, "local") : new NoopImageEngine();
    }
    case "none":
    default:
      return new NoopImageEngine();
  }
}

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

    console.warn(`[image] fallback a ${fb}`);
    try {
      const fallbackEngine = buildImageEngine(fb, this.fallbackModel);
      const result = await fallbackEngine.generate(input);
      if (result) lastImageEngine = `${fallbackEngine.name()} (fallback)`;
      return result;
    } catch {
      return null;
    }
  }
}

let lastImageEngine: string | null = null;
export function getLastImageEngine(): string | null {
  return lastImageEngine;
}

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

export function imageEngineAvailable(): boolean {
  return createImageEngine().available();
}

export function imagePromptProfile(): string {
  const cfg = aiSettings.getImage();
  const p = cfg.provider;
  const model =
    p === "openai"
      ? cfg.openaiImageModel
      : p === "gemini"
        ? cfg.geminiImageModel
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
      return `${tag} = Z-Image Turbo via stable-diffusion.cpp / sd-cli. It needs one final fluent English paragraph suitable for the sd-cli -p parameter, not a Gemini-style structured prompt, headings, markdown, bullets or metadata. It anchors hard on early text: start with image type or style, exact number of visible people, location, main object and camera framing; put important objects and visibility/crop constraints near the beginning. Then describe action, spatial relationships, each person by appearance and clothing, environment, lighting, atmosphere, colour palette and final natural-language constraints. Preserve exact people counts, do not repeat character summaries, and avoid generic quality tags or long negative-prompt lists.`;
    case "openai":
      return `${tag} = a large instruction-following image model. It understands rich, ordered natural-language descriptions and explicit spatial relations (left/right, behind, attached-to, above) and counts well — you may write longer, precise prose and name exact relations; it follows them more faithfully than a small diffusion model.`;
    case "gemini":
      return geminiImagePromptProfile(tag, model);
    case "agy":
      return geminiImagePromptProfile(tag, model);
    case "stability":
      return `${tag} = a Stable-Diffusion-family model. It prefers a COMPACT, front-loaded style over long prose: lead with subject plus medium plus the key concrete descriptors, most important first; favour concrete nouns and strong adjectives over long subordinate clauses; never bury the subject.`;
    case "bfl":
      return `${tag} = a FLUX model. It reads natural language of medium length; write a clear subject-first description with concrete spatial detail and avoid overly long tails.`;
    default:
      return `${tag}: write a clear, subject-first natural-language description of ONE coherent scene; state each visual fact once, concretely, most important detail first.`;
  }
}

export function geminiImagePromptProfile(tag: string, model: string): string {
  const normalized = model.trim().toLowerCase();
  const base = `${tag} = Gemini native image model. Write a structured plain-text natural-language prompt, not tags, JSON, markdown headings, or markdown fences. Preserve line breaks and use explicit section headings such as Subject:, Scene:, Action:, Composition:, Equipment or objects: (add a sport- or equipment-specific heading only when the scene calls for it), Physical consistency:, Constraints:, and Output:. Keep all canonical people, objects, posture, clothing and equipment details, but order them visually by those sections.`;
  const rig = `For any equipment, vehicle or action scene, make complete major forms unmistakable before small details: full person or subject, the complete object, major support, complete frame, all connected parts, physically plausible, visible and not cropped.`;
  const physics = `Convert physics into visible geometry and placement: one coherent direction of force or motion, believable body counterweight, object orientation, contact points, attachments, water/spray/light behaviour and perspective. Use explicit constraints for the likely failures: complete undamaged objects and supports, no duplicated objects, plausible geometry, the whole object kept in frame, correct limb count, and blank unlettered surfaces.`;

  if (normalized.includes("pro")) {
    return `${base} Use a longer, highly controlled professional prompt for this model. Include clear sections in the prose order: main subject, scene, action, camera/composition, equipment or object structure, physical consistency, lighting and colour, constraints, output aspect. ${rig} For difficult mechanical scenes, separately spell out the subject, its support and the connected parts, and how light reveals them. ${physics}`;
  }
  if (normalized.includes("flash")) {
    return `${base} Use a compact, direct prompt with short explicit blocks. Front-load the full subject and the complete visible equipment/object. ${rig} Keep the prompt lean but constraint-heavy; avoid long abstract explanations. ${physics}`;
  }
  return `${base} Use a balanced prompt: detailed enough to remove ambiguity, but not as long as a pro-control prompt. ${rig} Describe the complete composition and the large connected shapes before fine technical details. ${physics}`;
}
