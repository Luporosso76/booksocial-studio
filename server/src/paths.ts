import { join, isAbsolute, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

// All app data (DB + media + generated + books + music + sdcpp) lives under ONE data directory.
// Default: <project-root>/data — the folder that ships with the project, so the data sits next to
// the app and a manual run agrees with Docker (docker-compose maps ./data). Override anywhere with
// BOOKSOCIAL_DATA_DIR (absolute path recommended).

// paths.ts lives in server/src (dev/tsx) or server/dist (build); two levels up is the project root.
const here = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(here, "..", "..");

function ensureDir(p: string): string {
  mkdirSync(p, { recursive: true });
  return p;
}

// Radice di TUTTI i dati dell'app (media, generated, books, music, sdcpp).
// Se BOOKSOCIAL_DATA_DIR è impostata, È la cartella dati (collocabile ovunque); altrimenti il
// default è <project-root>/data.
export function dataDir(): string {
  const explicit = process.env.BOOKSOCIAL_DATA_DIR;
  if (explicit && explicit.trim() !== "") return ensureDir(explicit);
  return ensureDir(join(PROJECT_ROOT, "data"));
}

export function booksDir(): string {
  return ensureDir(join(dataDir(), "books"));
}

export function mediaDir(): string {
  return ensureDir(join(dataDir(), "media"));
}

export function renderDir(): string {
  return ensureDir(join(mediaDir(), "renders"));
}

// Immagini del GENERATORE LIBERO (non legate a un libro), separate dai media dei libri.
export function generatedDir(): string {
  return ensureDir(join(dataDir(), "generated"));
}

export function musicDir(): string {
  return ensureDir(join(dataDir(), "music"));
}

// ---------- path nel DB: RELATIVI alla cartella dati ----------
// Contratto: nel DB i path sono RELATIVI a dataDir() (es. "media/scene-x.png"); così i dati sono
// ricollocabili senza riscrivere il DB. Ogni LETTURA da DB passa per resolveDataPath; ogni
// SCRITTURA/insert passa per toDataRelative.

// DB → assoluto. Se il path è già assoluto, lo ritorna invariato.
export function resolveDataPath(p: string): string {
  return isAbsolute(p) ? p : join(dataDir(), p);
}

export function resolveInsideDataDir(inputPath: string): string {
  const base = resolve(dataDir());
  const resolved = resolve(resolveDataPath(inputPath));
  if (resolved !== base && !resolved.startsWith(base + sep)) {
    throw Object.assign(new Error("Path outside data directory"), { httpStatus: 400 });
  }
  return resolved;
}

// assoluto → relativo a dataDir (da salvare nel DB). Se il file è FUORI da dataDir non si può
// relativizzare in sicurezza → ritorna l'assoluto (verrà gestito da resolveDataPath in lettura).
export function toDataRelative(abs: string): string {
  if (!isAbsolute(abs)) return abs; // già relativo
  const rel = relative(dataDir(), abs);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? abs : rel;
}

// Variante STRICT per la SCRITTURA su DB: garantisce che il path cada dentro dataDir e ritorna
// sempre il relativo; se è fuori (assoluto estraneo, traversal) lancia invece di salvare un assoluto.
export function toDataRelativeStrict(inputPath: string): string {
  const base = resolve(dataDir());
  const absolute = resolve(resolveDataPath(inputPath));
  if (absolute !== base && !absolute.startsWith(base + sep)) {
    throw Object.assign(new Error("Path outside data directory"), { httpStatus: 400 });
  }
  return relative(base, absolute);
}
