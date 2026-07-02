import { appConfig } from "../config.js";

// Minimal real Graph API client (pages).
// The Page token is passed per call (taken from the keyring by the caller), never logged.
// API v21.0 by default.

export class FacebookError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly code?: number,
    public readonly type?: string,
  ) {
    super(message);
  }
}

export function graphError(message: string, body: any, status: number): FacebookError {
  const code = typeof body?.error?.code === "number" ? body.error.code : undefined;
  const type = typeof body?.error?.type === "string" ? body.error.type : undefined;
  return new FacebookError(message, status, code, type);
}

export function isTokenError(e: unknown): boolean {
  if (!(e instanceof FacebookError)) return false;
  if (e.code === 190 || e.type === "OAuthException") return true;
  return /error validating access token|session has expired|access token.*(expired|invalid|revoked)/i.test(
    e.message,
  );
}

export interface ManagedPage {
  id: string;
  name: string;
  category: string | null;
  accessToken: string | null;
}

function baseUrl(): string {
  return `https://graph.facebook.com/${appConfig.apiVersion}`;
}

async function send(url: string, init: RequestInit, op: string): Promise<any> {
  let resp: Response;
  try {
    resp = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new FacebookError(`Chiamata Graph API ${op} fallita: ${(e as Error).message}`, -1);
  }
  const textBody = await resp.text();
  let body: any = {};
  if (textBody && textBody.trim() !== "") {
    try {
      body = JSON.parse(textBody);
    } catch {
      body = {};
    }
  }
  if (resp.status >= 400 || body.error) {
    const msg = body?.error?.message ?? `HTTP ${resp.status}`;
    throw graphError(`Graph API ${op}: ${msg}`, body, resp.status);
  }
  return body;
}

