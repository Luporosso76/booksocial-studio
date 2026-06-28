import { Hono } from "hono";
import { FacebookError } from "../facebook/client.js";
import * as ig from "../facebook/instagramClient.js";
import { jsonBody, type RouteContext } from "./_shared.js";

export function mountInstagram(api: Hono, ctx: RouteContext): void {
  const { requireSecrets, resolveIgContext } = ctx;

  // ---------------- Instagram (tab IG: account, insight, media, commenti) ----------------
  // Mirror IG degli endpoint FB. Tutti risolvono token di pagina + igUserId via resolveIgContext;
  // se la pagina non ha un IG collegato rispondono 503 con un messaggio leggibile.

  // GET /pages/:id/ig/account — info profilo dell'account Instagram Business.
  api.get("/pages/:id/ig/account", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json({ pageId, account: null, ...r.fail.body }, r.fail.status);
    try {
      const account = await ig.getIgAccount(r.igUserId, r.token);
      return c.json({ pageId, igUserId: r.igUserId, account });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, account: null, error: msg }, 502);
    }
  });

  // GET /pages/:id/ig/insights?period=day — insight di account IG (degrada per-metrica).
  api.get("/pages/:id/ig/insights", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const period = c.req.query("period") ?? "day";
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json({ pageId, metrics: [], ...r.fail.body }, r.fail.status);
    try {
      const metrics = await ig.fetchIgAccountInsights(r.igUserId, r.token, period);
      return c.json({ pageId, igUserId: r.igUserId, metrics });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, metrics: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/ig/media?limit=25 — media pubblicati dall'account IG.
  api.get("/pages/:id/ig/media", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const limitParam = c.req.query("limit");
    const limit =
      limitParam != null && /^\d+$/.test(limitParam) ? Math.min(Number(limitParam), 100) : 25;
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json({ pageId, media: [], ...r.fail.body }, r.fail.status);
    try {
      const media = await ig.fetchIgMedia(r.igUserId, r.token, limit);
      return c.json({ pageId, media });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ pageId, media: [], error: msg }, 502);
    }
  });

  // GET /pages/:id/ig/media/:mediaId/comments — commenti (con risposte) di un media IG.
  api.get("/pages/:id/ig/media/:mediaId/comments", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const mediaId = c.req.param("mediaId");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json({ comments: [], ...r.fail.body }, r.fail.status);
    try {
      const comments = await ig.fetchIgComments(mediaId, r.token);
      return c.json({ comments });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ comments: [], error: msg }, 502);
    }
  });

  // POST /pages/:id/ig/comments/:commentId/reply — risponde a un commento IG.
  api.post("/pages/:id/ig/comments/:commentId/reply", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await jsonBody(c);
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return c.json({ ok: false, error: "message mancante" }, 400);
    }
    try {
      await ig.replyToIgComment(commentId, r.token, body.message);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // POST /pages/:id/ig/comments/:commentId/hide — nasconde/mostra un commento IG.
  api.post("/pages/:id/ig/comments/:commentId/hide", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    const body = await jsonBody(c);
    if (typeof body.hidden !== "boolean") {
      return c.json({ ok: false, error: "hidden (boolean) mancante" }, 400);
    }
    try {
      await ig.setIgCommentHidden(commentId, r.token, body.hidden);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });

  // DELETE /pages/:id/ig/comments/:commentId — elimina un commento IG.
  api.delete("/pages/:id/ig/comments/:commentId", async (c) => {
    requireSecrets();
    const pageId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const r = await resolveIgContext(pageId);
    if (r.fail) return c.json(r.fail.body, r.fail.status);
    try {
      await ig.deleteIgComment(commentId, r.token);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof FacebookError ? e.message : String(e);
      return c.json({ ok: false, error: msg }, 502);
    }
  });
}
