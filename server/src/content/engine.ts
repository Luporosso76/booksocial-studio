import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, delimiter } from "node:path";
import { appConfig } from "../config.js";
import * as aiSettings from "./aiSettings.js";
import { dataDir } from "../paths.js";
import { buildOllamaEngine } from "./engineApi.js";

function agentWorkBase(): string {
  const base = join(dataDir(), ".agent-work");
  mkdirSync(base, { recursive: true });
  return base;
}

function loginShellQuery(command: string): string {
  try {
    return execFileSync("bash", ["-lic", command], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function nvmBins(): string[] {
  try {
    const base = join(homedir(), ".nvm", "versions", "node");
    return readdirSync(base).map((v) => join(base, v, "bin"));
  } catch {
    return [];
  }
}
function knownBinDirs(): string[] {
  const home = homedir();
  return [
    join(home, ".opencode", "bin"),
    join(home, ".local", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".npm-global", "bin"),
    ...nvmBins(),
    "/usr/local/bin",
    "/usr/bin",
  ];
}

let cachedLoginPath: string | null = null;

export function enginePath(): string {
  if (cachedLoginPath != null) return cachedLoginPath;
  const fromShell = loginShellQuery('printf %s "$PATH"');
  const base = (fromShell || process.env.PATH || "").split(delimiter);
  const seen = new Set<string>();
  cachedLoginPath = [...base, ...knownBinDirs()]
    .filter((d) => d && !seen.has(d) && seen.add(d))
    .join(delimiter);
  return cachedLoginPath;
}

const binaryCache = new Map<string, string>();

export function resolveBinary(name: string): string {
  if (name.includes("/")) return name;
  const cached = binaryCache.get(name);
  if (cached) return cached;
  const viaShell = loginShellQuery(`command -v ${name}`)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  if (viaShell && viaShell.startsWith("/") && existsSync(viaShell)) {
    binaryCache.set(name, viaShell);
    return viaShell;
  }
  for (const d of knownBinDirs()) {
    const p = join(d, name);
    if (existsSync(p)) {
      binaryCache.set(name, p);
      return p;
    }
  }
  return name;
}

export interface ContentEngine {
  name(): string;
  run(prompt: string): Promise<string>;
}

export class ContentError extends Error {}

interface SpawnOut {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function spawnCollect(
  cmd: string,
  args: string[],
  opts: { input?: string; cwd?: string; timeoutMs: number; collectStdout: boolean },
): Promise<SpawnOut> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: opts.cwd ?? tmpdir(),
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PATH: enginePath() },
        detached: true,
      });
    } catch (e) {
      reject(e);
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

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

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, opts.timeoutMs);

    if (opts.collectStdout) {
      child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    } else {
      child.stdout.on("data", () => {});
    }
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });

    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();
  });
}

class OpenCodeEngine implements ContentEngine {
  constructor(
    private readonly binary: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return `opencode(${this.model})`;
  }

  async run(prompt: string): Promise<string> {
    let out: SpawnOut;
    try {
      out = await spawnCollect(this.binary, ["run", "--pure", "-m", this.model], {
        input: prompt,
        timeoutMs: this.timeoutMs,
        collectStdout: true,
      });
    } catch {
      throw new ContentError(
        `Impossibile avviare '${this.binary}'. OpenCode e' installato e nel PATH?`,
      );
    }
    if (out.timedOut) {
      throw new ContentError(
        `OpenCode ha superato il timeout di ${Math.round(this.timeoutMs / 1000)}s`,
      );
    }
    const answer = out.stdout.trim();
    if (out.code !== 0) {
      throw new ContentError(`OpenCode exit code ${out.code}: ${out.stderr.trim()}`);
    }
    if (answer === "") {
      throw new ContentError("OpenCode non ha prodotto alcuna risposta");
    }
    return answer;
  }
}

class CodexEngine implements ContentEngine {
  constructor(
    private readonly binary: string,
    private readonly model: string | null,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return this.model ? `codex(${this.model})` : "codex";
  }

