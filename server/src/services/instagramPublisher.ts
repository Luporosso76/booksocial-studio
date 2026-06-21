import { extname } from "node:path";
import { pages, posts } from "../db/repositories.js";
import * as ig from "../facebook/instagramClient.js";
import { channelFor, visualCaption, PublishError } from "./publisher.js";
import { resolveDataPath } from "../paths.js";
import type { ScheduledPost } from "../domain.js";

// Pubblicazione INSTAGRAM come JOB LOCALE separato, legato all'item Facebook. Instagram non ha
// programmazione nativa: ogni Reel/Storia IG è una riga scheduled_post con platform='instagram'
// che il publishScheduler interno pubblica al suo orario. Vedi facebook/instagramClient.ts.

function isVideoFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ext === ".mp4" || ext === ".mov" || ext === ".webm";
}

// Solo REEL/STORY con un video allegato sono ammessi su Instagram. Ritorna il canale validato
// ("REEL" | "STORY") o lancia PublishError con un messaggio leggibile.
function requireIgEligible(post: ScheduledPost): "REEL" | "STORY" {
  const channel = channelFor(post);
  if (channel !== "REEL" && channel !== "STORY") {
    throw new PublishError("Solo Reel o Storie video 9:16 possono essere pubblicati su Instagram.");
  }
  if (!post.mediaPath) {
    throw new PublishError("Il contenuto non ha un video renderizzato da pubblicare su Instagram.");
  }
  if (!isVideoFile(post.mediaPath)) {
    throw new PublishError("Il file allegato non è un video: Instagram accetta solo video 9:16.");
  }
  return channel;
}

// Crea (se non esiste già) il job IG gemello di un post Facebook REEL/STORY video. Idempotente:
// se esiste già una riga IG con linked_post_id = fromPost.id, ritorna QUELLA senza creare doppioni.
export async function createInstagramJob(fromPost: ScheduledPost): Promise<ScheduledPost> {
  requireIgEligible(fromPost);

  const existing = await posts.findByLinkedPostId(fromPost.id);
  if (existing) return existing;

  const now = Date.now();
  return posts.insert({
    pageId: fromPost.pageId,
    bookId: fromPost.bookId,
    generationId: fromPost.generationId,
    message: fromPost.message,
    hashtags: fromPost.hashtags,
    mediaType: fromPost.mediaType,
    link: fromPost.link,
    mediaPath: fromPost.mediaPath,
    scheduledAt: fromPost.scheduledAt,
    status: "SCHEDULED",
    fbPostId: null,
    attempts: 0,
    lastError: null,
    // idempotency_key è UNIQUE: deriva dall'id del post FB gemello per evitare collisioni.
    idempotencyKey: `ig:${fromPost.id}`,
    musicId: fromPost.musicId,
    contentFormat: fromPost.contentFormat,
    platform: "instagram",
    linkedPostId: fromPost.id,
    igMediaId: null,
    createdAt: now,
    updatedAt: now,
  });
}

// Pubblica un job IG (Reel/Storia) e ritorna l'igMediaId. Risolve l'igUserId dalla cache di pagina
// o via Graph API (e lo memorizza), pubblica via instagramClient e salva ig_media_id sul post.
export async function publishInstagramJob(post: ScheduledPost, token: string): Promise<string> {
  const channel = requireIgEligible(post);

  const page = await pages.find(post.pageId);
  if (!page) throw new PublishError(`Pagina non trovata: ${post.pageId}`);

  let igUserId = page.igUserId;
  if (!igUserId) {
    igUserId = await ig.getIgUserId(post.pageId, token);
    if (!igUserId) {
      throw new PublishError(
        "La Pagina non ha un account Instagram Business collegato: pubblicazione IG non possibile.",
      );
    }
    await pages.setIgUserId(post.pageId, igUserId);
  }

  const kind: ig.IgMediaKind = channel === "REEL" ? "REELS" : "STORIES";
  const videoPath = resolveDataPath(post.mediaPath as string);
  const igMediaId = await ig.publishVideo({
    igUserId,
    token,
    videoPath,
    caption: visualCaption(post),
    kind,
  });

  post.igMediaId = igMediaId;
  post.updatedAt = Date.now();
  await posts.update(post);
  return igMediaId;
}
