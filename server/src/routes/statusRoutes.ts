import { Hono } from "hono";
import { getLastTextEngine } from "../content/engine.js";
import { createImageEngine, getLastImageEngine } from "../media/imageEngine.js";
import { books, pages, renderJobs } from "../db/repositories.js";
import { listActiveSceneGen } from "../sceneGenJobs.js";
import { listActiveMediaRegen } from "../mediaRegenJobs.js";
import { listActiveVisualBible } from "../visualBibleJobs.js";
import { listJobs } from "../analysisJobs.js";
import { listActiveWeekGen } from "../weekGenJobs.js";
import { type RouteContext } from "./_shared.js";

export function mountStatus(api: Hono, ctx: RouteContext): void {
  const { deps } = ctx;

  // ---------------- state / read ----------------

  api.get("/health", (c) => c.json({ status: "ok" }));

  api.get("/status", async (c) => {
    const [allPages, allBooks] = await Promise.all([pages.all(), books.all()]);
    return c.json({
      secretsUnlocked: deps.secretsUnlocked,
      provider: deps.engine.name(),
      textProvider: deps.engine.name(),
      textActive: getLastTextEngine(),
      imageProvider: createImageEngine().name(),
      imageActive: getLastImageEngine(),
      pages: allPages.length,
      books: allBooks.length,
    });
  });

  // Attività in background per l'indicatore globale: analisi libri (analyzing) +
  // render visual (queued|rendering). Il campo `kind` li distingue.
  api.get("/jobs", async (c) => {
    const analysisJobs = listJobs().filter((j) => j.status === "analyzing");
    const analysisOut = await Promise.all(
      analysisJobs.map(async (j) => {
        const book = await books.get(j.bookId);
        return {
          bookId: String(j.bookId),
          title: book?.title ?? `Libro ${j.bookId}`,
          kind: "analysis",
          status: j.status,
          startedAt: j.startedAt,
        };
      }),
    );

    const active = await renderJobs.active();
    const renderOut = active.map((j) => ({
      id: String(j.id),
      postId: j.postId == null ? null : String(j.postId),
      bookId: j.bookId == null ? null : String(j.bookId),
      title: `Render ${j.kind}`,
      kind: "render",
      renderKind: j.kind,
      status: j.status, // queued | rendering
      startedAt: j.createdAt,
    }));

    // Generazioni-settimana in corso (per l'indicatore globale + progresso).
    const weekgenOut = listActiveWeekGen().map((j) => ({
      pageId: j.pageId,
      title: "Generazione settimana",
      kind: "weekgen",
      status: j.status, // generating
      planned: j.planned,
      created: j.created,
      startedAt: j.startedAt,
    }));

    // Generazioni-immagini-di-scena in corso (per l'indicatore globale + progresso).
    const sceneOut = listActiveSceneGen().map((j) => ({
      bookId: String(j.bookId),
      title: "Generazione immagini",
      kind: "scenegen",
      status: j.status, // generating
      planned: j.planned,
      created: j.created,
      startedAt: j.startedAt,
      waiting: j.waiting,
    }));

    // Rigenerazione immagini in corso (coda GLOBALE seriale): un solo job aggregato quando c'è
    // attività (corrente o coda), con avanzamento fatte/totale per l'indicatore globale.
    const regen = listActiveMediaRegen();
    const regenOut =
      regen.current !== null || regen.queued.length > 0
        ? [
            {
              title: "Rigenerazione immagini",
              kind: "mediaRegen",
              status: "generating" as const,
              planned: regen.planned,
              created: regen.created,
              startedAt: regen.startedAt,
              ...(regen.current
                ? { mediaId: regen.current.mediaId, bookId: String(regen.current.bookId) }
                : {}),
            },
          ]
        : [];

    // Costruzioni "bibbia visiva" in corso (per l'indicatore globale + progresso per-step).
    const visualBibleOut = listActiveVisualBible().map((s) => ({
      bookId: String(s.bookId),
      title: "Bibbia visiva",
      kind: "visualBible",
      status: "generating",
      startedAt: s.startedAt,
      steps: s.steps,
    }));

    return c.json({
      jobs: [
        ...analysisOut,
        ...renderOut,
        ...weekgenOut,
        ...sceneOut,
        ...regenOut,
        ...visualBibleOut,
      ],
    });
  });
}
