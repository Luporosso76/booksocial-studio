import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, delimiter } from "node:path";
import { appConfig } from "../config.js";
import * as aiSettings from "./aiSettings.js";
import { dataDir } from "../paths.js";
import { buildOllamaEngine } from "./engineApi.js";

/** Base dir per le work dir temporanee degli agenti: dentro il data dir (scrivibile in Docker). */
function agentWorkBase(): string {
  const base = join(dataDir(), ".agent-work");
  mkdirSync(base, { recursive: true });
  return base;
}

// I CLI (opencode/codex/claude/agy) vivono dove l'utente li ha installati (nvm, brew, asdf,
// volta, ~/.local/bin...). Invece di enumerare cartelle a mano, chiediamo alla SHELL DI LOGIN
// dell'utente: eredita lo stesso PATH che funziona nel suo terminale. Best-effort + cache; se
// la shell non c'e' (es. Docker minimale) si ricade sul PATH del processo.

/** Esegue un comando nella login shell dell'utente e ritorna stdout (trim), o "" su errore. */
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

// FALLBACK: posizioni note dove possono stare i CLI quando la login shell del servizio NON li
// espone. Caso tipico: codex installato via nvm, la cui dir e' su PATH solo dopo `nvm use` (che
// il servizio systemd/Docker non esegue). NON e' il meccanismo primario, solo una rete di sicurezza.
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
/** PATH per i sottoprocessi CLI: quello della login shell dell'utente UNITO alle posizioni note. */
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
/**
 * Risolve il percorso assoluto di un CLI. PRIMARIO: la login shell dell'utente
 * (`command -v <name>`) — trova i binari ovunque l'utente li abbia (nvm/brew/asdf...).
 * FALLBACK: se la shell non lo espone (es. nvm non attivo nel servizio), cerca nelle posizioni
 * note. Se non lo trova, ritorna il nome com'e' (lo spawn fallira' con messaggio chiaro). Cache.
 */
export function resolveBinary(name: string): string {
  if (name.includes("/")) return name; // gia' un percorso
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

// Content engine: a local CLI that turns a text prompt into a text response.
// Ported from Java OpenCodeProcess / CodexProcess / ClaudeProcess.
// The engine receives ONLY text (book scheda / prompt), never any token.

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
        detached: true, // gruppo di processi: gli agenti CLI lanciano sotto-processi/tool
      });
    } catch (e) {
      reject(e);
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    // Uccide l'INTERO gruppo (agente + figli), non solo il padre, per non lasciare orfani.
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

    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, opts.timeoutMs);

    if (opts.collectStdout) {
      child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    } else {
      child.stdout.on("data", () => {
        /* drain to avoid blocking */
      });
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

// Provider non configurato: restituisce un messaggio d'errore chiaro all'utente.
class UnconfiguredEngine implements ContentEngine {
  name(): string {
    return "non configurato";
  }

  async run(_prompt: string): Promise<string> {
    throw new ContentError(
      "Provider AI non configurato. Apri Impostazioni → AI e scegli un provider.",
    );
  }
}

// DEFAULT: opencode run -m <model> <prompt>  (clean answer on stdout).
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
      // Prompt via STDIN (non come argomento): evita il limite ~128KB per singolo argomento
      // di Linux (MAX_ARG_STRLEN), che fa fallire l'analisi dei libri grandi.
      // --pure: nessun plugin esterno, l'engine dipende solo da OpenCode e dalle sue skill globali.
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

// codex exec --skip-git-repo-check --color never -s read-only [-m model] -o <file>
// prompt on stdin; answer read from the output file.
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

// claude -p --output-format text [--model m]  ; prompt on stdin.
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

// agy --model <model> --print <prompt>  ; il prompt è passato come ARGOMENTO, la
// risposta arriva su stdout. Provider testo ad abbonamento (Gemini/antigravity via CLI agy).
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

/**
 * VISIONE best-effort: chiede a un modello multimodale di GUARDARE un'immagine e rispondere.
 * `opencode run --pure -m <model> -f <imagePath>` con la domanda su STDIN. La visione è OPZIONALE:
 * non lancia mai eccezioni — ritorna lo stdout ripulito, oppure null su errore/timeout/risposta vuota.
 */
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
    return null; // spawn fallito (binario assente, ecc.)
  }
  if (out.timedOut || out.code !== 0) return null;
  const answer = out.stdout.trim();
  return answer === "" ? null : answer;
}

/**
 * Errore di RATE-LIMIT/quota: vero se il messaggio (case-insensitive) contiene un marcatore noto.
 * Usato per decidere se ritentare col provider di fallback. Non logga né espone segreti.
 */
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

/**
 * Registry centrale dei provider del motore TESTO. È l'UNICO punto di estensione:
 * per aggiungere un provider, implementa l'interfaccia `ContentEngine` (qui o in engineApi.ts)
 * e aggiungi un `case` in questo switch, instradato dal provider scelto nelle Impostazioni.
 *
 * Due modalità di auth/esecuzione:
 *  - Abbonamento/login via CLI: opencode | codex | claude | agy (auth e skill/plugin si
 *    configurano NEI rispettivi tool, non nell'app; l'app si limita a invocare il CLI col modello).
 *  - Locale: ollama (nessuna chiave).
 *
 * I BINARI dei CLI restano da `appConfig` (env); i MODELLI e il provider da `aiSettings.getText()`.
 * Il `provider` può essere forzato (per il fallback su rate-limit) riusando gli stessi modelli `cfg`.
 */
function buildEngine(
  cfg: aiSettings.TextCfg,
  provider: string,
  modelOverride?: string,
): ContentEngine {
  const timeout = appConfig.engineTimeoutMs;
  // Se modelOverride è valorizzato (trim != ""), sostituisce il modello del provider.
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
    default:
      // 'none', '' o provider non riconosciuto: motore NON configurato (errore chiaro a run()).
      return new UnconfiguredEngine();
  }
}

// Ultimo motore TESTO realmente usato da run() (primario o fallback), col nome+modello concreto.
// I name in fallback portano il suffisso " (fallback)" per evidenziare il cambio nella UI.
let lastTextEngine: string | null = null;
export function getLastTextEngine(): string | null {
  return lastTextEngine;
}

/**
 * Ritorna un WRAPPER DINAMICO: `name()` e `run()` ricostruiscono ogni volta il motore
 * concreto da `aiSettings.getText()`. Così cambiare provider/chiavi/model dalle Impostazioni
 * (che ricaricano la cache) ha effetto immediato, senza riavviare il server.
 *
 * FALLBACK: se il motore primario fallisce con un errore di rate-limit/quota e `fallbackProvider`
 * è valorizzato (!= "none" e diverso dal primario), ritenta UNA volta col provider di fallback.
 */
export function createEngine(): ContentEngine {
  return {
    name(): string {
      try {
        const cfg = aiSettings.getText();
        return buildEngine(cfg, cfg.provider).name();
      } catch {
        // name() non deve lanciare: mostra il provider scelto.
        return aiSettings.getText().provider;
      }
    },
    async run(prompt: string): Promise<string> {
      // async: un eventuale throw sincrono di buildEngine() diventa un reject della Promise.
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
