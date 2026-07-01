import { execute, query, withTransaction, type Row } from "./pool.js";
import { resolveDataPath, toDataRelative, toDataRelativeStrict } from "../paths.js";
import { stripMdEscapes } from "../textEscapes.js";
import {
  CURRENT_PROMPT_VERSION,
  type Book,
  type BookChapter,
  type ChapterScene,
  type ChapterMoment,
  type BookCharacter,
  type BookQuote,
  type QuoteKind,
  type CharacterSource,
  type CharacterOutfit,
  type CharacterOutfits,
  type BookVisualProps,
  type DrivingSide,
  type MinorCharacter,
  type BookVisualExtras,
  type BookLink,
  type BookProfile,
  type ContentUsage,
  type FacebookPage,
  type ChapterMarketingCard,
  type ChapterMarketingCardData,
  type FormatAspect,
  type GenerationRecord,
  type MediaAsset,
  type MediaUsage,
  type MediaType,
  type MusicTrack,
  type MusicUsage,
  type RenderJob,
  type RenderStatus,
  type SceneQa,
  type PostStatus,
  type PostingSlot,
  type ScheduledPost,
  type WeeklyPlan,
  type TextMode,
  type VisualContent,
  type VisualDirective,
  type VisualKindChoice,
} from "../domain.js";

function mapBook(r: Row): Book {
  return {
    id: Number(r.id),
    title: r.title as string,
    author: (r.author as string | null) ?? null,
    language: r.language as string,
    sourcePath: resolveDataPath(r.source_path as string),
    contentHash: r.content_hash as string,
    chapterCount: Number(r.chapter_count),
    charCount: Number(r.char_count),
    importedAt: Number(r.imported_at),
    updatedAt: Number(r.updated_at),
    websiteUrl: (r.website_url as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    baseHashtags: (r.base_hashtags as string | null) ?? null,
    visualDomains: ((r.visual_domains as string | null) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    visualDirectives: (r.visual_directives as string | null) ?? null,
    visualDirectivesEn: (r.visual_directives_en as string | null) ?? null,
    visualProps: parseVisualProps(r.visual_props_json as string | null),
    visualExtras: parseVisualExtras(r.visual_extras_json as string | null),
    textExtraInstructions: (r.text_extra_instructions as string | null) ?? null,
    imageExtraInstructions: (r.image_extra_instructions as string | null) ?? null,
  };
}

function mapProfile(r: Row): BookProfile {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    synopsisShort: (r.synopsis_short as string | null) ?? null,
    synopsisLong: (r.synopsis_long as string | null) ?? null,
    genres: (r.genres as string | null) ?? null,
    tone: (r.tone as string | null) ?? null,
    targetAudience: (r.target_audience as string | null) ?? null,
    analysisJson: r.analysis_json as string,
    sourceContentHash: r.source_content_hash as string,
    promptVersion: Number(r.prompt_version),
    model: (r.model as string | null) ?? null,
    createdAt: Number(r.created_at),
  };
}

function parseChapterScene(raw: unknown): ChapterScene | null {
  if (raw == null) return null;
  let o: Record<string, unknown>;
  try {
    o = (typeof raw === "string" ? JSON.parse(raw) : raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (o == null || typeof o !== "object") return null;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter((x) => x.length > 0) : [];
  const str = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  const parseAges = (v: unknown): { name: string; age: number }[] => {
    if (!Array.isArray(v)) return [];
    const out: { name: string; age: number }[] = [];
    for (const x of v) {
      if (x == null || typeof x !== "object") continue;
      const a = x as Record<string, unknown>;
      const name = String(a.name ?? "").trim();
      const age = Number(a.age);
      if (name !== "" && Number.isFinite(age) && age > 0) out.push({ name, age: Math.round(age) });
    }
    return out;
  };
  const parseAltMoments = (v: unknown): ChapterMoment[] => {
    if (!Array.isArray(v)) return [];
    const out: ChapterMoment[] = [];
    for (const x of v) {
      if (x == null || typeof x !== "object") continue;
      const m = x as Record<string, unknown>;
      const type =
        m.type === "dream" || m.type === "flashback"
          ? m.type
          : m.type === "memory"
            ? "flashback"
            : null;
      const km = str(m.keyMoment);
      if (!type || !km) continue;
      const yy = Number(m.youngerYears);
      out.push({
        type,
        location: str(m.location),
        environment: str(m.environment),
        mainObjects: strArr(m.mainObjects),
        secondaryObjects: strArr(m.secondaryObjects),
        characters: strArr(m.characters),
        physicsRules: strArr(m.physicsRules),
        keyMoment: km,
        whose: str(m.whose),
        youngerYears: Number.isFinite(yy) && yy > 0 ? yy : null,
        characterAges: parseAges(m.characterAges),
      });
    }
    return out;
  };
  return {
    location: str(o.location),
    environment: str(o.environment),
    mainObjects: strArr(o.mainObjects),
    secondaryObjects: strArr(o.secondaryObjects),
    characters: strArr(o.characters),

    pov: str(o.pov),

    physicsRules: strArr(o.physicsRules),

    keyMoment: str(o.keyMoment),

    kind: o.kind === "dream" || o.kind === "flashback" ? o.kind : "waking",
    youngerYears:
      Number.isFinite(Number(o.youngerYears)) && Number(o.youngerYears) > 0
        ? Number(o.youngerYears)
        : null,
    characterAges: parseAges(o.characterAges),

    altMoments: parseAltMoments(o.altMoments),
    source: o.source === "USER" ? "USER" : "AI",
    model: str(o.model),

    promptVersion: Number.isFinite(Number(o.promptVersion)) ? Number(o.promptVersion) : undefined,
    sourceHash:
      typeof o.sourceHash === "string" && o.sourceHash.trim() !== "" ? o.sourceHash : undefined,
    updatedAt: Number.isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : 0,
  };
}

function mapChapter(r: Row): BookChapter {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    index: Number(r.idx),
    title: (r.title as string | null) ?? null,
    text: r.text as string,
    charCount: Number(r.char_count),
    excluded: Number(r.excluded ?? 0) === 1,
    scene: parseChapterScene(r.scene_json),
  };
}

function serializeVisualProps(v: BookVisualProps | null | undefined): string | null {
  if (!v) return null;
  const props = (v.props ?? []).filter((p) => p.name.trim() !== "" && p.description.trim() !== "");
  if (props.length === 0 && !v.drivingSide && !v.country) return null;
  return JSON.stringify({
    props: props.map((p) => ({
      name: p.name.trim(),
      when: (p.when ?? "").trim(),
      description: p.description.trim(),
      owner: p.owner && p.owner.trim() !== "" ? p.owner.trim() : null,
    })),
    drivingSide: v.drivingSide ?? null,
    country: v.country && v.country.trim() !== "" ? v.country.trim() : null,
  });
}

function parseVisualProps(raw: string | null): BookVisualProps {
  const empty: BookVisualProps = { props: [], drivingSide: null, country: null };
  if (!raw || raw.trim() === "") return empty;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const props = Array.isArray(o.props)
      ? (o.props as unknown[])
          .map((p) => {
            const x = (p ?? {}) as Record<string, unknown>;
            return {
              name: typeof x.name === "string" ? x.name.trim() : "",
              when: typeof x.when === "string" ? x.when.trim() : "",
              description: typeof x.description === "string" ? x.description.trim() : "",
              owner: typeof x.owner === "string" && x.owner.trim() !== "" ? x.owner.trim() : null,
            };
          })
          .filter((p) => p.name !== "" && p.description !== "")
      : [];
    const drivingSide: DrivingSide | null =
      o.drivingSide === "left" || o.drivingSide === "right" ? o.drivingSide : null;
    const country =
      typeof o.country === "string" && o.country.trim() !== "" ? o.country.trim() : null;
    return { props, drivingSide, country };
  } catch {
    return empty;
  }
}

function serializeVisualExtras(v: BookVisualExtras | null | undefined): string | null {
  if (!v) return null;
  const minors = (v.minors ?? []).filter(
    (m) => m.label.trim() !== "" && m.appearance.trim() !== "",
  );
  if (minors.length === 0) return null;
  return JSON.stringify({
    minors: minors.map(
      (m): MinorCharacter => ({
        label: m.label.trim(),
        when: (m.when ?? "").trim(),
        appearance: m.appearance.trim(),
        outfit: m.outfit && m.outfit.trim() !== "" ? m.outfit.trim() : null,
      }),
    ),
  });
}

function parseVisualExtras(raw: string | null): BookVisualExtras {
  const empty: BookVisualExtras = { minors: [] };
  if (!raw || raw.trim() === "") return empty;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const minors = Array.isArray(o.minors)
      ? (o.minors as unknown[])
          .map((m) => {
            const x = (m ?? {}) as Record<string, unknown>;
            return {
              label: typeof x.label === "string" ? x.label.trim() : "",
              when: typeof x.when === "string" ? x.when.trim() : "",
              appearance: typeof x.appearance === "string" ? x.appearance.trim() : "",
              outfit:
                typeof x.outfit === "string" && x.outfit.trim() !== "" ? x.outfit.trim() : null,
            };
          })
          .filter((m) => m.label !== "" && m.appearance !== "")
      : [];
    return { minors };
  } catch {
    return empty;
  }
}

