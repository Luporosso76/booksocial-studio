import { appConfig } from "../config.js";
import { FacebookError } from "./client.js";

// Client Instagram Graph API per pubblicare Reel/Storie (video 9:16) su un Instagram Business
// account collegato a una Pagina Facebook. Il token usato è il TOKEN DI PAGINA (keyring
// `fb.page.<pageId>`), MAI loggato. API v21.0 (appConfig.apiVersion). Flusso validato dal vivo:
//   1) POST /<igUserId>/media?upload_type=resumable&media_type=REELS|STORIES (caption solo REELS)
//   2) POST https://rupload.facebook.com/ig-api-upload/<ver>/<containerId> (byte del video)
//   3) GET  /<containerId>?fields=status_code  (polling finché FINISHED)
//   4) POST /<igUserId>/media_publish?creation_id=<containerId>  -> { id: igMediaId }

function baseUrl(): string {
  return `https://graph.facebook.com/${appConfig.apiVersion}`;
}

// Risolve l'instagram_business_account.id collegato alla Pagina. null se la Pagina non ha un
// account IG Business collegato (non è un errore: la pubblicazione IG semplicemente non è possibile).
export async function getIgUserId(pageId: string, pageToken: string): Promise<string | null> {
  const url =
    `${baseUrl()}/${encodeURIComponent(pageId)}` +
    `?fields=instagram_business_account{id}` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new FacebookError(
      `Lettura instagram_business_account fallita: ${(e as Error).message}`,
      -1,
    );
  }
  const text = await resp.text();
  let body: any = {};
  if (text && text.trim() !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = {};
    }
  }
  if (resp.status >= 400 || body.error) {
    const msg = body?.error?.message ?? `HTTP ${resp.status}`;
    throw new FacebookError(`Graph API instagram_business_account: ${msg}`, resp.status);
  }
  const igId = body?.instagram_business_account?.id;
  return igId == null ? null : String(igId);
}

export type IgMediaKind = "REELS" | "STORIES";

export interface PublishVideoInput {
  igUserId: string;
  token: string;
  videoPath: string;
  caption: string;
  kind: IgMediaKind;
  signal?: AbortSignal;
}