  async run(prompt: string): Promise<string> {
    const dir = await mkdtemp(join(agentWorkBase(), "codex-"));
    const outFile = join(dir, "out.txt");
    const args = ["exec", "--skip-git-repo-check", "--color", "never", "-s", "read-only"];
    if (this.model && this.model.trim() !== "") {
      args.push("-m", this.model);
    }
    args.push("-o", outFile);

    try {
      let out: SpawnOut;
      try {
        out = await spawnCollect(this.binary, args, {
          input: prompt,
          cwd: dir,
          timeoutMs: this.timeoutMs,
          collectStdout: false,
        });
      } catch {
        throw new ContentError(
          `Impossibile avviare '${this.binary}'. Codex CLI e' installato e nel PATH?`,
        );
      }
      if (out.timedOut) {
        throw new ContentError(
          `Codex ha superato il timeout di ${Math.round(this.timeoutMs / 1000)}s`,
        );
      }
      if (out.code !== 0) {
        throw new ContentError(`Codex exit code ${out.code}: ${out.stderr.trim()}`);
      }
      const answer = (await readFile(outFile, "utf8")).trim();
      if (answer === "") {
        throw new ContentError("Codex non ha prodotto alcuna risposta");
      }
      return answer;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

class ClaudeEngine implements ContentEngine {
  constructor(
    private readonly binary: string,
    private readonly model: string | null,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return this.model ? `claude(${this.model})` : "claude";
  }

  async run(prompt: string): Promise<string> {
    const dir = await mkdtemp(join(agentWorkBase(), "claude-"));
    try {
      const args = ["-p", "--output-format", "text"];
      if (this.model && this.model.trim() !== "") {
        args.push("--model", this.model);
      }
      let out: SpawnOut;
      try {
        out = await spawnCollect(this.binary, args, {
          input: prompt,
          cwd: dir,
          timeoutMs: this.timeoutMs,
          collectStdout: true,
        });
      } catch {
        throw new ContentError(
          `Impossibile avviare '${this.binary}'. Claude Code e' installato e nel PATH?`,
        );
      }
      if (out.timedOut) {
        throw new ContentError(
          `Claude ha superato il timeout di ${Math.round(this.timeoutMs / 1000)}s`,
        );
      }
      const answer = out.stdout.trim();
      if (out.code !== 0) {
        throw new ContentError(`Claude exit code ${out.code}: ${out.stderr.trim()}`);
      }
      return answer;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

class AgyEngine implements ContentEngine {
  constructor(
    private readonly binary: string,
    private readonly model: string | null,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return `agy(${this.model ?? ""})`;
  }

  async run(prompt: string): Promise<string> {
    const dir = await mkdtemp(join(agentWorkBase(), "agy-"));
    try {
      const args: string[] = [];
      if (this.model && this.model.trim() !== "") {
        args.push("--model", this.model);
      }
      args.push("--print", prompt);
      let out: SpawnOut;
      try {
        out = await spawnCollect(this.binary, args, {
          cwd: dir,
          timeoutMs: this.timeoutMs,
          collectStdout: true,
        });
      } catch {
        throw new ContentError(
          `Impossibile avviare '${this.binary}'. agy e' installato e nel PATH?`,
        );
      }
      if (out.timedOut) {
        throw new ContentError(
          `agy ha superato il timeout di ${Math.round(this.timeoutMs / 1000)}s`,
        );
      }
      const answer = out.stdout.trim();
      if (out.code !== 0) {
        throw new ContentError(`agy exit code ${out.code}: ${out.stderr.trim()}`);
      }
      if (answer === "") {
        throw new ContentError("agy non ha prodotto alcuna risposta");
      }
      return answer;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function runOpenCodeVision(opts: {
  binary: string;
  model: string;
  imagePath: string;
  prompt: string;
  timeoutMs: number;
}): Promise<string | null> {
  let out: SpawnOut;
  try {
    out = await spawnCollect(
      resolveBinary(opts.binary),
      ["run", "--pure", "-m", opts.model, "-f", opts.imagePath],
      { input: opts.prompt, timeoutMs: opts.timeoutMs, collectStdout: true },
    );
  } catch {
    return null;
  }
  if (out.timedOut || out.code !== 0) return null;
  const answer = out.stdout.trim();
  return answer === "" ? null : answer;
}

export function isRateLimitError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  const markers = [
    "rate limit",
    "rate_limit",
    "429",
    "quota",
    "resource_exhausted",
    "exhausted",
    "overloaded",
    "too many requests",
  ];
  return markers.some((m) => msg.includes(m));
}

export function buildEngine(
  cfg: aiSettings.TextCfg,
  provider: string,
  modelOverride?: string,
): ContentEngine {
  const timeout = appConfig.engineTimeoutMs;

  const ov = modelOverride && modelOverride.trim() !== "" ? modelOverride : null;
  const mdl = (base: string): string => ov ?? base;
  const mdlN = (base: string | null): string | null => ov ?? base;
  switch (provider) {
    case "ollama":
      return buildOllamaEngine({ ...cfg, ollamaModel: mdl(cfg.ollamaModel) });
    case "agy":
      return new AgyEngine(resolveBinary(appConfig.agyBinary), mdl(cfg.agyModel ?? ""), timeout);
    case "claude":
      return new ClaudeEngine(
        resolveBinary(appConfig.claudeBinary),
        mdlN(cfg.claudeModel),
        timeout,
      );
    case "codex":
      return new CodexEngine(resolveBinary(appConfig.codexBinary), mdlN(cfg.codexModel), timeout);
    case "opencode":
      return new OpenCodeEngine(
        resolveBinary(appConfig.opencodeBinary),
        mdl(cfg.opencodeModel),
        timeout,
      );
    default: {
      const chosen = provider && provider.trim() !== "" ? provider : "none";
      throw new ContentError(
        `Provider di testo non supportato: '${chosen}'. ` +
          "Sono supportati solo opencode, codex, claude, agy e ollama. " +
          "Riconfigura il provider in Impostazioni → AI.",
      );
    }
  }
}

let lastTextEngine: string | null = null;
export function getLastTextEngine(): string | null {
  return lastTextEngine;
}

export function createEngine(): ContentEngine {
  return {
    name(): string {
      try {
        const cfg = aiSettings.getText();
        return buildEngine(cfg, cfg.provider).name();
      } catch {
        return aiSettings.getText().provider;
      }
    },
    async run(prompt: string): Promise<string> {
      const cfg = aiSettings.getText();
      const primary = cfg.provider;
      const fallback = cfg.fallbackProvider;
      const primaryEngine = buildEngine(cfg, primary);
      try {
        const result = await primaryEngine.run(prompt);
        lastTextEngine = primaryEngine.name();
        return result;
      } catch (err) {
        if (isRateLimitError(err) && fallback && fallback !== "none" && fallback !== primary) {
          console.warn(`[engine] rate-limit su ${primary}, fallback a ${fallback}`);
          const fallbackEngine = buildEngine(cfg, fallback, cfg.fallbackModel);
          const result = await fallbackEngine.run(prompt);
          lastTextEngine = `${fallbackEngine.name()} (fallback)`;
          return result;
        }
        throw err;
      }
    },
  };
}
