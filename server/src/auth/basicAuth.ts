import { timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler, Next } from "hono";

// HTTP Basic Auth leggero per self-host (nessun login UI: il browser gestisce le credenziali).
// Parsing manuale dell'header `Authorization: Basic <base64>` — nessuna libreria esterna.

export interface BasicCredentials {
  user: string;
  pass: string;
}

/**
 * Estrae user/pass da un header `Authorization`. Restituisce null se l'header
 * manca, non è di schema Basic, o il payload base64 non è ben formato.
 */
export function parseBasicAuth(header: string | null | undefined): BasicCredentials | null {
  if (!header) return null;
  const trimmed = header.trim();
  const match = /^Basic\s+(.+)$/i.exec(trimmed);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  // Le credenziali sono "user:pass"; la password può contenere ":".
  const sep = decoded.indexOf(":");
  if (sep < 0) return null;
  return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
}

/** Confronto costante-tempo di due stringhe (resistente al timing). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Verifica le credenziali fornite contro quelle attese (costante-tempo). */
export function credentialsMatch(
  provided: BasicCredentials | null,
  expected: BasicCredentials,
): boolean {
  if (!provided) return false;
  // Valuta entrambi i confronti per non corto-circuitare sul primo mismatch.
  const okUser = safeEqual(provided.user, expected.user);
  const okPass = safeEqual(provided.pass, expected.pass);
  return okUser && okPass;
}

const REALM = 'Basic realm="BookSocial Studio"';

/**
 * Middleware Hono che richiede HTTP Basic Auth su tutte le richieste, eccetto
 * l'endpoint di health (accessibile senza auth per gli healthcheck).
 */
export function basicAuthMiddleware(expected: BasicCredentials): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    // L'health resta pubblico (montato sotto /api -> /api/health).
    if (c.req.path === "/api/health") return next();
    const provided = parseBasicAuth(c.req.header("Authorization"));
    if (!credentialsMatch(provided, expected)) {
      return c.body(null, 401, { "WWW-Authenticate": REALM });
    }
    return next();
  };
}
