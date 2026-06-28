import { Hono } from "hono";
import { renderJobs } from "../db/repositories.js";
import { query } from "../db/pool.js";
import { err, type RouteContext } from "./_shared.js";

export function mountRender(api: Hono, _ctx: RouteContext): void {
  // GET /render-jobs — job attivi (per l'indicatore).
  api.get("/render-jobs", async (c) => {
    const active = await renderJobs.active();
    return c.json({
      jobs: active.map((j) => ({
        id: String(j.id),
        kind: j.kind,
        status: j.status,
        postId: j.postId == null ? null : String(j.postId),
      })),
    });
  });

  // GET /render-jobs/:id — stato + outputUrl (se done e registrato come media).
  api.get("/render-jobs/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const job = await renderJobs.get(id);
    if (!job) return c.json(err("Render job non trovato"), 404);
    // Risali all'eventuale media_asset prodotto (per servire l'anteprima via /media/file/:id).
    let outputUrl: string | null = null;
    if (job.outputPath && job.bookId != null) {
      const rows = await query<{ id: number }>(
        "SELECT id FROM media_asset WHERE path = ? ORDER BY id DESC LIMIT 1",
        [job.outputPath],
      );
      if (rows.length > 0) outputUrl = `/api/media/file/${rows[0]!.id}`;
    }
    return c.json({
      id: String(job.id),
      kind: job.kind,
      status: job.status,
      postId: job.postId == null ? null : String(job.postId),
      bookId: job.bookId == null ? null : String(job.bookId),
      error: job.error,
      outputUrl,
    });
  });
}
