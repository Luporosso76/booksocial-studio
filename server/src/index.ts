import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { appConfig } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";
import { createEngine } from "./content/engine.js";
import * as aiSettings from "./content/aiSettings.js";
import { ContentService } from "./services/contentService.js";
import { WeekPlanner } from "./services/weekPlanner.js";
import { Director } from "./media/director.js";
import { SceneImageService } from "./services/sceneImageService.js";
import { imageGenAvailable } from "./media/imageGen.js";
import { ChapterSceneService } from "./services/chapterSceneService.js";
import { kick as kickRenderQueue } from "./media/renderQueue.js";
import { renderJobs } from "./db/repositories.js";
import { PublishScheduler } from "./scheduler/publishScheduler.js";
import { RenderCleanup } from "./scheduler/renderCleanup.js";
import * as keyring from "./secrets/keyring.js";
import { buildApi, type AppDeps } from "./routes.js";
import { basicAuthMiddleware } from "./auth/basicAuth.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  // 1) Migrations on SQLite (embedded, better-sqlite3).
  const applied = await runMigrations();
  console.log(`[db] migrazioni applicate in questa esecuzione: ${applied}`);

  // 2) Engine + services.
  // Carica la config RUNTIME dei provider AI (DB + keyring) in cache PRIMA di createEngine(),
  // così engine e imageEngine leggono i valori salvati (con fallback env) senza riavvio.
  await aiSettings.load();
  const engine = createEngine();
  const content = new ContentService(engine);
  const director = new Director({ engine });
  const chapterScenes = new ChapterSceneService({ engine });
  const sceneImages = new SceneImageService({ engine, chapterScenes });
  // Il planner riceve il Director: senza, le bozze con visual (card/reel/storyboard/storia)
  // non genererebbero MAI l'immagine/video (render mai accodato). Riceve anche sceneImages
  // per la "Generazione diretta" (impostazione): genera lo sfondo AI prima del render.
  const planner = new WeekPlanner(content, director, sceneImages);
  const secretsUnlocked = await keyring.isAvailable();
  console.log(`[engine] provider=${engine.name()} secretsUnlocked=${secretsUnlocked}`);
  if (!imageGenAvailable()) {
    console.log("[immagini] motore locale non disponibile: modalità solo-upload");
  }

  // Recupero coda render: i job rimasti 'rendering' a un riavvio non possono
  // riprendere (coda in-process) -> marcali 'failed', poi riavvia il worker per
  // gli eventuali 'queued' rimasti.
  await renderJobs.failStaleRendering().catch(() => 0);
  kickRenderQueue();

  const deps: AppDeps = {
    engine,
    content,
    planner,
    director,
    sceneImages,
    chapterScenes,
    secretsUnlocked,
  };

  // 3) HTTP app.
  const app = new Hono();

  // Centralized error handler -> { error } with status >= 400.
  app.onError((e, c) => {
    const message = e instanceof Error && e.message ? e.message : String(e);
    console.warn(`[api] errore su ${c.req.method} ${c.req.path}: ${message}`);
    const status = (e as { httpStatus?: number }).httpStatus;
    const code = typeof status === "number" && status >= 400 && status <= 599 ? status : 500;
    return c.json({ error: message }, code as 400);
  });

  // 3b) HTTP Basic Auth opzionale (self-host). Se ENTRAMBE le credenziali sono
  // presenti, la richiediamo su TUTTE le richieste (API + statico) tranne /api/health.
  // Il middleware va installato PRIMA delle rotte e dello static-serving.
  if (appConfig.authUser && appConfig.authPass) {
    app.use("*", basicAuthMiddleware({ user: appConfig.authUser, pass: appConfig.authPass }));
    console.log("[auth] Basic Auth attiva");
  } else {
    console.log("[auth] nessuna autenticazione (solo localhost consigliato)");
    if (appConfig.host === "0.0.0.0") {
      console.warn(
        "[sicurezza] in ascolto su 0.0.0.0 SENZA autenticazione: imposta AUTH_USER/AUTH_PASS o usa un reverse proxy",
      );
    }
  }

  app.route("/api", buildApi(deps));

  // 4) In production, serve ../web/dist as static if present (dev uses Vite proxy).
  const webDist = resolve(here, "..", "..", "web", "dist");
  if (existsSync(webDist)) {
    console.log(`[static] servo il frontend da ${webDist}`);
    app.use("/*", serveStatic({ root: webDist }));
    app.get("/*", serveStatic({ path: "index.html", root: webDist }));
  }

  // 5) Scheduler (publishes only SCHEDULED due posts; never DRAFT).
  const scheduler = new PublishScheduler();
  await scheduler.start();

  const renderCleanup = new RenderCleanup();
  renderCleanup.start();

  // 6) Listen on 127.0.0.1:PORT.
  serve({ fetch: app.fetch, hostname: appConfig.host, port: appConfig.port }, (info) => {
    console.log(`[server] in ascolto su http://${appConfig.host}:${info.port}`);
  });

  const shutdown = async () => {
    scheduler.stop();
    renderCleanup.stop();
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[fatal] avvio fallito:", e);
  process.exit(1);
});
