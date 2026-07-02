import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { translateImagePromptToEnglishPreserveStructure } from "./translate.js";
import type {
  ChapterScene,
  CharacterOutfit,
  CharacterOutfits,
  BookVisualProps,
  BookVisualExtras,
  VisualDirective,
  TemporalPresence,
} from "../domain.js";
import { anyKeywordMatches } from "./imageDomains.js";

export async function reviseScenePrompt(
  engine: ContentEngine,
  input: { oldPrompt: string; changes: string },
): Promise<string | null> {
  const oldPrompt = (input.oldPrompt ?? "").trim();
  const changes = (input.changes ?? "").trim();
  if (oldPrompt === "" || changes === "") return null;

  const prompt = `You revise IMAGE-GENERATION prompts. Below is an existing English image prompt and a list
of CHANGE REQUESTS written in Italian by the user. Apply the requested changes to the prompt and output
ONLY the revised prompt as a single English block — no preamble, no quotes, no explanation, no markdown.
RULES:
- Keep the same overall STYLE and STRUCTURE of the prompt.
- PRESERVE the final style/medium sentence and the no-text intent, but express it POSITIVELY (e.g. "any
  signs, screens or papers appear blank and unlettered"); do NOT add "no …"/"not …" clauses. It stays ONE
  single full-bleed illustration.
- Describe any person ONLY by physical appearance, NEVER by name.
- Apply the user's changes FAITHFULLY: add, remove or alter elements exactly as asked; if they ask to
  remove something, remove it; if they ask to change a colour/light/mood/subject, change it.
- Keep real objects and interiors in their correct, physically plausible configuration and orientation.

EXISTING PROMPT:
${oldPrompt}

CHANGE REQUESTS (Italian — apply these):
${changes}

REVISED PROMPT (English only):`;

  try {
    const raw = await engine.run(prompt);
    const cleaned = (raw ?? "")
      .trim()
      .replace(/^```[a-z]*\n?|\n?```$/gi, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    return cleaned.length >= 12 ? cleaned : null;
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}

export interface SceneCharacter {
  name: string;
  physical?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  role?: string | null;
  outfits?: CharacterOutfits;
  temporalPresence?: TemporalPresence | null;
}

export interface SceneFlashback {
  setting?: string | null;
  note?: string | null;
}

export interface SceneDescriptionInput {
  chapterExcerpt: string | null;
  chapterTitle?: string | null;
  characters: SceneCharacter[];
  bookTitle: string | null;
  angle?: string | null;

  sceneCard?: ChapterScene | null;

  directives?: readonly VisualDirective[];

  extraInstructions?: string | null;

  visualProps?: BookVisualProps;

  visualExtras?: BookVisualExtras;

  flashback?: SceneFlashback | null;

  dream?: boolean;

  imageProfile?: string | null;
}

const PHYSICS_BASELINE = `PHYSICS & REALISM (mandatory, all images):
- GRAVITY & SUPPORT: no human or animal rests ON TOP of the water surface; people stand on solid
  ground or float immersed in the water (body in the water, not on it); aquatic animals (e.g. a
  turtle, a fish, a dolphin) swim IN the water or rest on sand/rock, NEVER perched on top of the
  water; when an aquatic animal surfaces to breathe, only the top of its shell/back and its head may
  break the surface, while its flippers, fins and limbs stay SUBMERGED — never spread up in the air
  above the waterline; every object or vehicle sits on a plausible supporting surface, none floating
  in mid-air.
- WATER & WAVES: waves advance and break TOWARD the shore (crests and foam roll landward), never
  back out to sea; the water surface and the horizon are level and flat-lying, not tilted or domed.
- WIND & MOTION: any water, sailing, riding or action activity needs coherent wind, water/ground and
  motion — no gliding on a flat mirror-calm sea; sails, hair, flags and spray agree on one wind.
- LIGHT & SHADOW: a single coherent light source; all shadows fall in agreement with it; reflections
  and highlights are physically plausible.
- SCALE: realistic proportions between people, animals, objects and the setting.`;

function physicsBlock(card: ChapterScene | null | undefined): string {
  const rules = (card?.physicsRules ?? []).map((r) => r.trim()).filter((r) => r.length > 0);
  if (rules.length === 0) return PHYSICS_BASELINE;
  const lines = rules.map((r) => `- ${r}`).join("\n");
  return `${PHYSICS_BASELINE}
CHAPTER PHYSICS/REALISM RULES (must hold, specific to this chapter):
${lines}`;
}

function sceneCardBlock(card: ChapterScene | null | undefined): string {
  if (!card) return "";
  const lines: string[] = [];
  if (card.keyMoment && card.keyMoment.trim() !== "")
    lines.push(
      `- Key moment to depict (the iconic action of the chapter — prefer THIS as the subject when it fits): ${card.keyMoment.trim()}`,
    );
  if (card.location) lines.push(`- Location: ${card.location}`);
  if (card.environment)
    lines.push(`- Environment (drives lighting AND clothing): ${card.environment}`);
  if (card.mainObjects.length > 0)
    lines.push(
      `- Main visual subjects — the SUBJECT of the image MUST be ONE of these (pick the single one that fits this moment); do NOT invent a different subject from the chapter text: ${card.mainObjects.join(", ")}`,
    );
  if (card.secondaryObjects.length > 0)
    lines.push(
      `- Secondary objects to CHOOSE FROM (add only a couple if they fit): ${card.secondaryObjects.join(", ")}`,
    );
  if (card.characters.length > 0)
    lines.push(
      `- Characters present in the chapter to CHOOSE FROM (feature only the one or two that fit this image): ${card.characters.join(", ")}`,
    );
  if (lines.length === 0) return "";
  return `SCENE CARD (reliable grounding for THIS chapter — it is AUTHORITATIVE for the SUBJECT, setting
and clothing). The image SUBJECT must come from this card (its key moment / main subjects / characters);
the chapter text below is ONLY for the specific action, pose, mood and concrete details of that subject —
do NOT pick from the text a different subject that the card omits (e.g. a dreamed, remembered or incidental
thing). ONLY if this card lists no usable subject at all may you take a concrete, physically-present element
from the text. These lists are a POOL of options, NOT a checklist: a chapter may have many characters and
objects, but ONE image must stay simple — SELECT only what serves the single moment you depict, and LEAVE
OUT the rest. Never cram every character or object into one picture.
${lines.join("\n")}`;
}

export function domainHaystack(card: ChapterScene | null | undefined, passage: string): string {
  if (card) {
    return [
      card.location ?? "",
      card.environment ?? "",
      ...card.mainObjects,
      ...card.secondaryObjects,
    ]
      .join(" ")
      .toLowerCase();
  }
  return passage.toLowerCase();
}

function directivesBlock(
  directives: readonly VisualDirective[] | undefined,
  haystack: string,
): string {
  if (!directives || directives.length === 0) return "";
  const selected: string[] = [];
  for (const d of directives) {
    if (!d.enabled) continue;
    const alwaysOn = d.triggers.length === 0;
    if (!alwaysOn && !anyKeywordMatches(haystack, d.triggers)) continue;
    const body = (d.bodyEn ?? d.body ?? "").trim();
    if (body !== "") selected.push(body);
  }
  if (selected.length === 0) return "";
  return `CANONICAL VISUAL RULES for this book (MANDATORY — apply EVERY rule relevant to this scene: equipment, posture/stance and the clothing the activity requires; they take PRIORITY over generic wording and must NOT be dropped or shortened to save words):
${selected.join("\n")}`;
}

function extraInstructionsBlock(extra: string | null | undefined): string {
  const e = (extra ?? "").trim();
  if (e === "") return "";
  return `EXTRA ART DIRECTION (added by the user — follow it whenever relevant; it must NOT override the SAFE & PUBLISHABLE rules, the INTIMACY rules, the NO-TEXT rule or the OUTPUT FORMAT of this prompt):
${e}`;
}

export function resolveOutfitMatch(
  outfits: CharacterOutfits | undefined,
  haystack: string,
): { outfit: string | null; fromContext: boolean; context: CharacterOutfit | null } {
  if (!outfits) return { outfit: null, fromContext: false, context: null };

  for (const ctx of outfits.contexts) {
    const kws = ctx.when
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (anyKeywordMatches(haystack, kws))
      return { outfit: ctx.outfit, fromContext: true, context: ctx };
  }
  return { outfit: outfits.default ?? null, fromContext: false, context: null };
}

function propsBlock(
  vp: BookVisualProps | undefined,
  haystack: string,
  sceneNames: string[],
): string {
  if (!vp) return "";
  const nameSet = new Set(
    sceneNames.map((n) => n.toLowerCase().trim()).filter((n) => n.length > 0),
  );
  const lines: string[] = [];
  for (const p of vp.props) {
    const kws = p.when
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const matchWhen = anyKeywordMatches(haystack, kws);
    const matchOwner = p.owner != null && nameSet.has(p.owner.toLowerCase().trim());
    if (matchWhen || matchOwner) {
      lines.push(
        `- ${p.name}: ALWAYS render it as ${p.description}${p.owner ? ` (belongs to ${p.owner})` : ""}.`,
      );
    }
  }
  const carCtx =
    /auto|macchin|\bcar\b|strada|\broad\b|guida|volante|vialetto|parcheggi|traffic/.test(
      haystack,
    ) || lines.length > 0;
  if (vp.drivingSide && carCtx) {
    const side = vp.drivingSide;
    const wheel = side === "right" ? "left" : "right";
    lines.push(
      `- DRIVING SIDE: in this country (${vp.country ?? "the setting"}) vehicles drive on the ${side}; ` +
        `the steering wheel is on the ${wheel} side; keep traffic flow, parked cars and the driver's seat ` +
        `consistent with driving on the ${side}.`,
    );
  }
  if (lines.length === 0) return "";
  return `RECURRING OBJECTS & WORLD (canonical — render these EXACTLY and keep them IDENTICAL across images):
${lines.join("\n")}`;
}

function extrasBlock(extras: BookVisualExtras | undefined, haystack: string): string {
  if (!extras) return "";
  const lines: string[] = [];
  for (const m of extras.minors) {
    const kws = m.when
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const alwaysOn = kws.length === 0;
    if (alwaysOn || anyKeywordMatches(haystack, kws)) {
      lines.push(
        `- ${m.label}: an incidental character — ${m.appearance}${m.outfit ? `; wears ${m.outfit}` : ""}. Keep this character's look IDENTICAL whenever this scene recurs.`,
      );
    }
  }
  if (lines.length === 0) return "";
  return `INCIDENTAL CHARACTERS (canonical — keep identical across images):
${lines.join("\n")}`;
}

function castBlock(chars: SceneCharacter[], haystack: string, suppressOutfits = false): string {
  if (chars.length === 0) return "(no named characters)";
  const fmt = (c: SceneCharacter) => {
    const p = (c.physical ?? "").trim();
    const age = (c.age ?? "").trim();
    const eth = (c.ethnicity ?? "").trim();

    const match = resolveOutfitMatch(c.outfits, haystack);
    const outfit = suppressOutfits ? (match.fromContext ? match.outfit : null) : match.outfit;

    const sig = suppressOutfits ? "" : (c.outfits?.signature ?? "").trim();
    const worn = [outfit ?? "", sig ? `ALWAYS ${sig}` : ""].filter(Boolean).join(", ");
    const outfitPart = worn ? `; wears: ${worn}` : "";

    const short = p.length > 300 ? `${p.slice(0, 300).trimEnd()}…` : p;
    const traits = [eth ? `ethnicity ${eth}` : "", age ? `age ${age}` : "", short]
      .filter(Boolean)
      .join("; ");
    if (!traits) return worn ? `${c.name} (wears: ${worn})` : c.name;
    return `${c.name} (${traits}${outfitPart})`;
  };

  const protagIdx = chars.findIndex((c) => /protagon|principale|\bmain\b/i.test(c.role ?? ""));
  const pIdx = protagIdx >= 0 ? protagIdx : 0;

  const others = chars.filter((_, i) => i !== pIdx).slice(0, 10);
  const lines = [`Protagonist — ${fmt(chars[pIdx]!)}.`];
  if (others.length > 0) lines.push(`Other characters — ${others.map(fmt).join("; ")}.`);
  return lines.join("\n");
}

export interface SceneDescription {
  description: string;
  tags: string[];

  depicted: SceneCharacter[];
}

export function flashbackBlock(
  fb: SceneFlashback | null | undefined,
  chars: readonly SceneCharacter[] = [],
  contextAges: ReadonlyMap<string, { age: string | null; appearance: string | null }> = new Map(),
): string {
  if (!fb) return "";
  const setting = (fb.setting ?? "").trim();
  const note = (fb.note ?? "").trim();
  const contextClauses: string[] = [];
  const contextAgeNames = new Set<string>();
  for (const c of chars) {
    const key = c.name.trim().toLowerCase();
    if (key === "") continue;
    const ctx = contextAges.get(key);
    const ctxAge = (ctx?.age ?? "").trim();
    if (ctxAge === "") continue;
    contextAgeNames.add(key);
    const app = (ctx?.appearance ?? "").trim();
    contextClauses.push(`${c.name.trim()} is ${ctxAge} years old${app ? `, ${app}` : ""}`);
  }
  const alreadyPastNames = chars
    .filter((c) => (c.temporalPresence ?? "present") !== "present")
    .map((c) => c.name.trim())
    .filter((n) => n !== "" && !contextAgeNames.has(n.toLowerCase()));
  const keepAsIsClause =
    alreadyPastNames.length > 0
      ? ` EXCEPTION — do NOT change the age of ${joinNames(alreadyPastNames)}: their CAST age ALREADY is their age in this memory, so render ${
          alreadyPastNames.length > 1 ? "them" : "that character"
        } at EXACTLY the age stated in the CAST, NOT younger.`
      : "";
  const absoluteClauses = contextClauses;
  const ageDirective =
    absoluteClauses.length > 0
      ? ` In THIS past scene each of these characters has the EXACT age stated here, which OVERRIDES the age in their CAST description: ${absoluteClauses.join(
          "; ",
        )}.`
      : "";
  return `FLASHBACK / MEMORY OVERRIDE (this image only — it OVERRIDES the AGE rule and the WARDROBE CONSISTENCY rule above): this scene is a MEMORY set in the PAST.${ageDirective}${keepAsIsClause} Keep each character's IDENTITY unmistakable: SAME hair colour, SAME eye colour, SAME face structure and proportions, clearly the same person at that age. Dress them for the time and place of this memory${setting ? `: ${setting}` : ""}: IF the CAST gives a specific period outfit for this character (a "wears:" note), use EXACTLY that; otherwise dress them coherently with the era and the activity — NOT in their canonical present-day outfit.${note ? ` ${note}` : ""}`;
}

function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}

function dreamBlock(isDream: boolean | undefined): string {
  if (!isDream) return "";
  return `DREAM SCENE (this whole image is a DREAM): render it as a dream — a soft, surreal, slightly unreal atmosphere (hazy light, dreamlike mood, gentle dissolve at the edges), NOT a sharp everyday photo-real scene. Keep each character's CANONICAL identity and AGE exactly as the CAST states (a dream does NOT make them younger). The dreamed subjects may appear, but the overall image must clearly read as a dream, not as waking reality.`;
}

function fallbackScene(input: SceneDescriptionInput): SceneDescription | null {
  if (!input.bookTitle && input.characters.length === 0 && !input.chapterExcerpt) return null;
  return {
    description:
      "an empty path leading toward distant light at dawn, soft mist, long shadows, quiet evocative atmosphere, no people",
    tags: ["path", "light", "dawn", "atmosphere"],
    depicted: [],
  };
}

function isTagsLine(line: string): boolean {
  return /^\s*tags\s*:/i.test(line);
}
function isCharsLine(line: string): boolean {
  return /^\s*characters\s*:/i.test(line);
}

function cleanDescriptionLine(line: string): string {
  let s = line.trim();
  s = s.replace(/^#{1,6}\s*/, "").replace(/^[-*•]\s+/, "");
  s = s.replace(/^(line\s*1|description|image|prompt|paragraph)\s*[:.)-]\s*/i, "");
  s = s.replace(/^["'`]+|["'`]+$/g, "").trim();
  return s;
}

function looksLikePreamble(line: string): boolean {
  return /^(here\b|sure\b|certainly\b|of course\b|okay\b|ok\b|got it\b)/i.test(line.trim());
}

function wantsStructuredImagePrompt(imageProfile: string): boolean {
  return /\bGemini native image model\b/i.test(imageProfile);
}

function wantsZImagePrompt(imageProfile: string): boolean {
  return /\bZ-Image Turbo\b/i.test(imageProfile);
}

function pickDescription(lines: string[], preserveLineBreaks = false): string {
  const contentLines: string[] = [];
  for (const l of lines) {
    if (isTagsLine(l) || isCharsLine(l)) break;
    const cleaned = cleanDescriptionLine(l);
    if (cleaned.length > 0) contentLines.push(cleaned);
  }
  if (contentLines.length === 0) return "";

  const startIdx = looksLikePreamble(contentLines[0]!) && contentLines.length > 1 ? 1 : 0;
  const joined = contentLines
    .slice(startIdx)
    .join(preserveLineBreaks ? "\n" : " ")
    .trim();

  const result = joined.length > 0 ? joined : contentLines[0]!;
  return result.length >= 12 ? result : "";
}

function looseNameMatch(castName: string, depicted: string): boolean {
  const tokA = castName
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  const tokB = depicted
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  if (tokA.length === 0 || tokB.length === 0) return false;
  if (tokA.join(" ") === tokB.join(" ")) return true;

  function containsRun(hay: readonly string[], needle: readonly string[]): boolean {
    for (let i = 0; i + needle.length <= hay.length; i++) {
      if (needle.every((t, j) => hay[i + j] === t)) return true;
    }
    return false;
  }
  return containsRun(tokA, tokB) || containsRun(tokB, tokA);
}

function extractHair(physical: string): string {
  const p = physical.toLowerCase();
  const en = p.match(/[a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3}\s+hair\b/);
  if (en) {
    const stopRe = /^(?:with|and|a|an|the|of|has|having|their|his|her|con|e|i|le|dai|dei)\s+/;
    let s = en[0].trim();
    for (let pass = 0; pass < 4; pass++) {
      const next = s.replace(stopRe, "");
      if (next === s) break;
      s = next;
    }
    return s;
  }
  const it = p.match(/capelli(?:\s+[a-zàèéìòùç][a-zàèéìòùç-]*){0,3}/);
  if (it) return it[0].trim();
  return "";
}

function canonicalClause(c: SceneCharacter): string {
  const parts: string[] = [];
  const eth = (c.ethnicity ?? "").trim();
  const age = (c.age ?? "").trim();
  const hair = extractHair((c.physical ?? "").trim());
  const sig = (c.outfits?.signature ?? "").trim();
  if (eth) parts.push(eth);
  if (age) parts.push(`age ${age}`);
  if (hair) parts.push(hair);
  let clause = parts.join(", ");
  if (sig) clause = clause ? `${clause}, always with ${sig}` : `always with ${sig}`;
  return clause;
}

const COVERAGE_SYNONYMS: Record<string, string[]> = {
  hair: ["capelli", "capello", "cheveux", "cabello", "pelo", "haare", "haar"],
  beard: ["barba", "barbe", "bart"],
  mustache: ["baffi", "moustache", "bigote", "schnurrbart"],
  skin: ["pelle", "peau", "piel", "haut"],
  eyes: ["occhi", "occhio", "yeux", "ojos", "augen"],
  face: ["viso", "volto", "visage", "cara", "rostro", "gesicht"],
  man: ["uomo", "homme", "hombre", "mann"],
  woman: ["donna", "femme", "mujer", "frau"],
  boy: ["ragazzo", "garcon", "chico", "junge"],
  girl: ["ragazza", "fille", "chica", "madchen"],
  years: ["anni", "anno", "ans", "annee", "annees", "anos", "ano", "jahre", "jahr"],
  about: ["circa", "environ", "unos", "etwa", "ungefahr"],
  short: [
    "corti",
    "corto",
    "corta",
    "corte",
    "courts",
    "court",
    "courte",
    "courtes",
    "cortos",
    "cortas",
    "kurz",
    "kurze",
    "kurzen",
  ],
  long: [
    "lunghi",
    "lungo",
    "lunga",
    "longs",
    "longue",
    "longues",
    "largos",
    "largo",
    "larga",
    "lange",
    "langen",
    "langes",
  ],
  dark: [
    "scuri",
    "scuro",
    "scura",
    "fonce",
    "fonces",
    "foncee",
    "foncees",
    "sombre",
    "sombres",
    "oscuro",
    "oscura",
    "oscuros",
    "oscuras",
    "dunkel",
    "dunkle",
    "dunklen",
  ],
  light: [
    "chiari",
    "chiaro",
    "chiara",
    "clair",
    "clairs",
    "claire",
    "claires",
    "claro",
    "clara",
    "claros",
    "claras",
    "hell",
    "helle",
    "hellen",
  ],
  brown: [
    "castani",
    "castano",
    "castana",
    "castane",
    "marroni",
    "marrone",
    "bruns",
    "brun",
    "brune",
    "brunes",
    "marron",
    "castanos",
    "castanas",
    "braun",
    "braune",
    "braunen",
  ],
  black: [
    "neri",
    "nero",
    "nera",
    "noirs",
    "noir",
    "noire",
    "noires",
    "negros",
    "negro",
    "negra",
    "negras",
    "schwarz",
    "schwarze",
    "schwarzen",
  ],
  blond: [
    "biondi",
    "biondo",
    "bionda",
    "blonds",
    "blond",
    "blonde",
    "blondes",
    "rubios",
    "rubio",
    "rubia",
    "rubias",
    "blonden",
  ],
  grey: [
    "grigi",
    "grigio",
    "grigia",
    "brizzolati",
    "brizzolato",
    "gris",
    "grises",
    "grau",
    "graue",
    "grauen",
  ],
  red: [
    "rossi",
    "rosso",
    "rossa",
    "roux",
    "rousse",
    "rojos",
    "rojo",
    "roja",
    "rot",
    "rote",
    "roten",
  ],
  olive: [
    "olivastra",
    "olivastro",
    "olivastri",
    "olivatre",
    "olivatres",
    "aceitunada",
    "aceituna",
    "oliv",
  ],
  tanned: [
    "abbronzata",
    "abbronzato",
    "bronzee",
    "bronze",
    "bronzes",
    "bronceada",
    "bronceado",
    "gebraunt",
  ],
  pale: ["pallida", "pallido", "palida", "palido", "blass", "blasse"],
  lean: [
    "asciutta",
    "asciutto",
    "snella",
    "snello",
    "magra",
    "magro",
    "mince",
    "minces",
    "sec",
    "seche",
    "delgada",
    "delgado",
    "esbelta",
    "esbelto",
    "schlank",
    "schlanke",
  ],
  athletic: ["atletica", "atletico", "athletique", "athletiques", "athletisch", "athletische"],
  robust: ["robusta", "robusto", "robuste", "robustes", "robust", "kraftig", "kraftige"],
  tall: [
    "alto",
    "alta",
    "alti",
    "grand",
    "grande",
    "grands",
    "grandes",
    "gross",
    "grosse",
    "grossen",
    "hochgewachsen",
  ],
  young: [
    "giovane",
    "giovani",
    "jeune",
    "jeunes",
    "joven",
    "jovenes",
    "jung",
    "junge",
    "junger",
    "jungen",
  ],
  adult: [
    "adulto",
    "adulta",
    "adulti",
    "adulte",
    "adultes",
    "erwachsen",
    "erwachsene",
    "erwachsener",
  ],
  build: ["corporatura", "fisico", "physique", "constitucion", "complexion", "korperbau", "statur"],
  mediterranean: [
    "mediterraneo",
    "mediterranea",
    "mediterranei",
    "mediterraneen",
    "mediterraneenne",
    "mediterran",
  ],
  european: [
    "europeo",
    "europea",
    "europei",
    "europeen",
    "europeenne",
    "europeens",
    "europaisch",
    "europaische",
  ],
  italian: [
    "italiano",
    "italiana",
    "italiani",
    "italien",
    "italienne",
    "italiens",
    "italienisch",
    "italiener",
  ],
  french: [
    "francese",
    "francesi",
    "francofono",
    "francofona",
    "francais",
    "francaise",
    "frances",
    "francesa",
    "franzosisch",
    "franzose",
  ],
  spanish: [
    "spagnolo",
    "spagnola",
    "espagnol",
    "espagnole",
    "espanol",
    "espanola",
    "spanisch",
    "spanier",
  ],
  german: [
    "tedesco",
    "tedesca",
    "allemand",
    "allemande",
    "aleman",
    "alemana",
    "deutsch",
    "deutsche",
    "deutscher",
  ],
  roman: ["romano", "romana", "romani", "romain", "romaine", "romisch"],
  latin: ["latino", "latina", "latini", "latine", "lateinamerikanisch"],
  caribbean: [
    "caraibico",
    "caraibica",
    "caraibe",
    "caraibeen",
    "caribeno",
    "caribena",
    "karibisch",
  ],
  dominican: [
    "dominicano",
    "dominicana",
    "dominicain",
    "dominicaine",
    "dominikanisch",
    "dominikaner",
  ],
  chilean: ["cileno", "cilena", "chilien", "chilienne", "chileno", "chilena", "chilenisch"],
  african: ["africano", "africana", "africain", "africaine", "afrikanisch"],
  asian: ["asiatico", "asiatica", "asiatique", "asiatisch"],
  arab: ["arabo", "araba", "arabe", "arabes", "araber", "arabisch"],
  neat: ["ordinati", "ordinato", "ordinata", "soignes", "soigne", "cuidado", "cuidada", "gepflegt"],
};

const COVERAGE_TOKEN_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(COVERAGE_SYNONYMS).flatMap(([en, srcs]) =>
    srcs.map((s): [string, string] => [s, en]),
  ),
);

const COVERAGE_STOP = new Set([
  "a",
  "about",
  "age",
  "aged",
  "always",
  "and",
  "an",
  "around",
  "has",
  "having",
  "is",
  "of",
  "old",
  "the",
  "their",
  "with",
  "year",
  "years",
  "e",
  "con",
  "di",
  "il",
  "la",
  "lo",
  "un",
  "una",
  "et",
  "avec",
  "de",
  "du",
  "des",
  "le",
  "les",
  "un",
  "une",
  "y",
  "el",
  "los",
  "las",
  "una",
  "und",
  "mit",
  "der",
  "die",
  "das",
  "ein",
  "eine",
]);

export function coverageTokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => COVERAGE_TOKEN_MAP[t] ?? t)
    .filter((t) => t.length > 0 && !COVERAGE_STOP.has(t));
}

