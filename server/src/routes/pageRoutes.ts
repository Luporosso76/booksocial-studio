import { Hono } from "hono";
import { insights, pages } from "../db/repositories.js";
import {
  fetchInsights,
  fetchPageOverview,
  fetchFollowerTrend,
  fetchTopPosts,
  fetchPageDetails,
  updatePageSettings,
  uploadPagePhoto,
  setPageCover,
  fetchManagedPosts,
  fetchScheduledPosts,
  editPostMessage,
  deletePost,
  setPostPinned,
  publishNativePost,
  fetchPostComments,
  replyToComment,
  setCommentHidden,
  deleteComment,
  setCommentLiked,
  fetchCoverageTrend,
  fetchDemographics,
  FacebookError,
  type PageSettingsPatch,
} from "../facebook/client.js";
import { pageSecretKeyFor } from "../domain.js";
import { validateUpload } from "../uploads.js";
import { pageDto } from "../serialize.js";
import * as pageConnect from "../services/pageConnectService.js";
import * as ig from "../facebook/instagramClient.js";
import * as keyring from "../secrets/keyring.js";
import { err, jsonBody, type RouteContext } from "./_shared.js";

export function mountPages(api: Hono, ctx: RouteContext): void {
  const { deps, requireSecrets, resolvePageToken } = ctx;

  api.get("/pages", async (c) => {
    const all = await pages.all();
    // Backfill lazy dell'igUserId per le pagine che non l'hanno ancora risolto (best-effort):
    // serve a far comparire il tab Instagram. Solo se il keyring e' sbloccato; ogni errore e'
    // ignorato (una pagina senza IG resta semplicemente con igUserId null).
    if (deps.secretsUnlocked) {
      await Promise.all(
        all
          .filter((p) => p.igUserId == null)
          .map(async (p) => {
            try {
              const token = await keyring.get(pageSecretKeyFor(p.pageId));
              if (token == null) return;
              const igId = await ig.getIgUserId(p.pageId, token);
              if (igId != null) {
                await pages.setIgUserId(p.pageId, igId);
                p.igUserId = igId;
              }
            } catch {
              /* best-effort: non bloccare l'elenco pagine */
            }
          }),
      );
    }
    return c.json(all.map(pageDto));
  });

  api.post("/connection/pages", async (c) => {
    requireSecrets();
    const body = await jsonBody(c);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (token === "") return c.json(err("token mancante"), 400);
    const managed = await pageConnect.loadManagedPages(token);
    return c.json(managed);
  });

  api.post("/connection/save", async (c) => {
    requireSecrets();
    const body = await jsonBody(c);
    let saved = 0;
    if (Array.isArray(body.pages)) {
      for (const p of body.pages) {
        await pageConnect.savePage(p);
        saved++;
      }
    }
    return c.json({ saved });
  });

  api.delete("/pages/:id", async (c) => {
    requireSecrets();
    await pageConnect.removePage(c.req.param("id"));
    return c.json({ ok: true });
  });

  api.post("/connection/disconnect", async (c) => {
    requireSecrets();
    await pageConnect.disconnectAll();
    return c.json({ ok: true });
  });

  // ---------------- insights ----------------

  // KPI snapshot metrics fetched from the Graph API and persisted.
  // v21 (giu 2026): page_impressions/page_fans deprecate -> usiamo le nuove "media view".
  // I totali follower/like arrivano dai campi del nodo Page (fetchPageOverview), non da qui.
  // fetchInsights e' resiliente: le metriche non valide vengono scartate, non bloccano le altre.
  const KPI_METRICS = [
    "page_total_media_view_unique", // copertura/visualizzazioni pagina (sostituisce page_impressions*)
    "page_post_engagements", // interazioni (se ancora attiva su questa pagina)
  ];

  // GET /pages/:id/insights?period=day
  // Fetches live metrics, page totals, and follower trend; persists KPI snapshot.
  // Each sub-call has an independent try/catch: partial failures don't zero the whole response.
  api.get("/pages/:id/insights", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const period = c.req.query("period") ?? "day";
    const fetchedAt = Date.now();

    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);

    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json(
        {
          pageId,
          fetchedAt,
          totals: null,
          metrics: [],
          followerTrend: [],
          error: "Token di pagina non trovato nel keyring",
        },
        503,
      );
    }

    // Sub-call 1: page overview (nodo Page — nome, follower, fan).
    let totals: {
      followersCount: number | null;
      fanCount: number | null;
      name: string | null;
    } | null = null;
    let totalsError: string | null = null;
    try {
      const overview = await fetchPageOverview(pageId, pageToken);
      totals = {
        name: overview.name,
        followersCount: overview.followersCount,
        fanCount: overview.fanCount,
      };
    } catch (e) {
      totalsError = e instanceof FacebookError ? e.message : String(e);
    }

    // Sub-call 2: KPI snapshot metrics (page_impressions, page_impressions_unique, page_post_engagements).
    let insightRows: Awaited<ReturnType<typeof fetchInsights>> = [];
    let metricsError: string | null = null;
    try {
      insightRows = await fetchInsights(pageId, pageToken, KPI_METRICS, period);
      // Persist snapshot (fire-and-forget; errors logged, not surfaced).
      await insights.insertMany(insightRows).catch((e: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[insights] insertMany fallito:", e);
      });
    } catch (e) {
      metricsError = e instanceof FacebookError ? e.message : String(e);
    }

    // Sub-call 3: follower trend (serie giornaliera ultimi 28 giorni).
    let followerTrend: Awaited<ReturnType<typeof fetchFollowerTrend>> = [];
    let trendError: string | null = null;
    try {
      followerTrend = await fetchFollowerTrend(pageId, pageToken);
    } catch (e) {
      trendError = e instanceof FacebookError ? e.message : String(e);
    }

    const metrics = insightRows.map((r) => ({
      metric: r.metric,
      value: r.value,
      periodEnd: r.periodEnd,
    }));

    // Surface a top-level error only if ALL sub-calls failed.
    const allFailed = totalsError !== null && metricsError !== null && trendError !== null;
    const topError = allFailed
      ? `overview: ${totalsError}; metrics: ${metricsError}; trend: ${trendError}`
      : undefined;

    return c.json({
      pageId,
      fetchedAt,
      totals,
      metrics,
      followerTrend,
      ...(topError !== undefined ? { error: topError } : {}),
    });
  });

  // GET /pages/:id/top-posts?limit=10
  // Returns the page's top posts ranked by impressions, with per-post insight metrics.
  api.get("/pages/:id/top-posts", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const limitParam = c.req.query("limit");
    const limit =
      limitParam != null && /^\d+$/.test(limitParam) ? Math.min(Number(limitParam), 100) : 10;

    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);

    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json({ pageId, posts: [], error: "Token di pagina non trovato nel keyring" }, 503);
    }

    try {
      const topPosts = await fetchTopPosts(pageId, pageToken, limit);
      return c.json({ pageId, posts: topPosts });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, posts: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/insights/history
  // Returns recent snapshots from the DB (no live call).
  api.get("/pages/:id/insights/history", async (c) => {
    const pageId = c.req.param("id");
    const snapshots = await insights.history(pageId);
    return c.json({ pageId, snapshots });
  });

  // GET /pages/:id/coverage-trend?days=28 — serie giornaliera visualizzazioni pagina (B3).
  api.get("/pages/:id/coverage-trend", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const daysParam = c.req.query("days");
    const days =
      daysParam != null && /^\d+$/.test(daysParam) ? Math.min(Number(daysParam), 90) : 28;
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json({ pageId, points: [], ...r.fail.body }, r.fail.status);
    try {
      const points = await fetchCoverageTrend(pageId, r.token, days);
      return c.json({ pageId, points });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, points: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/demographics — paesi/genere-eta'/citta' dei fan (B5).
  // Molte demografiche sono deprecate dal 2024: il client ritorna liste vuote senza crash.
  api.get("/pages/:id/demographics", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const r = await resolvePageToken(pageId);
    if (r.fail)
      return c.json(
        { pageId, countries: [], genderAge: [], cities: [], ...r.fail.body },
        r.fail.status,
      );
    try {
      const demo = await fetchDemographics(pageId, r.token);
      return c.json({ pageId, ...demo });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, countries: [], genderAge: [], cities: [], error: msg }, 502);
    }
  });

  // ---------------- gestione post pubblicati (A1/A4/A5) ----------------

  // GET /pages/:id/managed-posts?limit=25 — post gia' presenti sulla pagina FB.
  api.get("/pages/:id/managed-posts", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const limitParam = c.req.query("limit");
    const limit =
      limitParam != null && /^\d+$/.test(limitParam) ? Math.min(Number(limitParam), 100) : 25;
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json({ pageId, posts: [], ...r.fail.body }, r.fail.status);
    try {
      const posts = await fetchManagedPosts(pageId, r.token, limit);
      return c.json({ pageId, posts });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, posts: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/scheduled-posts — contenuti PROGRAMMATI sulla pagina FB (live, lato Facebook),
  // distinti dai "post locali" programmati nel nostro DB.
  api.get("/pages/:id/scheduled-posts", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json({ pageId, posts: [], ...r.fail.body }, r.fail.status);
    try {
      const posts = await fetchScheduledPosts(pageId, r.token);
      return c.json({ pageId, posts });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, posts: [], error: msg }, 502);
    }
  });

  // POST /pages/:id/posts/:postId/edit — modifica il testo di un post.
  api.post("/pages/:id/posts/:postId/edit", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const postId = c.req.param("postId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await jsonBody(c);
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "message mancante" }, 400);
    }
    try {
      await editPostMessage(postId, r.token, body.message);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // DELETE /pages/:id/posts/:postId — elimina un post dalla pagina.
  api.delete("/pages/:id/posts/:postId", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const postId = c.req.param("postId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    try {
      await deletePost(postId, r.token);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/posts/:postId/pin — fissa/sblocca un post.
  api.post("/pages/:id/posts/:postId/pin", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const postId = c.req.param("postId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await jsonBody(c);
    if (typeof body.pinned !== "boolean") {
      return c.json({ ok: false, error: "pinned (boolean) mancante" }, 400);
    }
    try {
      await setPostPinned(postId, r.token, body.pinned);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/publish — pubblica/programma un post nativo.
  // SCRIVE su una pagina pubblica reale: la conferma esplicita la gestisce il frontend.
  // scheduledPublishTime e' epoch in SECONDI (come richiede Graph scheduled_publish_time).
  api.post("/pages/:id/publish", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await jsonBody(c);
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "message mancante" }, 400);
    }
    const link = typeof body.link === "string" && body.link.trim() !== "" ? body.link : null;
    const scheduledPublishTime =
      typeof body.scheduledPublishTime === "number" && Number.isFinite(body.scheduledPublishTime)
        ? Math.floor(body.scheduledPublishTime)
        : null;
    try {
      const fbPostId = await publishNativePost(
        pageId,
        r.token,
        body.message,
        link,
        scheduledPublishTime,
      );
      return c.json({ ok: true, fbPostId });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // ---------------- gestione commenti (A2) ----------------
  // Il :id pagina serve solo a recuperare il token dal keyring; gli id post/commento sono FB.

  // GET /pages/:id/posts/:postId/comments — commenti di un post.
  api.get("/pages/:id/posts/:postId/comments", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const postId = c.req.param("postId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json({ comments: [], ...r.fail.body }, r.fail.status);
    try {
      const comments = await fetchPostComments(postId, r.token);
      return c.json({ comments });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ comments: [], error: msg }, 502);
    }
  });

  // POST /pages/:id/comments/:commentId/reply — risponde a un commento.
  api.post("/pages/:id/comments/:commentId/reply", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await jsonBody(c);
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "message mancante" }, 400);
    }
    try {
      await replyToComment(commentId, r.token, body.message);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/comments/:commentId/hide — nasconde/mostra un commento.
  api.post("/pages/:id/comments/:commentId/hide", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await jsonBody(c);
    if (typeof body.hidden !== "boolean") {
      return c.json({ ok: false, error: "hidden (boolean) mancante" }, 400);
    }
    try {
      await setCommentHidden(commentId, r.token, body.hidden);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // DELETE /pages/:id/comments/:commentId — elimina un commento.
  api.delete("/pages/:id/comments/:commentId", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    try {
      await deleteComment(commentId, r.token);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/comments/:commentId/like — mette/toglie like della pagina a un commento.
  api.post("/pages/:id/comments/:commentId/like", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolvePageToken(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await jsonBody(c);
    if (typeof body.like !== "boolean") {
      return c.json({ ok: false, error: "like (boolean) mancante" }, 400);
    }
    try {
      await setCommentLiked(commentId, r.token, body.like);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // ---------------- gestione pagina (richiede pages_manage_metadata) ----------------

  // GET /pages/:id/details — campi modificabili (about/description/website/visibilita'/cover).
  api.get("/pages/:id/details", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);
    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json({ pageId, error: "Token di pagina non trovato nel keyring" }, 503);
    }
    try {
      return c.json(await fetchPageDetails(pageId, pageToken));
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, error: msg }, 502);
    }
  });

  // POST /pages/:id/settings — aggiorna i campi della pagina.
  // SCRIVE su una pagina pubblica reale: invocata solo su submit esplicito dal frontend.
  // Invia esclusivamente i campi forniti nel body.
  api.post("/pages/:id/settings", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);
    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json({ ok: false, error: "Token di pagina non trovato nel keyring" }, 503);
    }
    const body = await jsonBody(c);
    const patch: PageSettingsPatch = {};
    if (typeof body.about === "string") patch.about = body.about;
    if (typeof body.description === "string") patch.description = body.description;
    if (typeof body.website === "string") patch.website = body.website;
    if (typeof body.phone === "string") patch.phone = body.phone;
    if (Array.isArray(body.emails)) patch.emails = body.emails.map((e: unknown) => String(e));
    if (typeof body.isPublished === "boolean") patch.isPublished = body.isPublished;
    if (Object.keys(patch).length === 0) {
      return c.json({ ok: false, error: "Nessun campo da aggiornare" }, 400);
    }
    try {
      await updatePageSettings(pageId, pageToken, patch);
      const updated = await fetchPageDetails(pageId, pageToken);
      return c.json({ ok: true, updated });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/cover — carica una nuova immagine di copertina (multipart, campo 'file').
  // SCRIVE su una pagina pubblica reale: solo su azione esplicita dell'utente.
  api.post("/pages/:id/cover", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const pg = await pages.find(pageId);
    if (!pg) return c.json(err("Pagina non trovata"), 404);
    const pageToken = await keyring.get(pageSecretKeyFor(pageId));
    if (pageToken == null) {
      return c.json({ ok: false, error: "Token di pagina non trovato nel keyring" }, 503);
    }
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) {
      return c.json({ ok: false, error: "Campo 'file' (immagine) mancante nel multipart" }, 400);
    }
    const { buffer: bytes } = await validateUpload(file, "image");
    try {
      const photoId = await uploadPagePhoto(pageId, pageToken, bytes, file.name || "cover.jpg");
      await setPageCover(pageId, pageToken, photoId);
      const details = await fetchPageDetails(pageId, pageToken);
      return c.json({ ok: true, coverUrl: details.cover?.url ?? null });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });
}
