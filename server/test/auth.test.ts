import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_PASSWORD = "12345678";
const LOGIN_MAX_ATTEMPTS = 5;

type Auth = typeof import("../src/services/authService.js");
let auth: Auth;

beforeAll(async () => {
  process.env.BOOKSOCIAL_DATA_DIR = mkdtempSync(join(tmpdir(), "bs-auth-"));
  const { runMigrations } = await import("../src/db/migrate.js");
  auth = await import("../src/services/authService.js");
  await runMigrations();
  await auth.ensureSeed();
});

describe("authService", () => {
  it("rejects a wrong password with reason 'invalid'", async () => {
    const r = await auth.login("admin", "definitely-wrong");
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });

  it("logs in with the default seed credentials and requires a password change", async () => {
    const r = await auth.login("admin", DEFAULT_PASSWORD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mustChange).toBe(true);
      expect(typeof r.token).toBe("string");
    }
  });

  it("resets the fail counter after a correct login", async () => {
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS - 1; i++) {
      const r = await auth.login("admin", "nope");
      expect(r).toEqual({ ok: false, reason: "invalid" });
    }
    const ok = await auth.login("admin", DEFAULT_PASSWORD);
    expect(ok.ok).toBe(true);
    const after = await auth.login("admin", "nope");
    expect(after).toEqual({ ok: false, reason: "invalid" });
  });

  it("validates a fresh session token and rejects garbage", async () => {
    const r = await auth.login("admin", DEFAULT_PASSWORD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await auth.isValidSession(r.token)).toBe(true);
    expect(await auth.isValidSession("garbage-token")).toBe(false);
    expect(await auth.isValidSession(null)).toBe(false);
  });

  it("changePassword succeeds and invalidates all existing sessions", async () => {
    const r = await auth.login("admin", DEFAULT_PASSWORD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const oldToken = r.token;
    const cp = await auth.changePassword(DEFAULT_PASSWORD, "brand-new-password");
    expect(cp.ok).toBe(true);
    expect(await auth.isValidSession(oldToken)).toBe(false);
    if (cp.ok) {
      expect(await auth.isValidSession(cp.token)).toBe(true);
    }
  });

  it("blocks after too many failed attempts", async () => {
    let last: Awaited<ReturnType<typeof auth.login>> | undefined;
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      last = await auth.login("admin", "wrong-again");
    }
    expect(last!.ok).toBe(false);
    if (!last!.ok) {
      expect(last!.reason).toBe("blocked");
      if (last!.reason === "blocked") {
        expect(last!.retryAfterSec).toBeGreaterThan(0);
      }
    }
  });
});
