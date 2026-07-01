import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import * as auth from "./services/authService.js";
import { pages } from "./db/repositories.js";
import * as keyring from "./secrets/keyring.js";
import * as ig from "./facebook/instagramClient.js";
import { pageSecretKeyFor } from "./domain.js";
import type { AppDeps, RouteContext } from "./routes/_shared.js";
import { rateLimit } from "./routes/_shared.js";
export type { AppDeps } from "./routes/_shared.js";
import { mountAuth } from "./routes/authRoutes.js";
import { mountStatus } from "./routes/statusRoutes.js";
import { mountPages } from "./routes/pageRoutes.js";
import { mountBooks } from "./routes/bookRoutes.js";
import { mountMedia } from "./routes/mediaRoutes.js";
import { mountCharacters } from "./routes/characterRoutes.js";
import { mountVisualBible } from "./routes/visualBibleRoutes.js";
import { mountImageGen } from "./routes/imageGenRoutes.js";
import { mountSettings } from "./routes/settingsRoutes.js";
import { mountPost } from "./routes/postRoutes.js";
import { mountRender } from "./routes/renderRoutes.js";
import { mountMusic } from "./routes/musicRoutes.js";
import { mountInstagram } from "./routes/instagramRoutes.js";

export function buildApi(deps: AppDeps): Hono {
  const api = new Hono();

  api.use("*", rateLimit({ windowMs: 60_000, max: 600 }));

  const PUBLIC_PATHS = new Set([
    "/api/health",
    "/api/auth/login",
    "/api/auth/status",
    "/api/auth/logout",
  ]);
  api.use("*", async (c, next) => {
    if (c.req.method === "OPTIONS" || PUBLIC_PATHS.has(c.req.path)) return next();
    const token = getCookie(c, auth.SESSION_COOKIE);
    if (!(await auth.isValidSession(token))) return c.json({ error: "unauthorized" }, 401);
    return next();
  });

  let imageGenGate: Promise<void> = Promise.resolve();
  function runImageGenExclusive(fn: () => Promise<void>): Promise<void> {
    const run = imageGenGate.then(fn);
    imageGenGate = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  function requireSecrets(): void {
    if (!deps.secretsUnlocked) {
      throw new Error(
        "Cassaforte non disponibile (keyring bloccato). Installa/avvia gnome-keyring.",
      );
    }
  }

  async function resolvePageToken(pageId: string): Promise<
    | { token: string; fail?: undefined }
    | {
        token?: undefined;
        fail: { body: Record<string, unknown>; status: 404 | 503 };
      }
  > {
    const pg = await pages.find(pageId);
    if (!pg) return { fail: { body: { error: "Pagina non trovata" }, status: 404 } };
    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return {
        fail: {
          body: { ok: false, error: "Token di pagina non trovato nel keyring" },
          status: 503,
        },
      };
    }
    return { token: pageToken };
  }

  async function resolveIgContext(pageId: string): Promise<
    | { token: string; igUserId: string; fail?: undefined }
    | {
        token?: undefined;
        igUserId?: undefined;
        fail: { body: Record<string, unknown>; status: 404 | 503 };
      }
  > {
    const r = await resolvePageToken(pageId);
    if (r.fail) return { fail: r.fail };
    const pg = await pages.find(pageId);
    let igUserId = pg?.igUserId ?? null;
    if (!igUserId) {
      try {
        igUserId = await ig.getIgUserId(pageId, r.token);
      } catch {
        igUserId = null;
      }
      if (igUserId) await pages.setIgUserId(pageId, igUserId);
    }
    if (!igUserId) {
      return {
        fail: {
          body: {
            error: "Nessun account Instagram Business collegato a questa Pagina.",
          },
          status: 503,
        },
      };
    }
    return { token: r.token, igUserId };
  }

  const ctx: RouteContext = {
    deps,
    requireSecrets,
    resolvePageToken,
    resolveIgContext,
    runImageGenExclusive,
  };

  mountAuth(api, ctx);
  mountStatus(api, ctx);
  mountPages(api, ctx);
  mountBooks(api, ctx);
  mountMedia(api, ctx);
  mountCharacters(api, ctx);
  mountVisualBible(api, ctx);
  mountImageGen(api, ctx);
  mountSettings(api, ctx);
  mountPost(api, ctx);
  mountRender(api, ctx);
  mountMusic(api, ctx);
  mountInstagram(api, ctx);

  return api;
}
