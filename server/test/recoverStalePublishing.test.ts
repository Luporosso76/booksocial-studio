import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScheduledPost } from "../src/domain.js";

// Punto 1 del pacchetto "publishing & jobs": la crash-recovery NON deve rimettere in coda i post
// rimasti in PUBLISHING senza id di pubblicazione (rischio di doppia pubblicazione pubblica): li
// marca FAILED con un messaggio esplicito. I post che HANNO già un id (fb o ig) non vanno toccati.

type Migrate = typeof import("../src/db/migrate.js");
type Repos = typeof import("../src/db/repositories.js");
let migrate: Migrate;
let repos: Repos;

beforeAll(async () => {
  process.env.BOOKSOCIAL_DATA_DIR = mkdtempSync(join(tmpdir(), "bs-recover-"));
  migrate = await import("../src/db/migrate.js");
  repos = await import("../src/db/repositories.js");
  await migrate.runMigrations();
  await repos.pages.upsert({
    pageId: "page-1",
    name: "Test Page",
    category: null,
    tokenSecretKey: "fb.page.page-1",
    bookId: null,
    addedAt: Date.now(),
    igUserId: null,
  });
});

function basePost(over: Partial<Omit<ScheduledPost, "id">>): Omit<ScheduledPost, "id"> {
  const now = Date.now();
  return {
    pageId: "page-1",
    bookId: null,
    generationId: null,
    message: "hello",
    hashtags: null,
    mediaType: "TEXT",
    link: null,
    mediaPath: null,
    scheduledAt: now,
    status: "PUBLISHING",
    fbPostId: null,
    attempts: 0,
    lastError: null,
    idempotencyKey: `k-${Math.random()}`,
    musicId: null,
    contentFormat: null,
    platform: "facebook",
    linkedPostId: null,
    igMediaId: null,
    dashboardHidden: false,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("posts.recoverStalePublishing", () => {
  it("marca FAILED i post PUBLISHING senza id di pubblicazione e lascia intatti quelli con id", async () => {
    const stuck = await repos.posts.insert(basePost({ status: "PUBLISHING" }));
    const withFb = await repos.posts.insert(
      basePost({ status: "PUBLISHING", fbPostId: "fb-123" }),
    );
    const withIg = await repos.posts.insert(
      basePost({ status: "PUBLISHING", platform: "instagram", igMediaId: "ig-456" }),
    );

    const affected = await repos.posts.recoverStalePublishing(Date.now());
    expect(affected).toBe(1);

    const stuckAfter = await repos.posts.get(stuck.id);
    expect(stuckAfter?.status).toBe("FAILED");
    expect(stuckAfter?.lastError).toMatch(/interrotta/i);

    // I post con un id di pubblicazione restano invariati (non vanno ripubblicati né falliti).
    expect((await repos.posts.get(withFb.id))?.status).toBe("PUBLISHING");
    expect((await repos.posts.get(withIg.id))?.status).toBe("PUBLISHING");
  });
});
