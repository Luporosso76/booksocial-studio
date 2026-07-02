export type MediaType = "TEXT" | "LINK" | "PHOTO" | "REEL" | "STORY";
export const MEDIA_TYPES: MediaType[] = ["TEXT", "LINK", "PHOTO", "REEL", "STORY"];

export type PostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELLED";

export interface Book {
  id: number;
  title: string;
  author: string | null;
  language: string;
  sourcePath: string;
  contentHash: string;
  chapterCount: number;
  charCount: number;
  importedAt: number;
  updatedAt: number;
  websiteUrl: string | null;
  notes: string | null;
  baseHashtags: string | null;

  visualDomains: string[];
  visualDirectives: string | null;
  visualDirectivesEn: string | null;

  visualProps: BookVisualProps;

  visualExtras: BookVisualExtras;

  textExtraInstructions: string | null;
  imageExtraInstructions: string | null;
}

export interface VisualDirective {
  id: number;
  bookId: number;
  title: string;
  triggers: string[];
  intent: string | null;
  body: string | null;
  bodyEn: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface MinorCharacter {
  label: string;
  when: string;
  appearance: string;
  outfit: string | null;
}
export interface BookVisualExtras {
  minors: MinorCharacter[];
}

export interface VisualProp {
  name: string;
  when: string;
  description: string;
  owner: string | null;
}

export type DrivingSide = "left" | "right";

export interface BookVisualProps {
  props: VisualProp[];
  drivingSide: DrivingSide | null;
  country: string | null;
}

export interface BookChapter {
  id: number;
  bookId: number;
  index: number;
  title: string | null;
  text: string;
  charCount: number;

  excluded: boolean;

  scene: ChapterScene | null;
}

export interface ChapterScene {
  location: string | null;
  environment: string | null;
  mainObjects: string[];
  secondaryObjects: string[];
  characters: string[];

  pov: string | null;

  physicsRules: string[];

  keyMoment: string | null;

  kind: ChapterSceneKind;

  altMoments: ChapterMoment[];
  source: CharacterSource;
  model: string | null;

  promptVersion?: number;
  sourceHash?: string;
  updatedAt: number;
}

export const SCENE_PROMPT_VERSION = 5;

export type ChapterSceneKind = "waking" | "dream" | "flashback";

export type ChapterMomentType = "dream" | "flashback";

export interface ChapterMoment {
  type: ChapterMomentType;
  location: string | null;
  environment: string | null;
  mainObjects: string[];
  secondaryObjects: string[];
  characters: string[];
  physicsRules: string[];
  keyMoment: string | null;
  whose: string | null;
}

export type CharacterSource = "AI" | "USER";

export type TemporalPresence = "present" | "flashback_only" | "dream_only" | "past_dream_only";

export interface TemporalMembership {
  present: number[];
  flashback: number[];
  dream: number[];
}

export interface CharacterOutfit {
  when: string;
  outfit: string;
  age?: string | null;
  appearance?: string | null;
}
export interface CharacterOutfits {
  default: string | null;
  contexts: CharacterOutfit[];

  signature: string | null;
}

export interface BookCharacter {
  id: number;
  bookId: number;
  name: string;
  role: string | null;
  occupation: string | null;
  personality: string | null;
  physical: string | null;

  age: string | null;
  ethnicity: string | null;
  notes: string | null;
  source: CharacterSource;
  sortOrder: number;

  mentions: number | null;
  chapters: number[];

  temporalPresence?: TemporalPresence | null;
  temporalPresenceLocked?: boolean;
  temporalMembership?: TemporalMembership | null;

  outfits: CharacterOutfits;
  createdAt: number;
  updatedAt: number;
}

export type QuoteKind = "quote" | "dialogue";

export interface BookQuote {
  id: number;
  bookId: number;
  chapterId: number | null;
  text: string;
  kind: QuoteKind;
  speaker: string | null;
  score: number;
  createdAt: number;
}

export interface BookProfile {
  id: number;
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
}

export const CURRENT_PROMPT_VERSION = 4;

export interface FacebookPage {
  pageId: string;
  name: string;
  category: string | null;
  tokenSecretKey: string;
  bookId: number | null;
  addedAt: number;

  igUserId: string | null;
}

export function pageSecretKeyFor(pageId: string): string {
  return `fb.page.${pageId}`;
}

export type LinkChannel =
  | "sito_libro"
  | "sito_autore"
  | "vendita"
  | "social_autore"
  | "altro"
  | string;

export type LinkUsagePolicy = "always" | "sometimes" | "manual";

export interface BookLink {
  id: number;
  bookId: number;
  channel: LinkChannel;
  label: string | null;
  url: string;
  isDefault: boolean;
  usagePolicy: LinkUsagePolicy | null;
}

export interface SceneQa {
  ok: boolean;
  issues: string[];
}

export interface MediaUsage {
  total: number;
  reel: number;
  story: number;
  post: number;
}

export interface MusicUsage {
  total: number;
  reel: number;
  story: number;
}

export interface MediaAsset {
  id: number;
  bookId: number;
  chapterId: number | null;
  scope: string;
  path: string;
  caption: string | null;
  genPrompt: string | null;
  chapterIdx: number | null;
  tags: string[];