// POST /{page-id}/feed with optional scheduled_publish_time (published=false).
export async function publishFeedPost(
  pageId: string,
  pageToken: string,
  message: string,
  link: string | null,
  scheduledPublishTimeSec: number | null = null,
): Promise<string> {
  const form = new URLSearchParams();
  form.set("message", message);
  if (link && link.trim() !== "") form.set("link", link);
  if (scheduledPublishTimeSec != null) {
    form.set("published", "false");
    form.set("scheduled_publish_time", String(scheduledPublishTimeSec));
  }
  form.set("access_token", pageToken);

  const body = await send(
    `${baseUrl()}/${pageId}/feed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "publishFeedPost",
  );
  if (body.id == null) {
    throw new FacebookError(`Risposta senza id post: ${JSON.stringify(body)}`, -1);
  }
  return String(body.id);
}

// GET /me/accounts (fields=id,name,category,access_token) from a long-lived user token.
export async function fetchManagedPages(userToken: string): Promise<ManagedPage[]> {
  const url =
    `${baseUrl()}/me/accounts?fields=` +
    encodeURIComponent("id,name,category,access_token") +
    `&limit=100&access_token=${encodeURIComponent(userToken)}`;
  const body = await send(url, { method: "GET" }, "fetchManagedPages");
  const out: ManagedPage[] = [];
  if (Array.isArray(body.data)) {
    for (const p of body.data) {
      out.push({
        id: String(p.id),
        name: String(p.name ?? ""),
        category: p.category ?? null,
        accessToken: p.access_token ?? null,
      });
    }
  }
  return out;
}

// Exchange a short-lived user token for a long-lived one (~60 days).
export async function exchangeForLongLivedUserToken(
  appId: string,
  appSecret: string,
  shortToken: string,
): Promise<string> {
  const url =
    `${baseUrl()}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
  const body = await send(url, { method: "GET" }, "exchangeForLongLivedUserToken");
  if (body.access_token == null) {
    throw new FacebookError(`Scambio token senza access_token: ${JSON.stringify(body)}`, -1);
  }
  return String(body.access_token);
}

export interface InsightRow {
  pageId: string;
  metric: string;
  value: number;
  periodEnd: number;
  fetchedAt: number;
}

export interface PageOverview {
  name: string | null;
  followersCount: number | null;
  fanCount: number | null;
}

export interface FollowerTrendPoint {
  date: number; // epoch ms (midnight UTC of the day)
  follows: number;
  unfollows: number;
}

export interface TopPost {
  id: string;
  message: string | null;
  createdTime: string | null;
  permalinkUrl: string | null;
  pictureUrl: string | null;
  impressions: number;
  reach: number;
  engagedUsers: number;
  reactions: number;
  comments: number;
  shares: number;
}

export interface TrendPoint {
  date: number; // epoch ms (midnight UTC of the day)
  value: number;
}

export interface DemographicEntry {
  key: string;
  value: number;
}

// GET /{page-id}?fields=name,followers_count,fan_count — campi del nodo Page (non insights).
// Alcuni campi non sono esposti da tutte le pagine; in quel caso il campo manca dalla risposta.
export async function fetchPageOverview(pageId: string, pageToken: string): Promise<PageOverview> {
  const url =
    `${baseUrl()}/${pageId}?fields=` +
    encodeURIComponent("name,followers_count,fan_count") +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const body = await send(url, { method: "GET" }, "fetchPageOverview");
  return {
    name: typeof body.name === "string" ? body.name : null,
    followersCount: typeof body.followers_count === "number" ? body.followers_count : null,
    fanCount: typeof body.fan_count === "number" ? body.fan_count : null,
  };
}

export interface PageDetails {
  pageId: string;
  name: string | null;
  about: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  emails: string[];
  isPublished: boolean | null;
  cover: { url: string } | null;
}

export interface PageSettingsPatch {
  about?: string;
  description?: string;
  website?: string;
  phone?: string;
  emails?: string[];
  isPublished?: boolean;
}

// GET /{page-id}?fields=name,about,description,website,phone,emails,is_published,cover{source}
// Campi modificabili della pagina (lettura). Richiede pages_manage_metadata sul token.
export async function fetchPageDetails(pageId: string, pageToken: string): Promise<PageDetails> {
  const url =
    `${baseUrl()}/${pageId}?fields=` +
    encodeURIComponent("name,about,description,website,phone,emails,is_published,cover{source}") +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const body = await send(url, { method: "GET" }, "fetchPageDetails");
  const coverSource =
    body.cover && typeof body.cover.source === "string" ? body.cover.source : null;
  const emails = Array.isArray(body.emails) ? body.emails.map((e: unknown) => String(e)) : [];
  return {
    pageId,
    name: typeof body.name === "string" ? body.name : null,
    about: typeof body.about === "string" ? body.about : null,
    description: typeof body.description === "string" ? body.description : null,
    website: typeof body.website === "string" ? body.website : null,
    phone: typeof body.phone === "string" ? body.phone : null,
    emails,
    isPublished: typeof body.is_published === "boolean" ? body.is_published : null,
    cover: coverSource ? { url: coverSource } : null,
  };
}

// POST /{page-id} per aggiornare i campi della pagina (richiede pages_manage_metadata).
// Invia SOLO i campi presenti nel patch. ATTENZIONE: scrive su una pagina pubblica reale;
// va invocata solo su azione esplicita dell'utente (mai automaticamente).
export async function updatePageSettings(
  pageId: string,
  pageToken: string,
  patch: PageSettingsPatch,
): Promise<void> {
  const form = new URLSearchParams();
  if (patch.about !== undefined) form.set("about", patch.about);
  if (patch.description !== undefined) form.set("description", patch.description);
  if (patch.website !== undefined) form.set("website", patch.website);
  if (patch.phone !== undefined) form.set("phone", patch.phone);
  // Graph richiede emails come array JSON.
  if (patch.emails !== undefined) form.set("emails", JSON.stringify(patch.emails));
  if (patch.isPublished !== undefined) form.set("is_published", String(patch.isPublished));
  form.set("access_token", pageToken);

  const body = await send(
    `${baseUrl()}/${pageId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "updatePageSettings",
  );
  // Graph ritorna {success:true} o l'oggetto aggiornato; un error sarebbe gia' stato lanciato da send().
  if (body && body.success === false) {
    throw new FacebookError("Aggiornamento pagina non riuscito", -1);
  }
}

// Carica una foto sulla pagina come NON pubblicata (published=false), cosi' non crea
// un post nel feed, e ritorna l'id della foto. Upload multipart (send() gestisce solo
// form url-encoded, qui serve FormData/Blob).
export async function uploadPagePhoto(
  pageId: string,
  pageToken: string,
  bytes: Buffer,
  filename: string,
): Promise<string> {
  const form = new FormData();
  form.set("published", "false");
  form.set("access_token", pageToken);
  form.set("source", new Blob([bytes]), filename || "cover.jpg");

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl()}/${pageId}/photos`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    throw new FacebookError(`Upload foto pagina fallito: ${(e as Error).message}`, -1);
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
    throw graphError(
      `Graph API uploadPagePhoto: ${body?.error?.message ?? `HTTP ${resp.status}`}`,
      body,
      resp.status,
    );
  }
  if (body.id == null) {
    throw new FacebookError("Upload foto senza id", -1);
  }
  return String(body.id);
}

// Imposta come copertina una foto gia' caricata (no_feed_story evita la storia "ha cambiato copertina").
export async function setPageCover(
  pageId: string,
  pageToken: string,
  photoId: string,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("cover", photoId);
  form.set("no_feed_story", "true");
  form.set("access_token", pageToken);
  await send(
    `${baseUrl()}/${pageId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "setPageCover",
  );
}

// ---------------- storie (Page Stories API) ----------------
// Pubblica come STORIA il media gia' renderizzato. Foto: upload non pubblicato +
// POST /{page-id}/photo_stories. Video: upload ripreso /{page-id}/video_stories
// (start/transfer/finish). SCRIVE su una pagina reale: invocata SOLO dall'endpoint
// dedicato su conferma esplicita dell'utente, MAI dallo scheduler.

// POST /{page-id}/photo_stories con photo_id (foto caricata non pubblicata).
// Ritorna l'id della storia (post_id) o, in mancanza, l'id foto.
export async function publishPhotoStory(
  pageId: string,
  pageToken: string,
  imagePath: string,
): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath);
  } catch (e) {
    throw new FacebookError(`Foto storia non leggibile su disco: ${(e as Error).message}`, -1);
  }
  // 1) Carica la foto come NON pubblicata per ottenere un photo_id.
  const photoId = await uploadPagePhoto(pageId, pageToken, bytes, basename(imagePath));
  // 2) Pubblica la storia dalla foto caricata.
  const form = new URLSearchParams();
  form.set("photo_id", photoId);
  form.set("access_token", pageToken);
  const body = await send(
    `${baseUrl()}/${pageId}/photo_stories`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "publishPhotoStory",
  );
  const storyId = body.post_id ?? body.id ?? photoId;
  return String(storyId);
}

// Upload video ripreso per le STORIE (Resumable Upload, come i Reel):
//  - start:  POST video_stories upload_phase=start -> { video_id, upload_url }
//  - upload: POST sul upload_url (rupload) con header OAuth/offset/file_size + binario
//  - finish: POST video_stories upload_phase=finish + video_id -> pubblica la storia
export async function publishVideoStory(
  pageId: string,
  pageToken: string,
  videoPath: string,
): Promise<string> {
  const { readFile, stat } = await import("node:fs/promises");
  let fileSize: number;
  try {
    fileSize = (await stat(videoPath)).size;
  } catch (e) {
    throw new FacebookError(`Video storia non leggibile su disco: ${(e as Error).message}`, -1);
  }

  // 1) START: ottiene video_id + upload_url.
  const startForm = new URLSearchParams();
  startForm.set("upload_phase", "start");
  startForm.set("access_token", pageToken);
  const startBody = await send(
    `${baseUrl()}/${pageId}/video_stories`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: startForm.toString(),
    },
    "publishVideoStory/start",
  );
  const videoId = startBody.video_id;
  const uploadUrl = startBody.upload_url;
  if (videoId == null || !uploadUrl) {
    throw new FacebookError(
      `Avvio storia video senza video_id/upload_url: ${JSON.stringify(startBody)}`,
      -1,
    );
  }

  // 2) UPLOAD: invia il binario all'upload_url (header OAuth + offset/file_size).
  let bytes: Buffer;
  try {
    bytes = await readFile(videoPath);
  } catch (e) {
    throw new FacebookError(`Video storia non leggibile su disco: ${(e as Error).message}`, -1);
  }
  let upResp: Response;
  try {
    upResp = await fetch(String(uploadUrl), {
      method: "POST",
      headers: {
        Authorization: `OAuth ${pageToken}`,
        offset: "0",
        file_size: String(fileSize),
      },
      body: new Blob([bytes], { type: "application/octet-stream" }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (e) {
    throw new FacebookError(`Upload storia video fallito: ${(e as Error).message}`, -1);
  }
  if (upResp.status >= 400) {
    const t = await upResp.text().catch(() => "");
    throw new FacebookError(
      `Upload storia video: HTTP ${upResp.status} ${t.slice(0, 200)}`,
      upResp.status,
    );
  }

  // 3) FINISH: pubblica la storia (niente video_state per le storie).
  const finishForm = new URLSearchParams();
  finishForm.set("upload_phase", "finish");
  finishForm.set("video_id", String(videoId));
  finishForm.set("access_token", pageToken);
  const finishBody = await send(
    `${baseUrl()}/${pageId}/video_stories`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: finishForm.toString(),
    },
    "publishVideoStory/finish",
  );
  const storyId = finishBody.post_id ?? finishBody.id ?? videoId;
  return String(storyId);
}

// ---------------- pubblicazione post-foto e Reel (con media) ----------------

// Pubblica un POST-FOTO nel feed: carica la foto con published=true e la didascalia.
// Ritorna l'id del post (post_id) o, in mancanza, l'id foto. SCRIVE sulla pagina reale.
export async function publishPhotoPost(
  pageId: string,
  pageToken: string,
  imagePath: string,
  message: string,
  scheduledPublishTimeSec: number | null = null,
): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  let bytes: Buffer;
  try {
    bytes = await readFile(imagePath);
  } catch (e) {
    throw new FacebookError(`Immagine post non leggibile su disco: ${(e as Error).message}`, -1);
  }
  const form = new FormData();
  if (scheduledPublishTimeSec != null) {
    // Programmazione NATIVA Facebook: la foto viene caricata ora e pubblicata da FB alla data.
    form.set("published", "false");
    form.set("scheduled_publish_time", String(scheduledPublishTimeSec));
  } else {
    form.set("published", "true");
  }
  if (message && message.trim() !== "") form.set("message", message);
  form.set("access_token", pageToken);
  form.set("source", new Blob([bytes]), basename(imagePath));

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl()}/${pageId}/photos`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    throw new FacebookError(`Pubblicazione post-foto fallita: ${(e as Error).message}`, -1);
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
    throw graphError(
      `Graph API publishPhotoPost: ${body?.error?.message ?? `HTTP ${resp.status}`}`,
      body,
      resp.status,
    );
  }
  const id = body.post_id ?? body.id;
  if (id == null) throw new FacebookError("Post-foto senza id", -1);
  return String(id);
}

// Pubblica un REEL (video verticale) sulla pagina via Reels API resumable:
//  start -> upload del binario su upload_url -> finish.
// In finish: scheduledPublishTimeSec valorizzato → programmazione NATIVA FB
// (video_state=SCHEDULED + scheduled_publish_time), altrimenti pubblicazione immediata
// (video_state=PUBLISHED). Ritorna il video_id del reel. SCRIVE sulla pagina reale.
export async function publishReel(
  pageId: string,
  pageToken: string,
  videoPath: string,
  description: string,
  scheduledPublishTimeSec: number | null = null,
): Promise<string> {
  const { readFile, stat } = await import("node:fs/promises");
  let fileSize: number;
  try {
    fileSize = (await stat(videoPath)).size;
  } catch (e) {
    throw new FacebookError(`Video reel non leggibile su disco: ${(e as Error).message}`, -1);
  }

  // 1) START: ottiene video_id + upload_url.
  const startForm = new URLSearchParams();
  startForm.set("upload_phase", "start");
  startForm.set("access_token", pageToken);
  const startBody = await send(
    `${baseUrl()}/${pageId}/video_reels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: startForm.toString(),
    },
    "publishReel/start",
  );
  const videoId = startBody.video_id;
  const uploadUrl = startBody.upload_url;
  if (videoId == null || !uploadUrl) {
    throw new FacebookError(
      `Avvio reel senza video_id/upload_url: ${JSON.stringify(startBody)}`,
      -1,
    );
  }

  // 2) UPLOAD: invia il binario all'upload_url (header OAuth + offset/file_size).
  let bytes: Buffer;
  try {
    bytes = await readFile(videoPath);
  } catch (e) {
    throw new FacebookError(`Video reel non leggibile su disco: ${(e as Error).message}`, -1);
  }
  let upResp: Response;
  try {
    upResp = await fetch(String(uploadUrl), {
      method: "POST",
      headers: {
        Authorization: `OAuth ${pageToken}`,
        offset: "0",
        file_size: String(fileSize),
      },
      // Binario MP4 raw (non multipart); il Blob tipizzato imposta application/octet-stream.
      body: new Blob([bytes], { type: "application/octet-stream" }),
      signal: AbortSignal.timeout(180000),
    });
  } catch (e) {
    throw new FacebookError(`Upload reel fallito: ${(e as Error).message}`, -1);
  }
  if (upResp.status >= 400) {
    const t = await upResp.text().catch(() => "");
    throw new FacebookError(`Upload reel: HTTP ${upResp.status} ${t.slice(0, 200)}`, upResp.status);
  }

  // 3) FINISH: programmato (SCHEDULED + scheduled_publish_time) o immediato (PUBLISHED).
  const stateParams =
    scheduledPublishTimeSec != null
      ? `&video_state=SCHEDULED&scheduled_publish_time=${encodeURIComponent(
          String(scheduledPublishTimeSec),
        )}`
      : `&video_state=PUBLISHED`;
  const finishUrl =
    `${baseUrl()}/${pageId}/video_reels?` +
    `video_id=${encodeURIComponent(String(videoId))}` +
    `&upload_phase=finish` +
    stateParams +
    `&description=${encodeURIComponent(description ?? "")}` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  await send(finishUrl, { method: "POST" }, "publishReel/finish");
  return String(videoId);
}

// ---------------- gestione post pubblicati (A1/A4/A5) ----------------

export interface ManagedPost {
  id: string;
  message: string | null;
  createdTime: string | null;
  permalinkUrl: string | null;
  pictureUrl: string | null;
  isPublished: boolean;
  pinned: boolean;
}

// GET /{post-id}?fields=is_published — stato reale di pubblicazione di un singolo post.
// Ritorna true (pubblicato), false (programmato/non pubblicato, oppure non esiste più su FB),
// o null se FB non espone il campo. Errori di rete/token risalgono (il chiamante riprova).
export async function fetchPostPublished(
  postId: string,
  pageToken: string,
): Promise<boolean | null> {
  const url = `${baseUrl()}/${postId}?fields=is_published&access_token=${encodeURIComponent(pageToken)}`;
  try {
    const body = await send(url, { method: "GET" }, "fetchPostPublished");
    return typeof body.is_published === "boolean" ? body.is_published : null;
  } catch (e) {
    // Post inesistente/cancellato lato FB: trattalo come "non pubblicato".
    if (
      e instanceof FacebookError &&
      /does not exist|nonexisting field|Unsupported get request|\(#100\)|\(#803\)/i.test(e.message)
    ) {
      return false;
    }
    throw e;
  }
}

// GET /{page-id}/posts — post gia' presenti sulla pagina (pubblicati e programmati).
// `is_pinned` non e' sempre leggibile dall'API: di default pinned=false.
export async function fetchManagedPosts(
  pageId: string,
  pageToken: string,
  limit: number = 25,
): Promise<ManagedPost[]> {
  const fields = "id,message,created_time,permalink_url,full_picture,is_published";
  const url =
    `${baseUrl()}/${pageId}/posts` +
    `?fields=${encodeURIComponent(fields)}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const body = await send(url, { method: "GET" }, "fetchManagedPosts");

  const posts: ManagedPost[] = [];
  if (!Array.isArray(body.data)) return posts;
  for (const p of body.data) {
    posts.push({
      id: String(p.id ?? ""),
      message: typeof p.message === "string" ? p.message : null,
      createdTime: typeof p.created_time === "string" ? p.created_time : null,
      permalinkUrl: typeof p.permalink_url === "string" ? p.permalink_url : null,
      pictureUrl: typeof p.full_picture === "string" ? p.full_picture : null,
      isPublished: typeof p.is_published === "boolean" ? p.is_published : true,
      pinned: typeof p.is_pinned === "boolean" ? p.is_pinned : false,
    });
  }
  return posts;
}

// Un contenuto PROGRAMMATO sulla pagina (lato Facebook), letto live — distinto dai "post locali"
// che programmiamo noi nel DB. La media_type arriva da Facebook in modo generico (photo/video/link/
// status): un Reel programmato risulta "video" finché non viene pubblicato.
export interface ScheduledFbPost {
  id: string;
  message: string | null;
  scheduledPublishTime: number | null; // unix seconds
  createdTime: string | null;
  permalinkUrl: string | null;
  pictureUrl: string | null;
  mediaType: string | null; // photo | video | link | status (generico, da attachments)
}

// GET /{page-id}/scheduled_posts — contenuti PROGRAMMATI sulla pagina FB (non ancora pubblicati).
// Ordina per orario programmato crescente. Lista vuota se non ce ne sono.
export async function fetchScheduledPosts(
  pageId: string,
  pageToken: string,
  limit: number = 50,
): Promise<ScheduledFbPost[]> {
  const fields =
    "id,message,created_time,scheduled_publish_time,permalink_url,full_picture,attachments{media_type,type}";
  const url =
    `${baseUrl()}/${pageId}/scheduled_posts` +
    `?fields=${encodeURIComponent(fields)}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const body = await send(url, { method: "GET" }, "fetchScheduledPosts");

  const out: ScheduledFbPost[] = [];
  if (!Array.isArray(body.data)) return out;
  for (const p of body.data) {
    const att = Array.isArray(p.attachments?.data) ? p.attachments.data[0] : undefined;
    const sched = p.scheduled_publish_time;
    out.push({
      id: String(p.id ?? ""),
      message: typeof p.message === "string" ? p.message : null,
      scheduledPublishTime:
        typeof sched === "number"
          ? sched
          : typeof sched === "string" && /^\d+$/.test(sched)
            ? Number(sched)
            : null,
      createdTime: typeof p.created_time === "string" ? p.created_time : null,
      permalinkUrl: typeof p.permalink_url === "string" ? p.permalink_url : null,
      pictureUrl: typeof p.full_picture === "string" ? p.full_picture : null,
      mediaType: typeof att?.media_type === "string" ? att.media_type : null,
    });
  }
  out.sort(
    (a, b) =>
      (a.scheduledPublishTime ?? Number.POSITIVE_INFINITY) -
      (b.scheduledPublishTime ?? Number.POSITIVE_INFINITY),
  );
  return out;
}

// POST /{post-id} con message — modifica il testo di un post esistente.
export async function editPostMessage(
  postId: string,
  pageToken: string,
  message: string,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("message", message);
  form.set("access_token", pageToken);
  await send(
    `${baseUrl()}/${postId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "editPostMessage",
  );
}

// DELETE /{post-id} — elimina un post dalla pagina.
export async function deletePost(postId: string, pageToken: string): Promise<void> {
  await send(
    `${baseUrl()}/${postId}?access_token=${encodeURIComponent(pageToken)}`,
    { method: "DELETE" },
    "deletePost",
  );
}

// POST /{post-id} con is_pinned — fissa/sblocca un post in cima alla pagina.
// Se Graph rifiuta (es. limite di post fissati), l'errore propaga il messaggio.
export async function setPostPinned(
  postId: string,
  pageToken: string,
  pinned: boolean,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("is_pinned", String(pinned));
  form.set("access_token", pageToken);
  await send(
    `${baseUrl()}/${postId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "setPostPinned",
  );
}

// Pubblicazione nativa: riusa publishFeedPost (gestisce gia' scheduled_publish_time/published=false).
// SCRIVE su una pagina pubblica reale: solo su azione esplicita dell'utente. Ritorna l'id del post FB.
export async function publishNativePost(
  pageId: string,
  pageToken: string,
  message: string,
  link: string | null = null,
  scheduledPublishTimeSec: number | null = null,
): Promise<string> {
  return publishFeedPost(pageId, pageToken, message, link, scheduledPublishTimeSec);
}

// ---------------- gestione commenti (A2) ----------------

export interface PostComment {
  id: string;
  message: string | null;
  fromName: string | null;
  createdTime: string | null;
  likeCount: number;
  isHidden: boolean;
}

// GET /{post-id}/comments — commenti di un post (piu' recenti prima).
export async function fetchPostComments(postId: string, pageToken: string): Promise<PostComment[]> {
  const fields = "id,message,from{name},created_time,like_count,is_hidden";
  const url =
    `${baseUrl()}/${postId}/comments` +
    `?fields=${encodeURIComponent(fields)}` +
    `&order=reverse_chronological&limit=50` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const body = await send(url, { method: "GET" }, "fetchPostComments");

  const comments: PostComment[] = [];
  if (!Array.isArray(body.data)) return comments;
  for (const cm of body.data) {
    comments.push({
      id: String(cm.id ?? ""),
      message: typeof cm.message === "string" ? cm.message : null,
      fromName: cm.from && typeof cm.from.name === "string" ? cm.from.name : null,
      createdTime: typeof cm.created_time === "string" ? cm.created_time : null,
      likeCount: typeof cm.like_count === "number" ? cm.like_count : 0,
      isHidden: typeof cm.is_hidden === "boolean" ? cm.is_hidden : false,
    });
  }
  return comments;
}

// POST /{comment-id}/comments con message — risponde a un commento.
export async function replyToComment(
  commentId: string,
  pageToken: string,
  message: string,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("message", message);
  form.set("access_token", pageToken);
  await send(
    `${baseUrl()}/${commentId}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "replyToComment",
  );
}

// POST /{comment-id} con is_hidden — nasconde/mostra un commento.
export async function setCommentHidden(
  commentId: string,
  pageToken: string,
  hidden: boolean,
): Promise<void> {
  const form = new URLSearchParams();
  form.set("is_hidden", String(hidden));
  form.set("access_token", pageToken);
  await send(
    `${baseUrl()}/${commentId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    "setCommentHidden",
  );
}

// DELETE /{comment-id} — elimina un commento.
export async function deleteComment(commentId: string, pageToken: string): Promise<void> {
  await send(
    `${baseUrl()}/${commentId}?access_token=${encodeURIComponent(pageToken)}`,
    { method: "DELETE" },
    "deleteComment",
  );
}

// POST|DELETE /{comment-id}/likes — mette/toglie "mi piace" della pagina a un commento.
export async function setCommentLiked(
  commentId: string,
  pageToken: string,
  like: boolean,
): Promise<void> {
  if (like) {
    const form = new URLSearchParams();
    form.set("access_token", pageToken);
    await send(
      `${baseUrl()}/${commentId}/likes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
      "setCommentLiked",
    );
  } else {
    await send(
      `${baseUrl()}/${commentId}/likes?access_token=${encodeURIComponent(pageToken)}`,
      { method: "DELETE" },
      "setCommentLiked",
    );
  }
}

// Parser dedicato per la serie giornaliera: preserva TUTTI i punti (uno per giorno),
// a differenza di parseInsightRows che tiene solo l'ultimo.
function parseDailyValues(body: any, metricName: string): Map<string, number> {
  const out = new Map<string, number>();
  if (!Array.isArray(body.data)) return out;
  for (const metric of body.data) {
    if (String(metric.name ?? "") !== metricName) continue;
    if (!Array.isArray(metric.values)) continue;
    for (const v of metric.values) {
      // end_time e' ISO 8601 ("2024-01-15T08:00:00+0000"); usiamo la parte data come chiave.
      const endTime: string = typeof v?.end_time === "string" ? v.end_time : "";
      const dateKey = endTime.slice(0, 10); // "YYYY-MM-DD"
      if (dateKey.length === 10) {
        const value = typeof v?.value === "number" ? v.value : 0;
        out.set(dateKey, value);
      }
    }
  }
  return out;
}

// Fetches page_daily_follows_unique + page_daily_unfollows_unique for the last `days` days.
// Returns an aligned daily series [{date (epoch ms), follows, unfollows}].
// Resiliente: se una metrica restituisce errore #100 viene trattata come serie vuota (0).
export async function fetchFollowerTrend(
  pageId: string,
  pageToken: string,
  days: number = 28,
): Promise<FollowerTrendPoint[]> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - days * 86400;
  const until = now;

  const followsMetric = "page_daily_follows_unique";
  const unfollowsMetric = "page_daily_unfollows_unique";

  let followsMap = new Map<string, number>();
  let unfollowsMap = new Map<string, number>();

  // Fetch both metrics together first; fall back to per-metric on #100.
  try {
    const url =
      `${baseUrl()}/${pageId}/insights` +
      `?metric=${encodeURIComponent(`${followsMetric},${unfollowsMetric}`)}` +
      `&period=day` +
      `&since=${since}&until=${until}` +
      `&access_token=${encodeURIComponent(pageToken)}`;
    const body = await send(url, { method: "GET" }, "fetchFollowerTrend");
    followsMap = parseDailyValues(body, followsMetric);
    unfollowsMap = parseDailyValues(body, unfollowsMetric);
  } catch (e) {
    if (!isInvalidMetricError(e)) throw e;
    // Batch fallito: riprova ciascuna metrica individualmente.
    try {
      const urlF =
        `${baseUrl()}/${pageId}/insights` +
        `?metric=${encodeURIComponent(followsMetric)}` +
        `&period=day&since=${since}&until=${until}` +
        `&access_token=${encodeURIComponent(pageToken)}`;
      const bodyF = await send(urlF, { method: "GET" }, "fetchFollowerTrend/follows");
      followsMap = parseDailyValues(bodyF, followsMetric);
    } catch (e2) {
      if (!isInvalidMetricError(e2)) throw e2;
      // followsMap resta vuota (serie assente → 0)
    }
    try {
      const urlU =
        `${baseUrl()}/${pageId}/insights` +
        `?metric=${encodeURIComponent(unfollowsMetric)}` +
        `&period=day&since=${since}&until=${until}` +
        `&access_token=${encodeURIComponent(pageToken)}`;
      const bodyU = await send(urlU, { method: "GET" }, "fetchFollowerTrend/unfollows");
      unfollowsMap = parseDailyValues(bodyU, unfollowsMetric);
    } catch (e2) {
      if (!isInvalidMetricError(e2)) throw e2;
      // unfollowsMap resta vuota (serie assente → 0)
    }
  }

  // Allinea le due serie per data; l'unione delle chiavi garantisce tutti i giorni presenti.
  const allDates = new Set([...followsMap.keys(), ...unfollowsMap.keys()]);
  const points: FollowerTrendPoint[] = [];
  for (const dateKey of allDates) {
    const dateMs = new Date(`${dateKey}T00:00:00Z`).getTime();
    if (!Number.isFinite(dateMs)) continue;
    points.push({
      date: dateMs,
      follows: followsMap.get(dateKey) ?? 0,
      unfollows: unfollowsMap.get(dateKey) ?? 0,
    });
  }
  points.sort((a, b) => a.date - b.date);
  return points;
}

