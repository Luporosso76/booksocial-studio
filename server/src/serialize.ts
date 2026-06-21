// Serializzazione DB-row -> DTO del contratto frontend (web/src/api/types.ts).
// Si trasforma solo al confine API; lo storage DB resta invariato.

import type {
  Book,
  BookProfile,
  BookCharacter,
  ContentFormat,
  FacebookPage,
  BookLink,
  MediaAsset,
  MusicTrack,
  PostingSlot,
  ScheduledPost,
  MediaType,
} from "./domain.js";

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** ISO int 1..7 (1=lun) -> enum 'MON'..'SUN'. */
export function dayToEnum(d: number): string {
  return DOW[(((d - 1) % 7) + 7) % 7] ?? "MON";
}

/** enum 'MON'..'SUN' -> ISO int 1..7. */
export function enumToDay(s: unknown): number {
  const i = DOW.indexOf(String(s ?? "").toUpperCase());
  return i >= 0 ? i + 1 : 1;
}

// Il frontend usa solo TEXT|IMAGE|LINK; il dominio ha TEXT|LINK|PHOTO|REEL.
export function mediaOut(m: MediaType): "TEXT" | "IMAGE" | "LINK" {
  if (m === "PHOTO" || m === "REEL") return "IMAGE";
  return m === "LINK" ? "LINK" : "TEXT";
}
export function mediaIn(s: unknown): MediaType {
  const up = String(s ?? "TEXT").toUpperCase();
  if (up === "IMAGE" || up === "PHOTO") return "PHOTO";
  if (up === "REEL") return "REEL";
  if (up === "LINK") return "LINK";
  return "TEXT";
}

function splitWs(s: string | null | undefined): string[] {
  return s ? s.trim().split(/\s+/).filter(Boolean) : [];
}
function splitComma(s: string | null | undefined): string[] {
  return s
    ? s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
}

export function bookDto(b: Book, coverUrl: string | null = null) {
  return {
    id: String(b.id),
    title: b.title,
    author: b.author,
    language: b.language,
    baseHashtags: splitWs(b.baseHashtags),
    sourcePath: b.sourcePath,
    createdAt: b.importedAt,
    updatedAt: b.updatedAt,
    coverUrl,
    visualDomains: b.visualDomains,
    visualDirectives: b.visualDirectives,
    visualDirectivesEn: b.visualDirectivesEn,
    visualProps: b.visualProps,
    visualExtras: b.visualExtras,
  };
}

export function profileDto(p: BookProfile | null) {
  if (!p) return null;
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(p.analysisJson || "{}") as Record<string, unknown>;
  } catch {
    a = {};
  }
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const themes = arr(a.themes).map(String);
  const characters = arr(a.characters)
    .map((c) =>
      typeof c === "string" ? c : (((c as Record<string, unknown>)?.name as string) ?? ""),
    )
    .filter(Boolean);
  const conflicts = arr(a.conflicts)
    .map((c) =>
      typeof c === "string"
        ? c
        : (((c as Record<string, unknown>)?.description as string) ??
          ((c as Record<string, unknown>)?.type as string) ??
          ""),
    )
    .filter(Boolean);
  const sp = a.spoiler_policy as Record<string, unknown> | undefined;
  const doNotReveal = arr(sp?.do_not_reveal).map(String);
  return {
    bookId: String(p.bookId),
    synopsis: p.synopsisShort ?? p.synopsisLong ?? null,
    genres: splitComma(p.genres),
    tone: p.tone,
    themes,
    characters,
    conflicts,
    spoilerPolicy: { doNotReveal },
  };
}

