import type { ContentEngine } from "../content/engine.js";
import { ContentError } from "../content/engine.js";
import { parseModelJson } from "../content/modelJson.js";
import { imageAspectRatio } from "./imageDimensions.js";
import { books, characters, media, quotes } from "../db/repositories.js";
import type { MediaAsset, ScheduledPost } from "../domain.js";
import {
  type Aspect,
  type VisualKind,
  type VisualSpec,
  ASPECTS,
  TEMPLATES,
  validateSpec,
} from "./spec.js";

export interface DirectorDeps {
  engine: ContentEngine;
}

export interface DirectorOpts {
  kind: VisualKind;
  template?: string;
  aspect?: Aspect;

  useImages?: boolean;

  musicTrackId?: number | null;

  target?: "reel" | "story";

  avoidQuotes?: string[];

  forceImageId?: number | null;

  chapterIndex?: number | null;

  avoidImages?: number[];

  quoteUsage?: Map<string, number>;
  imageUsage?: Map<number, number>;
}

interface AvailableImage {
  id: number;
  caption: string | null;
  scope: string;

  chapterIdx: number | null;
  tags: string[];
}

export interface DirectorResult {
  spec: VisualSpec;

  realQuotes: string[];

  availableImageIds: number[];

  chosenImageIds: number[];

  chosenQuote: string | null;
}

export function normalizeQuoteKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 180);
}

function primaryQuoteOf(spec: VisualSpec): string | null {
  if (spec.kind === "quote_card") return spec.quote.trim() || null;
  if (spec.kind === "reel_text") {
    const s = spec.scenes.find((x) => (x.quote ?? x.text ?? "").trim() !== "");
    return (s?.quote ?? s?.text ?? "").trim() || null;
  }
  if (spec.kind === "storyboard") {
    const p = spec.panels.find((x) => x.dialogue.trim() !== "");
    return p?.dialogue.trim() || null;
  }
  return null;
}

