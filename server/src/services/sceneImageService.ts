import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { mediaDir } from "../paths.js";
import { books, characters, media, settings, visualDirectives } from "../db/repositories.js";
import type { ContentEngine } from "../content/engine.js";
import {
  buildSceneDescription,
  selectChapterScenes,
  type SceneFlashback,
  type SceneCharacter,
  type SceneSelection,
} from "../content/imagePrompt.js";
import * as aiSettings from "../content/aiSettings.js";
import { applyStyleForProvider, buildScenePrompt, type SceneAspect } from "../media/imageGen.js";
import { createImageEngine, imagePromptProfile } from "../media/imageEngine.js";
import { verifySceneImage } from "../content/visionCheck.js";
import { appConfig } from "../config.js";
import type { ChapterSceneService } from "./chapterSceneService.js";
import type { BookCharacter, ChapterScene, VisualDirective } from "../domain.js";
import { anyKeywordMatches } from "../content/imageDomains.js";

function namesMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === "" || y === "") return false;
  return x === y || x.includes(y) || y.includes(x);
}

const PHYSICS_TOKEN_STOP = new Set([
  "del",
  "della",
  "delle",
  "dei",
  "degli",
  "con",
  "una",
  "uno",
  "per",
  "alla",
  "dal",
]);
function physicsTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-zà-ù0-9]+/i)
    .filter((t) => t.length >= 4 && !PHYSICS_TOKEN_STOP.has(t));
}
function mentionsWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-zà-ù0-9])${word}([^a-zà-ù0-9]|$)`, "i").test(text);
}
function pruneChapterPhysics(
  rules: readonly string[],
  allObjectNames: readonly string[],
  selectedObjectNames: readonly string[],
): string[] {
  const selectedToks = new Set(selectedObjectNames.flatMap(physicsTokens));
  const droppedToks = allObjectNames
    .filter((n) => !selectedObjectNames.some((s) => namesMatch(n, s)))
    .flatMap(physicsTokens)
    .filter((t) => !selectedToks.has(t));
  if (droppedToks.length === 0) return rules.slice();
  return rules.filter((rule) => {
    if (!droppedToks.some((t) => mentionsWord(rule, t))) return true;

    return [...selectedToks].some((t) => mentionsWord(rule, t));
  });
}

const SCENE_VARIETY_STOP = new Set([
  "about",
  "after",
  "along",
  "also",
  "away",
  "because",
  "behind",
  "beside",
  "between",
  "camera",
  "clear",
  "close",
  "color",
  "coloured",
  "colored",
  "down",
  "each",
  "eyes",
  "face",
  "from",
  "front",
  "into",
  "light",
  "little",
  "medium",
  "near",
  "other",
  "over",
  "scene",
  "shot",
  "side",
  "skin",
  "slightly",
  "still",
  "their",
  "there",
  "toward",
  "under",
  "very",
  "view",
  "where",
  "while",
  "with",
  "without",
  "italian",
  "italiano",
  "roman",
  "romano",
  "mediterranean",
  "person",
  "people",
  "woman",
  "women",
  "adult",
  "young",
  "years",
  "year",
  "tall",
  "short",
  "hair",
  "brown",
  "dark",
  "olive",
  "athletic",
  "build",
  "lean",
  "circa",
  "anni",
  "pelle",
  "uomo",
  "donna",
  "volto",
  "capelli",
  "castano",
  "olivastra",
  "chiara",
]);

function sceneVarietyTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-zà-ù0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !SCENE_VARIETY_STOP.has(t));
}

function addWeightedTokens(
  weights: Map<string, number>,
  text: string | null | undefined,
  weight: number,
): void {
  if (!text || text.trim() === "") return;
  for (const token of sceneVarietyTokens(text)) {
    weights.set(token, Math.max(weights.get(token) ?? 0, weight));
  }
}

function sceneSelectionWeights(scene: SceneSelection): Map<string, number> {
  const weights = new Map<string, number>();
  addWeightedTokens(weights, scene.brief, 1);
  addWeightedTokens(weights, scene.characters.join(" "), 1);
  addWeightedTokens(weights, scene.framing, 2);
  addWeightedTokens(weights, scene.mood, 2);
  addWeightedTokens(weights, scene.objects.join(" "), 4);
  addWeightedTokens(weights, scene.subject, 5);
  return weights;
}

function sceneDirectiveHaystack(card: ChapterScene | null, passage: string): string {
  return [
    card?.keyMoment ?? "",
    card?.location ?? "",
    card?.environment ?? "",
    ...(card?.mainObjects ?? []),
    ...(card?.secondaryObjects ?? []),
    passage,
  ]
    .join(" ")
    .toLowerCase();
}

function compactDirectiveForSceneSelection(d: VisualDirective): string | null {
  const body = (d.bodyEn ?? d.body ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (body === "") return d.title.trim() !== "" ? `- ${d.title}` : null;
  const max = 5_200;
  if (body.length <= max) return `- ${d.title}:\n${body}`;
  const half = Math.floor(max / 2);
  return `- ${d.title}:\n${body.slice(0, half).trimEnd()}\n...\n${body.slice(-half).trimStart()}`;
}

function directiveGuidanceForSceneSelection(
  directives: readonly VisualDirective[],
  card: ChapterScene | null,
  passage: string,
): string[] {
  const haystack = sceneDirectiveHaystack(card, passage);
  const out: string[] = [];
  for (const d of directives) {
    if (!d.enabled) continue;
    const alwaysOn = d.triggers.length === 0;
    if (!alwaysOn && !anyKeywordMatches(haystack, d.triggers)) continue;
    const text = compactDirectiveForSceneSelection(d);
    if (text) out.push(text);
  }
  return out;
}

function normalizedPhrase(text: string): string {
  return sceneVarietyTokens(text).join(" ");
}

export function pickLeastRepeatedSceneSelection(
  scenes: readonly SceneSelection[],
  existingPromptTexts: readonly string[],
): SceneSelection | null {
  if (scenes.length === 0) return null;
  const history = existingPromptTexts
    .map((text) => text.trim())
    .filter((text) => text !== "")
    .map((text) => ({ raw: text.toLowerCase(), tokens: new Set(sceneVarietyTokens(text)) }));
  if (history.length === 0) return scenes[0] ?? null;

  let best = scenes[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const scene of scenes) {
    const weights = sceneSelectionWeights(scene);
    const subjectPhrase = normalizedPhrase(scene.subject);
    let score = 0;
    for (const seen of history) {
      for (const [token, weight] of weights) {
        if (seen.tokens.has(token)) score += weight;
      }
      if (subjectPhrase.length >= 8 && seen.raw.includes(subjectPhrase)) score += 20;
    }
    if (score < bestScore) {
      best = scene;
      bestScore = score;
    }
  }
  return best;
}

function buildHardConstraints(
  depicted: readonly SceneCharacter[],
  flashback?: SceneFlashback | null,
): string[] {
  const out: string[] = [];
  for (const c of depicted) {
    const eth = (c.ethnicity ?? "").trim();

    let age = (c.age ?? "").trim();
    if (flashback) {
      const nm = c.name.toLowerCase().trim();
      const abs = (flashback.characterAges ?? []).find((a) => {
        const x = (a.name ?? "").toLowerCase().trim();
        return x !== "" && (x === nm || x.includes(nm) || nm.includes(x));
      });
      if (abs) {
        age = `about ${abs.age}`;
      } else if (flashback.youngerYears && flashback.youngerYears > 0) {
        const canon = parseInt(age.replace(/[^0-9]/g, ""), 10);
        age = Number.isFinite(canon) ? `about ${Math.max(0, canon - flashback.youngerYears)}` : "";
      } else {
        age = "";
      }
    }
    const sig = (c.outfits?.signature ?? "").trim();
    const traits = [eth ? `ethnicity ${eth}` : "", age ? `age ${age}` : ""]
      .filter(Boolean)
      .join(", ");
    if (traits) out.push(`a person shown must match ${traits}`);
    if (sig) out.push(`a person shown must visibly wear ${sig} (their ALWAYS signature item)`);
  }
  return out;
}

function pickCastForChapter(
  chars: BookCharacter[],
  chapterIndex: number,
  card: ChapterScene | null,
  featureCharacters?: readonly string[] | null,
): BookCharacter[] {
  if (chars.length === 0) return [];
  const requested = resolveWanted(chars, featureCharacters ?? []);
  if (requested.length > 0) return requested;
  const protagIdx = chars.findIndex((c) => /protagon|principale|\bmain\b/i.test(c.role ?? ""));
  const protagonist = chars[protagIdx >= 0 ? protagIdx : 0]!;
  const cardNames = (card?.characters ?? []).map((n) => n.trim()).filter((n) => n.length > 0);

  let picked: BookCharacter[];
  if (cardNames.length > 0) {
    picked = chars.filter((c) => cardNames.some((n) => namesMatch(c.name, n)));
  } else {
    const haveNlp = chars.some((c) => c.chapters.length > 0);
    picked = haveNlp ? chars.filter((c) => c.chapters.includes(chapterIndex)) : chars.slice();
  }
  if (!picked.some((c) => c.id === protagonist.id)) picked = [protagonist, ...picked];

  for (const name of featureCharacters ?? []) {
    if (!name || name.trim() === "") continue;
    const wanted = chars.find((c) => namesMatch(c.name, name));
    if (wanted && !picked.some((c) => c.id === wanted.id)) picked = [...picked, wanted];
  }
  return picked;
}

function resolveWanted(chars: BookCharacter[], names: readonly string[]): BookCharacter[] {
  const out: BookCharacter[] = [];
  for (const name of names) {
    if (!name || name.trim() === "") continue;
    const found = chars.find((c) => namesMatch(c.name, name));
    if (found && !out.some((c) => c.id === found.id)) out.push(found);
  }
  return out;
}

export interface SceneImageDeps {
  engine: ContentEngine;
  chapterScenes: ChapterSceneService;
}

export interface SceneImageResult {
  mediaId: number;
  path: string;
  aspect: SceneAspect;
  chapterIndex: number | null;
}

export class SceneImageService {
  constructor(private readonly deps: SceneImageDeps) {}

  available(): boolean {
    return createImageEngine().available();
  }

  private async safeExcerpt(
    bookId: number,
    avoid: ReadonlySet<number>,
    prefer: number | null = null,

    restrictChapters: ReadonlySet<number> | null = null,
  ): Promise<{ text: string; chapterIndex: number; title: string | null } | null> {
    const chapters = await books.chapters(bookId);
    if (chapters.length === 0) return null;

    const eligibleChapters = chapters.filter((ch) => !ch.excluded);
    const base = eligibleChapters.length > 0 ? eligibleChapters : chapters;
    const safe = base.slice(0, Math.max(0, base.length - 2));
    let pool = safe.length > 0 ? safe : base;
    if (restrictChapters && restrictChapters.size > 0) {
      const inSafe = pool.filter((ch) => restrictChapters.has(ch.index));
      const inAll = base.filter((ch) => restrictChapters.has(ch.index));
      pool = inSafe.length > 0 ? inSafe : inAll.length > 0 ? inAll : pool;
    }

    let chosen = prefer != null ? (chapters.find((ch) => ch.index === prefer) ?? null) : null;
    if (!chosen) {
      const fresh = pool.filter((ch) => !avoid.has(ch.index));
      const candidates = fresh.length > 0 ? fresh : pool;
      chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]!;
    }
    const clean = chosen.text.replace(/\s+/g, " ").trim();
    if (clean === "") return null;
    return {
      text: clean,
      chapterIndex: chosen.index,
      title: chosen.title ?? null,
    };
  }

  private async buildSceneForChapter(
    bookId: number,
    opts?: {
      angle?: string | null;
      avoidChapterIndexes?: number[];
      chapterIndex?: number | null;

      featureCharacters?: readonly string[] | null;

      flashback?: SceneFlashback | null;

      forceFlashback?: boolean;

      moment?: number | null;

      randomMoment?: boolean;
      selectFreshScene?: boolean;
      selectedScene?: SceneSelection | null;
      signal?: AbortSignal;
    },
  ): Promise<{
    description: string;
    tags: string[];
    chapterIndex: number | null;
    hardConstraints: string[];
  } | null> {
    const avoid = new Set(opts?.avoidChapterIndexes ?? []);
    const features = (opts?.featureCharacters ?? []).map((n) => n.trim()).filter((n) => n !== "");
    const allChars = await characters.byBook(bookId);

    const wanted = features.length > 0 ? resolveWanted(allChars, features) : [];
    const union = new Set<number>();
    for (const w of wanted) for (const ch of w.chapters) union.add(ch);
    const restrict = union.size > 0 ? union : null;
    const [excerpt, book, directives] = await Promise.all([
      this.safeExcerpt(bookId, avoid, opts?.chapterIndex ?? null, restrict),
      books.get(bookId),
      visualDirectives.byBook(bookId),
    ]);

    const baseCard =
      excerpt != null
        ? await this.deps.chapterScenes.getOrBuild(bookId, excerpt.chapterIndex)
        : null;
    if (opts?.signal?.aborted) return null;

    let effMoment = opts?.moment ?? -1;
    const altCount = baseCard?.altMoments?.length ?? 0;
    if ((opts?.moment == null || opts.moment < 0) && opts?.randomMoment && altCount > 0) {
      const pick = Math.floor(Math.random() * (altCount + 1));
      effMoment = pick === altCount ? -1 : pick;
    }
    const chosenMoment = effMoment >= 0 ? (baseCard?.altMoments?.[effMoment] ?? null) : null;
    const card: ChapterScene | null =
      chosenMoment && baseCard
        ? {
            ...baseCard,
            location: chosenMoment.location,
            environment: chosenMoment.environment,
            mainObjects: chosenMoment.mainObjects,
            secondaryObjects: chosenMoment.secondaryObjects,
            characters: chosenMoment.characters,
            physicsRules: chosenMoment.physicsRules,
            keyMoment: chosenMoment.keyMoment,
            kind: chosenMoment.type,
            youngerYears: chosenMoment.youngerYears,
            characterAges: chosenMoment.characterAges,
            altMoments: [],
          }
        : baseCard;

    const eligible =
      excerpt != null
        ? pickCastForChapter(allChars, excerpt.chapterIndex, card, features)
        : allChars;

    let angle = this.composeAngle(opts?.angle ?? null, wanted);

    let twoPassChars = eligible;
    let twoPassCard: ChapterScene | null = card;
    let twoPassProps = book?.visualProps;
    let twoPassExcerpt = excerpt?.text ?? null;
    const defaultWaking =
      !opts?.flashback &&
      !opts?.forceFlashback &&
      (opts?.moment == null || opts.moment < 0) &&
      !opts?.randomMoment &&
      card?.kind !== "flashback" &&
      card?.kind !== "dream";
    if (defaultWaking && excerpt && features.length === 0) {
      let sel = opts?.selectedScene ?? null;
      if (!sel && opts?.selectFreshScene) {
        const sels = await selectChapterScenes(
          this.deps.engine,
          {
            chapterTitle: excerpt.title,
            chapterExcerpt: excerpt.text,
            bookTitle: book?.title ?? null,
            sceneCard: card,
            castNames: eligible.map((c) => ({ name: c.name, role: c.role })),
            objectNames: (book?.visualProps?.props ?? []).map((p) => p.name),
            directiveNames: directives.filter((d) => d.enabled).map((d) => d.title),
            directiveGuidance: directiveGuidanceForSceneSelection(directives, card, excerpt.text),
          },
          8,
        );
        sel = pickLeastRepeatedSceneSelection(
          sels ?? [],
          await this.existingPromptTextsForChapter(bookId, excerpt.chapterIndex),
        );
      }
      if (!sel) {
        const sels = await selectChapterScenes(
          this.deps.engine,
          {
            chapterTitle: excerpt.title,
            chapterExcerpt: excerpt.text,
            bookTitle: book?.title ?? null,
            sceneCard: card,
            castNames: eligible.map((c) => ({ name: c.name, role: c.role })),
            objectNames: (book?.visualProps?.props ?? []).map((p) => p.name),
            directiveNames: directives.filter((d) => d.enabled).map((d) => d.title),
            directiveGuidance: directiveGuidanceForSceneSelection(directives, card, excerpt.text),
          },
          1,
        );
        sel = sels?.[0] ?? null;
      }
      if (sel) {
        const chosen = eligible.filter((c) => sel.characters.some((nm) => namesMatch(c.name, nm)));
        twoPassChars = sel.characters.length === 0 ? [] : chosen.length > 0 ? chosen : eligible;
        if (book?.visualProps) {
          twoPassProps = {
            ...book.visualProps,
            props: book.visualProps.props.filter((p) =>
              sel.objects.some((nm) => namesMatch(p.name, nm)),
            ),
          };
        }
        if (card) {
          twoPassCard = {
            ...card,
            keyMoment: sel.brief || card.keyMoment,
            mainObjects: sel.objects.length > 0 ? sel.objects : card.mainObjects,
            secondaryObjects: [],
            characters: sel.characters.length > 0 ? sel.characters : card.characters,
            physicsRules: pruneChapterPhysics(
              card.physicsRules ?? [],
              (book?.visualProps?.props ?? []).map((p) => p.name),
              sel.objects,
            ),
          };
        }
        twoPassExcerpt = sel.brief || excerpt.text;
        if (sel.framing)
          angle = [angle, sel.framing].filter((s) => s && s.trim() !== "").join("; ");
      }
    }
    const resolvedFlashback =
      opts?.flashback ??
      (opts?.forceFlashback || card?.kind === "flashback"
        ? {
            youngerYears: card?.youngerYears ?? undefined,
            setting: card?.location ?? undefined,
            characterAges: card?.characterAges ?? undefined,
          }
        : null);
    const imageProfile = imagePromptProfile();
    const scene = await buildSceneDescription(this.deps.engine, {
      chapterExcerpt: twoPassExcerpt,
      chapterTitle: excerpt?.title ?? null,
      characters: twoPassChars.map((c) => ({
        name: c.name,
        physical: c.physical,
        age: c.age,
        ethnicity: c.ethnicity,
        role: c.role,
        outfits: c.outfits,
      })),
      bookTitle: book?.title ?? null,
      angle,
      sceneCard: twoPassCard,

      directives,
      visualProps: twoPassProps,
      visualExtras: book?.visualExtras,

      extraInstructions: [aiSettings.getPromptExtras().image, book?.imageExtraInstructions]
        .map((s) => (s ?? "").trim())
        .filter((s) => s !== "")
        .join("\n\n"),

      flashback: resolvedFlashback,
      dream: card?.kind === "dream",
      imageProfile,
    });
    if (!scene) return null;

    const hardConstraints = buildHardConstraints(scene.depicted, resolvedFlashback);
    return {
      description: scene.description,
      tags: scene.tags,
      chapterIndex: excerpt?.chapterIndex ?? null,
      hardConstraints,
    };
  }

  private composeAngle(angle: string | null, wanted: readonly BookCharacter[]): string | null {
    if (wanted.length === 0) return angle;
    const MAX = 3;
    const featured = wanted.slice(0, MAX);

    const lookOf = (c: BookCharacter): string => {
      const eth = (c.ethnicity ?? "").trim();
      const age = (c.age ?? "").trim();
      const phys = (c.physical ?? "").trim();
      const short = phys.length > 280 ? `${phys.slice(0, 280).trimEnd()}…` : phys;
      return [eth ? `ethnicity ${eth}` : "", age ? `age ${age}` : "", short]
        .filter(Boolean)
        .join("; ");
    };
    const describe = (c: BookCharacter): string => {
      const look = lookOf(c);
      return look.length > 0 ? `one rendered by appearance as: ${look}` : "one specific character";
    };
    let directive: string;
    if (featured.length === 1) {
      const look = lookOf(featured[0]!);
      const desc = look.length > 0 ? ` (render by appearance: ${look})` : "";
      directive =
        `Composition: this image MUST visibly contain this specific PERSON — they are REQUIRED in the frame; ` +
        `ONLY this one person may appear: do NOT include any other person, named character, rescuer, victim, ` +
        `partner, crowd member, bystander, duplicate or background figure. ` +
        `never render a scene without them, and even if this chapter has a strong iconic animal, object or ` +
        `landscape, that element may appear WITH them but must NOT replace them. FEATURE this character ` +
        `prominently${desc}, INTERACTING with ` +
        `the scene (using, touching, reaching toward or moving with the iconic subject) in a candid but ` +
        `RELAXED, NATURAL pose with upright balanced posture — NOT a posed portrait, NOT contorted or ` +
        `tilted, gaze on the action/subject and NEVER toward the camera. Render the ` +
        `person ONLY by physical appearance, never by name. They are the clear focal subject of the image.`;
    } else {
      const list = featured.map(describe).join("; ");
      directive =
        `Composition: this image MUST visibly contain these ${featured.length} specific PEOPLE — they are ` +
        `the ONLY people allowed in the frame: do NOT include any other named character, rescuer, victim, ` +
        `partner, crowd member, bystander, duplicate or background figure. They are ` +
        `REQUIRED in the frame and must NOT be replaced by an iconic animal/object/landscape (which may ` +
        `appear WITH them). FEATURE these ${featured.length} characters TOGETHER in the frame ` +
        `(${list}), in a candid but RELAXED, NATURAL INTERACTION with each other or the scene (talking, ` +
        `walking, working or moving with the iconic subject), each with upright balanced posture, not ` +
        `contorted or tilted — NOT posed portraits, faces turned toward each ` +
        `other or the action and NEVER toward the camera. Include ONLY characters actually present in ` +
        `THIS passage; render each person ONLY by physical appearance, never by name. They are the clear ` +
        `focal subjects of the image.`;
    }
    return angle && angle.trim() !== "" ? `${directive} ${angle.trim()}` : directive;
  }

  async buildPromptForChapter(
    bookId: number,
    chapterIndex: number,
    opts?: {
      angle?: string | null;
      featureCharacters?: readonly string[] | null;
      flashback?: SceneFlashback | null;
      selectedScene?: SceneSelection | null;
    },
  ): Promise<string | null> {
    const data = await this.buildPromptDataForChapter(bookId, chapterIndex, opts);
    return data?.prompt ?? null;
  }

  async buildPromptDataForChapter(
    bookId: number,
    chapterIndex: number,
    opts?: {
      angle?: string | null;
      featureCharacters?: readonly string[] | null;
      flashback?: SceneFlashback | null;
      selectedScene?: SceneSelection | null;
    },
  ): Promise<{ prompt: string; tags: string[] } | null> {
    const scene = await this.buildSceneForChapter(bookId, {
      chapterIndex,
      ...(opts?.angle != null ? { angle: opts.angle } : {}),
      ...(opts?.featureCharacters != null ? { featureCharacters: opts.featureCharacters } : {}),
      ...(opts?.flashback != null ? { flashback: opts.flashback } : {}),
      ...(opts?.selectedScene != null ? { selectedScene: opts.selectedScene } : {}),
    });
    if (!scene) return null;
    return { prompt: buildScenePrompt(scene.description), tags: scene.tags };
  }

  async selectFreshSceneForChapter(
    bookId: number,
    chapterIndex: number,
  ): Promise<SceneSelection | null> {
    const scenes = await this.selectScenesForChapter(bookId, chapterIndex, 8);
    if (!scenes || scenes.length === 0) return null;
    return pickLeastRepeatedSceneSelection(
      scenes,
      await this.existingPromptTextsForChapter(bookId, chapterIndex),
    );
  }

  private async existingPromptTextsForChapter(
    bookId: number,
    chapterIndex: number,
  ): Promise<string[]> {
    return (await media.byBook(bookId))
      .filter((m) => m.chapterIdx === chapterIndex && m.genPrompt && m.genPrompt.trim() !== "")
      .map((m) => [m.tags.join(" "), m.genPrompt ?? ""].filter((s) => s.trim() !== "").join("\n"));
  }

  async selectScenesForChapter(
    bookId: number,
    chapterIndex: number,
    count: number,
  ): Promise<SceneSelection[] | null> {
    const [excerpt, book, directives, allChars] = await Promise.all([
      this.safeExcerpt(bookId, new Set<number>(), chapterIndex, null),
      books.get(bookId),
      visualDirectives.byBook(bookId),
      characters.byBook(bookId),
    ]);
    if (!excerpt) return null;
    const card = await this.deps.chapterScenes.getOrBuild(bookId, excerpt.chapterIndex);
    const eligible = pickCastForChapter(allChars, excerpt.chapterIndex, card, []);
    const objectNames = (book?.visualProps?.props ?? [])
      .map((p) => p.name)
      .filter((n) => n.trim() !== "");
    const directiveNames = directives.filter((d) => d.enabled).map((d) => d.title);
    const directiveGuidance = directiveGuidanceForSceneSelection(directives, card, excerpt.text);
    return selectChapterScenes(
      this.deps.engine,
      {
        chapterTitle: excerpt.title,
        chapterExcerpt: excerpt.text,
        bookTitle: book?.title ?? null,
        sceneCard: card,
        castNames: eligible.map((c) => ({ name: c.name, role: c.role })),
        objectNames,
        directiveNames,
        directiveGuidance,
      },
      count,
    );
  }

  async generateForBook(
    bookId: number,
    aspect: SceneAspect,
    opts?: {
      angle?: string | null;
      avoidChapterIndexes?: number[];

      chapterIndex?: number | null;

      featureCharacters?: readonly string[] | null;

      flashback?: SceneFlashback | null;

      forceFlashback?: boolean;

      moment?: number | null;

      randomMoment?: boolean;
      selectFreshScene?: boolean;
      selectedScene?: SceneSelection | null;
      signal?: AbortSignal;
    },
  ): Promise<SceneImageResult | null> {
    if (!createImageEngine().available() || opts?.signal?.aborted) return null;
    const scene = await this.buildSceneForChapter(bookId, opts);
    if (!scene) return null;

    if (opts?.signal?.aborted) return null;
    const outPath = join(mediaDir(), `scene-${bookId}-${randomUUID()}.png`);

    const seed = Math.floor(Math.random() * 1_000_000_000);
    const ok = await createImageEngine().generate({
      prompt: buildScenePrompt(scene.description),
      aspect,
      outPath,
      seed,
      ...(opts?.signal ? { signal: opts.signal } : {}),
    });
    if (!ok) return null;

    const asset = await media.insert({
      bookId,
      chapterId: null,
      scope: "GENERAL",
      path: outPath,
      caption: null,

      genPrompt: applyStyleForProvider(
        buildScenePrompt(scene.description),
        aiSettings.getImage().provider,
      ),
      chapterIdx: scene.chapterIndex,
      tags: scene.tags,
      seed,
      addedAt: Date.now(),
    });

    try {
      if ((await settings.get("qa_enabled")) !== "off") {
        const verdict = await verifySceneImage({
          imagePath: outPath,
          genPrompt: scene.description,
          binary: appConfig.opencodeBinary,
          model: appConfig.opencodeModel,
          timeoutMs: appConfig.visionTimeoutMs,

          hardConstraints: scene.hardConstraints,
        });
        await media.setQa(asset.id, verdict);
      }
    } catch {}
    return { mediaId: asset.id, path: outPath, aspect, chapterIndex: scene.chapterIndex };
  }
}
