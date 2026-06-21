import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, delimiter, dirname } from "node:path";
import { appConfig } from "../config.js";
import * as aiSettings from "./aiSettings.js";
import {
  buildOpenAIEngine,
  buildOpenAICompatibleEngine,
  buildOllamaEngine,
  buildAnthropicEngine,
  buildGoogleGeminiEngine,
} from "./engineApi.js";

/**
 * PATH "ricco" da passare ai sottoprocessi CLI. I binari come `opencode`/`codex` sono spesso
 * script con shebang (`env node`/`bun`): se il PATH ereditato dal server e' ridotto, l'interprete
 * non si trova e lo spawn fallisce. Qui includiamo la dir di node e le posizioni note.
 */
function enginePath(): string {
  const home = homedir();
  const candidates = [
    dirname(process.execPath), // dir del binario node corrente
    join(home, ".opencode", "bin"),
    join(home, ".local", "bin"),
    join(home, ".codex", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".npm-global", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    ...(process.env.PATH ? process.env.PATH.split(delimiter) : []),
  ];
  const seen = new Set<string>();
  return candidates.filter((d) => d && !seen.has(d) && seen.add(d)).join(delimiter);
}

/**
 * Risolve il percorso assoluto di un binario CLI senza dipendere solo dal PATH ereditato dal
 * processo Node (che puo' differire dalla shell dell'utente). Cerca nel PATH e in posizioni note
 * (es. ~/.opencode/bin). Se non lo trova, ritorna il nome cosi' com'e' (spawn fallira' con messaggio chiaro).
 */
function resolveBinary(name: string): string {
  if (name.includes("/")) return name; // gia' un percorso
  const home = homedir();
  const dirs = [
    ...(process.env.PATH ? process.env.PATH.split(delimiter) : []),
    join(home, ".opencode", "bin"),
    join(home, ".local", "bin"),
    join(home, ".codex", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".npm-global", "bin"),
    "/usr/local/bin",
    "/usr/bin",
  ];
  for (const d of dirs) {
    if (!d) continue;
    const p = join(d, name);
    if (existsSync(p)) return p;
  }
  return name;
}

// Content engine: a local CLI that turns a text prompt into a text response.
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
      });
    } catch (e) {
      reject(e);
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
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
    // Modello obbligatorio: senza di esso opencode non sa quale LLM invocare.
    if (!this.model || this.model.trim() === "") {
      throw new ContentError("Modello OpenCode non impostato. Configuralo in Impostazioni → AI.");
    }
    let out: SpawnOut;
    try {
      // Prompt via STDIN (non come argomento): evita il limite ~128KB per singolo argomento
      // di Linux (MAX_ARG_STRLEN), che faceva fallire l'analisi dei libri grandi.
      // --pure: nessun plugin/agent esterno (es. OMC "ultraworker"), così l'app dipende solo
      // da OpenCode. La logica di estrazione idea + umanizzazione è INCORPORATA nei prompt
      // (vedi content/postGenerator.ts): NON servono skill installate sul sistema.
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
    return "codex";
  }

  async run(prompt: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "booksocial-codex-"));
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

// gemini -m <model?> -p ""  ; prompt su STDIN (il CLI lo accoda all'input di stdin).
// `-p` ATTIVA la modalità non-interattiva (headless): passiamo "" come valore del flag e il
// prompt vero su STDIN, evitando il limite ~128KB per singolo argomento di Linux (MAX_ARG_STRLEN).
class GeminiCliEngine implements ContentEngine {
  constructor(
    private readonly binary: string,
    private readonly model: string | null,
    private readonly timeoutMs: number,
  ) {}

  name(): string {
    return "gemini";
  }

