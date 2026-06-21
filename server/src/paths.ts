import { homedir } from "node:os";
import { join, isAbsolute, relative } from "node:path";
import { mkdirSync } from "node:fs";

// XDG-conformant paths.
// Books are stored under ~/.local/share/book-social/books by default.

const APP_DIR = "book-social";

function xdgBase(envName: string, fallback: string): string {
  const v = process.env[envName];
  if (v && v.trim() !== "") return v;
  return join(homedir(), fallback);
}

function ensureDir(p: string): string {
  mkdirSync(p, { recursive: true });
  return p;
}

// Radice di TUTTI i dati dell'app (media, generated, books, music, sdcpp).
// Se BOOKSOCIAL_DATA_DIR è impostata, È la cartella dati (così si può collocare ovunque, es.
// ~/booksocial/data); altrimenti default XDG (~/.local/share/book-social).
export function dataDir(): string {
  const explicit = process.env.BOOKSOCIAL_DATA_DIR;
  if (explicit && explicit.trim() !== "") return ensureDir(explicit);
  return ensureDir(join(xdgBase("XDG_DATA_HOME", ".local/share"), APP_DIR));
}

export function booksDir(): string {
  return ensureDir(join(dataDir(), "books"));
}

export function mediaDir(): string {
  return ensureDir(join(dataDir(), "media"));
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

// assoluto → relativo a dataDir (da salvare nel DB). Se il file è FUORI da dataDir non si può
// relativizzare in sicurezza → ritorna l'assoluto (verrà gestito da resolveDataPath in lettura).
export function toDataRelative(abs: string): string {
  if (!isAbsolute(abs)) return abs; // già relativo
  const rel = relative(dataDir(), abs);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? abs : rel;
}