function imageIdsOf(spec: VisualSpec): number[] {
  const ids: number[] = [];
  const push = (id: number | null | undefined): void => {
    if (id != null && Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  };
  if (spec.kind === "quote_card") push(spec.imageId);
  else if (spec.kind === "reel_text") for (const s of spec.scenes) push(s.imageId);
  else if (spec.kind === "storyboard") for (const p of spec.panels) push(p.imageId);
  return ids;
}

const MAX_QUOTES = 12;
const MAX_IMAGES = 12;

type AspectCategory = "vertical" | "square" | "landscape";

function aspectCategory(ratio: number | null): AspectCategory | null {
  if (ratio == null) return null;
  if (ratio < 0.7) return "vertical";
  if (ratio > 1.25) return "landscape";
  return "square";
}

function targetAspectCategory(opts: DirectorOpts): AspectCategory {
  if (opts.aspect === "9:16") return "vertical";
  if (opts.aspect === "1.91:1") return "landscape";
  if (opts.aspect === "1:1" || opts.aspect === "4:5") return "square";
  return opts.kind === "reel_text" ? "vertical" : "square";
}

function normTag(t: string): string {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}

function rankImagesByRelevance(images: MediaAsset[], chapterIndex: number | null): MediaAsset[] {
  if (chapterIndex == null) return images;

  const profile = new Set<string>();
  for (const m of images) {
    if (m.chapterIdx === chapterIndex) for (const t of m.tags) profile.add(normTag(t));
  }
  const scored = images.map((m, i) => {
    let score = 0;
    if (m.chapterIdx != null) {
      const distance = Math.abs(m.chapterIdx - chapterIndex);
      score = Math.max(0, 1000 - distance * 50);
    }

    if (profile.size > 0) for (const t of m.tags) if (profile.has(normTag(t))) score++;
    return { m, score, i };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.m);
}

function deprioritizeImages(images: MediaAsset[], avoidImages: number[]): MediaAsset[] {
  if (avoidImages.length === 0) return images;
  const avoid = new Set(avoidImages);
  const fresh = images.filter((m) => !avoid.has(m.id));
  const used = images.filter((m) => avoid.has(m.id));
  return [...fresh, ...used];
}

function lruOrderQuotes(quotes: string[], usage: Map<string, number>): string[] {
  const withC = quotes.map((q) => ({ q, c: usage.get(normalizeQuoteKey(q)) ?? 0 }));
  for (let i = withC.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [withC[i], withC[j]] = [withC[j]!, withC[i]!];
  }
  withC.sort((a, b) => a.c - b.c);
  return withC.map((w) => w.q);
}

function lruOrderImages(images: MediaAsset[], usage: Map<number, number>): MediaAsset[] {
  return images.slice().sort((a, b) => (usage.get(a.id) ?? 0) - (usage.get(b.id) ?? 0));
}

const QUOTE_POOL_MIN = 8;

function brandFor(bookTitle: string | null, accent: string | null) {
  return { title: bookTitle, accent: accent ?? "#c8553d" };
}

function isGeneratedVisual(caption: string | null): boolean {
  return typeof caption === "string" && caption.startsWith("visual ");
}

function keyQuotesFromProfile(profile: { analysisJson?: string | null } | null): string[] {
  if (!profile?.analysisJson) return [];
  try {
    const j = JSON.parse(profile.analysisJson) as Record<string, unknown>;
    const kq = Array.isArray(j.key_quotes) ? j.key_quotes : [];
    const out: string[] = [];
    for (const item of kq) {
      if (typeof item === "string") {
        if (item.trim()) out.push(item.trim());
      } else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        if (o.is_spoiler === true) continue;
        const q = typeof o.quote === "string" ? o.quote : "";
        if (q.trim()) out.push(q.trim());
      }
    }
    return out;
  } catch {
    return [];
  }
}

function readingSeconds(text: string): number {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  const sec = 1.5 + words * 0.5;
  return Math.min(8, Math.max(3.5, Math.round(sec * 10) / 10));
}

export class Director {
  constructor(private readonly deps: DirectorDeps) {}

  async generaVisualSpec(post: ScheduledPost, opts: DirectorOpts): Promise<DirectorResult> {
    const bookId = post.bookId;

    const realQuotes: string[] = [];
    let charNames: string[] = [];
    let bookTitle: string | null = null;
    let images: AvailableImage[] = [];

    const useImages = opts.useImages !== false;

    if (bookId != null) {
      const [book, bookQuotes, chars, profile, mediaAssets] = await Promise.all([
        books.get(bookId),
        quotes.byBook(bookId),
        characters.byBook(bookId),
        books.currentProfile(bookId),
        useImages ? media.uploadsByBook(bookId) : Promise.resolve([]),
      ]);
      bookTitle = book?.title ?? null;

      let poolTexts: string[] = [];
      if (opts.chapterIndex != null) {
        poolTexts = await this.chapterQuotePool(bookId, opts.chapterIndex);
      }
      if (poolTexts.length === 0) poolTexts = bookQuotes.map((q) => q.text);
      if (poolTexts.length === 0) poolTexts = keyQuotesFromProfile(profile);
      for (const q of poolTexts) realQuotes.push(q);
      charNames = chars.map((c) => c.name);

      const wantCat = targetAspectCategory(opts);
      const uploads = mediaAssets.filter((m) => !isGeneratedVisual(m.caption));
      const rated = await Promise.all(
        uploads.map(async (m) => ({ m, cat: aspectCategory(await imageAspectRatio(m.path)) })),
      );

      const matching = rated.filter((x) => x.cat === wantCat).map((x) => x.m);
      const ranked = rankImagesByRelevance(matching, opts.chapterIndex ?? null);

      const rotated = opts.imageUsage
        ? lruOrderImages(ranked, opts.imageUsage)
        : deprioritizeImages(ranked, opts.avoidImages ?? []);
      images = rotated.slice(0, MAX_IMAGES).map((m) => ({
        id: m.id,
        caption: m.caption,
        scope: m.scope,
        chapterIdx: m.chapterIdx,
        tags: m.tags,
      }));
    }

    const validImageIds = new Set(images.map((m) => m.id));
    const availableImageIds = images.map((m) => m.id);

    const orderedAll = opts.quoteUsage
      ? lruOrderQuotes(realQuotes, opts.quoteUsage)
      : (() => {
          const avoid = new Set(opts.avoidQuotes ?? []);
          const fresh = realQuotes.filter((q) => !avoid.has(normalizeQuoteKey(q)));
          return fresh.length > 0 ? fresh : realQuotes;
        })();
    const orderedQuotes = orderedAll.slice(0, MAX_QUOTES);

    const fallbackText = (orderedQuotes[0] ?? post.message ?? bookTitle ?? "").trim();

    const forcedQuote = (
      orderedQuotes.length > 0
        ? opts.quoteUsage
          ? orderedQuotes[0]!
          : orderedQuotes[Math.floor(Math.random() * orderedQuotes.length)]!
        : fallbackText
    ).trim();

    const prompt = this.buildPrompt(post, opts, {
      realQuotes: orderedQuotes,
      charNames,
      bookTitle,
      images,
      useImages,
    });

    let spec: VisualSpec;
    try {
      const response = await this.deps.engine.run(prompt);
      const raw = parseModelJson(response);

      const merged = this.applyOverrides(raw, opts);
      spec = validateSpec(opts.kind, merged);

      this.forcePrimaryQuote(spec, forcedQuote, orderedQuotes);

      this.ensureRealText(spec, orderedQuotes, fallbackText);
    } catch (e) {
      if (!(e instanceof ContentError)) throw e;
      spec = this.fallbackSpec(opts, {
        realQuotes: orderedQuotes,
        charNames,
        bookTitle,
        fallbackText,
        images,
      });

      this.forcePrimaryQuote(spec, forcedQuote, orderedQuotes);
    }

    this.sanitizeImageIds(spec, validImageIds);

    this.applyForcedImage(spec, opts.forceImageId);

    this.applyMusicTrack(spec, opts.musicTrackId);

    this.applyReelTiming(spec, opts.target);

    this.applyReelImageVariety(spec, images, opts.forceImageId);

    const chosenQuote = forcedQuote || primaryQuoteOf(spec);
    return { spec, realQuotes, availableImageIds, chosenImageIds: imageIdsOf(spec), chosenQuote };
  }

  private async chapterQuotePool(bookId: number, chapterIndex: number): Promise<string[]> {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (qs: { text: string }[]): void => {
      for (const q of qs) {
        const k = normalizeQuoteKey(q.text);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(q.text);
        }
      }
    };
    add(await quotes.byChapter(bookId, chapterIndex));
    for (let r = 1; r <= 3 && out.length < QUOTE_POOL_MIN; r++) {
      add(await quotes.byChapter(bookId, chapterIndex - r));
      if (out.length >= QUOTE_POOL_MIN) break;
      add(await quotes.byChapter(bookId, chapterIndex + r));
    }
    return out;
  }

  private applyForcedImage(spec: VisualSpec, imageId: number | null | undefined): void {
    if (imageId == null || !Number.isInteger(imageId) || imageId <= 0) return;
    if (spec.kind === "quote_card") spec.imageId = imageId;
    else if (spec.kind === "reel_text") for (const s of spec.scenes) s.imageId = imageId;
    else if (spec.kind === "storyboard") for (const p of spec.panels) p.imageId = imageId;
  }

  private applyReelImageVariety(
    spec: VisualSpec,
    images: AvailableImage[],
    forcedImageId: number | null | undefined,
  ): void {
    if (spec.kind !== "reel_text") return;
    if (forcedImageId != null && Number.isInteger(forcedImageId) && forcedImageId > 0) return;
    const ids = images.map((m) => m.id);
    if (ids.length === 0) return;
    spec.scenes.forEach((s, i) => {
      s.imageId = ids[i % ids.length]!;
    });
  }

  private applyMusicTrack(spec: VisualSpec, trackId: number | null | undefined): void {
    if (spec.kind !== "reel_text") return;
    if (trackId == null || !Number.isInteger(trackId) || trackId <= 0) return;
    spec.music = { ...spec.music, trackId };
  }

  private applyReelTiming(spec: VisualSpec, target: "reel" | "story" | undefined): void {
    if (spec.kind !== "reel_text") return;
    const isStory = target === "story";
    const maxScenes = isStory ? 2 : 4;
    const totalCap = isStory ? 14 : 26;

    if (spec.scenes.length > maxScenes) spec.scenes = spec.scenes.slice(0, maxScenes);

    for (const s of spec.scenes) {
      s.sec = readingSeconds(s.quote ?? s.text ?? "");
    }

    while (spec.scenes.length > 1 && spec.scenes.reduce((a, s) => a + s.sec, 0) > totalCap) {
      spec.scenes.pop();
    }
    spec.durationSec = Math.round(spec.scenes.reduce((a, s) => a + s.sec, 0));
  }

  private sanitizeImageIds(spec: VisualSpec, validIds: Set<number>): void {
    const keep = (id: number | null | undefined): number | null =>
      id != null && validIds.has(id) ? id : null;
    if (spec.kind === "quote_card") {
      spec.imageId = keep(spec.imageId);
    } else if (spec.kind === "reel_text") {
      for (const s of spec.scenes) s.imageId = keep(s.imageId);
    } else if (spec.kind === "storyboard") {
      for (const p of spec.panels) p.imageId = keep(p.imageId);
    }
  }

  private applyOverrides(raw: unknown, opts: DirectorOpts): Record<string, unknown> {
    const o = (
      raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {}
    ) as Record<string, unknown>;
    o.kind = opts.kind;
    if (opts.template && TEMPLATES[opts.kind].includes(opts.template)) o.template = opts.template;
    if (opts.aspect && ASPECTS.includes(opts.aspect)) o.aspect = opts.aspect;
    return o;
  }

  private forcePrimaryQuote(spec: VisualSpec, forcedQuote: string, orderedQuotes: string[]): void {
    const primary = (forcedQuote ?? "").trim();
    if (!primary) return;
    if (spec.kind === "quote_card") {
      spec.quote = primary;
    } else if (spec.kind === "reel_text") {
      const distinct: string[] = [];
      for (const q of [primary, ...orderedQuotes]) {
        const t = (q ?? "").trim();
        if (t && !distinct.includes(t)) distinct.push(t);
      }
      spec.scenes.forEach((s, i) => {
        s.quote = distinct[Math.min(i, distinct.length - 1)]!;
        delete s.text;
      });
    } else if (spec.kind === "storyboard") {
      spec.panels[0]!.dialogue = primary;
    }
  }

  private ensureRealText(spec: VisualSpec, realQuotes: string[], fallbackText: string): void {
    const text = (realQuotes[0] ?? fallbackText ?? "").trim();
    if (!text) return;
    if (spec.kind === "quote_card" && spec.quote.trim() === "") {
      spec.quote = text;
    } else if (spec.kind === "reel_text") {
      const hasText = spec.scenes.some((s) => (s.text ?? s.quote ?? "").trim() !== "");
      if (!hasText && spec.scenes[0]) spec.scenes[0].quote = text;
    } else if (spec.kind === "storyboard") {
      const hasText = spec.panels.some((p) => p.dialogue.trim() !== "");
      if (!hasText && spec.panels[0]) spec.panels[0].dialogue = text;
    }
  }

  private fallbackSpec(
    opts: DirectorOpts,
    ctx: {
      realQuotes: string[];
      charNames: string[];
      bookTitle: string | null;
      fallbackText: string;
      images: AvailableImage[];
    },
  ): VisualSpec {
    const texts =
      ctx.realQuotes.length > 0 ? ctx.realQuotes : ctx.fallbackText ? [ctx.fallbackText] : [];
    const quote = texts[0] ?? "";
    const source = ctx.bookTitle ?? "";
    const imageIds = ctx.images.map((m) => m.id);
    if (opts.kind === "reel_text") {
      return validateSpec("reel_text", {
        template: opts.template,
        scenes: texts.slice(0, 3).map((q, i) => ({
          quote: q,
          anim: "fade",
          sec: 3,
          imageId: imageIds.length > 0 ? imageIds[i % imageIds.length] : null,
        })),
        background: { type: "gradient", palette: "ink" },
        music: { mood: "calm" },
      });
    }
    if (opts.kind === "storyboard") {
      return validateSpec("storyboard", {
        aspect: opts.aspect,
        panels: texts.slice(0, 4).map((q, i) => ({
          speaker: ctx.charNames[i] ?? "",
          dialogue: q,
          bg: "ink",
          imageId: imageIds.length > 0 ? imageIds[i % imageIds.length] : null,
        })),
      });
    }
    return validateSpec("quote_card", {
      template: opts.template,
      aspect: opts.aspect,
      quote,
      source,
      palette: "ink",
      imageId: imageIds[0] ?? null,
    });
  }

  private buildPrompt(
    post: ScheduledPost,
    opts: DirectorOpts,
    ctx: {
      realQuotes: string[];
      charNames: string[];
      bookTitle: string | null;
      images: AvailableImage[];
      useImages: boolean;
    },
  ): string {
    const templates = TEMPLATES[opts.kind].join(", ");
    const quotesBlock =
      ctx.realQuotes.length > 0
        ? ctx.realQuotes.map((q, i) => `${i + 1}. ${q}`).join("\n")
        : "(no quotes extracted from the book: use ONE short punchy sentence taken from the POST TEXT below, copied verbatim; do NOT invent and do NOT leave text fields empty)";
    const charsBlock = ctx.charNames.length > 0 ? ctx.charNames.join(", ") : "(none)";
    const brand = brandFor(ctx.bookTitle, null);

    const schema = this.schemaHint(opts.kind);
    const imagesSection = this.imagesSection(
      opts.kind,
      ctx.images,
      ctx.useImages,
      opts.chapterIndex ?? null,
    );

    return `You are an ART DIRECTOR for social media. Do NOT draw pixels: choose a FIXED TEMPLATE and
produce EXCLUSIVELY a JSON object (a SPEC) that a renderer will execute. No text before or after the JSON.

IRON RULE: visual texts (quotes/dialogues) must come from REAL text, copied verbatim: prefer the
REAL QUOTES below; if the list is empty, use ONE short sentence taken from the POST TEXT below
(it is real text). Do NOT invent, do NOT paraphrase, and do NOT leave text fields empty.

REQUESTED TYPE: ${opts.kind}
ALLOWED TEMPLATES (pick one): ${templates}
ALLOWED ASPECTS: ${ASPECTS.join(", ")}
${opts.template ? `Use template: ${opts.template}` : ""}
${opts.aspect ? `Use aspect: ${opts.aspect}` : ""}

BRAND: book title = ${brand.title ?? "(not specified)"}; suggested accent = ${brand.accent}
CHARACTERS (real names, use ONLY these as speakers): ${charsBlock}

REAL QUOTES (use ONLY these, verbatim; they are ORDERED: PREFER the first ones, not recently
used, so the same sentence is not repeated across posts/reels/stories):
${quotesBlock}
${imagesSection}
POST TEXT (use it for tone; if there are no real quotes, copy ONE short sentence from it into the text fields):
${post.message}

Reply with a JSON of this form (fill missing fields with sensible values):
${schema}`;
  }

  private imagesSection(
    kind: VisualKind,
    images: AvailableImage[],
    useImages: boolean,
    chapterIndex: number | null,
  ): string {
    if (!useImages || images.length === 0) {
      return `\nBOOK IMAGES: none available. Do NOT use any imageId field (leave it null or omit it): the composition will be TEXT ONLY.\n`;
    }

    const list = images
      .map((m) => {
        const label = (m.caption && m.caption.trim()) || m.scope;
        const ch = m.chapterIdx != null ? ` [ch.${m.chapterIdx}]` : "";
        const tags = m.tags.length > 0 ? ` {${m.tags.join(", ")}}` : "";
        return `- ${m.id}: ${label}${ch}${tags}`;
      })
      .join("\n");

    const relevanceNote =
      chapterIndex != null
        ? `Images are ORDERED BY RELEVANCE to the post (chapter ${chapterIndex} and subjects): when equally suitable, PREFER the FIRST ones in the list.\n`
        : "";
    const guidance =
      kind === "reel_text"
        ? `Choose the COMPOSITION: (a) text only (no imageId), (b) slideshow with multiple scenes, each with a DIFFERENT imageId chosen from the list (presentation effect). Assign imageIds to the "imageId" field of each scene.`
        : kind === "storyboard"
          ? `You may optionally assign a background "imageId" to each panel, chosen from the list.`
          : `Choose the COMPOSITION: (a) text only (no imageId), (b) single background: set "imageId" to ONE id from the list (the quote will appear over a dark overlay for readability).`;
    return `
AVAILABLE BOOK IMAGES (use ONLY these ids, do NOT invent others):
${list}
${relevanceNote}IMAGE COMPOSITION: ${guidance}
Images are background ONLY: the text remains the real quote, readable over a dark overlay.
`;
  }

  private schemaHint(kind: VisualKind): string {
    if (kind === "reel_text") {
      return `{
  "kind": "reel_text",
  "template": "<one of the allowed templates>",
  "aspect": "9:16",
  "durationSec": 9,
  "scenes": [{ "quote": "<real quote>", "anim": "fade|slide|zoom|none", "sec": 3, "cta": "<optional>", "imageId": <image id from the list or null> }],
  "music": { "mood": "calm|epic|warm" },
  "background": { "type": "gradient|solid", "palette": "ink|warm|cool|mono|brand" }
}`;
    }
    if (kind === "storyboard") {
      return `{
  "kind": "storyboard",
  "aspect": "<one of the allowed aspects>",
  "panels": [{ "speaker": "<real character name or empty>", "dialogue": "<real dialogue>", "bg": "ink|warm|cool|mono|brand", "imageId": <image id from the list or null> }]
}`;
    }
    return `{
  "kind": "quote_card",
  "template": "<one of the allowed templates>",
  "aspect": "<one of the allowed aspects>",
  "quote": "<real quote, verbatim>",
  "source": "<book title or author>",
  "palette": "ink|warm|cool|mono|brand",
  "accent": "#rrggbb",
  "imageId": <background image id from the list or null>
}`;
  }
}
