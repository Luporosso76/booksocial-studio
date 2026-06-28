import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LATEST_VERSION = 9;
const CORE_TABLES = [
  "book",
  "book_chapter",
  "app_auth",
  "app_session",
  "visual_directive",
  "render_job",
];

type Migrate = typeof import("../src/db/migrate.js");
type Pool = typeof import("../src/db/pool.js");
let migrate: Migrate;
let pool: Pool;

beforeAll(async () => {
  process.env.BOOKSOCIAL_DATA_DIR = mkdtempSync(join(tmpdir(), "bs-migrate-"));
  migrate = await import("../src/db/migrate.js");
  pool = await import("../src/db/pool.js");
});

describe("runMigrations", () => {
  it("applies all migrations on a fresh empty database", async () => {
    const applied = await migrate.runMigrations();
    expect(applied).toBeGreaterThan(0);
  });

  it("is idempotent: a second run applies nothing", async () => {
    const applied = await migrate.runMigrations();
    expect(applied).toBe(0);
  });

  it("creates the expected core tables", async () => {
    const rows = await pool.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const names = rows.map((r) => r.name);
    for (const t of CORE_TABLES) {
      expect(names).toContain(t);
    }
  });

  it("records the latest schema version", async () => {
    const [row] = await pool.query<{ v: number }>(
      "SELECT COALESCE(MAX(version), 0) AS v FROM schema_version",
    );
    expect(Number(row.v)).toBe(LATEST_VERSION);
  });
});
