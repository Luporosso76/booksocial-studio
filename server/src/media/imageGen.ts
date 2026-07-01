import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, delimiter, dirname } from "node:path";
import * as aiSettings from "../content/aiSettings.js";
import type { ImageStyleCfg } from "../content/aiSettings.js";

export type SceneAspect = "1:1" | "4:5" | "1.91:1" | "9:16" | "16:9";

const DIMS: Record<SceneAspect, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "4:5": { w: 1024, h: 1280 },
  "1.91:1": { w: 1216, h: 640 },
  "9:16": { w: 768, h: 1344 },
  "16:9": { w: 1344, h: 768 },
};

const PRESET_MEDIUM: Record<string, string> = {
  "graphic-novel": "graphic-novel illustration with ink outlines and cel shading",
  "cel-anime": "anime cel-shaded illustration",
  painterly: "painterly digital illustration with visible brushwork",
  photorealistic: "photorealistic image with natural detail",
  cinematic: "cinematic photographic frame with filmic lighting",
  watercolor: "watercolor illustration with soft washes",
  oil: "oil painting with rich textured brushwork",
  "3d-render": "polished 3D-rendered image",
  "flat-vector": "flat vector illustration with clean shapes",
  storybook: "soft storybook illustration",
  "pencil-sketch": "pencil and ink sketch",
  "concept-art": "digital concept-art illustration",
  "line-art": "clean line-art illustration",
};

export function buildStyleTail(style: ImageStyleCfg): string {
  const preset = style.preset || "graphic-novel";
  let medium: string;
  if (preset === "custom") {
    const cs = (style.customStyle || "").trim();
    medium = cs !== "" ? cs : PRESET_MEDIUM["graphic-novel"];
  } else {
    medium = PRESET_MEDIUM[preset] ?? PRESET_MEDIUM["graphic-novel"];
  }
  const intensity = Math.min(100, Math.max(0, Number(style.intensity)));
  const vividness = Math.min(100, Math.max(0, Number(style.vividness)));
  const qualifier =
    intensity < 34 ? "subtle, lightly stylized " : intensity > 66 ? "bold, heavily stylized " : "";
  const colour =
    vividness < 34
      ? ", with muted, soft colours"
      : vividness > 66
        ? ", with vivid, high-contrast colours"
        : ", with natural colours";
  return `${qualifier}${medium}${colour}`;
}