function canonicalClauseAlreadyCovered(description: string, clause: string): boolean {
  const needed = coverageTokens(clause);
  if (needed.length === 0) return true;
  const present = new Set(coverageTokens(description));
  return needed.every((t) => present.has(t));
}

function appendCanonicalReminder(
  description: string,
  cast: SceneCharacter[],
  depictedNames: string[],
): string {
  if (depictedNames.length === 0 || cast.length === 0) return description;
  const matched: SceneCharacter[] = [];
  for (const n of depictedNames) {
    const c = cast.find((cc) => looseNameMatch(cc.name, n));
    if (c && !matched.includes(c)) matched.push(c);
    if (matched.length >= 2) break;
  }
  const clauses = matched
    .map(canonicalClause)
    .filter((s) => s.length > 0 && !canonicalClauseAlreadyCovered(description, s));
  if (clauses.length === 0) return description;
  const reminder =
    clauses.length === 1
      ? `The person shown is ${clauses[0]}.`
      : `The people shown are: ${clauses.join("; and ")}.`;
  const base = description.trim();
  if (/(^|\n)Subject:/i.test(base)) {
    const lines = base.split("\n");
    const subjectIdx = lines.findIndex((line) => /^\s*Subject:/i.test(line));
    if (subjectIdx >= 0) {
      const nextSectionIdx = lines.findIndex(
        (line, idx) =>
          idx > subjectIdx &&
          /^\s*(Scene|Action|Composition|Equipment or objects|Physical consistency|Style|Constraints|Output):/i.test(
            line,
          ),
      );
      const insertAt = nextSectionIdx >= 0 ? nextSectionIdx : subjectIdx + 1;
      return [...lines.slice(0, insertAt), reminder, ...lines.slice(insertAt)].join("\n");
    }
  }
  const sep = base === "" ? "" : /[.!?]$/.test(base) ? " " : ". ";
  return `${base}${sep}${reminder}`;
}