function mapCharacter(r: Row): BookCharacter {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    name: r.name as string,
    role: (r.role as string | null) ?? null,
    occupation: (r.occupation as string | null) ?? null,
    personality: (r.personality as string | null) ?? null,
    physical: (r.physical as string | null) ?? null,
    age: (r.age as string | null) ?? null,
    ethnicity: (r.ethnicity as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    source: (r.source as CharacterSource) ?? "AI",
    sortOrder: Number(r.sort_order),
    mentions: r.mentions == null ? null : Number(r.mentions),
    chapters:
      typeof r.chapters === "string" && r.chapters.trim() !== ""
        ? r.chapters
            .split(",")
            .map((x) => Number(x.trim()))
            .filter((x) => Number.isFinite(x))
        : [],
    outfits: parseOutfits(r.outfits_json as string | null),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function serializeOutfits(o: CharacterOutfits | null | undefined): string | null {
  if (!o) return null;
  const def = (o.default ?? "").trim();
  const sig = (o.signature ?? "").trim();
  const contexts = (o.contexts ?? []).filter((x) => x.when.trim() !== "" && x.outfit.trim() !== "");
  if (def === "" && sig === "" && contexts.length === 0) return null;
  return JSON.stringify({
    default: def === "" ? null : def,
    contexts,
    signature: sig === "" ? null : sig,
  });
}

function parseOutfits(raw: string | null): CharacterOutfits {
  if (!raw || raw.trim() === "") return { default: null, contexts: [], signature: null };
  try {
    const o = JSON.parse(raw) as Partial<CharacterOutfits>;
    const def = typeof o.default === "string" && o.default.trim() !== "" ? o.default : null;
    const sig =
      typeof o.signature === "string" && o.signature.trim() !== "" ? o.signature.trim() : null;
    const contexts = Array.isArray(o.contexts)
      ? o.contexts
          .filter(
            (x): x is CharacterOutfit =>
              !!x && typeof x.when === "string" && typeof x.outfit === "string",
          )
          .map((x) => ({ when: x.when.trim(), outfit: x.outfit.trim() }))
          .filter((x) => x.when !== "" && x.outfit !== "")
      : [];
    return { default: def, contexts, signature: sig };
  } catch {
    return { default: null, contexts: [], signature: null };
  }
}

function mapQuote(r: Row): BookQuote {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    chapterId: r.chapter_id == null ? null : Number(r.chapter_id),
    text: r.text as string,
    kind: (r.kind as QuoteKind) ?? "quote",
    speaker: (r.speaker as string | null) ?? null,
    score: Number(r.score),
    createdAt: Number(r.created_at),
  };
}

function mapRenderJob(r: Row): RenderJob {
  return {
    id: Number(r.id),
    postId: r.post_id == null ? null : Number(r.post_id),
    bookId: r.book_id == null ? null : Number(r.book_id),
    kind: r.kind as string,
    status: r.status as RenderStatus,
    specJson: r.spec_json as string,
    outputPath: r.output_path == null ? null : resolveDataPath(r.output_path as string),
    error: (r.error as string | null) ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function mapPage(r: Row): FacebookPage {
  return {
    pageId: r.page_id as string,
    name: r.name as string,
    category: (r.category as string | null) ?? null,
    tokenSecretKey: r.token_secret_key as string,
    bookId: r.book_id == null ? null : Number(r.book_id),
    addedAt: Number(r.added_at),
    igUserId: (r.ig_user_id as string | null) ?? null,
  };
}

function mapLink(r: Row): BookLink {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    channel: r.channel as string,
    label: (r.label as string | null) ?? null,
    url: r.url as string,
    isDefault: Number(r.is_default) === 1,
    usagePolicy: (r.usage_policy as BookLink["usagePolicy"]) ?? null,
  };
}

function mapMedia(r: Row): MediaAsset {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    chapterId: r.chapter_id == null ? null : Number(r.chapter_id),
    scope: r.scope as string,
    path: resolveDataPath(r.path as string),
    caption: (r.caption as string | null) ?? null,
    genPrompt: (r.gen_prompt as string | null) ?? null,
    chapterIdx: r.chapter_idx == null ? null : Number(r.chapter_idx),
    tags:
      typeof r.tags === "string" && r.tags.trim() !== ""
        ? r.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    qa: parseQa(r.qa_json),
    seed: r.gen_seed == null ? null : Number(r.gen_seed),
    addedAt: Number(r.added_at),
  };
}

function parseQa(raw: unknown): SceneQa | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const parsed = JSON.parse(raw) as { ok?: unknown; issues?: unknown };
    if (parsed == null || typeof parsed !== "object") return null;
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter((i): i is string => typeof i === "string")
      : [];
    return { ok: parsed.ok === true, issues };
  } catch {
    return null;
  }
}

function mapSlot(r: Row): PostingSlot {
  return {
    id: Number(r.id),
    pageId: r.page_id as string,
    dayOfWeek: Number(r.day_of_week),
    timeOfDay: r.time_of_day as string,
    timeStart: (r.time_start as string | null) ?? null,
    timeEnd: (r.time_end as string | null) ?? null,
    mediaType: r.media_type as MediaType,
    enabled: Number(r.enabled) === 1,
  };
}