function sdRoot(): string {
  return process.env.SDCPP_DIR || join(homedir(), ".local", "share", "book-social", "sdcpp");
}
function sdCliPath(): string {
  return process.env.SDCPP_CLI || join(sdRoot(), "sd-cli");
}
function backendArg(): string {
  return process.env.SDCPP_BACKEND || "te=cpu,vae=cpu,diffusion=vulkan0";
}
function timeoutMs(): number {
  const v = Number(process.env.SDCPP_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 1_200_000;
}

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

export function imageGenAvailable(): boolean {
  const v = (process.env.IMAGEGEN_ENABLED ?? "true").toLowerCase();
  if (v === "false" || v === "0" || v === "no") return false;
  return existsSync(sdCliPath()) && zimageInstalled();
}

export function dimsForAspect(aspect: SceneAspect): { w: number; h: number } {
  return DIMS[aspect] ?? DIMS["1:1"];
}

export const STYLE_PLACEHOLDER = "§STYLE§";

function looksStructuredForGemini(prompt: string): boolean {
  return /(?:^|\n)(Subject|Scene|Action|Composition|Equipment or objects|Physical consistency|Constraints|Output):/i.test(
    prompt,
  );
}

function insertStructuredStyle(prompt: string, styleBlock: string): string {
  const lines = prompt.split("\n");
  const insertAt = lines.findIndex((line) => /^\s*(Constraints|Output):/i.test(line));
  if (insertAt < 0) return `${prompt}\n\n${styleBlock}`;
  return [...lines.slice(0, insertAt), styleBlock, "", ...lines.slice(insertAt)].join("\n").trim();
}

export function buildScenePrompt(subjectScene: string): string {
  const raw = subjectScene.trim().replace(/^["']|["']$/g, "");
  if (looksStructuredForGemini(raw)) {
    const s = raw
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const styleBlock = `Style:\nRendered as a single full-bleed uninterrupted ${STYLE_PLACEHOLDER}, the palette and lighting matching the scene described above; any signs, screens or papers appear blank and unlettered.`;
    return insertStructuredStyle(s, styleBlock);
  }
  const s = raw.replace(/\s+/g, " ");

  const sep = /[.!?]$/.test(s) ? "" : ".";
  return `${s}${sep} Rendered as a single full-bleed uninterrupted ${STYLE_PLACEHOLDER}, the palette and lighting matching the scene described above; any signs, screens or papers appear blank and unlettered.`;
}

export function applyStyleForProvider(prompt: string, provider: string): string {
  if (!prompt.includes(STYLE_PLACEHOLDER)) return prompt;
  const tail = buildStyleTail(aiSettings.getImageStyle(provider));
  return prompt.split(STYLE_PLACEHOLDER).join(tail);
}

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

export interface SdCliSpawnPlan {
  command: string;
  args: string[];
}

function niceArg(env: NodeJS.ProcessEnv): string | null {
  const raw = env.SDCPP_NICE?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= -20 && n <= 19 ? String(n) : null;
}

function cpusetArg(env: NodeJS.ProcessEnv): string | null {
  const raw = env.SDCPP_CPUSET?.trim();
  return raw && /^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(raw) ? raw : null;
}

function ioniceArgs(env: NodeJS.ProcessEnv): string[] {
  const raw = env.SDCPP_IONICE?.trim().toLowerCase();
  if (!raw || raw === "off" || raw === "none") return [];
  const [classRaw, priorityRaw] = raw.split(":", 2);
  const classMap: Record<string, number> = {
    be: 2,
    "best-effort": 2,
    best_effort: 2,
    idle: 3,
    realtime: 1,
    rt: 1,
  };
  const cls = classMap[classRaw ?? ""] ?? Number(classRaw);
  if (!Number.isInteger(cls) || cls < 1 || cls > 3) return [];
  if (cls === 3) return ["-c", "3"];
  if (priorityRaw == null || priorityRaw === "") return ["-c", String(cls)];
  const priority = Number(priorityRaw);
  if (!Number.isInteger(priority) || priority < 0 || priority > 7) return [];
  return ["-c", String(cls), "-n", String(priority)];
}

export function sdCliSpawnPlan(
  sdCli: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): SdCliSpawnPlan {
  let command = sdCli;
  let commandArgs = args.slice();
  const cpuset = cpusetArg(env);
  if (cpuset) {
    commandArgs = ["-c", cpuset, command, ...commandArgs];
    command = "taskset";
  }
  const io = ioniceArgs(env);
  if (io.length > 0) {
    commandArgs = [...io, command, ...commandArgs];
    command = "ionice";
  }
  const nice = niceArg(env);
  if (nice) {
    commandArgs = ["-n", nice, command, ...commandArgs];
    command = "nice";
  }
  return { command, args: commandArgs };
}

function runSdCli(
  args: string[],
  signal?: AbortSignal,
): Promise<{ code: number | null; stderr: string; timedOut: boolean; aborted: boolean }> {
  return new Promise((resolveP, reject) => {
    let child;
    try {
      const plan = sdCliSpawnPlan(sdCliPath(), args);
      child = spawn(plan.command, plan.args, {
        cwd: sdRoot(),
        stdio: ["ignore", "pipe", "pipe"],

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

export interface SceneGenInput {
  subjectScene: string;
  aspect: SceneAspect;
  outPath: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  signal?: AbortSignal;
}

export interface RawGenInput {
  prompt: string;
  aspect: SceneAspect;
  outPath: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  signal?: AbortSignal;
}

export async function generateFromPrompt(input: RawGenInput): Promise<string | null> {
  if (!imageGenAvailable() || input.signal?.aborted) return null;
  if (!input.prompt || input.prompt.trim() === "") return null;
  const { w, h } = dimsForAspect(input.aspect);
  const seed = Number.isFinite(input.seed)
    ? Number(input.seed)
    : Math.floor(Math.random() * 1_000_000_000);

  const localStyle = aiSettings.getImageStyle(aiSettings.getImage().provider);
  const defSteps =
    typeof localStyle.steps === "number" && localStyle.steps > 0 ? localStyle.steps : 8;
  const defCfg = typeof localStyle.cfg === "number" && localStyle.cfg > 0 ? localStyle.cfg : 1.0;
  const steps =
    Number.isFinite(input.steps) && Number(input.steps) > 0 ? Number(input.steps) : defSteps;
  const cfg = Number.isFinite(input.cfg) && Number(input.cfg) > 0 ? Number(input.cfg) : defCfg;

  const finalPrompt = applyStyleForProvider(input.prompt, aiSettings.getImage().provider);
  const args = [
    "--diffusion-model",
    zDiffusionPath(),
    "--vae",
    zVaePath(),
    "--llm",
    zLlmPath(),
    "-p",
    finalPrompt,
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

  console.log(`[imagegen] ${input.aspect} seed=${seed}`);
  return serial(async () => {
    if (input.signal?.aborted) return null;
    let res;
    try {
      res = await runSdCli(args, input.signal);
    } catch (e) {
      console.warn(
        `[imagegen] sd-cli non avviabile: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
    if (res.aborted) return null;
    if (res.timedOut || res.code !== 0 || !existsSync(input.outPath)) {
      console.warn(
        `[imagegen] generazione fallita (code ${res.code}, timeout ${res.timedOut}): ${res.stderr.trim().split("\n").pop() ?? ""}`,
      );
      return null;
    }
    return input.outPath;
  });
}

export async function generateSceneImage(input: SceneGenInput): Promise<string | null> {
  if (!input.subjectScene || input.subjectScene.trim() === "") return null;
  return generateFromPrompt({
    prompt: buildScenePrompt(input.subjectScene),
    aspect: input.aspect,
    outPath: input.outPath,
    ...(input.seed != null ? { seed: input.seed } : {}),
    ...(input.steps != null ? { steps: input.steps } : {}),
    ...(input.cfg != null ? { cfg: input.cfg } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}
