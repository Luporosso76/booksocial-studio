import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { query, execute } from "../db/pool.js";

const SESSION_TTL_DAYS =
  Number(process.env.SESSION_TTL_DAYS) > 0 ? Number(process.env.SESSION_TTL_DAYS) : 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "12345678";

export const MIN_PASSWORD_LEN = 8;

const LOGIN_MAX_ATTEMPTS =
  Number(process.env.LOGIN_MAX_ATTEMPTS) > 0 ? Number(process.env.LOGIN_MAX_ATTEMPTS) : 5;
const LOGIN_BLOCK_MS =
  (Number(process.env.LOGIN_BLOCK_SECONDS) > 0 ? Number(process.env.LOGIN_BLOCK_SECONDS) : 900) *
  1000;
const loginGate = { fails: 0, blockedUntil: 0 };

export type LoginResult =
  | { ok: true; token: string; mustChange: boolean }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "blocked"; retryAfterSec: number };

function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const dk = scryptSync(pw, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === dk.length && timingSafeEqual(expected, dk);
}

export async function ensureSeed(): Promise<void> {
  const [row] = await query<{ id: number }>("SELECT id FROM app_auth WHERE id=1");
  if (!row) {
    await execute(
      "INSERT INTO app_auth(id, username, password_hash, must_change, updated_at) VALUES (1, ?, ?, 1, ?)",
      [DEFAULT_USERNAME, hashPassword(DEFAULT_PASSWORD), Date.now()],
    );
  }
}

async function createSession(): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await execute("INSERT INTO app_session(token, created_at, expires_at) VALUES (?,?,?)", [
    token,
    now,
    now + SESSION_TTL_MS,
  ]);
  return token;
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const now = Date.now();
  if (loginGate.blockedUntil > now) {
    return {
      ok: false,
      reason: "blocked",
      retryAfterSec: Math.ceil((loginGate.blockedUntil - now) / 1000),
    };
  }
  const [row] = await query<{ username: string; password_hash: string; must_change: number }>(
    "SELECT username, password_hash, must_change FROM app_auth WHERE id=1",
  );
  const valid = !!row && row.username === username && verifyPassword(password, row.password_hash);
  if (!valid) {
    loginGate.fails += 1;
    if (loginGate.fails >= LOGIN_MAX_ATTEMPTS) {
      loginGate.blockedUntil = now + LOGIN_BLOCK_MS;
      loginGate.fails = 0;
      console.warn(
        `[auth] login failed: attempt limit reached, blocking for ${Math.round(LOGIN_BLOCK_MS / 1000)}s`,
      );
      return { ok: false, reason: "blocked", retryAfterSec: Math.ceil(LOGIN_BLOCK_MS / 1000) };
    }
    console.warn(`[auth] login failed (attempt ${loginGate.fails}/${LOGIN_MAX_ATTEMPTS})`);
    return { ok: false, reason: "invalid" };
  }
  loginGate.fails = 0;
  loginGate.blockedUntil = 0;
  const token = await createSession();
  return { ok: true, token, mustChange: Number(row!.must_change) === 1 };
}

export async function isValidSession(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const [row] = await query<{ token: string }>(
    "SELECT token FROM app_session WHERE token=? AND expires_at > ?",
    [token, Date.now()],
  );
  return !!row;
}

export async function status(
  token: string | null | undefined,
): Promise<{ authenticated: boolean; mustChange: boolean }> {
  if (!(await isValidSession(token))) return { authenticated: false, mustChange: false };
  const [a] = await query<{ must_change: number }>("SELECT must_change FROM app_auth WHERE id=1");
  return { authenticated: true, mustChange: Number(a?.must_change) === 1 };
}

export async function logout(token: string | null | undefined): Promise<void> {
  if (token) await execute("DELETE FROM app_session WHERE token=?", [token]);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true; token: string } | { ok: false; error: "too-short" | "wrong-current" }> {
  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LEN) {
    return { ok: false, error: "too-short" };
  }
  const [row] = await query<{ password_hash: string }>(
    "SELECT password_hash FROM app_auth WHERE id=1",
  );
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return { ok: false, error: "wrong-current" };
  }
  await execute("UPDATE app_auth SET password_hash=?, must_change=0, updated_at=? WHERE id=1", [
    hashPassword(newPassword),
    Date.now(),
  ]);
  await execute("DELETE FROM app_session", []);
  const token = await createSession();
  return { ok: true, token };
}

export const SESSION_COOKIE = "bs_session";
export const SESSION_MAX_AGE_S = SESSION_TTL_MS / 1000;