// Pubblica un video (Reel o Storia) su Instagram e ritorna l'igMediaId. SCRIVE sull'account reale.
// La caption è usata SOLO per i REELS (le storie la ignorano lato Instagram).
export async function publishVideo(input: PublishVideoInput): Promise<string> {
  const { igUserId, token, videoPath, caption, kind, signal } = input;
  const { readFile } = await import("node:fs/promises");

  let bytes: Buffer;
  try {
    bytes = await readFile(videoPath);
  } catch (e) {
    throw new FacebookError(`Video IG non leggibile su disco: ${(e as Error).message}`, -1);
  }

  // 1) CREA CONTAINER (resumable). caption solo per i REELS.
  const containerUrl =
    `${baseUrl()}/${encodeURIComponent(igUserId)}/media` +
    `?upload_type=resumable&media_type=${kind}` +
    (kind === "REELS" ? `&caption=${encodeURIComponent(caption ?? "")}` : "") +
    `&access_token=${encodeURIComponent(token)}`;
  let createResp: Response;
  try {
    createResp = await fetch(containerUrl, { method: "POST", signal });
  } catch (e) {
    throw new FacebookError(`Creazione container IG fallita: ${(e as Error).message}`, -1);
  }
  const createBody = await parseJson(createResp);
  if (createResp.status >= 400 || createBody.error) {
    const msg = createBody?.error?.message ?? `HTTP ${createResp.status}`;
    throw new FacebookError(`Creazione container IG: ${msg}`, createResp.status);
  }
  const containerId = createBody?.id;
  if (containerId == null) {
    throw new FacebookError(`Container IG senza id: ${JSON.stringify(createBody)}`, -1);
  }

  // 2) UPLOAD dei byte sul rupload endpoint (header OAuth + offset/file_size).
  const uploadUrl = `https://rupload.facebook.com/ig-api-upload/${appConfig.apiVersion}/${encodeURIComponent(
    String(containerId),
  )}`;
  let upResp: Response;
  try {
    upResp = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        offset: "0",
        file_size: String(bytes.length),
        "Content-Type": "application/octet-stream",
      },
      body: new Blob([bytes], { type: "application/octet-stream" }),
      signal: signal ?? AbortSignal.timeout(300000),
    });
  } catch (e) {
    throw new FacebookError(`Upload video IG fallito: ${(e as Error).message}`, -1);
  }
  if (upResp.status >= 400) {
    const t = await upResp.text().catch(() => "");
    throw new FacebookError(
      `Upload video IG: HTTP ${upResp.status} ${t.slice(0, 200)}`,
      upResp.status,
    );
  }

  // 3) POLLING dello stato del container finché FINISHED (timeout ~5 min, ogni ~4s).
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    if (Date.now() > deadline) {
      throw new FacebookError("Container IG non pronto entro il timeout (5 min).", -1);
    }
    await sleep(4000, signal);
    const statusUrl =
      `${baseUrl()}/${encodeURIComponent(String(containerId))}` +
      `?fields=status_code&access_token=${encodeURIComponent(token)}`;
    let statusResp: Response;
    try {
      statusResp = await fetch(statusUrl, { signal });
    } catch (e) {
      throw new FacebookError(`Polling container IG fallito: ${(e as Error).message}`, -1);
    }
    const statusBody = await parseJson(statusResp);
    if (statusResp.status >= 400 || statusBody.error) {
      const msg = statusBody?.error?.message ?? `HTTP ${statusResp.status}`;
      throw new FacebookError(`Polling container IG: ${msg}`, statusResp.status);
    }
    const code = String(statusBody?.status_code ?? "");
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new FacebookError(`Container IG in stato ${code}: elaborazione del video fallita.`, -1);
    }
    // IN_PROGRESS / PUBLISHED-pending: continua il polling.
  }

  // 4) PUBLISH: pubblica il container e ritorna l'igMediaId.
  const publishUrl =
    `${baseUrl()}/${encodeURIComponent(igUserId)}/media_publish` +
    `?creation_id=${encodeURIComponent(String(containerId))}` +
    `&access_token=${encodeURIComponent(token)}`;
  let pubResp: Response;
  try {
    pubResp = await fetch(publishUrl, { method: "POST", signal });
  } catch (e) {
    throw new FacebookError(`Pubblicazione IG fallita: ${(e as Error).message}`, -1);
  }
  const pubBody = await parseJson(pubResp);
  if (pubResp.status >= 400 || pubBody.error) {
    const msg = pubBody?.error?.message ?? `HTTP ${pubResp.status}`;
    throw new FacebookError(`Pubblicazione IG: ${msg}`, pubResp.status);
  }
  const igMediaId = pubBody?.id;
  if (igMediaId == null) {
    throw new FacebookError(`Pubblicazione IG senza id: ${JSON.stringify(pubBody)}`, -1);
  }
  return String(igMediaId);
}

// ============================ LETTURA & GESTIONE (tab IG) ============================
// Tutte queste funzioni usano il TOKEN DI PAGINA (keyring `fb.page.<pageId>`, scope IG) e
// l'igUserId dell'Instagram Business account collegato. Mirror read-only/gestione degli endpoint
// FB esistenti (managed-posts, comments, insights) ma su Instagram Graph. Mai loggare il token.

// Helper richiesta JSON: ritorna il body parsato o lancia FacebookError con messaggio leggibile.
async function igRequest(url: string, init: RequestInit, ctx: string): Promise<any> {
  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(30000), ...init });
  } catch (e) {
    throw new FacebookError(`${ctx} fallita: ${(e as Error).message}`, -1);
  }
  const body = await parseJson(resp);
  if (resp.status >= 400 || body.error) {
    const msg = body?.error?.message ?? `HTTP ${resp.status}`;
    throw new FacebookError(`${ctx}: ${msg}`, resp.status);
  }
  return body;
}