function mapPost(r: Row): ScheduledPost {
  return {
    id: Number(r.id),
    pageId: r.page_id as string,
    bookId: r.book_id == null ? null : Number(r.book_id),
    generationId: r.generation_id == null ? null : Number(r.generation_id),
    message: r.message as string,
    hashtags: (r.hashtags as string | null) ?? null,
    mediaType: r.media_type as MediaType,
    link: (r.link as string | null) ?? null,
    mediaPath: r.media_path == null ? null : resolveDataPath(r.media_path as string),
    scheduledAt: Number(r.scheduled_at),
    status: r.status as PostStatus,
    fbPostId: (r.fb_post_id as string | null) ?? null,
    attempts: Number(r.attempts),
    lastError: (r.last_error as string | null) ?? null,
    idempotencyKey: r.idempotency_key as string,
    musicId: r.music_id == null ? null : Number(r.music_id),
    contentFormat: (r.content_format as string | null) ?? null,
    platform: r.platform === "instagram" ? "instagram" : "facebook",
    linkedPostId: r.linked_post_id == null ? null : Number(r.linked_post_id),
    igMediaId: (r.ig_media_id as string | null) ?? null,
    dashboardHidden: Number(r.dashboard_hidden ?? 0) === 1,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

function mapMusic(r: Row): MusicTrack {
  return {
    id: Number(r.id),
    bookId: r.book_id == null ? null : Number(r.book_id),
    title: r.title as string,
    path: resolveDataPath(r.path as string),
    durationSec: r.duration_sec == null ? null : Number(r.duration_sec),
    mood: (r.mood as string | null) ?? null,
    addedAt: Number(r.added_at),
  };
}

function mapUsage(r: Row): ContentUsage {
  let imageIds: number[] = [];
  if (typeof r.image_ids === "string" && r.image_ids.trim() !== "") {
    try {
      const arr = JSON.parse(r.image_ids) as unknown;
      if (Array.isArray(arr))
        imageIds = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    } catch {
      imageIds = [];
    }
  }
  return {
    id: Number(r.id),
    pageId: r.page_id as string,
    bookId: r.book_id == null ? null : Number(r.book_id),
    postId: r.post_id == null ? null : Number(r.post_id),
    textMode: r.text_mode as TextMode,
    visualKind: r.visual_kind as VisualKindChoice,
    visualContent: r.visual_content as VisualContent,
    aspect: (r.aspect as FormatAspect | null) ?? null,
    imageIds,
    quoteKey: (r.quote_key as string | null) ?? null,
    musicId: r.music_id == null ? null : Number(r.music_id),
    chapterIndex: r.chapter_index == null ? null : Number(r.chapter_index),
    angleKey: (r.angle_key as string | null) ?? null,
    createdAt: Number(r.created_at),
  };
}

export const books = {
  async all(): Promise<Book[]> {
    const rows = await query("SELECT * FROM book ORDER BY title");
    return rows.map(mapBook);
  },

  async get(id: number): Promise<Book | null> {
    const rows = await query("SELECT * FROM book WHERE id = ?", [id]);
    return rows.length ? mapBook(rows[0]) : null;
  },

  async findByPath(path: string): Promise<Book | null> {
    const rows = await query("SELECT * FROM book WHERE source_path = ?", [toDataRelative(path)]);
    return rows.length ? mapBook(rows[0]) : null;
  },

  async insert(b: Omit<Book, "id">): Promise<Book> {
    const r = await execute(
      `INSERT INTO book(title, author, language, source_path, content_hash,
                        chapter_count, char_count, imported_at, updated_at, base_hashtags)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        b.title,
        b.author,
        b.language,
        toDataRelativeStrict(b.sourcePath),
        b.contentHash,
        b.chapterCount,
        b.charCount,
        b.importedAt,
        b.updatedAt,
        b.baseHashtags,
      ],
    );
    const created = await this.get(r.insertId);
    if (!created) throw new Error("insert book: row missing");
    return created;
  },

  async updateContent(
    id: number,
    contentHash: string,
    chapterCount: number,
    charCount: number,
    updatedAt: number,
  ): Promise<void> {
    await execute(
      "UPDATE book SET content_hash=?, chapter_count=?, char_count=?, updated_at=? WHERE id=?",
      [contentHash, chapterCount, charCount, updatedAt, id],
    );
  },

  async rename(id: number, title: string): Promise<void> {
    await execute("UPDATE book SET title=?, updated_at=? WHERE id=?", [title, Date.now(), id]);
  },

  async delete(id: number): Promise<void> {
    await execute("DELETE FROM book WHERE id=?", [id]);
  },

  async getBaseHashtags(id: number): Promise<string> {
    const rows = await query<{ base_hashtags: string | null }>(
      "SELECT base_hashtags FROM book WHERE id=?",
      [id],
    );
    return rows.length ? (rows[0].base_hashtags ?? "") : "";
  },

  async setBaseHashtags(id: number, hashtags: string): Promise<void> {
    await execute("UPDATE book SET base_hashtags=? WHERE id=?", [hashtags, id]);
  },

  async setVisualProps(id: number, props: BookVisualProps): Promise<void> {
    await execute("UPDATE book SET visual_props_json=?, updated_at=? WHERE id=?", [
      serializeVisualProps(props),
      Date.now(),
      id,
    ]);
  },

  async setVisualExtras(id: number, extras: BookVisualExtras): Promise<void> {
    await execute("UPDATE book SET visual_extras_json=?, updated_at=? WHERE id=?", [
      serializeVisualExtras(extras),
      Date.now(),
      id,
    ]);
  },

  async setExtraInstructions(
    id: number,
    textExtra: string | null,
    imageExtra: string | null,
  ): Promise<void> {
    const t = (textExtra ?? "").trim();
    const i = (imageExtra ?? "").trim();
    await execute(
      "UPDATE book SET text_extra_instructions=?, image_extra_instructions=?, updated_at=? WHERE id=?",
      [t === "" ? null : t, i === "" ? null : i, Date.now(), id],
    );
  },

  async chapters(bookId: number): Promise<BookChapter[]> {
    const rows = await query("SELECT * FROM book_chapter WHERE book_id=? ORDER BY idx", [bookId]);
    return rows.map(mapChapter);
  },

  async replaceChapters(
    bookId: number,
    chapters: { index: number; title: string | null; text: string; charCount: number }[],
  ): Promise<void> {
    await execute("DELETE FROM book_chapter WHERE book_id=?", [bookId]);
    for (const ch of chapters) {
      await execute(
        "INSERT INTO book_chapter(book_id, idx, title, text, char_count, excluded) VALUES (?,?,?,?,?,?)",
        [bookId, ch.index, ch.title, ch.text, ch.charCount, ch.charCount < 200 ? 1 : 0],
      );
    }
  },

  async setChapterExcluded(bookId: number, idx: number, excluded: boolean): Promise<boolean> {
    const r = await execute("UPDATE book_chapter SET excluded=? WHERE book_id=? AND idx=?", [
      excluded ? 1 : 0,
      bookId,
      idx,
    ]);
    return r.affectedRows > 0;
  },

  async chapter(bookId: number, idx: number): Promise<BookChapter | null> {
    const rows = await query("SELECT * FROM book_chapter WHERE book_id=? AND idx=?", [bookId, idx]);
    return rows.length ? mapChapter(rows[0]) : null;
  },

  async setChapterScene(chapterId: number, scene: ChapterScene): Promise<void> {
    await execute("UPDATE book_chapter SET scene_json=? WHERE id=?", [
      JSON.stringify(scene),
      chapterId,
    ]);
  },

  async clearChapterScenes(bookId: number): Promise<void> {
    await execute("UPDATE book_chapter SET scene_json=NULL WHERE book_id=?", [bookId]);
  },

  async currentProfile(bookId: number): Promise<BookProfile | null> {
    const rows = await query("SELECT * FROM book_profile WHERE book_id=? AND prompt_version=?", [
      bookId,
      CURRENT_PROMPT_VERSION,
    ]);
    return rows.length ? mapProfile(rows[0]) : null;
  },

  async upsertProfile(p: {
    bookId: number;
    synopsisShort: string | null;
    synopsisLong: string | null;
    genres: string | null;
    tone: string | null;
    targetAudience: string | null;
    analysisJson: string;
    sourceContentHash: string;
    promptVersion: number;
    model: string | null;
    createdAt: number;
  }): Promise<void> {
    await execute(
      `INSERT INTO book_profile(book_id, synopsis_short, synopsis_long, genres, tone,
              target_audience, analysis_json, source_content_hash, prompt_version, model, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(book_id, prompt_version) DO UPDATE SET
              synopsis_short=excluded.synopsis_short,
              synopsis_long=excluded.synopsis_long,
              genres=excluded.genres, tone=excluded.tone,
              target_audience=excluded.target_audience,
              analysis_json=excluded.analysis_json,
              source_content_hash=excluded.source_content_hash,
              model=excluded.model, created_at=excluded.created_at`,
      [
        p.bookId,
        p.synopsisShort,
        p.synopsisLong,
        p.genres,
        p.tone,
        p.targetAudience,
        p.analysisJson,
        p.sourceContentHash,
        p.promptVersion,
        p.model,
        p.createdAt,
      ],
    );
  },
};

export const characters = {
  async byBook(bookId: number): Promise<BookCharacter[]> {
    const rows = await query(
      "SELECT * FROM book_character WHERE book_id=? ORDER BY sort_order, id",
      [bookId],
    );
    return rows.map(mapCharacter);
  },

  async get(id: number): Promise<BookCharacter | null> {
    const rows = await query("SELECT * FROM book_character WHERE id=?", [id]);
    return rows.length ? mapCharacter(rows[0]) : null;
  },

  async insert(c: Omit<BookCharacter, "id">): Promise<BookCharacter> {
    const r = await execute(
      `INSERT INTO book_character(book_id, name, role, occupation, personality, physical,
              age, ethnicity, notes, source, sort_order, outfits_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        c.bookId,
        c.name,
        c.role,
        c.occupation,
        c.personality,
        c.physical,
        c.age,
        c.ethnicity,
        c.notes,
        c.source,
        c.sortOrder,
        serializeOutfits(c.outfits),
        c.createdAt,
        c.updatedAt,
      ],
    );
    const created = await this.get(r.insertId);
    if (!created) throw new Error("insert character: row missing");
    return created;
  },

  async update(c: BookCharacter): Promise<void> {
    await execute(
      `UPDATE book_character SET name=?, role=?, occupation=?, personality=?, physical=?,
              age=?, ethnicity=?, notes=?, source=?, sort_order=?, outfits_json=?, updated_at=? WHERE id=?`,
      [
        c.name,
        c.role,
        c.occupation,
        c.personality,
        c.physical,
        c.age,
        c.ethnicity,
        c.notes,
        c.source,
        c.sortOrder,
        serializeOutfits(c.outfits),
        c.updatedAt,
        c.id,
      ],
    );
  },

  async delete(id: number): Promise<void> {
    await execute("DELETE FROM book_character WHERE id=?", [id]);
  },

  async replaceAi(
    bookId: number,
    list: {
      name: string;
      role: string | null;
      occupation: string | null;
      personality: string | null;
      physical: string | null;
      age: string | null;
      ethnicity: string | null;
      notes: string | null;
    }[],
  ): Promise<void> {
    await execute("DELETE FROM book_character WHERE book_id=? AND source='AI'", [bookId]);
    const now = Date.now();
    let order = 0;
    for (const c of list) {
      await execute(
        `INSERT INTO book_character(book_id, name, role, occupation, personality, physical,
                age, ethnicity, notes, source, sort_order, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'AI',?,?,?)`,
        [
          bookId,
          c.name,
          c.role,
          c.occupation,
          c.personality,
          c.physical,
          c.age,
          c.ethnicity,
          c.notes,
          order++,
          now,
          now,
        ],
      );
    }
  },

  async nextSortOrder(bookId: number): Promise<number> {
    const rows = await query<{ n: number | null }>(
      "SELECT MAX(sort_order) AS n FROM book_character WHERE book_id=?",
      [bookId],
    );
    const max = rows.length && rows[0].n != null ? Number(rows[0].n) : -1;
    return max + 1;
  },

  async updateMentions(
    bookId: number,
    rows: { name: string; mentions: number; chapters: number[] }[],
  ): Promise<void> {
    for (const r of rows) {
      await execute(
        "UPDATE book_character SET mentions=?, chapters=? WHERE book_id=? AND LOWER(name)=LOWER(?)",
        [r.mentions, r.chapters.join(","), bookId, r.name],
      );
    }
  },

  async setChapters(characterId: number, chapters: number[]): Promise<void> {
    const csv = [...chapters].sort((a, b) => a - b).join(",");
    await execute("UPDATE book_character SET chapters=? WHERE id=?", [csv, characterId]);
  },

  async setChaptersBulk(rows: { characterId: number; chapters: number[] }[]): Promise<void> {
    if (rows.length === 0) return;
    await withTransaction(async (conn) => {
      for (const r of rows) {
        const csv = [...r.chapters].sort((a, b) => a - b).join(",");
        await conn.execute("UPDATE book_character SET chapters=? WHERE id=?", [csv, r.characterId]);
      }
    });
  },
};

export const quotes = {
  async byBook(bookId: number): Promise<BookQuote[]> {
    const rows = await query("SELECT * FROM book_quote WHERE book_id=? ORDER BY score DESC, id", [
      bookId,
    ]);
    return rows.map(mapQuote);
  },

  async byChapter(bookId: number, chapterIndex: number): Promise<BookQuote[]> {
    const rows = await query(
      `SELECT q.* FROM book_quote q
       JOIN book_chapter c ON q.chapter_id = c.id
       WHERE c.book_id=? AND c.idx=?
       ORDER BY q.score DESC, q.id`,
      [bookId, chapterIndex],
    );
    return rows.map(mapQuote);
  },

  async replaceForBook(
    bookId: number,
    rows: {
      chapterId: number | null;
      text: string;
      kind: QuoteKind;
      speaker: string | null;
      score: number;
    }[],
  ): Promise<void> {
    await execute("DELETE FROM book_quote WHERE book_id=?", [bookId]);
    const now = Date.now();
    for (const q of rows) {
      await execute(
        "INSERT INTO book_quote(book_id, chapter_id, text, kind, speaker, score, created_at) VALUES (?,?,?,?,?,?,?)",

        [
          bookId,
          q.chapterId,
          stripMdEscapes(q.text),
          q.kind,
          q.speaker ? stripMdEscapes(q.speaker) : q.speaker,
          q.score,
          now,
        ],
      );
    }
  },
};

export const pages = {
  async all(): Promise<FacebookPage[]> {
    const rows = await query("SELECT * FROM facebook_page ORDER BY name");
    return rows.map(mapPage);
  },

  async find(pageId: string): Promise<FacebookPage | null> {
    const rows = await query("SELECT * FROM facebook_page WHERE page_id=?", [pageId]);
    return rows.length ? mapPage(rows[0]) : null;
  },

  async upsert(p: FacebookPage): Promise<void> {
    await execute(
      `INSERT INTO facebook_page(page_id, name, category, token_secret_key, book_id, added_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(page_id) DO UPDATE SET name=excluded.name, category=excluded.category,
              token_secret_key=excluded.token_secret_key`,
      [p.pageId, p.name, p.category, p.tokenSecretKey, p.bookId, p.addedAt],
    );
  },

  async setBook(pageId: string, bookId: number | null): Promise<void> {
    await execute("UPDATE facebook_page SET book_id=? WHERE page_id=?", [bookId, pageId]);
  },

  async setIgUserId(pageId: string, igUserId: string | null): Promise<void> {
    await execute("UPDATE facebook_page SET ig_user_id=? WHERE page_id=?", [igUserId, pageId]);
  },

  async delete(pageId: string): Promise<void> {
    await execute("DELETE FROM facebook_page WHERE page_id=?", [pageId]);
  },
};

export const links = {
  async byBook(bookId: number): Promise<BookLink[]> {
    const rows = await query("SELECT * FROM book_link WHERE book_id=? ORDER BY id", [bookId]);
    return rows.map(mapLink);
  },

  async get(id: number): Promise<BookLink | null> {
    const rows = await query("SELECT * FROM book_link WHERE id=?", [id]);
    return rows.length ? mapLink(rows[0]) : null;
  },

  async insert(l: Omit<BookLink, "id">): Promise<BookLink> {
    const r = await execute(
      "INSERT INTO book_link(book_id, channel, label, url, is_default, usage_policy) VALUES (?,?,?,?,?,?)",
      [l.bookId, l.channel, l.label, l.url, l.isDefault ? 1 : 0, l.usagePolicy],
    );
    const rows = await query("SELECT * FROM book_link WHERE id=?", [r.insertId]);
    return mapLink(rows[0]);
  },

  async update(l: BookLink): Promise<void> {
    await execute(
      "UPDATE book_link SET channel=?, label=?, url=?, is_default=?, usage_policy=? WHERE id=?",
      [l.channel, l.label, l.url, l.isDefault ? 1 : 0, l.usagePolicy, l.id],
    );
  },

  async delete(id: number): Promise<void> {
    await execute("DELETE FROM book_link WHERE id=?", [id]);
  },
};

export const media = {
  async byBook(bookId: number): Promise<MediaAsset[]> {
    const rows = await query("SELECT * FROM media_asset WHERE book_id=? ORDER BY id", [bookId]);
    return rows.map(mapMedia);
  },

  async uploadsByBook(bookId: number): Promise<MediaAsset[]> {
    const rows = await query(
      "SELECT * FROM media_asset WHERE book_id=? AND scope<>'GENERATED' ORDER BY id",
      [bookId],
    );
    return rows.map(mapMedia);
  },

  async usageByBook(bookId: number): Promise<Map<number, MediaUsage>> {
    const rows = await query<{ media_id: number; visual_kind: string; n: number }>(
      `SELECT je.value AS media_id, cu.visual_kind AS visual_kind, COUNT(*) AS n
         FROM content_usage cu, json_each(cu.image_ids) je
        WHERE cu.book_id = ? AND cu.image_ids IS NOT NULL AND cu.image_ids NOT IN ('', '[]')
        GROUP BY je.value, cu.visual_kind`,
      [bookId],
    );
    const map = new Map<number, MediaUsage>();
    for (const r of rows) {
      const id = Number(r.media_id);
      if (!Number.isFinite(id)) continue;
      let u = map.get(id);
      if (!u) {
        u = { total: 0, reel: 0, story: 0, post: 0 };
        map.set(id, u);
      }
      const n = Number(r.n) || 0;
      u.total += n;
      if (r.visual_kind === "reel") u.reel += n;
      else if (r.visual_kind === "story") u.story += n;
      else if (r.visual_kind === "card") u.post += n;
    }
    return map;
  },

  async deleteByPath(path: string): Promise<void> {
    await execute("DELETE FROM media_asset WHERE path=?", [toDataRelative(path)]);
  },

  async insert(
    m: Omit<MediaAsset, "id" | "qa" | "seed"> & { qa?: SceneQa | null; seed?: number | null },
  ): Promise<MediaAsset> {
    const r = await execute(
      "INSERT INTO media_asset(book_id, chapter_id, scope, path, caption, gen_prompt, chapter_idx, tags, gen_seed, added_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        m.bookId,
        m.chapterId,
        m.scope,
        toDataRelativeStrict(m.path),
        m.caption,
        m.genPrompt,
        m.chapterIdx,
        m.tags.length > 0 ? m.tags.join(",") : null,
        m.seed ?? null,
        m.addedAt,
      ],
    );
    const rows = await query("SELECT * FROM media_asset WHERE id=?", [r.insertId]);
    return mapMedia(rows[0]);
  },

  async get(id: number): Promise<MediaAsset | null> {
    const rows = await query("SELECT * FROM media_asset WHERE id=?", [id]);
    return rows.length ? mapMedia(rows[0]) : null;
  },

  async delete(id: number): Promise<void> {
    await execute("DELETE FROM media_asset WHERE id=?", [id]);
  },

  async updateCatalog(
    id: number,
    data: { tags: string[]; chapterIdx: number | null },
  ): Promise<void> {
    await execute("UPDATE media_asset SET tags=?, chapter_idx=? WHERE id=?", [
      data.tags.length > 0 ? data.tags.join(",") : null,
      data.chapterIdx,
      id,
    ]);
  },

  async updateAfterRegen(
    id: number,
    m: { path: string; genPrompt: string; addedAt: number; tags?: string[] },
  ): Promise<void> {
    if (m.tags) {
      await execute("UPDATE media_asset SET path=?, gen_prompt=?, tags=?, added_at=? WHERE id=?", [
        toDataRelativeStrict(m.path),
        m.genPrompt,
        m.tags.length > 0 ? m.tags.join(",") : null,
        m.addedAt,
        id,
      ]);
      return;
    }
    await execute("UPDATE media_asset SET path=?, gen_prompt=?, added_at=? WHERE id=?", [
      toDataRelativeStrict(m.path),
      m.genPrompt,
      m.addedAt,
      id,
    ]);
  },

  async setQa(id: number, qa: SceneQa | null): Promise<void> {
    await execute("UPDATE media_asset SET qa_json=? WHERE id=?", [
      qa ? JSON.stringify(qa) : null,
      id,
    ]);
  },
};

export const settings = {
  async get(key: string): Promise<string | null> {
    const rows = await query("SELECT v FROM app_setting WHERE k=?", [key]);
    return rows.length ? ((rows[0] as { v: string | null }).v ?? null) : null;
  },

  async set(key: string, value: string): Promise<void> {
    await execute(
      "INSERT INTO app_setting(k, v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
      [key, value],
    );
  },
};

export const slots = {
  async byPage(pageId: string): Promise<PostingSlot[]> {
    const rows = await query(
      "SELECT * FROM posting_slot WHERE page_id=? ORDER BY day_of_week, time_of_day",
      [pageId],
    );
    return rows.map(mapSlot);
  },

  async insert(s: Omit<PostingSlot, "id">): Promise<PostingSlot> {
    const r = await execute(
      "INSERT INTO posting_slot(page_id, day_of_week, time_of_day, time_start, time_end, media_type, enabled) VALUES (?,?,?,?,?,?,?)",
      [s.pageId, s.dayOfWeek, s.timeOfDay, s.timeStart, s.timeEnd, s.mediaType, s.enabled ? 1 : 0],
    );
    const rows = await query("SELECT * FROM posting_slot WHERE id=?", [r.insertId]);
    return mapSlot(rows[0]);
  },

  async delete(id: number): Promise<void> {
    await execute("DELETE FROM posting_slot WHERE id=?", [id]);
  },
};

export const weeklyPlan = {
  async get(pageId: string): Promise<WeeklyPlan | null> {
    const rows = await query("SELECT * FROM weekly_plan WHERE page_id=?", [pageId]);
    if (rows.length === 0) return null;
    const r = rows[0]!;
    return {
      pageId: r.page_id as string,
      postsPerWeek: Number(r.posts_per_week),
      reelsPerWeek: Number(r.reels_per_week),
      storiesPerWeek: Number(r.stories_per_week),
      updatedAt: Number(r.updated_at),
    };
  },

  async upsert(p: WeeklyPlan): Promise<void> {
    await execute(
      `INSERT INTO weekly_plan(page_id, posts_per_week, reels_per_week, stories_per_week, updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(page_id) DO UPDATE SET posts_per_week=excluded.posts_per_week,
         reels_per_week=excluded.reels_per_week, stories_per_week=excluded.stories_per_week,
         updated_at=excluded.updated_at`,
      [p.pageId, p.postsPerWeek, p.reelsPerWeek, p.storiesPerWeek, p.updatedAt],
    );
  },
};

export const generations = {
  async insert(g: Omit<GenerationRecord, "id">): Promise<number> {
    const r = await execute(
      `INSERT INTO generation_record(book_id, page_id, angle, prompt_version, input_hash, model, output, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [g.bookId, g.pageId, g.angle, g.promptVersion, g.inputHash, g.model, g.output, g.createdAt],
    );
    return r.insertId;
  },
};

export const posts = {
  async byPage(pageId: string, limit = 100): Promise<ScheduledPost[]> {
    const rows = await query(
      "SELECT * FROM scheduled_post WHERE page_id=? ORDER BY scheduled_at DESC LIMIT ?",
      [pageId, limit],
    );
    return rows.map(mapPost);
  },

  async scheduledAll(limit = 500): Promise<ScheduledPost[]> {
    const rows = await query(
      "SELECT * FROM scheduled_post WHERE status='SCHEDULED' ORDER BY scheduled_at ASC LIMIT ?",
      [limit],
    );
    return rows.map(mapPost);
  },

  async get(id: number): Promise<ScheduledPost | null> {
    const rows = await query("SELECT * FROM scheduled_post WHERE id=?", [id]);
    return rows.length ? mapPost(rows[0]) : null;
  },

  async insert(p: Omit<ScheduledPost, "id">): Promise<ScheduledPost> {
    const r = await execute(
      `INSERT INTO scheduled_post(page_id, book_id, generation_id, message, hashtags, media_type,
              link, media_path, scheduled_at, status, fb_post_id, attempts, last_error,
              idempotency_key, music_id, content_format, platform, linked_post_id, ig_media_id,
              created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        p.pageId,
        p.bookId,
        p.generationId,
        p.message,
        p.hashtags,
        p.mediaType,
        p.link,
        p.mediaPath == null ? null : toDataRelativeStrict(p.mediaPath),
        p.scheduledAt,
        p.status,
        p.fbPostId,
        p.attempts,
        p.lastError,
        p.idempotencyKey,
        p.musicId,
        p.contentFormat,
        p.platform,
        p.linkedPostId,
        p.igMediaId,
        p.createdAt,
        p.updatedAt,
      ],
    );
    const created = await this.get(r.insertId);
    if (!created) throw new Error("insert post: row missing");
    return created;
  },

  async delete(id: number): Promise<void> {
    await execute("DELETE FROM scheduled_post WHERE id=?", [id]);
  },

  async setDashboardHidden(id: number, hidden: boolean): Promise<void> {
    await execute("UPDATE scheduled_post SET dashboard_hidden=?, updated_at=? WHERE id=?", [
      hidden ? 1 : 0,
      Date.now(),
      id,
    ]);
  },

  async setMusic(id: number, musicId: number | null): Promise<void> {
    await execute("UPDATE scheduled_post SET music_id=?, updated_at=? WHERE id=?", [
      musicId,
      Date.now(),
      id,
    ]);
  },

  async existsByIdempotencyKey(key: string): Promise<boolean> {
    const rows = await query("SELECT 1 AS x FROM scheduled_post WHERE idempotency_key=? LIMIT 1", [
      key,
    ]);
    return rows.length > 0;
  },

  async recentMessages(pageId: string, limit: number): Promise<string[]> {
    const rows = await query<{ message: string }>(
      "SELECT message FROM scheduled_post WHERE page_id=? ORDER BY created_at DESC LIMIT ?",
      [pageId, limit],
    );
    return rows.map((r) => r.message);
  },

  async findDue(now: number, limit: number): Promise<ScheduledPost[]> {
    const rows = await query(
      "SELECT * FROM scheduled_post WHERE status='SCHEDULED' AND scheduled_at <= ? AND (fb_post_id IS NULL OR fb_post_id='') ORDER BY scheduled_at LIMIT ?",
      [now, limit],
    );
    return rows.map(mapPost);
  },

  async claimForPublishing(postId: number, now: number): Promise<boolean> {
    const r = await execute(
      "UPDATE scheduled_post SET status='PUBLISHING', updated_at=? WHERE id=? AND status='SCHEDULED' AND scheduled_at <= ? AND (fb_post_id IS NULL OR fb_post_id='')",
      [now, postId, now],
    );
    return r.affectedRows === 1;
  },

  async nativeScheduledDue(now: number): Promise<ScheduledPost[]> {
    const rows = await query(
      `SELECT * FROM scheduled_post
       WHERE status='SCHEDULED' AND fb_post_id IS NOT NULL AND fb_post_id != '' AND scheduled_at <= ?`,
      [now],
    );
    return rows.map(mapPost);
  },

  async markNativePublished(id: number, now: number): Promise<void> {
    await execute(
      `UPDATE scheduled_post SET status='PUBLISHED',
              published_at_actual=COALESCE(published_at_actual, scheduled_at), updated_at=? WHERE id=?`,
      [now, id],
    );
  },

  async update(p: ScheduledPost): Promise<void> {
    await execute(
      `UPDATE scheduled_post SET status=?, fb_post_id=?, attempts=?, last_error=?,
              scheduled_at=?, message=?, hashtags=?, media_path=?, media_type=?,
              music_id=?, content_format=?, ig_media_id=?, updated_at=? WHERE id=?`,
      [
        p.status,
        p.fbPostId,
        p.attempts,
        p.lastError,
        p.scheduledAt,
        p.message,
        p.hashtags,
        p.mediaPath == null ? null : toDataRelativeStrict(p.mediaPath),
        p.mediaType,
        p.musicId,
        p.contentFormat,
        p.igMediaId,
        p.updatedAt,
        p.id,
      ],
    );
  },

  async findByLinkedPostId(linkedPostId: number): Promise<ScheduledPost | null> {
    const rows = await query(
      "SELECT * FROM scheduled_post WHERE platform='instagram' AND linked_post_id=? LIMIT 1",
      [linkedPostId],
    );
    return rows.length ? mapPost(rows[0]) : null;
  },

  async recoverStalePublishing(now: number): Promise<number> {
    const r = await execute(
      "UPDATE scheduled_post SET status='SCHEDULED', updated_at=? WHERE status='PUBLISHING' AND (fb_post_id IS NULL OR fb_post_id='')",
      [now],
    );
    return r.affectedRows;
  },
};

export interface InsightSnapshot {
  metric: string;
  value: number;
  periodEnd: number;
  fetchedAt: number;
}

export const insights = {
  async insertMany(
    rows: { pageId: string; metric: string; value: number; periodEnd: number; fetchedAt: number }[],
  ): Promise<void> {
    for (const s of rows) {
      await execute(
        "INSERT INTO insight_snapshot(page_id, metric, value, period_end, fetched_at) VALUES (?,?,?,?,?)",
        [s.pageId, s.metric, s.value, s.periodEnd, s.fetchedAt],
      );
    }
  },

  async history(pageId: string, limit = 200): Promise<InsightSnapshot[]> {
    const rows = await query(
      "SELECT metric, value, period_end, fetched_at FROM insight_snapshot WHERE page_id=? ORDER BY fetched_at DESC LIMIT ?",
      [pageId, limit],
    );
    return rows.map((r) => ({
      metric: r.metric as string,
      value: Number(r.value),
      periodEnd: Number(r.period_end),
      fetchedAt: Number(r.fetched_at),
    }));
  },
};

export const renderJobs = {
  async insert(j: {
    postId: number | null;
    bookId: number | null;
    kind: string;
    specJson: string;
  }): Promise<RenderJob> {
    const now = Date.now();
    const r = await execute(
      `INSERT INTO render_job(post_id, book_id, kind, status, spec_json, created_at, updated_at)
       VALUES (?,?,?,'queued',?,?,?)`,
      [j.postId, j.bookId, j.kind, j.specJson, now, now],
    );
    const created = await this.get(r.insertId);
    if (!created) throw new Error("insert render_job: row missing");
    return created;
  },

  async get(id: number): Promise<RenderJob | null> {
    const rows = await query("SELECT * FROM render_job WHERE id=?", [id]);
    return rows.length ? mapRenderJob(rows[0]) : null;
  },

  async active(): Promise<RenderJob[]> {
    const rows = await query(
      "SELECT * FROM render_job WHERE status IN ('queued','rendering') ORDER BY id",
    );
    return rows.map(mapRenderJob);
  },

  async nextQueued(): Promise<RenderJob | null> {
    const rows = await query("SELECT * FROM render_job WHERE status='queued' ORDER BY id LIMIT 1");
    return rows.length ? mapRenderJob(rows[0]) : null;
  },

  async setStatus(
    id: number,
    status: RenderStatus,
    fields: { outputPath?: string | null; error?: string | null } = {},
  ): Promise<void> {
    await execute(
      "UPDATE render_job SET status=?, output_path=?, error=?, updated_at=? WHERE id=?",
      [
        status,
        fields.outputPath == null ? null : toDataRelativeStrict(fields.outputPath),
        fields.error ?? null,
        Date.now(),
        id,
      ],
    );
  },

  async failStaleRendering(): Promise<number> {
    const r = await execute(
      "UPDATE render_job SET status='failed', error='Interrotto da riavvio del server', updated_at=? WHERE status='rendering'",
      [Date.now()],
    );
    return r.affectedRows;
  },
};

export const music = {
  async all(): Promise<MusicTrack[]> {
    const rows = await query("SELECT * FROM music_track ORDER BY added_at DESC, id DESC");
    return rows.map(mapMusic);
  },

  async byBook(bookId: number): Promise<MusicTrack[]> {
    const rows = await query(
      "SELECT * FROM music_track WHERE book_id=? OR book_id IS NULL ORDER BY mood, id",
      [bookId],
    );
    return rows.map(mapMusic);
  },

  async usageAll(): Promise<Map<number, MusicUsage>> {
    const rows = await query<{ music_id: number; visual_kind: string; n: number }>(
      `SELECT music_id, visual_kind, COUNT(*) AS n
         FROM content_usage
        WHERE music_id IS NOT NULL
        GROUP BY music_id, visual_kind`,
      [],
    );
    const map = new Map<number, MusicUsage>();
    for (const r of rows) {
      const id = Number(r.music_id);
      if (!Number.isFinite(id)) continue;
      let u = map.get(id);
      if (!u) {
        u = { total: 0, reel: 0, story: 0 };
        map.set(id, u);
      }
      const n = Number(r.n) || 0;
      u.total += n;
      if (r.visual_kind === "reel") u.reel += n;
      else if (r.visual_kind === "story") u.story += n;
    }
    return map;
  },

  async get(id: number): Promise<MusicTrack | null> {
    const rows = await query("SELECT * FROM music_track WHERE id=?", [id]);
    return rows.length ? mapMusic(rows[0]) : null;
  },

  async insert(m: Omit<MusicTrack, "id">): Promise<MusicTrack> {
    const r = await execute(
      "INSERT INTO music_track(book_id, title, path, duration_sec, mood, added_at) VALUES (?,?,?,?,?,?)",
      [m.bookId, m.title, toDataRelativeStrict(m.path), m.durationSec, m.mood, m.addedAt],
    );
    const created = await this.get(r.insertId);
    if (!created) throw new Error("insert music: row missing");
    return created;
  },

  async delete(id: number): Promise<void> {
    await execute("DELETE FROM music_track WHERE id=?", [id]);
  },
};

export interface UsageStats {
  totalContents: number;
  byVisualKind: Record<string, number>;
  byTextMode: Record<string, number>;
  byAspect: Record<string, number>;

  recentImageIds: number[];
  leastUsedImageIds: number[];
  recentQuoteKeys: string[];
}

export const contentUsage = {
  async insert(u: Omit<ContentUsage, "id">): Promise<ContentUsage> {
    const r = await execute(
      `INSERT INTO content_usage(page_id, book_id, post_id, text_mode, visual_kind,
              visual_content, aspect, image_ids, quote_key, music_id, chapter_index, angle_key, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        u.pageId,
        u.bookId,
        u.postId,
        u.textMode,
        u.visualKind,
        u.visualContent,
        u.aspect,
        JSON.stringify(u.imageIds ?? []),
        u.quoteKey,
        u.musicId,
        u.chapterIndex,
        u.angleKey,
        u.createdAt,
      ],
    );
    const rows = await query("SELECT * FROM content_usage WHERE id=?", [r.insertId]);
    return mapUsage(rows[0]);
  },

  async latestByPost(postId: number): Promise<ContentUsage | null> {
    const rows = await query(
      "SELECT * FROM content_usage WHERE post_id=? ORDER BY created_at DESC, id DESC LIMIT 1",
      [postId],
    );
    return rows.length ? mapUsage(rows[0]) : null;
  },

  async deleteByPost(postId: number): Promise<void> {
    await execute("DELETE FROM content_usage WHERE post_id=?", [postId]);
  },

  async marketingAngleCounts(
    pageId: string,
    bookId: number,
    chapterIndex: number,
  ): Promise<Map<string, number>> {
    const rows = await query<{ angle_key: string | null }>(
      "SELECT angle_key FROM content_usage WHERE page_id=? AND book_id=? AND chapter_index=? AND angle_key IS NOT NULL",
      [pageId, bookId, chapterIndex],
    );
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.angle_key) m.set(r.angle_key, (m.get(r.angle_key) ?? 0) + 1);
    }
    return m;
  },

  async recentByPage(pageId: string, limit: number): Promise<ContentUsage[]> {
    const rows = await query(
      "SELECT * FROM content_usage WHERE page_id=? ORDER BY created_at DESC, id DESC LIMIT ?",
      [pageId, limit],
    );
    return rows.map(mapUsage);
  },

  async usageCounts(
    pageId: string,
    bookId: number,
  ): Promise<{
    quotes: Map<string, number>;
    images: Map<number, number>;
    chapters: Map<number, number>;
    music: Map<number, number>;
  }> {
    const rows = await query<{
      quote_key: string | null;
      image_ids: string | null;
      chapter_index: number | null;
      music_id: number | null;
    }>(
      "SELECT quote_key, image_ids, chapter_index, music_id FROM content_usage WHERE page_id=? AND book_id=?",
      [pageId, bookId],
    );
    const quotes = new Map<string, number>();
    const images = new Map<number, number>();
    const chapters = new Map<number, number>();
    const music = new Map<number, number>();
    const bump = <K>(m: Map<K, number>, k: K): void => {
      m.set(k, (m.get(k) ?? 0) + 1);
    };
    for (const r of rows) {
      if (r.quote_key) bump(quotes, r.quote_key);
      if (r.chapter_index != null) bump(chapters, Number(r.chapter_index));
      if (r.music_id != null) bump(music, Number(r.music_id));
      if (r.image_ids) {
        try {
          const ids = JSON.parse(r.image_ids) as unknown;
          if (Array.isArray(ids))
            for (const id of ids) if (typeof id === "number") bump(images, id);
        } catch {}
      }
    }
    return { quotes, images, chapters, music };
  },

  async statsByPage(pageId: string): Promise<UsageStats> {
    const all = (
      await query("SELECT * FROM content_usage WHERE page_id=? ORDER BY created_at DESC, id DESC", [
        pageId,
      ])
    ).map(mapUsage);

    const byVisualKind: Record<string, number> = {};
    const byTextMode: Record<string, number> = {};
    const byAspect: Record<string, number> = {};
    const imageCounts = new Map<number, number>();
    const quoteOrder: string[] = [];
    const seenQuotes = new Set<string>();

    for (const u of all) {
      byVisualKind[u.visualKind] = (byVisualKind[u.visualKind] ?? 0) + 1;
      byTextMode[u.textMode] = (byTextMode[u.textMode] ?? 0) + 1;
      if (u.aspect) byAspect[u.aspect] = (byAspect[u.aspect] ?? 0) + 1;
      for (const id of u.imageIds) imageCounts.set(id, (imageCounts.get(id) ?? 0) + 1);
      if (u.quoteKey && !seenQuotes.has(u.quoteKey)) {
        seenQuotes.add(u.quoteKey);
        quoteOrder.push(u.quoteKey);
      }
    }

    const byCountDesc = [...imageCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const byCountAsc = [...imageCounts.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);

    return {
      totalContents: all.length,
      byVisualKind,
      byTextMode,
      byAspect,
      recentImageIds: byCountDesc.slice(0, 20),
      leastUsedImageIds: byCountAsc.slice(0, 20),
      recentQuoteKeys: quoteOrder.slice(0, 20),
    };
  },
};

function mapMarketingCard(r: Row): ChapterMarketingCard {
  let data: ChapterMarketingCardData;
  try {
    data = JSON.parse(r.card_json as string) as ChapterMarketingCardData;
  } catch {
    data = {
      spoilerLevel: "low",
      nonSpoilerSummary: "",
      emotionalCore: "",
      humanTruth: "",
      readerQuestion: "",
      mainTension: "",
      visualMoment: "",
      safeQuotes: [],
      characterFocus: [],
      postAngles: [],
    };
  }
  return {
    bookId: Number(r.book_id),
    chapterIndex: Number(r.chapter_index),
    schemaVersion: Number(r.schema_version),
    data,
    model: (r.model as string | null) ?? null,
    updatedAt: Number(r.updated_at),
  };
}

export const marketingCards = {
  async get(bookId: number, chapterIndex: number): Promise<ChapterMarketingCard | null> {
    const rows = await query(
      "SELECT * FROM chapter_marketing_card WHERE book_id=? AND chapter_index=?",
      [bookId, chapterIndex],
    );
    return rows.length ? mapMarketingCard(rows[0]) : null;
  },

  async byBook(bookId: number): Promise<ChapterMarketingCard[]> {
    const rows = await query(
      "SELECT * FROM chapter_marketing_card WHERE book_id=? ORDER BY chapter_index",
      [bookId],
    );
    return rows.map(mapMarketingCard);
  },

  async countByBook(bookId: number): Promise<number> {
    const rows = await query("SELECT COUNT(*) AS n FROM chapter_marketing_card WHERE book_id=?", [
      bookId,
    ]);
    return rows.length ? Number(rows[0].n) : 0;
  },

  async upsert(c: {
    bookId: number;
    chapterIndex: number;
    schemaVersion: number;
    data: ChapterMarketingCardData;
    model: string | null;
  }): Promise<void> {
    const now = Date.now();
    await execute(
      `INSERT INTO chapter_marketing_card(book_id, chapter_index, schema_version, spoiler_level, card_json, model, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(book_id, chapter_index) DO UPDATE SET
         schema_version=excluded.schema_version,
         spoiler_level=excluded.spoiler_level,
         card_json=excluded.card_json,
         model=excluded.model,
         updated_at=excluded.updated_at`,
      [
        c.bookId,
        c.chapterIndex,
        c.schemaVersion,
        c.data.spoilerLevel,
        JSON.stringify(c.data),
        c.model,
        now,
        now,
      ],
    );
  },

  async deleteByBook(bookId: number): Promise<void> {
    await execute("DELETE FROM chapter_marketing_card WHERE book_id=?", [bookId]);
  },
};

function mapVisualDirective(r: Row): VisualDirective {
  return {
    id: Number(r.id),
    bookId: Number(r.book_id),
    title: r.title as string,
    triggers: ((r.triggers as string | null) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    intent: (r.intent as string | null) ?? null,
    body: (r.body as string | null) ?? null,
    bodyEn: (r.body_en as string | null) ?? null,
    enabled: Number(r.enabled) === 1,
    sortOrder: Number(r.sort_order),
  };
}

function triggersCsv(triggers: string[]): string | null {
  const csv = triggers
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .join(",");
  return csv === "" ? null : csv;
}

export const visualDirectives = {
  async byBook(bookId: number): Promise<VisualDirective[]> {
    const rows = await query(
      "SELECT * FROM visual_directive WHERE book_id=? ORDER BY sort_order, id",
      [bookId],
    );
    return rows.map(mapVisualDirective);
  },

  async get(id: number): Promise<VisualDirective | null> {
    const rows = await query("SELECT * FROM visual_directive WHERE id=?", [id]);
    return rows.length ? mapVisualDirective(rows[0]) : null;
  },

  async create(d: {
    bookId: number;
    title: string;
    triggers: string[];
    intent: string | null;
    body: string | null;
    bodyEn: string | null;
    enabled: boolean;
    sortOrder: number;
  }): Promise<VisualDirective> {
    const now = Date.now();
    const r = await execute(
      `INSERT INTO visual_directive(book_id, title, triggers, intent, body, body_en, enabled, sort_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        d.bookId,
        d.title,
        triggersCsv(d.triggers),
        d.intent,
        d.body,
        d.bodyEn,
        d.enabled,
        d.sortOrder,
        now,
        now,
      ],
    );
    const created = await this.get(r.insertId);
    if (!created) throw new Error("insert visual_directive: row missing");
    return created;
  },

  async update(
    id: number,
    d: {
      title: string;
      triggers: string[];
      intent: string | null;
      body: string | null;
      bodyEn: string | null;
      enabled: boolean;
      sortOrder: number;
    },
  ): Promise<void> {
    await execute(
      `UPDATE visual_directive
         SET title=?, triggers=?, intent=?, body=?, body_en=?, enabled=?, sort_order=?, updated_at=?
       WHERE id=?`,
      [
        d.title,
        triggersCsv(d.triggers),
        d.intent,
        d.body,
        d.bodyEn,
        d.enabled,
        d.sortOrder,
        Date.now(),
        id,
      ],
    );
  },

  async delete(id: number): Promise<void> {
    await execute("DELETE FROM visual_directive WHERE id=?", [id]);
  },

  async countByBook(bookId: number): Promise<number> {
    const rows = await query("SELECT COUNT(*) AS n FROM visual_directive WHERE book_id=?", [
      bookId,
    ]);
    return rows.length ? Number(rows[0].n) : 0;
  },
};