const TAGS_LINE = `"TAGS: " followed by 3 to 6 short lowercase keywords (the main subject, the place, the mood), comma-separated.`;
const CHARACTERS_LINE = `"CHARACTERS: " followed by the NAMES (from the CAST) of the named characters you ACTUALLY depicted in the image, comma-separated, in the same order they appear in the scene; write "none" if the image shows no named character. These names are for cataloguing only — they never appear in the image itself.`;
const NON_NEGOTIABLES = `Spend the words on the NON-NEGOTIABLES instead (each person's ethnicity + age + hair, the exact pose and any mandatory signature item, the single object colour), so none of them are lost.`;
const NO_STYLE_WORDS = `style/medium words ("illustration", "graphic novel", "comic", "art", "photo")`;

export function imagePromptDialectBlocks(
  structuredForGemini: boolean,
  tailoredForZImage: boolean,
): {
  styleRule: string;
  shapeInstruction: string;
  orderBlock: string;
  outputFormatBlock: string;
  directiveRule: string;
} {
  const styleRule = tailoredForZImage
    ? `STYLE AND QUALITY: the Z-Image paragraph may include concrete image type and visual style at the very
beginning when useful, but avoid generic quality tags such as "masterpiece", "8k", "ultra detailed" unless
the requested style explicitly requires them. Do not repeat character descriptions in summary form.`
    : `RULES: NO style words (do NOT write "graphic novel", "illustration", "comic", "art"); NO quotes.`;
  const shapeInstruction = structuredForGemini
    ? `From the book passage, output ONE plain-text Gemini image prompt with clear section headings and
line breaks, using full sentences or short concrete phrases under each heading. Do NOT use markdown
fences, markdown headings, JSON, or a tag-list prompt. It must describe an EVOCATIVE, ATMOSPHERIC image that`
    : tailoredForZImage
      ? `From the book passage, act as a prompt adapter for a local Z-Image Turbo model executed through
stable-diffusion.cpp / sd-cli. Output ONE final image-generation prompt as a single fluent descriptive
English paragraph. Do NOT use a Gemini-style structured prompt, section headings, markdown, JSON, bullet
points, metadata, interface notes, or a tag-list prompt. It must describe an EVOCATIVE, ATMOSPHERIC image that`
      : `From the book passage,
output ONE rich English paragraph describing an EVOCATIVE, ATMOSPHERIC image that`;
  const orderBlock = structuredForGemini
    ? `ORDER (write the Gemini prompt as PLAIN TEXT sections in THIS sequence; the opening line anchors the
model, and the headings reduce ambiguity):
Opening line: "Create a single cinematic ... image of ..." adapted to THIS scene.
Subject: the main subject first; if it is a person, describe them by physical appearance ALWAYS including
ethnicity/skin tone and age, plus build and hair.
Scene: the location, environment, horizon and large spatial anchors.
Action: what each subject is doing and their pose, bound to the correct person or object.
Composition: shot/framing from the COMPOSITION DIRECTIVE, camera position, crop rules and visible forms.
Equipment or objects: concrete object structure; use an activity-specific heading when the scene needs one.
Physical consistency: force/motion direction, contact points, attachments, water/spray/light behaviour and
perspective.
Constraints: explicit negative constraints for likely failures.
Output: the aspect/output instruction.
Do NOT include a Style section and do NOT add ${NO_STYLE_WORDS}: the application appends the Style section afterwards.`
    : tailoredForZImage
      ? `ORDER FOR Z-IMAGE (write ONE compact paragraph in THIS visual priority; it is passed directly to
sd-cli -p on a SMALL diffusion model that CANNOT bind many stacked clauses — density breaks it):
1) START: image type/visual style if needed, the exact number of visible people, the location, the MAIN
   OBJECT named as ONE complete assembled shape, and the camera framing. Preserve the exact number of people.
   Front-load the objects and framing that must stay visible. If the shot is a close-up but multiple people
   and objects must be visible, write "intimate medium close-up" or "lateral medium close-up".
2) POSE + EQUIPMENT (front-loaded, together, BEFORE appearance): give the focal subject's COMPLETE equipment
   as ONE assembled shape and ONE clear body pose with ONE clear grip/contact, as a single coherent action —
   not a list of parts. Name each equipment part ONCE. Do NOT stack fine spatial sub-relations (which hand
   on which side of which part): write ONE holistic pose sentence, not five relational qualifiers. Take the
   specific pose, equipment and connection facts from the CANONICAL VISUAL RULES below — never invent them.
3) PEOPLE (after the pose): describe each person compactly — ethnicity/nationality, age, skin tone, build,
   hair, face, clothing — ONE short clause each, in spatial order. If a character is blind, show it visually
   ("clouded unfocused eyes"). Never repeat a character in summary form.
4) ENVIRONMENT + LIGHT: finish with environment, then SPECIFIC lighting (time of day, quality of light),
   atmosphere, colour palette and texture — this model responds strongly to light and texture.
POSITIVE ONLY — CRITICAL: this model IGNORES negatives and DRAWS whatever noun you forbid (negation-leak). Do
NOT write any "no …", "not …", "without …", "avoid …" clause. Rephrase EVERY constraint as what IS present:
"empty calm background", "a single subject", "clean blank surfaces", "the full object visible inside the
frame". Do NOT invent equipment state (connected/attached vs loose/free) from a negation — read it from the
CANONICAL VISUAL RULES and state the CORRECT positive state they specify. State each fact ONCE; do not add
interface notes or emotional filler before the concrete visual composition is clear.`
      : `ORDER (write the paragraph in THIS sequence — it is how the image model reads best; the SUBJECT comes
FIRST, this model anchors on the opening noun phrase):
1) the main SUBJECT (the iconic element) as the FIRST noun phrase of the paragraph — and if it is a
   person, describe them by physical appearance ALWAYS including their ethnicity/skin tone and age (plus
   build and hair); 2) the SHOT / framing (take it from the COMPOSITION DIRECTIVE: e.g. wide shot,
   close-up, three-quarter view, from behind); 3) what they are DOING and their pose, binding each action
   to the correct person — and when the CANONICAL VISUAL RULES specify the subject's equipment, posture or
   technique, spell out IN FULL every detail they state, exactly as written, without abbreviating;
   4) their CLOTHING; 5) the SETTING and where each element sits (grounding,
   horizon); 6) the LIGHTING — time of day and quality of light, be specific (this model responds strongly
   to light); 7) the overall MOOD.
Write FLOWING SENTENCES in that order, not a tag list. Do NOT add ${NO_STYLE_WORDS}: the visual style is appended afterwards, you only describe the
scene.`;
  const outputFormatBlock = structuredForGemini
    ? `OUTPUT FORMAT — exactly this structure:
First output the Gemini image prompt block as plain text with the section headings above. Do not wrap it in
markdown fences, do not use markdown headings, and do not output JSON. State each visual fact ONCE in
concrete words; do NOT pad with synonyms, repeated adjectives or vague filler. ${NON_NEGOTIABLES}
Then output one line: ${TAGS_LINE}
Then output one line: ${CHARACTERS_LINE}`
    : tailoredForZImage
      ? `OUTPUT FORMAT — exactly THREE lines:
Line 1: the final Z-Image prompt paragraph only (follow the ORDER FOR Z-IMAGE above). Keep it compact and
complete, about 90–150 words even when characters are featured — DENSITY, not length: fewer, clearer facts
beat a long clause pile-up on this model. Do not add explanations, comments, titles, markdown, bullet
points, section headers or metadata inside this line.
Line 2: ${TAGS_LINE}
Line 3: ${CHARACTERS_LINE}`
      : `OUTPUT FORMAT — exactly THREE lines:
Line 1: the image description paragraph (follow the adaptive WORD BUDGET above — ~80–110 words with no
person, ~120–170 words when characters are featured — and the ORDER above). State each visual fact
ONCE in concrete words; do NOT pad with synonyms, repeated adjectives or vague filler — the image model
treats repetition and empty modifiers as noise and may drop nearby details. ${NON_NEGOTIABLES}
Line 2: ${TAGS_LINE}
Line 3: ${CHARACTERS_LINE}`;

  const directiveRule = tailoredForZImage
    ? `WORD BUDGET (STRICT for this small diffusion model): ONE paragraph, about 90–150 words. DENSITY, not
length, is what breaks this model — it cannot bind many stacked clauses onto one object.
COMPRESS THE CANONICAL VISUAL RULES INTO THEIR VISIBLE ESSENTIALS: the rules below are a detailed written
spec — do NOT transcribe them clause by clause and do NOT repeat the same object. Extract the focal
subject's LARGE COMPLETE SHAPE and only the load-bearing, visible facts, and state each ONCE in plain
POSITIVE words. Name each equipment part ONCE as a complete assembled shape (the whole rig as one unit),
then give ONE clear pose and ONE clear grip.
KEEP the POSE- AND CONFIGURATION-DEFINING facts (these decide whether the image is CORRECT, so they are NOT
optional detail): the active mode/action; the body's lean or balance direction; whether the gear is
ENGAGED/CONNECTED to the body and WHERE (state the CORRECT connection positively and exactly as the rules
specify — never guess it from a negation); and how the hands/body relate to the main object, as ONE simple
relation. Also KEEP each person's ethnicity + age + hair and any signature colour/item.
DROP only DECORATIVE detail (exact part counts, sub-panel colours, minor sub-part names, mounting-track
positions). Never spell out fine spatial micro-relations, but never drop a fact that defines whether the pose
is right. Front-load the subject, its complete equipment and the pose BEFORE the person's appearance.`
    : `WORD BUDGET (adaptive): about 80–110 words for an OBJECT or PLACE with NO person; about 120–170 words
when ONE OR MORE named characters are featured (more people need more words to keep each one distinct). The
budget is a guide, NOT a hard cap: NEVER drop a character's ethnicity, age, hair, the exact pose, a mandatory
signature item, a single object's signature colour, or the activity's required equipment, posture/stance and
clothing stated in the CANONICAL VISUAL RULES, just to fit the budget — exceed the budget instead.
THE CANONICAL VISUAL RULES ARE THE SUBJECT, NOT CLUTTER: when those rules below describe the focal subject's
specific EQUIPMENT, POSTURE/STANCE or technique in detail, that detail IS the focal subject — TRANSCRIBE
every such detail they state in FULL into the paragraph, exactly as written, without summarising,
generalising or dropping any of it, and without reducing it to a single verb. Write as MANY words as that
needs — exceed the budget. The "uncluttered / evocative" guidance below applies ONLY to the BACKGROUND and
secondary elements, NEVER to the detail the CANONICAL VISUAL RULES require for the focal subject.`;
  return { styleRule, shapeInstruction, orderBlock, outputFormatBlock, directiveRule };
}

