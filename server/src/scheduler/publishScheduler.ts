import { appConfig } from "../config.js";
import { pages, posts } from "../db/repositories.js";
import * as keyring from "../secrets/keyring.js";
import * as fb from "../facebook/client.js";
import type { ScheduledPost } from "../domain.js";
import { publishDraft } from "../services/publisher.js";
import { publishInstagramJob } from "../services/instagramPublisher.js";

// Publish scheduler, robust to crash/restart:
//  - on start, recover posts stuck in PUBLISHING (never confirmed) -> SCHEDULED;
//  - each tick, take due posts, atomically claim them (SCHEDULED->PUBLISHING), publish;
//  - on error apply backoff and retry up to maxPublishAttempts, then FAILED.
// IMPORTANT: DRAFT posts are NEVER published automatically; only SCHEDULED due posts.
// Posts with an existing fb_post_id are never republished. Ported from Java PublishScheduler.

const DUE_BATCH = 10;

export class PublishScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  async start(): Promise<void> {
    const recovered = await posts.recoverStalePublishing(Date.now());
    if (recovered > 0) {
      // eslint-disable-next-line no-console
      console.log(`[scheduler] recuperati ${recovered} post rimasti in PUBLISHING`);
    }
    const intervalSec = Math.max(5, appConfig.schedulerPollSeconds);
    this.timer = setInterval(() => void this.tickSafe(), intervalSec * 1000);
    if (this.timer.unref) this.timer.unref();
    // eslint-disable-next-line no-console
    console.log(`[scheduler] avviato (poll ogni ${intervalSec}s)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tickSafe(): Promise<void> {
    if (this.running) return; // avoid overlapping ticks
    this.running = true;
    try {
      await this.tick();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`[scheduler] errore nel tick: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async tick(): Promise<void> {
    const due = await posts.findDue(Date.now(), DUE_BATCH);
    for (const post of due) {
      if (await posts.claimForPublishing(post.id, Date.now())) {
        await this.publish(post);
      }
    }
  }

  private async publish(post: ScheduledPost): Promise<void> {
    const page = await pages.find(post.pageId);
    if (!page) {
      await this.fail(post, `Pagina non trovata: ${post.pageId}`, false);
      return;
    }
    const token = await keyring.get(page.tokenSecretKey);
    if (!token) {
      await this.fail(post, `Token mancante per la pagina ${post.pageId}`, false);
      return;
    }

    try {
      // INSTAGRAM (job locale separato): pubblica via Instagram Graph API, salva ig_media_id.
      // Nessun fb_post_id coinvolto. Il flusso Facebook (default) resta INVARIATO sotto.
      if (post.platform === "instagram") {
        const igMediaId = await publishInstagramJob(post, token);
        await posts.update({
          ...post,
          status: "PUBLISHED",
          igMediaId,
          lastError: null,
          updatedAt: Date.now(),
        });
        // eslint-disable-next-line no-console
        console.log(`[scheduler] pubblicato post IG #${post.id} -> ig ${igMediaId}`);
        return;
      }

      const fbId = await publishDraft(post, token);
      await posts.update({
        ...post,
        status: "PUBLISHED",
        fbPostId: fbId,
        lastError: null,
        updatedAt: Date.now(),
      });
      // eslint-disable-next-line no-console
      console.log(`[scheduler] pubblicato post #${post.id} -> fb ${fbId}`);
    } catch (e) {
      const err = e as fb.FacebookError;
      const status = typeof err.httpStatus === "number" ? err.httpStatus : -1;
      const retryable = status < 0 || status >= 500 || status === 429;
      await this.fail(post, err.message, retryable);
    }
  }

  private async fail(post: ScheduledPost, error: string, retryable: boolean): Promise<void> {
    const attempts = post.attempts + 1;
    const now = Date.now();
    if (retryable && attempts < appConfig.maxPublishAttempts) {
      const retryAt = now + this.backoffMs(attempts);
      await posts.update({
        ...post,
        scheduledAt: retryAt,
        status: "SCHEDULED",
        attempts,
        lastError: error,
        updatedAt: now,
      });
      // eslint-disable-next-line no-console
      console.warn(
        `[scheduler] post #${post.id} fallito (tentativo ${attempts}), ritento: ${error}`,
      );
    } else {
      await posts.update({
        ...post,
        status: "FAILED",
        attempts,
        lastError: error,
        updatedAt: now,
      });
      // eslint-disable-next-line no-console
      console.error(`[scheduler] post #${post.id} FALLITO definitivamente: ${error}`);
    }
  }

  private backoffMs(attempts: number): number {
    return Math.pow(2, attempts) * 60 * 1000; // 2, 4, 8 min...
  }
}
