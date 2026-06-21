import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { dataDir } from "../paths.js";

// Encrypted-file secret store (AES-256-GCM), replacing the OS keyring (secret-tool/libsecret).
// Rationale: a downloadable product cannot depend on the OS keyring — Docker images and headless
// servers have no secret-tool. Secrets live ONLY in this encrypted file, never in the DB or logs.
//
// Layout:
//   <dataDir>/secrets.enc  — AES-256-GCM ciphertext of a JSON map { key: value }.
//   <dataDir>/secret.key   — 32-byte encryption key (mode 0600), auto-generated if absent.
//                            Skipped when BOOKSOCIAL_SECRET_KEY is provided via env.
//
// File format of secrets.enc (binary): [12-byte IV][16-byte auth tag][ciphertext].

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function secretsFile(): string {
  return join(dataDir(), "secrets.enc");
}

function keyFile(): string {
  return join(dataDir(), "secret.key");
}

// Resolve the 32-byte AES key: from BOOKSOCIAL_SECRET_KEY (hex or base64 or raw utf8 hashed),
// else from <dataDir>/secret.key, auto-generating it (mode 0600) on first use.
function loadKey(): Buffer {
  const env = process.env.BOOKSOCIAL_SECRET_KEY;
  if (env && env.trim() !== "") {
    const trimmed = env.trim();
    // Accept a 64-char hex string or 44-char base64 as a raw 32-byte key; otherwise derive
    // a stable 32-byte key from the passphrase via SHA-256.
    const hexMatch = /^[0-9a-fA-F]{64}$/.test(trimmed);
    if (hexMatch) return Buffer.from(trimmed, "hex");
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === 32) return b64;
    // Passphrase fallback: derive a stable 32-byte key via SHA-256.
    return createHash("sha256").update(trimmed, "utf8").digest();
  }

  const kf = keyFile();
  if (existsSync(kf)) {
    const raw = readFileSync(kf);
    if (raw.length === 32) return raw;
    // Stored as hex (manual edits): decode.
    const asHex = Buffer.from(raw.toString("utf8").trim(), "hex");
    if (asHex.length === 32) return asHex;
    throw new Error("secret.key has an invalid length; remove it to regenerate");
  }

  const key = randomBytes(32);
  mkdirSync(dirname(kf), { recursive: true });
  writeFileSync(kf, key, { mode: 0o600 });
  try {
    chmodSync(kf, 0o600);
  } catch {
    // best-effort on platforms without POSIX permissions
  }
  return key;
}

function readStore(): Record<string, string> {
  const file = secretsFile();
  if (!existsSync(file)) return {};
  const blob = readFileSync(file);
  if (blob.length < IV_LEN + TAG_LEN) return {};
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, loadKey(), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const parsed = JSON.parse(plain.toString("utf8")) as Record<string, string>;
  return parsed && typeof parsed === "object" ? parsed : {};
}

function writeStore(map: Record<string, string>): void {
  const file = secretsFile();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, loadKey(), iv);
  const plain = Buffer.from(JSON.stringify(map), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.concat([iv, tag, ciphertext]), { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best-effort
  }
}

/**
 * Always true: the encrypted-file store needs no external service. Kept async and named
 * `isAvailable` so existing callers (index.ts, aiSettings.ts) are unchanged.
 */
export async function isAvailable(): Promise<boolean> {
  return true;
}

export async function put(key: string, value: string): Promise<void> {
  const map = readStore();
  map[key] = value;
  writeStore(map);
}

export async function get(key: string): Promise<string | null> {
  const map = readStore();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

export async function remove(key: string): Promise<void> {
  const map = readStore();
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    delete map[key];
    writeStore(map);
  }
}

export async function contains(key: string): Promise<boolean> {
  const map = readStore();
  return Object.prototype.hasOwnProperty.call(map, key);
}