// B3 — Copertura trend: serie giornaliera di page_total_media_view_unique (visualizzazioni
// pagina, sostituisce page_impressions in v21). Resiliente: metrica deprecata (#100) → [].
export async function fetchCoverageTrend(
  pageId: string,
  pageToken: string,
  days: number = 28,
): Promise<TrendPoint[]> {
  const now = Math.floor(Date.now() / 1000);
  const since = now - days * 86400;
  const until = now;
  const metric = "page_total_media_view_unique";

  let valuesMap = new Map<string, number>();
  try {
    const url =
      `${baseUrl()}/${pageId}/insights` +
      `?metric=${encodeURIComponent(metric)}` +
      `&period=day&since=${since}&until=${until}` +
      `&access_token=${encodeURIComponent(pageToken)}`;
    const body = await send(url, { method: "GET" }, "fetchCoverageTrend");
    valuesMap = parseDailyValues(body, metric);
  } catch (e) {
    if (!isInvalidMetricError(e)) throw e; // errori reali (token/permessi) risalgono
    return []; // metrica deprecata: serie vuota, niente crash
  }

  const points: TrendPoint[] = [];
  for (const [dateKey, value] of valuesMap) {
    const dateMs = new Date(`${dateKey}T00:00:00Z`).getTime();
    if (!Number.isFinite(dateMs)) continue;
    points.push({ date: dateMs, value });
  }
  points.sort((a, b) => a.date - b.date);
  return points;
}

