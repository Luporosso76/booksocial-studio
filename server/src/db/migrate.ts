import { pool, query, execute } from "./pool.js";

// Migrazioni SQLite (better-sqlite3). Convenzioni dello schema:
//  - id INTEGER PRIMARY KEY AUTOINCREMENT
//  - tipi: testo -> TEXT ; interi -> INTEGER ; decimali -> REAL ; i DEFAULT restano
//  - indici/UNIQUE: estratti in CREATE [UNIQUE] INDEX separati DOPO la CREATE TABLE
//  - FOREIGN KEY: inline (SQLite con foreign_keys=ON)
//  - timestamps come INTEGER epoch ms
// Ogni migrazione = array di statement applicati in una singola transazione, registrato in
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
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        title         TEXT    NOT NULL,
        author        TEXT    NULL,
        language      TEXT    NOT NULL DEFAULT 'it',
        source_path   TEXT    NOT NULL,
        content_hash  TEXT    NOT NULL,
        chapter_count INTEGER NOT NULL DEFAULT 0,
        char_count    INTEGER NOT NULL DEFAULT 0,
        imported_at   INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS ux_book_source ON book(source_path)`,

      `CREATE TABLE IF NOT EXISTS book_chapter (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id    INTEGER NOT NULL,
        idx        INTEGER NOT NULL,
        title      TEXT    NULL,
        text       TEXT    NOT NULL,
        char_count INTEGER NOT NULL,
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

      `CREATE TABLE IF NOT EXISTS scheduled_post (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id         TEXT    NOT NULL,
        book_id         INTEGER NULL,
        generation_id   INTEGER NULL,
        message         TEXT    NOT NULL,
        hashtags        TEXT    NULL,
        media_type      TEXT    NOT NULL DEFAULT 'TEXT',
        link            TEXT    NULL,
        media_path      TEXT    NULL,
        scheduled_at    INTEGER NOT NULL,
        status          TEXT    NOT NULL DEFAULT 'DRAFT',
        fb_post_id      TEXT    NULL,
        attempts        INTEGER NOT NULL DEFAULT 0,
        last_error      TEXT    NULL,
        idempotency_key TEXT    NOT NULL,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
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
    ],
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS book_link (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id    INTEGER NOT NULL,
        channel    TEXT    NOT NULL,
        label      TEXT    NULL,
        url        TEXT    NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_link_book ON book_link(book_id)`,

      `CREATE TABLE IF NOT EXISTS media_asset (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id    INTEGER NOT NULL,
        chapter_id INTEGER NULL,
        scope      TEXT    NOT NULL DEFAULT 'GENERAL',
        path       TEXT    NOT NULL,
        caption    TEXT    NULL,
        added_at   INTEGER NOT NULL,
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
        FOREIGN KEY (page_id) REFERENCES facebook_page(page_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_slot_page ON posting_slot(page_id)`,

      // SQLite: un solo ADD COLUMN per statement.
      `ALTER TABLE scheduled_post ADD COLUMN scheduled_publish_time INTEGER NULL`,
      `ALTER TABLE scheduled_post ADD COLUMN published_at_actual    INTEGER NULL`,
      `ALTER TABLE scheduled_post ADD COLUMN reach        INTEGER NULL`,
      `ALTER TABLE scheduled_post ADD COLUMN impressions  INTEGER NULL`,
      `ALTER TABLE scheduled_post ADD COLUMN engagement   INTEGER NULL`,
      `ALTER TABLE scheduled_post ADD COLUMN last_checked INTEGER NULL`,

      `ALTER TABLE book ADD COLUMN website_url TEXT NULL`,
      `ALTER TABLE book ADD COLUMN notes       TEXT NULL`,
    ],
  },
  {
    version: 3,
    statements: [`ALTER TABLE book ADD COLUMN base_hashtags TEXT NULL`],
  },
  {
    version: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS book_character (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id     INTEGER NOT NULL,
        name        TEXT    NOT NULL,
        role        TEXT    NULL,
        occupation  TEXT    NULL,
        personality TEXT    NULL,
        physical    TEXT    NULL,
        notes       TEXT    NULL,
        source      TEXT    NOT NULL DEFAULT 'AI',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS ix_char_book ON book_character(book_id)`,
    ],
  },
  {
    // V5: pre-pass NLP. Citazioni/dialoghi REALI estratti dai capitoli + metriche
    // di menzione sui personaggi (popolati solo se il pre-pass spaCy e' disponibile).
    version: 5,
    statements: [
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

      `ALTER TABLE book_character ADD COLUMN mentions INTEGER NULL`,
      `ALTER TABLE book_character ADD COLUMN chapters TEXT    NULL`,
    ],
  },
  {
    // V6: coda render in-process. L'IA-regista produce uno SPEC JSON; il renderer
    // (Satori/Remotion) lo esegue e salva il file. Nessuna pubblicazione automatica:
    // l'asset resta attaccato alla bozza.
    version: 6,
    statements: [
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
    ],
  },
  {
    // V7: varietà + orari variabili + storie + musica.
    //  - posting_slot diventa giorno + FASCIA (time_start/time_end); time_of_day resta
    //    come fallback (centro fascia). La generazione varia l'orario nella fascia.
    //  - scheduled_post ricorda il formato scelto (content_format JSON) e la musica (music_id).
    //  - music_track: libreria musicale globale (upload utente), montata sui reel/storie.
    //  - content_usage: registro d'uso (memoria del motore di varietà + statistiche).
    version: 7,
    statements: [
      `ALTER TABLE posting_slot ADD COLUMN time_start TEXT NULL`,
      `ALTER TABLE posting_slot ADD COLUMN time_end   TEXT NULL`,

      `ALTER TABLE scheduled_post ADD COLUMN music_id       INTEGER NULL`,
      `ALTER TABLE scheduled_post ADD COLUMN content_format TEXT    NULL`,

      `CREATE TABLE IF NOT EXISTS music_track (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        title        TEXT    NOT NULL,
        path         TEXT    NOT NULL,
        duration_sec REAL    NULL,
        mood         TEXT    NULL,
        added_at     INTEGER NOT NULL
      )`,

      // La FK scheduled_post.music_id -> music_track non è enforced: SQLite NON supporta ADD
      // CONSTRAINT su una tabella esistente (richiederebbe il rebuild della tabella). La colonna
      // music_id resta INTEGER NULL senza FK enforced: questa singola FK viene OMESSA per non
      // ricostruire scheduled_post. La semantica applicativa è
      // identica (ON DELETE SET NULL gestito a livello logico/app).

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
        FOREIGN KEY (page_id) REFERENCES facebook_page(page_id) ON DELETE CASCADE,
        FOREIGN KEY (post_id) REFERENCES scheduled_post(id) ON DELETE SET NULL,
        FOREIGN KEY (music_id) REFERENCES music_track(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS ix_usage_page ON content_usage(page_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS ix_usage_book ON content_usage(book_id)`,
    ],
  },
  {
    // V8: traccia il capitolo-sorgente di ogni contenuto (per variare i capitoli da cui
    // idea-extractor pesca le idee) e tipizza i link con una regola d'uso nei post.
    version: 8,
    statements: [
      `ALTER TABLE content_usage ADD COLUMN chapter_index INTEGER NULL`,

      // usage_policy: come usare il link nei post — always (sempre) | sometimes (a volte)
      //   | sales (solo post orientati alla vendita) | manual (mai automatico). NULL = non impostato.
      `ALTER TABLE book_link ADD COLUMN usage_policy TEXT NULL`,
    ],
  },
  {
    // V9: pianificazione a QUOTE. L'utente imposta solo quante pubblicazioni vuole a
    // settimana (post/reel/storie); lo scheduler decide automaticamente giorni, orari
    // (dentro le finestre = posting_slot) e formati. Una riga per pagina.
    version: 9,
    statements: [
      `CREATE TABLE IF NOT EXISTS weekly_plan (
        page_id          TEXT    NOT NULL PRIMARY KEY,
        posts_per_week   INTEGER NOT NULL DEFAULT 0,
        reels_per_week   INTEGER NOT NULL DEFAULT 0,
        stories_per_week INTEGER NOT NULL DEFAULT 0,
        updated_at       INTEGER NOT NULL,
        FOREIGN KEY (page_id) REFERENCES facebook_page(page_id) ON DELETE CASCADE
      )`,
    ],
  },
  {
    // V10: musica PER-LIBRO. La libreria musicale diventa specifica del libro (come le
    // immagini): il motore di varietà sceglie le tracce del libro. book_id NULL = traccia
    // globale (usabile da tutti i libri).
    // NOTA: la FK music_track.book_id -> book non è enforced: SQLite NON supporta ADD CONSTRAINT
    // su tabella esistente, quindi la colonna viene aggiunta senza FK enforced (semantica app
    // invariata). ON DELETE CASCADE gestito a livello logico.
    version: 10,
    statements: [`ALTER TABLE music_track ADD COLUMN book_id INTEGER NULL`],
  },
  {
    // V11: rimossa la regola d'uso link "sales" (post di vendita non definiti): i link con
    // policy 'sales' diventano 'sometimes' (compaiono a volte nei post, varietà).
    version: 11,
    statements: [`UPDATE book_link SET usage_policy='sometimes' WHERE usage_policy='sales'`],
  },
  {
    // V12: tabella key-value per le impostazioni globali (es. modalità immagini AI).
    version: 12,
    statements: [
      `CREATE TABLE IF NOT EXISTS app_setting (
         k TEXT NOT NULL PRIMARY KEY,
         v TEXT NULL
       )`,
    ],
  },
  {
    // V13: prompt dei visual generati in un campo DEDICATO (non nella caption user-facing,
    // che rischierebbe di comparire nei post/libreria). Backfill dalle caption "scene … · …"
    // prendendo la parte DOPO ' · ' con substr(caption, instr(caption, ' · ') + 3). Le caption
    // "scene …·…" hanno un solo ' · ' (formato "scene <n> · <prompt>"), quindi instr (prima
    // occorrenza) basta.
    version: 13,
    statements: [
      `ALTER TABLE media_asset ADD COLUMN gen_prompt TEXT NULL`,
      `UPDATE media_asset
         SET gen_prompt = substr(caption, instr(caption, ' · ') + 3), caption = NULL
         WHERE caption LIKE 'scene %·%'`,
    ],
  },
  {
    // V14: CATALOGAZIONE delle immagini generate — capitolo di riferimento + tag (soggetto/mood/
    // personaggi), per scegliere l'immagine GIUSTA per un post invece che a caso. tags = lista
    // separata da virgole (lowercase).
    version: 14,
    statements: [
      `ALTER TABLE media_asset ADD COLUMN chapter_idx INTEGER NULL`,
      `ALTER TABLE media_asset ADD COLUMN tags        TEXT    NULL`,
    ],
  },
  {
    // V15: SCHEDA VISIVA per capitolo (estratta on-demand dal testo, in cache). Ambiente/luogo,
    // oggetti principali/secondari e personaggi presenti: serve a FONDARE il prompt immagine
    // (soggetto iconico + ambientazione + vestiti coerenti) invece di farlo indovinare al modello.
    // JSON: { location, environment, main_objects[], secondary_objects[], characters[], source, model, updatedAt }.
    version: 15,
    statements: [`ALTER TABLE book_chapter ADD COLUMN scene_json TEXT NULL`],
  },
  {
    // V16: PATH RELATIVI. Il codice salva/legge i path RELATIVI a dataDir() (vedi paths.ts
    // resolveDataPath/toDataRelative), così i dati sono ricollocabili. Le nuove installazioni
    // scrivono già path relativi dall'inizio, quindi questa versione non ha nulla da fare ed è
    // mantenuta solo per preservare la numerazione delle migrazioni.
    version: 16,
    statements: [],
  },
  {
    // V17: configurazione VISIVA per-libro. visual_domains = CSV dei moduli-dominio del prompt immagine
    // attivi per il libro (es. "sea_windsurf", "red_door"); visual_directives = direttive d'arte libere
    // per-libro iniettate nel prompt. Servono a SCOPPIARE i blocchi specifici per libro (niente windsurf
    // nel libro della porta rossa, ecc.) invece di applicarli a TUTTI i libri. Vedi content/imageDomains.ts.
    version: 17,
    statements: [
      `ALTER TABLE book ADD COLUMN visual_domains    TEXT NULL`,
      `ALTER TABLE book ADD COLUMN visual_directives TEXT NULL`,
    ],
  },
  {
    // V18: traduzione EN delle direttive d'arte. L'utente scrive `visual_directives` in italiano
    // (mostrato/editabile in UI); al salvataggio le traduciamo una volta in inglese e mettiamo qui la
    // versione che entra DAVVERO nel prompt immagine (il modello rende meglio in inglese).
    version: 18,
    statements: [`ALTER TABLE book ADD COLUMN visual_directives_en TEXT NULL`],
  },
  {
    // V19: ABBIGLIAMENTO CANONICO per personaggio. JSON { default, contexts:[{when,outfit}] }: un
    // abito di default + abiti per contesto che scattano sul match keyword con la scheda del capitolo,
    // cosi' un personaggio veste sempre uguale nella stessa scena ricorrente. Vedi domain CharacterOutfits.
    version: 19,
    statements: [`ALTER TABLE book_character ADD COLUMN outfits_json TEXT NULL`],
  },
  {
    // V20: OGGETTI/VEICOLI ricorrenti canonici + fatti del mondo (lato guida). JSON
    // { props:[{name,when,description,owner}], drivingSide, country }: oggetti resi sempre uguali e
    // attivati per match keyword sulla scheda del capitolo. Vedi domain BookVisualProps.
    version: 20,
    statements: [`ALTER TABLE book ADD COLUMN visual_props_json TEXT NULL`],
  },
  {
    // V21: PERSONAGGI MINORI/incidentali con un look canonico. JSON { minors:[{label,when,appearance,
    // outfit}] }: figure secondarie senza nome (spesso) rese sempre uguali e attivate per match keyword
    // sulla scheda del capitolo. Vedi domain BookVisualExtras.
    version: 21,
    statements: [`ALTER TABLE book ADD COLUMN visual_extras_json TEXT NULL`],
  },
  {
    // V22: QUALITY CHECK visivo. Dopo aver generato un'immagine, un modello multimodale la GUARDA e
    // segnala i problemi (testo/scritte, anatomia, nudità, gi/karate fuori contesto, collage, soggetto
    // assente/sbagliato). Verdetto in JSON { ok, issues[] }; NULL = non eseguito. Vedi content/visionCheck.ts.
    version: 22,
    statements: [`ALTER TABLE media_asset ADD COLUMN qa_json TEXT NULL`],
  },
  {
    // V23: ESCLUSIONE capitoli dalla generazione immagini. excluded=1 → il capitolo NON entra nel
    // pool di selezione (anti-frontespizio + toggle manuale). Auto-default: i capitoli con testo
    // cortissimo (< 200 char, tipicamente il frontespizio titolo+autore) nascono esclusi.
    version: 23,
    statements: [
      `ALTER TABLE book_chapter ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0`,
      `UPDATE book_chapter SET excluded=1 WHERE char_count < 200`,
    ],
  },
  {
    // V24: PUBBLICAZIONE INSTAGRAM (Reel/Storie 9:16) come JOB LOCALE separato, legato all'item
    // Facebook ma indipendente. Instagram NON ha programmazione nativa: ogni contenuto IG è una
    // riga scheduled_post con platform='instagram' che il publishScheduler interno pubblica al
    // suo orario (server acceso). Il flusso Facebook resta INVARIATO (platform default 'facebook').
    //  - facebook_page.ig_user_id: l'instagram_business_account.id della Pagina (cache, NULL = non risolto).
    //  - scheduled_post.platform: 'facebook' (default, comportamento attuale) | 'instagram'.
    //  - scheduled_post.linked_post_id: per le righe IG, id dell'item FB gemello (se esiste).
    //  - scheduled_post.ig_media_id: id del media IG dopo la pubblicazione.
    version: 24,
    statements: [
      `ALTER TABLE facebook_page ADD COLUMN ig_user_id TEXT NULL`,
      `ALTER TABLE scheduled_post ADD COLUMN platform TEXT NOT NULL DEFAULT 'facebook'`,
      `ALTER TABLE scheduled_post ADD COLUMN linked_post_id INTEGER NULL`,
      `ALTER TABLE scheduled_post ADD COLUMN ig_media_id TEXT NULL`,
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
      console.log(`[migrate] applied V${m.version}`);
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
