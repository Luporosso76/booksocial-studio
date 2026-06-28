import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { isHttpsEnabled } from "../config.js";
import * as auth from "../services/authService.js";
import { jsonBody, type RouteContext } from "./_shared.js";

export function mountAuth(api: Hono, _ctx: RouteContext): void {
  const cookieOpts = () => ({
    httpOnly: true,
    secure: isHttpsEnabled(),
    sameSite: "Lax" as const,
    path: "/",
    maxAge: auth.SESSION_MAX_AGE_S,
  });

  api.get("/auth/status", async (c) => {
    return c.json(await auth.status(getCookie(c, auth.SESSION_COOKIE)));
  });

  api.post("/auth/login", async (c) => {
    const body = await jsonBody(c);
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const res = await auth.login(username, password);
    if (!res.ok) {
      if (res.reason === "blocked")
        return c.json({ error: "too-many-attempts", retryAfterSec: res.retryAfterSec }, 429);
      return c.json({ error: "invalid-credentials" }, 401);
    }
    setCookie(c, auth.SESSION_COOKIE, res.token, cookieOpts());
    return c.json({ ok: true, mustChange: res.mustChange });
  });

  api.post("/auth/logout", async (c) => {
    await auth.logout(getCookie(c, auth.SESSION_COOKIE));
    deleteCookie(c, auth.SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  api.post("/auth/change-password", async (c) => {
    const body = await jsonBody(c);
    const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const next = typeof body.newPassword === "string" ? body.newPassword : "";
    const res = await auth.changePassword(current, next);
    if (!res.ok) return c.json({ error: res.error }, 400);
    setCookie(c, auth.SESSION_COOKIE, res.token, cookieOpts());
    return c.json({ ok: true });
  });
}