  qa: SceneQa | null;

  seed: number | null;
  addedAt: number;
}

export type SpoilerLevel = "low" | "medium" | "high";

export interface MarketingSafeQuote {
  quote: string;
  whyItWorks: string;
  spoilerRisk: SpoilerLevel;
}

export interface MarketingCharacterFocus {
  name: string;
  stateInChapter: string;
  desire: string;
  fear: string;
  changeWithoutSpoiler: string;
}

export interface MarketingPostAngle {
  type: string;
  hook: string;
  reason: string;
  concreteness: number;
  emotionalStrength: number;
  spoilerSafety: number;
  freshness: number;
}

export interface ChapterMarketingCardData {
  spoilerLevel: SpoilerLevel;
  nonSpoilerSummary: string;
  emotionalCore: string;
  humanTruth: string;
  readerQuestion: string;
  mainTension: string;
  visualMoment: string;
  safeQuotes: MarketingSafeQuote[];
  characterFocus: MarketingCharacterFocus[];
  postAngles: MarketingPostAngle[];
}

export interface ChapterMarketingCard {
  bookId: number;
  chapterIndex: number;
  schemaVersion: number;
  data: ChapterMarketingCardData;
  model: string | null;
  updatedAt: number;
}

export type ContentType = "post" | "reel" | "story";

export interface WeeklyPlan {
  pageId: string;
  postsPerWeek: number;
  reelsPerWeek: number;
  storiesPerWeek: number;
  updatedAt: number;
}

export const DEFAULT_WEEKLY_PLAN: Omit<WeeklyPlan, "pageId" | "updatedAt"> = {
  postsPerWeek: 3,
  reelsPerWeek: 1,
  storiesPerWeek: 2,
};

export interface PostingSlot {
  id: number;
  pageId: string;
  dayOfWeek: number;
  timeOfDay: string;

  timeStart: string | null;
  timeEnd: string | null;
  mediaType: MediaType;
  enabled: boolean;
}

export type Platform = "facebook" | "instagram";

export interface ScheduledPost {
  id: number;
  pageId: string;
  bookId: number | null;
  generationId: number | null;
  message: string;
  hashtags: string | null;
  mediaType: MediaType;
  link: string | null;
  mediaPath: string | null;
  scheduledAt: number;
  status: PostStatus;
  fbPostId: string | null;
  attempts: number;
  lastError: string | null;
  idempotencyKey: string;

  musicId: number | null;

  contentFormat: string | null;

  platform: Platform;

  linkedPostId: number | null;

  igMediaId: string | null;

  dashboardHidden: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TextMode = "full" | "short" | "none";
export type VisualKindChoice = "none" | "card" | "storyboard" | "reel" | "story";
export type VisualContent = "text" | "images" | "mixed";

export type FormatAspect = "1:1" | "4:5" | "1.91:1" | "9:16";

export interface ContentFormat {
  textMode: TextMode;
  visualKind: VisualKindChoice;
  visualContent: VisualContent;
  aspect: FormatAspect | null;
}

export interface ContentUsage {
  id: number;
  pageId: string;
  bookId: number | null;
  postId: number | null;
  textMode: TextMode;
  visualKind: VisualKindChoice;
  visualContent: VisualContent;
  aspect: FormatAspect | null;
  imageIds: number[];
  quoteKey: string | null;
  musicId: number | null;
  chapterIndex: number | null;
  angleKey: string | null;
  createdAt: number;
}

export interface MusicTrack {
  id: number;
  bookId: number | null;
  title: string;
  path: string;
  durationSec: number | null;
  mood: string | null;
  addedAt: number;
}

export type RenderStatus = "queued" | "rendering" | "done" | "failed";

export interface RenderJob {
  id: number;
  postId: number | null;
  bookId: number | null;
  kind: string;
  status: RenderStatus;
  specJson: string;
  outputPath: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface GenerationRecord {
  id: number;
  bookId: number;
  pageId: string | null;
  angle: string | null;
  promptVersion: string | null;
  inputHash: string | null;
  model: string | null;
  output: string;
  createdAt: number;
}

export function fullText(p: ScheduledPost): string {
  if (!p.hashtags || p.hashtags.trim() === "") return p.message;
  return `${p.message}\n\n${p.hashtags}`;
}
