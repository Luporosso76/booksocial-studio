import { pool, query, execute } from "./pool.js";

// Schema SQLite (better-sqlite3). Convenzioni:
//  - id INTEGER PRIMARY KEY AUTOINCREMENT
//  - tipi: testo -> TEXT ; interi -> INTEGER ; decimali -> REAL
//  - indici/UNIQUE: in CREATE [UNIQUE] INDEX separati DOPO la CREATE TABLE
//  - FOREIGN KEY: inline (SQLite con foreign_keys=ON)
//  - timestamps come INTEGER epoch ms
// Ogni voce = array di statement applicati in una singola transazione, registrato in
// schema_version (version, applied_at).

interface Migration {
  version: number;
  statements: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS book (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        title                TEXT    NOT NULL,
        author               TEXT    NULL,
        language             TEXT    NOT NULL DEFAULT 'it',
        source_path          TEXT    NOT NULL,
        content_hash         TEXT    NOT NULL,
        chapter_count        INTEGER NOT NULL DEFAULT 0,
        char_count           INTEGER NOT NULL DEFAULT 0,
        imported_at          INTEGER NOT NULL,
        updated_at           INTEGER NOT NULL,
        website_url          TEXT    NULL,
        notes                TEXT    NULL,
        base_hashtags        TEXT    NULL,
        visual_domains       TEXT    NULL,
        visual_directives    TEXT    NULL,
        visual_directives_en TEXT    NULL,
        visual_props_json    TEXT    NULL,
        visual_extras_json   TEXT    NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_book_source ON book(source_path)`,

      `CREATE TABLE IF NOT EXISTS book_chapter (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id    INTEGER NOT NULL,
        idx        INTEGER NOT NULL,
        title      TEXT    NULL,
        text       TEXT    NOT NULL,
        char_count INTEGER NOT NULL,
        scene_json TEXT    NULL,
        excluded   INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_chapter_book_idx ON book_chapter(book_id, idx)`,
      `CREATE INDEX IF NOT EXISTS ix_chapter_book ON book_chapter(book_id)`,

      `CREATE TABLE IF NOT EXISTS book_profile (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id             INTEGER NOT NULL,
        synopsis_short      TEXT    NULL,
        synopsis_long       TEXT    NULL,
        genres              TEXT    NULL,
        tone                TEXT    NULL,
        target_audience     TEXT    NULL,
        analysis_json       TEXT    NOT NULL,
        source_content_hash TEXT    NOT NULL,
        prompt_version      INTEGER NOT NULL,
        model               TEXT    NULL,
        created_at          INTEGER NOT NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_profile_book_version ON book_profile(book_id, prompt_version)`,

      `CREATE TABLE IF NOT EXISTS facebook_page (
        page_id          TEXT    NOT NULL PRIMARY KEY,
        name             TEXT    NOT NULL,
        category         TEXT    NULL,
        token_secret_key TEXT    NOT NULL,
        book_id          INTEGER NULL,
        added_at         INTEGER NOT NULL,
        ig_user_id       TEXT    NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_page_book ON facebook_page(book_id)`,

      `CREATE TABLE IF NOT EXISTS generation_record (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id        INTEGER NOT NULL,
        page_id        TEXT    NULL,
        angle          TEXT    NULL,
        prompt_version TEXT    NULL,
        input_hash     TEXT    NULL,
        model          TEXT    NULL,
        output         TEXT    NOT NULL,
        created_at     INTEGER NOT NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_generation_page ON generation_record(page_id, created_at)`,

      // music_id NON ha FK enforced verso music_track: SQLite non supporta ADD CONSTRAINT su
      // tabella esistente; la semantica (ON DELETE SET NULL) è gestita a livello applicativo.
      `CREATE TABLE IF NOT EXISTS scheduled_post (
        id                     INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id                TEXT    NOT NULL,
        book_id                INTEGER NULL,
        generation_id          INTEGER NULL,
        message                TEXT    NOT NULL,
        hashtags               TEXT    NULL,
        media_type             TEXT    NOT NULL DEFAULT 'TEXT',
        link                   TEXT    NULL,
        media_path             TEXT    NULL,
        scheduled_at           INTEGER NOT NULL,
        status                 TEXT    NOT NULL DEFAULT 'DRAFT',
        fb_post_id             TEXT    NULL,
        attempts               INTEGER NOT NULL DEFAULT 0,
        last_error             TEXT    NULL,
        idempotency_key        TEXT    NOT NULL,
        created_at             INTEGER NOT NULL,
        updated_at             INTEGER NOT NULL,
        scheduled_publish_time INTEGER NULL,
        published_at_actual    INTEGER NULL,
        reach                  INTEGER NULL,
        impressions            INTEGER NULL,
        engagement             INTEGER NULL,
        last_checked           INTEGER NULL,
        music_id               INTEGER NULL,
        content_format         TEXT    NULL,
        platform               TEXT    NOT NULL DEFAULT 'facebook',
        linked_post_id         INTEGER NULL,
        ig_media_id            TEXT    NULL,
        FOREIGN KEY (page_id) REFERENCES facebook_page(page_id) ON DELETE CASCADE,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE SET NULL,
        FOREIGN KEY (generation_id) REFERENCES generation_record(id) ON DELETE SET NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_post_idem ON scheduled_post(idempotency_key)`,
      `CREATE INDEX IF NOT EXISTS ix_post_due ON scheduled_post(status, scheduled_at)`,
      `CREATE INDEX IF NOT EXISTS ix_post_page ON scheduled_post(page_id, scheduled_at)`,

      `CREATE TABLE IF NOT EXISTS insight_snapshot (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id    TEXT    NOT NULL,
        metric     TEXT    NOT NULL,
        value      REAL    NOT NULL,
        period_end INTEGER NOT NULL,
        fetched_at INTEGER NOT NULL,
        FOREIGN KEY (page_id) REFERENCES facebook_page(page_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_insight_page_metric ON insight_snapshot(page_id, metric, period_end)`,

      `CREATE TABLE IF NOT EXISTS book_link (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id      INTEGER NOT NULL,
        channel      TEXT    NOT NULL,
        label        TEXT    NULL,
        url          TEXT    NOT NULL,
        is_default   INTEGER NOT NULL DEFAULT 0,
        usage_policy TEXT    NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_link_book ON book_link(book_id)`,

      `CREATE TABLE IF NOT EXISTS media_asset (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id     INTEGER NOT NULL,
        chapter_id  INTEGER NULL,
        scope       TEXT    NOT NULL DEFAULT 'GENERAL',
        path        TEXT    NOT NULL,
        caption     TEXT    NULL,
        added_at    INTEGER NOT NULL,
        gen_prompt  TEXT    NULL,
        chapter_idx INTEGER NULL,
        tags        TEXT    NULL,
        qa_json     TEXT    NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES book_chapter(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_media_book ON media_asset(book_id)`,

      `CREATE TABLE IF NOT EXISTS posting_slot (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id     TEXT    NOT NULL,
        day_of_week INTEGER NOT NULL,
        time_of_day TEXT    NOT NULL,
        media_type  TEXT    NOT NULL DEFAULT 'TEXT',
        enabled     INTEGER NOT NULL DEFAULT 1,
        time_start  TEXT    NULL,
        time_end    TEXT    NULL,
        FOREIGN KEY (page_id) REFERENCES facebook_page(page_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_slot_page ON posting_slot(page_id)`,

      `CREATE TABLE IF NOT EXISTS book_character (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id      INTEGER NOT NULL,
        name         TEXT    NOT NULL,
        role         TEXT    NULL,
        occupation   TEXT    NULL,
        personality  TEXT    NULL,
        physical     TEXT    NULL,
        notes        TEXT    NULL,
        source       TEXT    NOT NULL DEFAULT 'AI',
        sort_order   INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        mentions     INTEGER NULL,
        chapters     TEXT    NULL,
        outfits_json TEXT    NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_char_book ON book_character(book_id)`,

      `CREATE TABLE IF NOT EXISTS book_quote (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id    INTEGER NOT NULL,
        chapter_id INTEGER NULL,
        text       TEXT    NOT NULL,
        kind       TEXT    NOT NULL DEFAULT 'quote',
        speaker    TEXT    NULL,
        score      REAL    NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE,
        FOREIGN KEY (chapter_id) REFERENCES book_chapter(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_quote_book ON book_quote(book_id)`,

      `CREATE TABLE IF NOT EXISTS render_job (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id     INTEGER NULL,
        book_id     INTEGER NULL,
        kind        TEXT    NOT NULL,
        status      TEXT    NOT NULL DEFAULT 'queued',
        spec_json   TEXT    NOT NULL,
        output_path TEXT    NULL,
        error       TEXT    NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (post_id) REFERENCES scheduled_post(id) ON DELETE CASCADE,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_render_status ON render_job(status, id)`,
      `CREATE INDEX IF NOT EXISTS ix_render_post ON render_job(post_id)`,

      `CREATE TABLE IF NOT EXISTS music_track (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL,
        path         TEXT    NOT NULL,
        duration_sec REAL    NULL,
        mood         TEXT    NULL,
        added_at     INTEGER NOT NULL,
        book_id      INTEGER NULL
      )`,

      `CREATE TABLE IF NOT EXISTS content_usage (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id        TEXT    NOT NULL,
        book_id        INTEGER NULL,
        post_id        INTEGER NULL,
        text_mode      TEXT    NOT NULL,
        visual_kind    TEXT    NOT NULL,
        visual_content TEXT    NOT NULL,
        aspect         TEXT    NULL,
        image_ids      TEXT    NULL,
        quote_key      TEXT    NULL,
        music_id       INTEGER NULL,
        created_at     INTEGER NOT NULL,
        chapter_index  INTEGER NULL,
        FOREIGN KEY (page_id) REFERENCES facebook_page(page_id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES scheduled_post(id) ON DELETE SET NULL,
        FOREIGN KEY (music_id) REFERENCES music_track(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_usage_page ON content_usage(page_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS ix_usage_book ON content_usage(book_id)`,

      `CREATE TABLE IF NOT EXISTS weekly_plan (
        page_id          TEXT    NOT NULL PRIMARY KEY,
        posts_per_week   INTEGER NOT NULL DEFAULT 0,
        reels_per_week   INTEGER NOT NULL DEFAULT 0,
        stories_per_week INTEGER NOT NULL DEFAULT 0,
        updated_at       INTEGER NOT NULL,
        FOREIGN KEY (page_id) REFERENCES facebook_page(page_id) ON DELETE CASCADE
      )`,

      `CREATE TABLE IF NOT EXISTS app_setting (
        k TEXT NOT NULL PRIMARY KEY,
        v TEXT NULL
      )`,
    ],
  },
  {
    // dashboard_hidden=1 → la riga resta nel DB e su FB/IG, ma NON compare più nelle liste
    // della Dashboard. Serve a "togliere dalla vista" un post già pubblicato senza eliminarlo.
    version: 2,
    statements: [
      `ALTER TABLE scheduled_post ADD COLUMN dashboard_hidden INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    // Istruzioni-extra per-libro: testo libero accodato ai prompt POST/IMMAGINE di quel libro.
    version: 3,
    statements: [
      `ALTER TABLE book ADD COLUMN text_extra_instructions  TEXT NULL`,
      `ALTER TABLE book ADD COLUMN image_extra_instructions TEXT NULL`,
    ],
  },
  {
    // Seed di generazione delle immagini scena: consente di riprodurre la stessa immagine.
    version: 4,
    statements: [`ALTER TABLE media_asset ADD COLUMN gen_seed INTEGER NULL`],
  },
  {
    // Comprensione narrativa persistente del capitolo, base per i post: una card per capitolo.
    version: 5,
    statements: [
      `CREATE TABLE IF NOT EXISTS chapter_marketing_card (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id        INTEGER NOT NULL,
        chapter_index  INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        spoiler_level  TEXT    NULL,
        card_json      TEXT    NOT NULL,
        model          TEXT    NULL,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_marketing_card_book_chapter ON chapter_marketing_card(book_id, chapter_index)`,
    ],
  },
  {
    // Angolo di marketing usato da un contenuto: abilita la rotazione LRU degli angoli per capitolo.
    version: 6,
    statements: [`ALTER TABLE content_usage ADD COLUMN angle_key TEXT NULL`],
  },
  {
    version: 7,
    statements: [
      `ALTER TABLE book_character ADD COLUMN age       TEXT NULL`,
      `ALTER TABLE book_character ADD COLUMN ethnicity TEXT NULL`,
    ],
  },
  {
    version: 8,
    statements: [
      `CREATE TABLE IF NOT EXISTS app_auth (
         id            INTEGER PRIMARY KEY,
         username      TEXT    NOT NULL DEFAULT 'admin',
         password_hash TEXT    NOT NULL,
         must_change   INTEGER NOT NULL DEFAULT 1,
         updated_at    INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS app_session (
         token      TEXT    NOT NULL PRIMARY KEY,
         created_at INTEGER NOT NULL,
         expires_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS ix_session_expires ON app_session(expires_at)`,
    ],
  },
  {
    version: 9,
    statements: [
      `CREATE TABLE IF NOT EXISTS visual_directive (
         id         INTEGER PRIMARY KEY AUTOINCREMENT,
         book_id    INTEGER NOT NULL,
         title      TEXT    NOT NULL,
         triggers   TEXT    NULL,
         intent     TEXT    NULL,
         body       TEXT    NULL,
         body_en    TEXT    NULL,
         enabled    INTEGER NOT NULL DEFAULT 1,
         sort_order INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
       )`,
      `CREATE INDEX IF NOT EXISTS ix_visual_directive_book ON visual_directive(book_id)`,
    ],
  },
  {
    version: 10,
    statements: [`ALTER TABLE book_character ADD COLUMN temporal_presence TEXT NULL`],
  },
  {
    version: 11,
    statements: [
      `ALTER TABLE book_character ADD COLUMN temporal_presence_locked INTEGER NOT NULL DEFAULT 0`,
    ],
  },
];

async function currentVersion(): Promise<number> {
  const [row] = await query<{ v: number }>(
    "SELECT COALESCE(MAX(version), 0) AS v FROM schema_version",
  );
  return Number(row?.v ?? 0);
}

export async function runMigrations(): Promise<number> {
  pool.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (
       version    INTEGER NOT NULL PRIMARY KEY,
       applied_at INTEGER NOT NULL
     )`,
  );

  let applied = 0;
  const current = await currentVersion();
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    pool.exec("BEGIN");
    try {
      for (const stmt of m.statements) {
        pool.exec(stmt);
      }
      await execute("INSERT INTO schema_version(version, applied_at) VALUES (?, ?)", [
        m.version,
        Date.now(),
      ]);
      pool.exec("COMMIT");
      applied++;
      // eslint-disable-next-line no-console
      console.log(`[migrate] applied v${m.version}`);
    } catch (e) {
      try {
        pool.exec("ROLLBACK");
      } catch {
        // ignore rollback failure
      }
      throw e;
    }
  }
  return applied;
}