export interface Demographics {
  countries: DemographicEntry[];
  genderAge: DemographicEntry[];
  cities: DemographicEntry[];
}

// Estrae l'ultimo `value` (oggetto {chiave:conteggio}) di una metrica e lo converte
// in [{key,value}] ordinato per value desc, troncato ai primi 10.
function parseDemographicMetric(body: any, metricName: string): DemographicEntry[] {
  if (!Array.isArray(body.data)) return [];
  for (const metric of body.data) {
    if (String(metric.name ?? "") !== metricName) continue;
    if (!Array.isArray(metric.values) || metric.values.length === 0) continue;
    const last = metric.values[metric.values.length - 1]?.value;
    if (!last || typeof last !== "object") continue;
    const entries: DemographicEntry[] = Object.entries(last as Record<string, unknown>)
      .map(([key, v]) => ({ key, value: typeof v === "number" ? v : Number(v) || 0 }))
      .filter((e) => Number.isFinite(e.value));
    entries.sort((a, b) => b.value - a.value);
    return entries.slice(0, 10);
  }
  return [];
}

// Recupera una singola metrica demografica lifetime; resiliente: #100/deprecata → [].
async function fetchOneDemographic(
  pageId: string,
  pageToken: string,
  metric: string,
): Promise<DemographicEntry[]> {
  try {
    const url =
      `${baseUrl()}/${pageId}/insights` +
      `?metric=${encodeURIComponent(metric)}` +
      `&period=lifetime` +
      `&access_token=${encodeURIComponent(pageToken)}`;
    const body = await send(url, { method: "GET" }, `fetchDemographics/${metric}`);
    return parseDemographicMetric(body, metric);
  } catch (e) {
    if (!isInvalidMetricError(e)) throw e; // errori reali (token/permessi) risalgono
    return []; // metrica deprecata (molte demografiche lo sono dal 2024)
  }
}