export function characterDto(c: BookCharacter) {
  return {
    id: String(c.id),
    bookId: String(c.bookId),
    name: c.name,
    role: c.role,
    occupation: c.occupation,
    personality: c.personality,
    physical: c.physical,
    notes: c.notes,
    source: c.source,
    // Capitoli in cui il personaggio compare (metriche NLP): il FE ci deriva il CONTEGGIO
    // (chapters.length) e il FILTRO per capitolo (chapters.includes(idx)) in rigenerazione.
    chapters: c.chapters,
    sortOrder: c.sortOrder,
    outfits: c.outfits,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function pageDto(p: FacebookPage) {
  return {
    id: p.pageId,
    name: p.name,
    category: p.category,
    connectedAt: p.addedAt,
    // Libro attualmente associato a questa pagina (la UI ci deriva lo stato della spunta).
    bookId: p.bookId == null ? null : String(p.bookId),
    // Instagram Business account collegato (NULL = nessun IG → la UI nasconde il tab Instagram).
    igUserId: p.igUserId,
  };
}

export function linkDto(l: BookLink) {
  return {
    id: String(l.id),
    bookId: String(l.bookId),
    channel: l.channel,
    label: l.label,
    url: l.url,
    isDefault: l.isDefault,
    usagePolicy: l.usagePolicy,
  };
}

export function mediaDto(m: MediaAsset) {
  const filename = m.path.split("/").pop() ?? null;
  return {
    id: String(m.id),
    bookId: String(m.bookId),
    scope: (m.scope === "CHAPTER" ? "CHAPTER" : "GENERAL") as "GENERAL" | "CHAPTER",
    chapterId: m.chapterId == null ? null : String(m.chapterId),
    caption: m.caption,
    filename,
    // `?v=addedAt` = cache-busting: dopo una rigenerazione addedAt cambia → l'URL cambia → il
    // browser non mostra la vecchia immagine dalla cache (l'id resta lo stesso).
    url: `/api/media/file/${m.id}?v=${m.addedAt}`,
    // Metadata di catalogazione (UI gestione/lightbox; non finiscono nei post).
    chapterIdx: m.chapterIdx,
    tags: m.tags,
    genPrompt: m.genPrompt,
    // Verdetto del QUALITY CHECK visivo: { ok, issues[] } o null se non eseguito.
    qa: m.qa,
  };
}

export function slotDto(s: PostingSlot) {
  return {
    id: String(s.id),
    pageId: s.pageId,
    dayOfWeek: dayToEnum(s.dayOfWeek),
    timeOfDay: s.timeOfDay,
    timeStart: s.timeStart,
    timeEnd: s.timeEnd,
    mediaType: mediaOut(s.mediaType),
    enabled: s.enabled,
  };
}

// Parse del content_format serializzato (ScheduledPost.contentFormat) in oggetto,
// esponendo solo i 4 campi del contratto. Null se assente/non parseabile.
function parseContentFormat(raw: string | null): {
  textMode: string;
  visualKind: string;
  visualContent: string;
  aspect: string | null;
} | null {
  if (!raw || raw.trim() === "") return null;
  try {
    const o = JSON.parse(raw) as Partial<ContentFormat>;
    if (!o || typeof o !== "object") return null;
    return {
      textMode: String(o.textMode ?? "full"),
      visualKind: String(o.visualKind ?? "none"),
      visualContent: String(o.visualContent ?? "text"),
      aspect: o.aspect == null ? null : String(o.aspect),
    };
  } catch {
    return null;
  }
}

export function musicDto(m: MusicTrack) {
  return {
    id: String(m.id),
    title: m.title,
    durationSec: m.durationSec,
    mood: m.mood,
    addedAt: m.addedAt,
    url: `/api/music/${m.id}/file`,
  };
}

export function postDto(p: ScheduledPost) {
  return {
    id: String(p.id),
    pageId: p.pageId,
    bookId: p.bookId == null ? undefined : String(p.bookId),
    status: p.status,
    angle: null,
    body: p.message,
    baseHashtags: [] as string[],
    specificHashtags: [] as string[],
    finalHashtags: splitWs(p.hashtags),
    mediaType: mediaOut(p.mediaType),
    scheduledAt: p.scheduledAt,
    createdAt: p.createdAt,
    fbPostId: p.fbPostId,
    errorMessage: p.lastError,
    musicId: p.musicId == null ? null : Number(p.musicId),
    contentFormat: parseContentFormat(p.contentFormat),
    // Visual già renderizzato e attaccato alla bozza? Necessario per pubblicare come Storia.
    hasMedia: p.mediaPath != null && p.mediaPath !== "",
    // URL del visual renderizzato (immagine o video) da mostrare nell'anteprima della bozza,
    // così com'è = come apparirà su Facebook. null finché il render non è pronto.
    // `?v=updatedAt` = cache-busting: la coda render bumpa updatedAt quando attacca il nuovo
    // file, così l'URL cambia e il browser non ripesca dalla cache il vecchio video/immagine.
    mediaUrl:
      p.mediaPath != null && p.mediaPath !== ""
        ? `/api/posts/${p.id}/media?v=${p.updatedAt}`
        : null,
    // Natura del media: 'video' per mp4/webm/mov, altrimenti 'image'; null se assente.
    mediaKind: mediaKindOf(p.mediaPath),
    // Piattaforma del job: 'facebook' (default) o 'instagram' (Reel/Storia su IG, job locale
    // separato). Per le righe IG, linkedPostId è l'id dell'item Facebook gemello (o null).
    platform: p.platform,
    linkedPostId: p.linkedPostId == null ? null : String(p.linkedPostId),
    igMediaId: p.igMediaId,
  };
}

function mediaKindOf(path: string | null): "image" | "video" | null {
  if (!path) return null;
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return ext === "mp4" || ext === "webm" || ext === "mov" ? "video" : "image";
}

/** GeneratedPost (non salvato) -> ScheduledPost DTO per /posts/generate (anteprima). */
export function generatedToPostDto(g: Record<string, unknown>) {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    id: "preview",
    pageId: undefined as string | undefined,
    bookId: undefined as string | undefined,
    status: "DRAFT",
    angle: null,
    body: str(g.message ?? g.body),
    baseHashtags: splitWs(str(g.baseHashtags)),
    specificHashtags: splitWs(str(g.specificHashtags)),
    finalHashtags: splitWs(str(g.hashtags ?? g.finalHashtags)),
    mediaType: mediaOut(mediaIn(g.mediaType)),
    scheduledAt: null,
    createdAt: Date.now(),
    fbPostId: null,
    errorMessage: null,
  };
}