export async function buildSceneDescription(
  engine: ContentEngine,
  input: SceneDescriptionInput,
): Promise<SceneDescription | null> {
  const passage = (input.chapterExcerpt ?? "").trim().slice(0, 20000);
  if (passage === "" && input.characters.length === 0 && !input.bookTitle) return null;

  const haystack = domainHaystack(input.sceneCard, passage);
  const flashbackContextAges = new Map<string, { age: string | null; appearance: string | null }>();
  if (input.flashback) {
    for (const c of input.characters) {
      const m = resolveOutfitMatch(c.outfits, haystack);
      if (m.fromContext && m.context && (m.context.age ?? "").trim() !== "") {
        flashbackContextAges.set(c.name.trim().toLowerCase(), {
          age: m.context.age ?? null,
          appearance: m.context.appearance ?? null,
        });
      }
    }
  }
  const flashback = flashbackBlock(input.flashback, input.characters, flashbackContextAges);
  const dream = dreamBlock(input.dream);

  const cast = castBlock(input.characters, haystack, !!input.flashback);
  const card = sceneCardBlock(input.sceneCard);
  const physics = physicsBlock(input.sceneCard);

  const directives = directivesBlock(input.directives, haystack);

  const props = propsBlock(
    input.visualProps,
    haystack,
    input.sceneCard != null
      ? input.sceneCard.characters.slice()
      : input.characters.map((c) => c.name),
  );
  const extras = extrasBlock(input.visualExtras, haystack);
  const extraDirection = extraInstructionsBlock(input.extraInstructions);

  const imageProfile = (input.imageProfile ?? "").trim();
  const structuredForGemini = wantsStructuredImagePrompt(imageProfile);
  const tailoredForZImage = wantsZImagePrompt(imageProfile);
  const imageModelBlock =
    imageProfile === ""
      ? ""
      : `TARGET IMAGE MODEL — write this prompt SPECIFICALLY for the image model described here, in the
form and length IT interprets best, and make it as PRECISE as this model can actually use (adapt format,
ordering and emphasis to it; do not waste detail the model cannot render, and front-load the detail it
can): ${imageProfile}\n`;
  const { styleRule, shapeInstruction, orderBlock, outputFormatBlock, directiveRule } =
    imagePromptDialectBlocks(structuredForGemini, tailoredForZImage);

  const prompt = `You write IMAGE PROMPTS for an AI image model that wants a DETAILED, flowing
NATURAL-LANGUAGE description (full sentences), NOT a list of comma-separated tags. ${shapeInstruction}
captures the MOOD and THEME of the moment. ${directiveRule}
The image is a BACKGROUND behind a quote (text will be placed
on top), so it must be emotional, cinematic and UNCLUTTERED. Favour mood over busy literal narration —
but you MAY depict the chapter's KEY MOMENT or central ACTION when that action is what the chapter turns
on (a person doing the pivotal activity of the scene): an event in the MIDDLE of the book is NOT a spoiler,
so do not shy away from it; just keep it evocative, not a cluttered literal illustration.
${imageModelBlock}SUBJECT (CRUCIAL): identify the SINGLE most ICONIC, concrete, VISUAL focal point of the passage and make
IT the clear focal subject — an animal, a striking object, a vehicle, a building, a memorable place, OR
the central ACTION/moment itself when the chapter hinges on an event. The focal subject MUST be present
and recognizable — do NOT replace it with a generic mood or an empty landscape. Name it explicitly. The
CHAPTER TITLE and the SCENE CARD below very often NAME this subject: trust them and feature it.
THEN wrap it in ATMOSPHERE: evocative light and shadow, time of day, weather, setting; convey a clear
feeling (hope, melancholy, tension, calm, a turning point). Cinematic and uncluttered.
SAFE & PUBLISHABLE (these are public social-media backgrounds): NEVER depict graphic violence, blood,
open wounds, a corpse or dead body, death or gore, even when the passage describes such things.
Convey danger, fear, dread or tragedy through ATMOSPHERE ONLY — dark restless water, a heavy threatening
sky, looming shadow, an ominous empty space, tense light — never through a body or graphic detail.
INTIMACY (tasteful, NON-EXPLICIT only): romantic and sensual moments MAY be depicted when the passage calls
for them — a couple kissing or embracing, two people lying together in bed under the covers with only heads
and bare shoulders showing, a figure in lingerie or underwear (or a man in boxers), bare backs and bare
shoulders, a tender or sensual mood. But it MUST stay non-explicit and publishable on social media: NEVER
show genitals, NEVER show female nipples — a woman's breasts are ALWAYS covered or hidden (by sheets, an
arm, hair, the lingerie itself, shadow, or the framing: cropped out, seen from behind, or side-on). NO
sexual acts, NO penetration, NO explicit or pornographic poses, NO intercourse — only the elegant, IMPLIED
suggestion of intimacy. NEVER depict anyone who is not clearly an adult in any intimate or suggestive way.
GROUNDING: place every element in its correct, physically plausible place (objects ON the ground,
vehicles on their surface), with ONE clear horizon line and a coherent perspective.
${physics}
REAL-WORLD CONFIGURATION: render familiar real objects, interiors and man-made structures in their
CORRECT, conventional arrangement and ORIENTATION — furniture, seats, fixtures, doors, windows and
architectural elements sit and face the way they actually do in reality. Do NOT rotate, mirror or
rearrange them just to fit more of them into the frame, and keep one coherent, physically consistent
space.
${directives}
${props}
EXTRAS & CROWDS: render background and incidental people (a film crew, passers-by, a group, other beachgoers) with NATURAL VARIETY — different hair colours and styles, heights, builds, ages and skin tones, never a row of identical clones — and dress them appropriately for the place and activity (a film crew in casual production clothes with lanyards/headphones/cables; beachgoers in swimwear; city people in everyday urban clothes). They are ordinary varied people, not uniformed unless the setting truly requires it.
${extras}
PEOPLE: a scene with NO person (just the iconic subject/place) is ALLOWED, but it is NOT preferable a
priori — do not default to an empty landscape when the passage actually has people in it. When the
passage revolves around one or more CHARACTERS, FEATURE them — but ONLY characters who actually appear
in THIS passage. It does NOT have to be the protagonist: a SECONDARY character ALONE is an excellent
subject when the passage is about them, and two characters together is fine when the passage puts them
in the same moment. Render any person faithfully from the CAST below (build, hair, face — for what they
WEAR see CLOTHING) and have them INTERACT with the iconic subject (touching it, looking toward it,
moving toward it, using it). One or two figures AT MOST; keep it natural and uncluttered; avoid a posed
studio portrait or a face staring straight at the camera. If a COMPOSITION DIRECTIVE is given below, it
DECIDES who (if anyone) appears AND from what angle — FOLLOW IT: if it asks for a character who IS
present in this passage, you MUST feature that character; fall back to the iconic subject/place ALONE
with no person ONLY if NO named character from the CAST appears anywhere in this chapter.
CLOTHING (VARY it — never default to one fixed outfit): dress every person for the SETTING and ACTIVITY
of THIS passage, consistent within the scene. Use activity- and setting-appropriate clothing; take the
exact garments from the CANONICAL VISUAL RULES / scene, do not default to one outfit. By the sea / on the
beach of a warm seaside town → swimwear or a light t-shirt and shorts. In a
city, at work, a formal or public moment, indoors in the evening, or a cold place → longer clothes: shirt
and trousers, a jacket or coat. Meditation, yoga, prayer, exercising, sitting on a practice/yoga mat,
sleeping or resting at home → NAME concrete modern casual garments (e.g. a plain t-shirt with soft joggers
or leggings), never the vague phrase "practice clothes" and NEVER a martial-arts GI, a karate/judo/taekwondo
uniform, a belt (obi), a dojo robe, a kimono or a monk's robe — an ORDINARY modern person, not a martial
artist or a monk.
WARDROBE CONSISTENCY: when a character in the CAST below has a "wears:" outfit noted next to them, dress
THAT character EXACTLY in it — their canonical look, IDENTICAL every time the same scene/context recurs;
this overrides the general clothing guidance above for that character, while characters WITHOUT a noted
outfit follow the general rule. An item in that note marked "ALWAYS …" (e.g. "ALWAYS a straw hat", "ALWAYS
round glasses") is a PERMANENT identity marker: show it in EVERY scene, on top of whatever else the scene
calls for, regardless of place, weather or activity — never drop or swap it. A garment merely mentioned in
the CAST notes as HABITUAL (e.g. "often wears red shirts", "elegant suits", a signature hat) is only a FAINT
identity hint, NOT a mandatory costume — use it where the scene genuinely fits, otherwise dress the character
for what they are actually DOING here.
NATURAL POSE: people look relaxed and believable, always anatomically correct and in balance. For a CALM,
everyday or static moment the body is UPRIGHT and well-balanced — head level, shoulders even, spine
straight, weight settled naturally on the feet, with only slight lifelike motion (a hand doing something,
a calm gesture, an easy step, sitting, holding an object). For an ACTIVE or SPORTING moment — and ALWAYS
when the CANONICAL VISUAL RULES describe the posture for an activity (any sport or physical
activity) — render that FULL dynamic posture EXACTLY as those rules specify,
including a strongly leaned-out, extended, crouched or angled body: the activity posture in the CANONICAL
VISUAL RULES takes PRIORITY here over the calm-upright default. Keep it athletic and anatomically correct.
KEEP IT SIMPLE: one clear setting, few elements (diffusion models ruin busy scenes); leave calm space
for the text. Use the book's overall theme/title as mood guidance: ${input.bookTitle ?? "(book)"}.
${styleRule}
NO TEXT IN THE IMAGE: never request letters, words, writing, signs, labels, captions, SPEECH BUBBLES
or comic panels, phone/computer SCREENS showing text, notes or letters with visible writing, or tattoos
with words. It is ONE single full-bleed illustration — no panels, no balloons, no lettering. If such an
object is essential to the scene, render its screen/paper BLANK or turned away.
PEOPLE BY APPEARANCE: describe any person ONLY by physical appearance (build, hair, clothing, posture) —
NEVER by name (names end up rendered as written text in the image).
CHARACTER CONSISTENCY: keep each recurring character's CORE physical features — apparent age, build, hair
colour and style, face — the SAME and clearly recognisable in EVERY image, exactly as the CAST describes.
HAIR: render each character's hair EXACTLY as the CAST states — the same COLOUR and the same cut in every
image; NEVER lighten it, grey it, darken it, recolour it or restyle it on your own. If the CAST says black
hair it is BLACK every time; if it says blonde it is blonde every time. AGE: render each character at the
EXACT apparent age the CAST states for them — neither younger nor markedly older (someone stated as about 50
must NOT look 30 or 70); do not rejuvenate or age them between images. ETHNICITY / SKIN TONE: render each
character's ethnicity and skin tone EXACTLY as the CAST states — the SAME heritage and the SAME skin tone in
every image; NEVER lighten, darken, whiten or change them, and never default to a generic light-skinned look.
Do NOT drift, restyle or exaggerate their look from one image to the next (especially the protagonist):
their face and build stay constant; only clothing and pose change with the scene.
PORTRAY EVERY PERSON FULLY (mandatory): for EACH person you place in the frame — the protagonist AND every
secondary character — you MUST explicitly WRITE, taken from the CAST, ALL of these: their ETHNICITY / skin
tone, their AGE, their BUILD and height, and their HAIR (colour + cut). Never reduce a character to a bare
"a man" / "a woman" / "a person": age and ethnicity in particular must ALWAYS be stated for every figure. If
the person is a CAST character, copy those traits verbatim; never omit, soften or invent them.
MULTIPLE CHARACTERS — KEEP THEM DISTINCT AND DO NOT SWAP THEM (applies to ANY two or more named people in the
frame, in EVERY book): (1) give EACH a CONTRASTING, unmistakable set of traits from the CAST — their own
ethnicity, age, build, hair and distinctive features (e.g. the older silver-haired man vs the younger robust
dark-haired man; the tall slim woman vs the shorter sturdy man) — so no two can be confused or blended into a
look-alike; (2) match each person to EXACTLY the action, position and role the PASSAGE assigns to THEM, bound
to that person by their distinctive appearance; never reassign, mix up or reverse who is where or who does what
(if the passage puts one lying in the bed and another standing beside it, render precisely that). This holds
for any number of characters and whatever their names are — never let one character take on another's
appearance, age, ethnicity, role or position.
RELATIVE SCALE: when two or more people share the frame, respect their RELATIVE heights and builds as given
in the CAST (e.g. a person stated as 1.60 m is clearly shorter than one at 1.85 m; a slim build is not drawn
as heavy). Keep human-to-human and human-to-object proportions realistic and consistent.
COLOR: if the iconic object has a signature COLOUR from the book, render the WHOLE object in THAT one
colour — INCLUDING its parts (handle, frame, hardware, panels). Do NOT invent a second colour, a
two-tone object or contrasting hardware (no "red-and-white door", no "white handle") unless the book
explicitly says so.
Concrete and visual.
${orderBlock}
FINAL CHECK (do this before writing): re-read your description against the PHYSICS & REALISM rules and
the CHAPTER PHYSICS/REALISM RULES above — none of them may be violated. If any element breaks a rule
(a body resting on the water, a wave breaking out to sea, a piece of equipment that needs an operator shown
with none, contradictory shadows, an object floating with no support, wrong scale), rewrite that element so it complies. Do NOT output this
check or any reasoning — output ONLY the format below.
${outputFormatBlock}

CHAPTER TITLE (strong hint for the iconic subject): ${input.chapterTitle?.trim() || "(none)"}
${card}
${extraDirection}
CAST (the book's characters with their appearance — use the NAMES only to recognise who the passage is
about; in the IMAGE render them by appearance, NEVER write their name; feature ONLY those present in the
passage):
${cast}
${flashback}
${dream}
${input.angle ? `COMPOSITION DIRECTIVE (follow this): ${input.angle}` : ""}
SUBJECT MUST FIT ITS REAL CONTEXT: the iconic subject must belong to the moment you actually depict.
- If you depict a WAKING, real scene, the subject must be PHYSICALLY PRESENT there. Do NOT drop into a waking
  scene an element that the text only DREAMS, remembers, expects, imagines or uses as a comparison/figure of
  speech (e.g. do not place a real animal or object beside the character in a waking scene when it only
  appeared in a dream, memory or comparison).
- A DREAMED or REMEMBERED element MAY be the subject — but ONLY by depicting THAT dream/memory AS its own
  scene: frame the WHOLE image as the dream/memory (dreamlike, surreal or soft atmosphere; the dreamed content
  fills the scene), not mixed into the awake reality. If the chapter's strongest image is a dream of a
  creature (or a monster, a place, a person), it is correct to illustrate that dream — as a dream.
- NEVER pick a word that merely SOUNDS like an object/animal but names a technique, move or concept (e.g. a
  sports move that borrows an animal's or object's name is NOT that animal or object): that is never a real
  subject.
- WHOSE dream/memory: a dream or memory belongs to the character who HAS it — usually the narrator / the "I"
  of a first-person passage, or the point-of-view character. If you depict that dream/memory, it is THAT
  person's; do NOT attribute it to, or feature as its protagonist, an unrelated bystander who merely appears
  elsewhere in the chapter. Show the dream's CONTENT (what is dreamt), framed as that character's dream.
Decide first WHICH moment you depict (waking scene OR the dream/memory) and WHOSE it is, then keep every
element coherent with that one moment.
FULL CHAPTER TEXT (it may contain SEVERAL moments — CHOOSE the SINGLE moment that best fits the
COMPOSITION DIRECTIVE and the SCENE CARD. The SUBJECT comes from the SCENE CARD, not from here: use this text
ONLY for the chosen subject's specific action, pose, mood and concrete details — never to introduce a subject
the card leaves out):
${passage || input.bookTitle || ""}`;

  if (process.env.DBG_INPUT) {
    console.error(
      `[DBG_INPUT] total=${prompt.length} chars | passage=${passage.length} | directives=${directives.length} | cast=${cast.length} | card=${card.length} | physics=${physics.length}`,
    );
    if (process.env.DBG_INPUT === "full") {
      console.error("\n----- FULL INPUT TO GPT -----\n" + prompt + "\n----- END INPUT -----\n");
    }
  }

  try {
    const raw = await engine.run(prompt);
    const lines = (raw ?? "")
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const tagLine = lines.find(isTagsLine);
    const charLine = lines.find(isCharsLine);
    const cleaned = pickDescription(lines, structuredForGemini);
    const tags = tagLine
      ? tagLine
          .replace(/^tags\s*:/i, "")
          .split(",")
          .map((t) =>
            t
              .trim()
              .toLowerCase()
              .replace(/[."'`]+$/g, ""),
          )
          .filter((t) => t.length > 0 && t.length <= 30)
          .slice(0, 6)
      : [];

    const charNames = charLine
      ? charLine
          .replace(/^characters\s*:/i, "")
          .split(",")
          .map((s) =>
            s
              .trim()
              .toLowerCase()
              .replace(/[."'`]+$/g, ""),
          )
          .filter((s) => s.length > 0 && s.length <= 30 && !/^none$/i.test(s))
          .filter((s) => input.characters.some((c) => looseNameMatch(c.name, s)))
      : [];
    const seen = new Set<string>();
    const mergedTags = [...charNames, ...tags]
      .filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
      .slice(0, 8);

    const depicted: SceneCharacter[] = [];
    for (const n of charNames) {
      const c = input.characters.find((cc) => looseNameMatch(cc.name, n));
      if (c && !depicted.includes(c)) depicted.push(c);
    }
    if (cleaned.length >= 8) {
      const description = tailoredForZImage
        ? cleaned
        : appendCanonicalReminder(cleaned, input.characters, charNames);
      const englishDescription = await translateImagePromptToEnglishPreserveStructure(
        engine,
        description,
      );
      return { description: englishDescription, tags: mergedTags, depicted };
    }
    return fallbackScene(input);
  } catch (e) {
    if (e instanceof ContentError) return fallbackScene(input);
    throw e;
  }
}

export interface SceneSelection {
  subject: string;
  brief: string;
  framing?: string;
  characters: string[];
  objects: string[];
  mood?: string;
  momentType: "waking" | "dream" | "flashback" | "memory";
}

export interface SceneSelectionInput {
  chapterTitle?: string | null;
  chapterExcerpt: string | null;
  bookTitle?: string | null;
  sceneCard?: ChapterScene | null;
  castNames: { name: string; role?: string | null }[];
  objectNames?: string[];
  directiveNames?: string[];
  directiveGuidance?: string[];
}

function parseJsonArray(raw: string): unknown[] | null {
  let s = (raw ?? "").trim();
  s = s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function selectionCardSummary(card: ChapterScene | null | undefined): string {
  if (!card) return "(none)";
  const lines: string[] = [];
  if (card.keyMoment && card.keyMoment.trim() !== "")
    lines.push(`- key moment: ${card.keyMoment.trim()}`);
  if (card.location) lines.push(`- location: ${card.location}`);
  if (card.environment) lines.push(`- environment: ${card.environment}`);
  if (card.mainObjects.length > 0)
    lines.push(`- main subjects pool: ${card.mainObjects.join(", ")}`);
  if (card.secondaryObjects.length > 0)
    lines.push(`- secondary objects pool: ${card.secondaryObjects.join(", ")}`);
  if (card.characters.length > 0) lines.push(`- characters pool: ${card.characters.join(", ")}`);
  for (const m of card.altMoments ?? []) {
    if (m.keyMoment && m.keyMoment.trim() !== "")
      lines.push(`- alternate ${m.type} moment: ${m.keyMoment.trim()}`);
  }
  return lines.length > 0 ? lines.join("\n") : "(none)";
}

export async function selectChapterScenes(
  engine: ContentEngine,
  input: SceneSelectionInput,
  count: number,
): Promise<SceneSelection[] | null> {
  const n = Math.max(1, Math.min(Math.floor(count) || 1, 12));
  const passage = (input.chapterExcerpt ?? "").trim().slice(0, 20000);
  const cast =
    input.castNames.map((c) => `- ${c.name}${c.role ? ` (${c.role})` : ""}`).join("\n") || "(none)";
  const objects =
    (input.objectNames ?? []).length > 0 ? (input.objectNames ?? []).join(", ") : "(none)";
  const directiveGuidance = (input.directiveGuidance ?? [])
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
  const directives =
    directiveGuidance.length > 0
      ? directiveGuidance.join("\n\n")
      : (input.directiveNames ?? []).length > 0
        ? (input.directiveNames ?? []).join(", ")
        : "(none)";

  const prompt = `You SELECT which scenes to illustrate for ONE chapter of a book, then hand each one to an image-prompt writer. A chapter holds several moments; choose the ${n} that make the STRONGEST, most distinct background images.
Return EXACTLY ${n} scene(s), each a DISTINCT moment with a DIFFERENT subject — never two near-identical scenes.
For EACH scene return a JSON object with these keys:
- "subject": the single most iconic, concrete VISUAL subject of that moment (an object, animal, vehicle, place, or a person doing the pivotal action).
- "brief": 2 to 3 sentences describing ONLY that moment — what happens, who is there, their action and pose, the setting and the mood. It MUST be self-contained: the image writer sees ONLY this brief, not the chapter.
- "framing": a short shot suggestion (e.g. wide over-the-shoulder, close-up, from behind, low angle).
- "characters": an array of names copied EXACTLY from the CAST list below, of the people PHYSICALLY PRESENT in this moment. Keep it to 0, 1 or 2. Use [] for a scene with no person.
- "objects": an array of names copied EXACTLY from the OBJECTS list below, of items that GENUINELY belong in this moment. Usually 0 to 2. Use [] if none apply.
- "mood": one or two mood words.
- "momentType": one of waking, dream, flashback, memory.
Output ONLY a JSON array of ${n} object(s). No prose, no explanation, no code fence.

CHAPTER TITLE: ${input.chapterTitle?.trim() || "(none)"}
BOOK: ${input.bookTitle ?? "(book)"}
SCENE CARD (grounding pool for the WHOLE chapter — pick the ${n} best moments from it):
${selectionCardSummary(input.sceneCard)}
CAST (names + role; copy names EXACTLY, render only those truly in the chosen moment):
${cast}
OBJECTS (recurring canonical items; copy names EXACTLY; pick only those truly present in the moment):
${objects}
CANONICAL VISUAL DIRECTIVES that may constrain WHICH moment is valid to choose. Apply them during scene
selection, not only after choosing the moment:
${directives}
FULL CHAPTER TEXT:
${passage || input.bookTitle || ""}`;

  try {
    const raw = await engine.run(prompt);
    const arr = parseJsonArray(raw ?? "");
    if (!arr) return null;
    const toStrArr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .filter((x): x is string => typeof x === "string")
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
    const out: SceneSelection[] = [];
    for (const it of arr) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      const subject = typeof o.subject === "string" ? o.subject.trim() : "";
      const brief = typeof o.brief === "string" ? o.brief.trim() : "";
      if (subject === "" && brief === "") continue;
      const mt = typeof o.momentType === "string" ? o.momentType.trim().toLowerCase() : "waking";
      out.push({
        subject,
        brief,
        ...(typeof o.framing === "string" && o.framing.trim() !== ""
          ? { framing: o.framing.trim() }
          : {}),
        characters: toStrArr(o.characters),
        objects: toStrArr(o.objects),
        ...(typeof o.mood === "string" && o.mood.trim() !== "" ? { mood: o.mood.trim() } : {}),
        momentType: (["waking", "dream", "flashback", "memory"].includes(mt)
          ? mt
          : "waking") as SceneSelection["momentType"],
      });
    }
    return out.length > 0 ? out : null;
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