// B5 — Demografia fan: paesi, genere/eta', citta'. Ogni metrica ha il proprio fallback;
// se tutte falliscono, ritorna liste vuote SENZA crash.
export async function fetchDemographics(pageId: string, pageToken: string): Promise<Demographics> {
  const [countries, genderAge, cities] = await Promise.all([
    fetchOneDemographic(pageId, pageToken, "page_fans_country"),
    fetchOneDemographic(pageId, pageToken, "page_fans_gender_age"),
    fetchOneDemographic(pageId, pageToken, "page_fans_city"),
  ]);
  return { countries, genderAge, cities };
}

// GET /{page-id}/posts con insights per-post innestati.
// Gli insight annidati non permettono il fallback per-metrica: se UNA metrica e'
// deprecata (#100) l'intera chiamata fallisce. Per questo proviamo set di metriche
// via via piu' piccoli, fino a recuperare i post SENZA insight (impressions a 0),
// cosi' il widget mostra comunque i post invece di andare in errore.
async function fetchTopPostsWithMetrics(
  pageId: string,
  pageToken: string,
  limit: number,
  metrics: string[],
): Promise<TopPost[]> {
  const insightsField = metrics.length > 0 ? `,insights.metric(${metrics.join(",")})` : "";
  // Campi nested per reazioni/commenti/condivisioni (sempre richiesti, non sono insight).
  const engagementFields =
    ",reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares";
  const fields =
    "id,message,created_time,permalink_url,full_picture" + engagementFields + insightsField;
  const url =
    `${baseUrl()}/${pageId}/posts` +
    `?fields=${encodeURIComponent(fields)}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const body = await send(url, { method: "GET" }, "fetchTopPosts");

  const posts: TopPost[] = [];
  if (!Array.isArray(body.data)) return posts;

  for (const p of body.data) {
    // Estrai le metriche insight innestati (struttura: insights.data = [{name,values:[{value}]}]).
    let impressions = 0;
    let reach = 0;
    let engagedUsers = 0;
    if (Array.isArray(p.insights?.data)) {
      for (const ins of p.insights.data) {
        const val =
          Array.isArray(ins.values) && ins.values.length > 0
            ? typeof ins.values[0]?.value === "number"
              ? ins.values[0].value
              : 0
            : 0;
        // v21 (giu 2026): "post_total_media_views_unique" sostituisce post_impressions*.
        if (ins.name === "post_total_media_views_unique" || ins.name === "post_impressions")
          impressions = val;
        else if (ins.name === "post_impressions_unique") reach = val;
        else if (ins.name === "post_engaged_users") engagedUsers = val;
      }
    }
    const reactions =
      typeof p.reactions?.summary?.total_count === "number" ? p.reactions.summary.total_count : 0;
    const comments =
      typeof p.comments?.summary?.total_count === "number" ? p.comments.summary.total_count : 0;
    const shares = typeof p.shares?.count === "number" ? p.shares.count : 0;
    posts.push({
      id: String(p.id ?? ""),
      message: typeof p.message === "string" ? p.message : null,
      createdTime: typeof p.created_time === "string" ? p.created_time : null,
      permalinkUrl: typeof p.permalink_url === "string" ? p.permalink_url : null,
      pictureUrl: typeof p.full_picture === "string" ? p.full_picture : null,
      impressions,
      reach,
      engagedUsers,
      reactions,
      comments,
      shares,
    });
  }

  posts.sort((a, b) => b.impressions - a.impressions);
  return posts;
}

// Ritorna i post ordinati per visualizzazioni desc, con degradazione graduale:
// prova prima la metrica v21 corrente, poi le legacy, infine SENZA insight
// (post con visualizzazioni a 0) cosi' il widget mostra comunque i post.
export async function fetchTopPosts(
  pageId: string,
  pageToken: string,
  limit: number = 10,
): Promise<TopPost[]> {
  const attempts: string[][] = [
    ["post_total_media_views_unique"], // v21 (giu 2026): nuova metrica "visualizzazioni"
    ["post_impressions", "post_impressions_unique"], // legacy, se ancora attiva
    [], // nessun insight: almeno la lista dei post
  ];
  let lastErr: unknown;
  for (const metrics of attempts) {
    try {
      return await fetchTopPostsWithMetrics(pageId, pageToken, limit, metrics);
    } catch (e) {
      if (!isInvalidMetricError(e)) throw e; // errori reali (token/permessi) risalgono
      lastErr = e;
    }
  }
  throw lastErr; // di fatto irraggiungibile: l'ultimo tentativo non chiede metriche
}

// Metriche disponibili solo come totale "lifetime": richiederle con period=day
// fa scattare l'errore Graph (#100) "must be a valid insights metric".
const LIFETIME_METRICS = new Set(["page_fans", "page_follows"]);

// L'errore #100 indica una metrica non valida per questa versione/periodo:
// va gestito scartando la singola metrica, non l'intera chiamata.
function isInvalidMetricError(e: unknown): boolean {
  return (
    e instanceof FacebookError &&
    /valid insights metric|\(#100\)|does not exist|nonexisting field/i.test(e.message)
  );
}

function parseInsightRows(pageId: string, body: any): InsightRow[] {
  const out: InsightRow[] = [];
  const now = Date.now();
  if (Array.isArray(body.data)) {
    for (const metric of body.data) {
      const name = String(metric.name ?? "");
      // Tieni solo il valore piu' recente (l'ultimo dell'array values) come snapshot.
      if (Array.isArray(metric.values) && metric.values.length > 0) {
        const v = metric.values[metric.values.length - 1];
        const value = typeof v?.value === "number" ? v.value : 0;
        out.push({ pageId, metric: name, value, periodEnd: now, fetchedAt: now });
      }
    }
  }
  return out;
}

async function fetchInsightsForPeriod(
  pageId: string,
  pageToken: string,
  metrics: string[],
  period: string,
): Promise<InsightRow[]> {
  const url =
    `${baseUrl()}/${pageId}/insights?metric=${encodeURIComponent(metrics.join(","))}` +
    `&period=${encodeURIComponent(period)}` +
    `&access_token=${encodeURIComponent(pageToken)}`;
  const body = await send(url, { method: "GET" }, "fetchInsights");
  return parseInsightRows(pageId, body);
}

// Robusto: raggruppa le metriche per il periodo che supportano (lifetime vs day/week),
// e se una metrica non e' valida (#100) ripiega su richieste per-metrica scartando solo
// quelle invalide, cosi' una metrica deprecata non azzera l'intera pagina.
export async function fetchInsights(
  pageId: string,
  pageToken: string,
  metrics: string[],
  period: string | null,
): Promise<InsightRow[]> {
  const reqPeriod = period ?? "day";
  const groups = new Map<string, string[]>();
  for (const m of metrics) {
    const p = LIFETIME_METRICS.has(m) ? "lifetime" : reqPeriod;
    groups.set(p, [...(groups.get(p) ?? []), m]);
  }

  const out: InsightRow[] = [];
  const skipped: string[] = [];
  for (const [p, ms] of groups) {
    try {
      out.push(...(await fetchInsightsForPeriod(pageId, pageToken, ms, p)));
    } catch (e) {
      if (!isInvalidMetricError(e)) throw e; // errori reali (token/permessi) risalgono
      // Batch fallito per metrica invalida: riprova una metrica alla volta.
      for (const m of ms) {
        try {
          out.push(...(await fetchInsightsForPeriod(pageId, pageToken, [m], p)));
        } catch (e2) {
          if (isInvalidMetricError(e2)) skipped.push(m);
          else throw e2;
        }
      }
    }
  }

  if (out.length === 0 && skipped.length > 0) {
    throw new FacebookError(
      `Nessuna metrica valida per questa pagina (scartate: ${skipped.join(", ")})`,
      400,
    );
  }
  return out;
}