export interface IgAccount {
  id: string;
  username: string | null;
  name: string | null;
  biography: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
}

// GET /<ig>?fields=... — info profilo dell'account Instagram Business.
export async function getIgAccount(igUserId: string, token: string): Promise<IgAccount> {
  const fields =
    "id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url";
  const url =
    `${baseUrl()}/${encodeURIComponent(igUserId)}` +
    `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  const b = await igRequest(url, { method: "GET" }, "Lettura account IG");
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: String(b.id ?? igUserId),
    username: str(b.username),
    name: str(b.name),
    biography: str(b.biography),
    followersCount: num(b.followers_count),
    followsCount: num(b.follows_count),
    mediaCount: num(b.media_count),
    profilePictureUrl: str(b.profile_picture_url),
  };
}

export interface IgMedia {
  id: string;
  caption: string | null;
  mediaType: string | null; // IMAGE | VIDEO | CAROUSEL_ALBUM
  mediaProductType: string | null; // FEED | REELS | STORY
  thumbnailUrl: string | null;
  mediaUrl: string | null;
  permalink: string | null;
  timestamp: string | null;
  likeCount: number | null;
  commentsCount: number | null;
}

// GET /<ig>/media — media recenti dell'account (post/reel/storie pubblicati), piu' recenti prima.
export async function fetchIgMedia(
  igUserId: string,
  token: string,
  limit: number = 25,
): Promise<IgMedia[]> {
  const fields =
    "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count";
  const url =
    `${baseUrl()}/${encodeURIComponent(igUserId)}/media` +
    `?fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${encodeURIComponent(token)}`;
  const b = await igRequest(url, { method: "GET" }, "Lettura media IG");
  const out: IgMedia[] = [];
  if (!Array.isArray(b.data)) return out;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  for (const m of b.data) {
    out.push({
      id: String(m.id ?? ""),
      caption: str(m.caption),
      mediaType: str(m.media_type),
      mediaProductType: str(m.media_product_type),
      thumbnailUrl: str(m.thumbnail_url),
      mediaUrl: str(m.media_url),
      permalink: str(m.permalink),
      timestamp: str(m.timestamp),
      likeCount: num(m.like_count),
      commentsCount: num(m.comments_count),
    });
  }
  return out;
}

export interface IgComment {
  id: string;
  text: string | null;
  username: string | null;
  timestamp: string | null;
  likeCount: number;
  hidden: boolean;
  replies: IgComment[];
}

function mapIgComment(cm: any): IgComment {
  const replies: IgComment[] = [];
  if (Array.isArray(cm?.replies?.data)) {
    for (const r of cm.replies.data) replies.push(mapIgComment(r));
  }
  return {
    id: String(cm?.id ?? ""),
    text: typeof cm?.text === "string" ? cm.text : null,
    username: typeof cm?.username === "string" ? cm.username : null,
    timestamp: typeof cm?.timestamp === "string" ? cm.timestamp : null,
    likeCount: typeof cm?.like_count === "number" ? cm.like_count : 0,
    hidden: typeof cm?.hidden === "boolean" ? cm.hidden : false,
    replies,
  };
}

// GET /<media>/comments — commenti (con le risposte annidate) di un media IG, piu' recenti prima.
export async function fetchIgComments(mediaId: string, token: string): Promise<IgComment[]> {
  const replyFields = "id,text,username,timestamp,like_count,hidden";
  const fields = `id,text,username,timestamp,like_count,hidden,replies{${replyFields}}`;
  const url =
    `${baseUrl()}/${encodeURIComponent(mediaId)}/comments` +
    `?fields=${encodeURIComponent(fields)}&limit=50&access_token=${encodeURIComponent(token)}`;
  const b = await igRequest(url, { method: "GET" }, "Lettura commenti IG");
  const out: IgComment[] = [];
  if (!Array.isArray(b.data)) return out;
  for (const cm of b.data) out.push(mapIgComment(cm));
  return out;
}

// POST /<comment>/replies — risponde a un commento IG.
export async function replyToIgComment(
  commentId: string,
  token: string,
  message: string,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("message", message);
  form.set("access_token", token);
  await igRequest(
    `${baseUrl()}/${encodeURIComponent(commentId)}/replies`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "Risposta commento IG",
  );
}

// POST /<comment>?hide=true|false — nasconde/mostra un commento IG.
export async function setIgCommentHidden(
  commentId: string,
  token: string,
  hidden: boolean,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("hide", String(hidden));
  form.set("access_token", token);
  await igRequest(
    `${baseUrl()}/${encodeURIComponent(commentId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "Nascondi commento IG",
  );
}

// DELETE /<comment> — elimina un commento IG.
export async function deleteIgComment(commentId: string, token: string): Promise<void> {
  await igRequest(
    `${baseUrl()}/${encodeURIComponent(commentId)}?access_token=${encodeURIComponent(token)}`,
    { method: "DELETE" },
    "Eliminazione commento IG",
  );
}

export interface IgInsightMetric {
  metric: string;
  value: number | null;
  error?: string;
}

// Metriche di account IG di default (v21). reach/profile_views richiedono metric_type=total_value
// nelle versioni recenti; follower_count e' una serie temporale. impressions e' deprecata.
const IG_DEFAULT_METRICS = ["reach", "profile_views", "follower_count"] as const;

// Estrae un singolo valore numerico dalla risposta /insights, sia in forma total_value
// (metric_type=total_value) sia in forma serie temporale (values[]: prende l'ultimo punto).
function extractInsightValue(body: any, metric: string): number | null {
  if (!Array.isArray(body?.data)) return null;
  const row = body.data.find((d: any) => String(d?.name ?? "") === metric) ?? body.data[0];
  if (!row) return null;
  if (row.total_value && typeof row.total_value.value === "number") return row.total_value.value;
  if (Array.isArray(row.values) && row.values.length > 0) {
    const last = row.values[row.values.length - 1];
    if (typeof last?.value === "number") return last.value;
  }
  return null;
}

// Una singola metrica, con doppio tentativo (total_value -> serie temporale). Non lancia:
// ritorna value=null + error se entrambi i tentativi falliscono, cosi' le altre metriche reggono.
async function fetchSingleIgMetric(
  igUserId: string,
  token: string,
  metric: string,
  period: string,
): Promise<IgInsightMetric> {
  const base = `${baseUrl()}/${encodeURIComponent(igUserId)}/insights`;
  const tv =
    `${base}?metric=${encodeURIComponent(metric)}&period=${encodeURIComponent(period)}` +
    `&metric_type=total_value&access_token=${encodeURIComponent(token)}`;
  try {
    const b = await igRequest(tv, { method: "GET" }, `Insight IG ${metric}`);
    return { metric, value: extractInsightValue(b, metric) };
  } catch {
    // Fallback: alcune metriche (es. follower_count) non accettano metric_type.
    const ts =
      `${base}?metric=${encodeURIComponent(metric)}&period=${encodeURIComponent(period)}` +
      `&access_token=${encodeURIComponent(token)}`;
    try {
      const b = await igRequest(ts, { method: "GET" }, `Insight IG ${metric}`);
      return { metric, value: extractInsightValue(b, metric) };
    } catch (e) {
      return { metric, value: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// Insight di account IG (degrada per-metrica: una metrica deprecata non azzera le altre).
export async function fetchIgAccountInsights(
  igUserId: string,
  token: string,
  period: string = "day",
  metrics: readonly string[] = IG_DEFAULT_METRICS,
): Promise<IgInsightMetric[]> {
  return Promise.all(metrics.map((m) => fetchSingleIgMetric(igUserId, token, m, period)));
}

async function parseJson(resp: Response): Promise<any> {
  const text = await resp.text();
  if (!text || text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new FacebookError("Pubblicazione IG annullata.", -1));
      return;
    }
    const t = setTimeout(() => resolve(), ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new FacebookError("Pubblicazione IG annullata.", -1));
        },
        { once: true },
      );
    }
  });
}