  async run(prompt: string): Promise<string> {
    const args: string[] = [];
    if (this.model && this.model.trim() !== "") {
      args.push("-m", this.model);
    }
    // `-p ""`: valore vuoto => il flag funge solo da interruttore headless; il contenuto è su STDIN.
    args.push("-p", "");
    let out: SpawnOut;
    try {
      out = await spawnCollect(this.binary, args, {
        input: prompt,
        timeoutMs: this.timeoutMs,
        collectStdout: true,
      });
    } catch {
      throw new ContentError(
        `Impossibile avviare '${this.binary}'. Gemini CLI e' installato e nel PATH?`,
      );
    }
    if (out.timedOut) {
      throw new ContentError(
        `Gemini ha superato il timeout di ${Math.round(this.timeoutMs / 1000)}s`,
      );
    }
    const answer = out.stdout.trim();
    if (out.code !== 0) {
      throw new ContentError(`Gemini exit code ${out.code}: ${out.stderr.trim()}`);
    }
    if (answer === "") {
      throw new ContentError("Gemini non ha prodotto alcuna risposta");
    }
    return answer;
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
 * Registry centrale dei provider del motore TESTO. È l'UNICO punto di estensione:
 * per aggiungere un provider, implementa l'interfaccia `ContentEngine` (qui o in engineApi.ts)
 * e aggiungi un `case` in questo switch, instradato da `CONTENT_PROVIDER`.
 *
 * Tre modalità di auth/esecuzione:
 *  - API key HTTP: openai | openai-compatible | anthropic | google (chiave nel .env).
 *  - Abbonamento/login via CLI: opencode | codex | gemini (auth e skill/plugin si configurano
 *    NEI rispettivi tool, non nell'app; l'app si limita a invocare il CLI col modello).
 *  - Locale: ollama (nessuna chiave).
 */
function buildEngine(): ContentEngine {
  // Config EFFETTIVA a RUNTIME: cache aiSettings (DB/keyring) ?? env. Letta a ogni
  // costruzione così i cambi via Impostazioni si applicano senza riavvio.
  const cfg = aiSettings.getText();
  const provider = cfg.provider;
  const timeout = appConfig.engineTimeoutMs;
  switch (provider) {
    case "openai":
      return buildOpenAIEngine(cfg);
    case "openai-compatible":
    case "compatible":
      return buildOpenAICompatibleEngine(cfg);
    case "ollama":
      return buildOllamaEngine(cfg);
    case "anthropic":
      return buildAnthropicEngine(cfg);
    case "google":
      return buildGoogleGeminiEngine(cfg);
    case "gemini":
      return new GeminiCliEngine(resolveBinary(appConfig.geminiBinary), cfg.geminiModel, timeout);
    case "codex":
      return new CodexEngine(resolveBinary(appConfig.codexBinary), cfg.codexModel, timeout);
    case "opencode":
      return new OpenCodeEngine(
        resolveBinary(appConfig.opencodeBinary),
        cfg.opencodeModel,
        timeout,
      );
    default:
      // 'none', '' o provider non riconosciuto: motore NON configurato (errore chiaro a run()).
      // Niente più fallback implicito a opencode (era il setup personale dello sviluppatore).
      return new UnconfiguredEngine();
  }
}

/**
 * Ritorna un WRAPPER DINAMICO: `name()` e `run()` ricostruiscono ogni volta il motore
 * concreto da `aiSettings.getText()`. Così cambiare provider/chiavi/model dalle Impostazioni
 * (che ricaricano la cache) ha effetto immediato, senza riavviare il server.
 */
export function createEngine(): ContentEngine {
  return {
    name(): string {
      try {
        return buildEngine().name();
      } catch {
        // name() non deve lanciare (es. provider HTTP senza chiave): mostra il provider scelto.
        return aiSettings.getText().provider;
      }
    },
    async run(prompt: string): Promise<string> {
      // async: un eventuale throw sincrono di buildEngine() (es. provider HTTP senza chiave)
      // diventa un reject della Promise, non un'eccezione sincrona.
      return buildEngine().run(prompt);
    },
  };
}
