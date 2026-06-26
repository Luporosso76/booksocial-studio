import { stat, unlink } from "node:fs/promises";
import { query } from "../db/pool.js";
import { resolveDataPath } from "../paths.js";

const GRACE_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 30 * 60 * 1000;

export class RenderCleanup {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.timer) return;
    void this.sweepSafe();
    this.timer = setInterval(() => void this.sweepSafe(), INTERVAL_MS);
    console.log(
      `[render-cleanup] avviato (sweep ogni ${INTERVAL_MS / 60000} min, grace ${GRACE_MS / 3600000}h)`,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async sweepSafe(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweep();
    } catch (e) {
      console.error(`[render-cleanup] errore sweep: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.running = false;
    }
  }

  async sweep(now: number = Date.now()): Promise<number> {
    const cutoff = now - GRACE_MS;
    const rows = await query<{ media_path: string }>(
      `SELECT media_path
         FROM scheduled_post
        WHERE media_path IS NOT NULL AND media_path <> ''
        GROUP BY media_path
       HAVING SUM(
                CASE WHEN status = 'PUBLISHED'
                      AND ( (platform = 'instagram' AND ig_media_id IS NOT NULL)
                         OR (platform <> 'instagram' AND fb_post_id IS NOT NULL) )
                     THEN 0 ELSE 1 END
              ) = 0
          AND MAX(COALESCE(published_at_actual, updated_at)) < ?`,
      [cutoff],
    );

    let deleted = 0;
    for (const r of rows) {
      const rel = r.media_path;
      if (!rel || !rel.includes("render-")) continue;
      const abs = resolveDataPath(rel);
      try {
        await stat(abs);
        await unlink(abs);
        deleted++;
        console.log(`[render-cleanup] liberato ${rel}`);
      } catch {
        // file mancante o non accessibile: ignora, ritenta al prossimo giro
      }
    }
    if (deleted > 0) console.log(`[render-cleanup] ${deleted} file liberati`);
    return deleted;
  }
}
