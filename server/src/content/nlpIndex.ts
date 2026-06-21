import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Wrapper Node del pre-pass NLP "classico" (spaCy). Spawna server/nlp/index_book.py,
// passando i capitoli su STDIN e leggendo il JSON risultante da STDOUT. Riusa lo
// stesso schema di engine.ts (PATH ricco, stdin, timeout).
//
// TUTTO il pre-pass e' OPZIONALE: se Python/lo script non ci sono o falliscono,
// indexBook() ritorna null e l'app prosegue invariata. NESSUN errore propagato.

export interface NlpCharacter {
  name: string;
  aliases: string[];
  mentions: number;
  chapters: number[];
}

export interface NlpQuote {
  chapterIndex: number;
  text: string;
  kind: "quote" | "dialogue";
  speaker: string | null;
  score: number;
}

export interface NlpResult {
  characters: NlpCharacter[];
  quotes: NlpQuote[];
}

export interface NlpChapterInput {
  index: number;
  title: string | null;
  text: string;
}

function enabled(): boolean {
  const v = (process.env.NLP_ENABLED ?? "true").toLowerCase();
  return v !== "false" && v !== "0" && v !== "no";
}

// Directory server/ (due livelli sopra src/content/).
function serverRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..");
}

function scriptPath(): string {
  return join(serverRoot(), "nlp", "index_book.py");
}

// Binario Python da usare: NLP_PYTHON, altrimenti il venv server/nlp/.venv/bin/python.
function pythonBinary(): string {
  const fromEnv = process.env.NLP_PYTHON;
  if (fromEnv && fromEnv.trim() !== "") return fromEnv.trim();
  return join(serverRoot(), "nlp", ".venv", "bin", "python");
}

// PATH "ricco" (come engine.ts): lo script ha shebang e python3 puo' stare in posizioni note.
function richPath(): string {
  const home = homedir();
  const candidates = [
    dirname(process.execPath),
    join(home, ".pyenv", "shims"),
    join(home, ".local", "bin"),
    "/usr/local/bin",
    "/usr/bin",
    ...(process.env.PATH ? process.env.PATH.split(delimiter) : []),
  ];
  const seen = new Set<string>();
  return candidates.filter((d) => d && !seen.has(d) && seen.add(d)).join(delimiter);
}

function timeoutMs(): number {
  const v = Number(process.env.NLP_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : 120_000;
}

interface SpawnOut {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function spawnCollect(cmd: string, args: string[], input: string): Promise<SpawnOut> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: tmpdir(),
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, PATH: richPath() },
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
    }, timeoutMs());

    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
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

    child.stdin.write(input);
    child.stdin.end();
  });
}

function coerceResult(raw: unknown): NlpResult | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const chars = Array.isArray(o.characters) ? o.characters : [];
  const quotes = Array.isArray(o.quotes) ? o.quotes : [];

  const characters: NlpCharacter[] = chars
    .map((c) => {
      if (c == null || typeof c !== "object") return null;
      const r = c as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (name === "") return null;
      return {
        name,
        aliases: Array.isArray(r.aliases) ? r.aliases.map(String) : [],
        mentions: Number.isFinite(Number(r.mentions)) ? Number(r.mentions) : 0,
        chapters: Array.isArray(r.chapters)
          ? r.chapters.map((x) => Number(x)).filter((x) => Number.isFinite(x))
          : [],
      } satisfies NlpCharacter;
    })
    .filter((c): c is NlpCharacter => c !== null);

  const outQuotes: NlpQuote[] = quotes
    .map((q) => {
      if (q == null || typeof q !== "object") return null;
      const r = q as Record<string, unknown>;
      const text = typeof r.text === "string" ? r.text.trim() : "";
      if (text === "") return null;
      const kind = r.kind === "dialogue" ? "dialogue" : "quote";
      return {
        chapterIndex: Number.isFinite(Number(r.chapterIndex)) ? Number(r.chapterIndex) : 0,
        text,
        kind,
        speaker: typeof r.speaker === "string" && r.speaker.trim() !== "" ? r.speaker : null,
        score: Number.isFinite(Number(r.score)) ? Number(r.score) : 0,
      } satisfies NlpQuote;
    })
    .filter((q): q is NlpQuote => q !== null);

  return { characters, quotes: outQuotes };
}

/**
 * Esegue il pre-pass NLP sui capitoli forniti. Ritorna i dati estratti, oppure
 * null se il pre-pass e' disabilitato/non disponibile/fallisce (fallback graceful).
 */
export async function indexBook(chapters: NlpChapterInput[]): Promise<NlpResult | null> {
  if (!enabled()) return null;
  const script = scriptPath();
  const py = pythonBinary();
  if (!existsSync(script)) return null;
  // Se il binario e' un percorso assoluto/relativo e non esiste, salta subito.
  if ((py.includes("/") || py.includes("\\")) && !existsSync(py)) return null;

  const input = JSON.stringify(
    chapters.map((ch) => ({ index: ch.index, title: ch.title, text: ch.text })),
  );

  let out: SpawnOut;
  try {
    out = await spawnCollect(py, [script], input);
  } catch {
    // Python non avviabile -> NLP non disponibile.
    return null;
  }
  if (out.timedOut || out.code !== 0) {
    if (out.stderr.trim() !== "") {
      // eslint-disable-next-line no-console
      console.warn(`[nlp] pre-pass non disponibile: ${out.stderr.trim().split("\n").pop()}`);
    }
    return null;
  }
  try {
    return coerceResult(JSON.parse(out.stdout));
  } catch {
    return null;
  }
}
