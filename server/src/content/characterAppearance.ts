import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import { languageName } from "./language.js";

export interface AppearanceInput {
  name: string;
  role?: string | null;
  occupation?: string | null;
  personality?: string | null;
  physical?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  notes?: string | null;
  bookTitle?: string | null;
  language: string;
  sourceText?: string | null;
  country?: string | null;
}

export interface AppearanceResult {
  physical: string;
  age: string | null;
  ethnicity: string | null;
}

const MAX_LEN = 320;
const MAX_SHORT = 80;

function clamp(s: string, max: number): string {
  const t = s
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

export async function generateAppearance(
  engine: ContentEngine,
  input: AppearanceInput,
): Promise<AppearanceResult | null> {
  const language = languageName(input.language);
  const prompt = `You are a visual director defining the CANONICAL PHYSICAL APPEARANCE of a character, to be
used IDENTICALLY across ALL the book's illustrations (to keep images consistent). Given the character and the
available information, fix PRECISE, COMPLETE and STABLE values.

Reply EXCLUSIVELY with a valid JSON object, no text before or after, in this exact form:
{"physical": "...", "age": "...", "ethnicity": "..."}

FIELD RULES:
- "age": apparent age or tight age range, SPECIFIC not vague (e.g. "about 35", "teenager ~16", "elderly ~70").
- "ethnicity": ethnicity + skin tone (e.g. "Dominican, light-brown skin", "East-Asian, fair skin"). If the
  text does not state it, anchor it plausibly to the book's setting (country: ${input.country?.trim() || "not stated"}),
  unless the text hints otherwise. Never leave it vague.
- "physical": everything ELSE about how they LOOK — build (and rough weight), height, hair (COLOR + cut/length),
  eyes (color), face and features, and permanent distinctive traits (beard/moustache, glasses, moles, scars,
  tattoos). Do NOT repeat age or ethnicity here. At most ~260 characters.
- FAITHFUL TO THE BOOK: read the "BOOK PASSAGES" carefully and capture EVERY physical trait they describe
  (hair/eye color, height, build, scars, beard, glasses, age, ethnicity…), skipping NONE; USE each exactly as
  stated; never contradict it. Only FILL IN what the book does not give, plausibly, once and for all.
- RESPECT the existing info below (do not contradict it). NO clothing/outfit (handled separately), NO personality,
  role, biography, emotions or actions.
- LANGUAGE: write ALL the string VALUES in ${language}. Even though these instructions are in English, every
  value (physical, age, ethnicity) MUST be written in ${language}. The JSON keys stay in English as shown.

CHARACTER: ${input.name}
ROLE: ${input.role?.trim() || "(unspecified)"}
OCCUPATION: ${input.occupation?.trim() || "(unspecified)"}
EXISTING PHYSICAL INFO: ${input.physical?.trim() || "(none)"}
EXISTING AGE: ${input.age?.trim() || "(none)"}
EXISTING ETHNICITY: ${input.ethnicity?.trim() || "(none)"}
NOTES: ${input.notes?.trim() || "(none)"}
BOOK: ${input.bookTitle?.trim() || "(untitled)"} — setting/country: ${input.country?.trim() || "(not stated)"}
=== BOOK PASSAGES MENTIONING ${input.name.toUpperCase()} (extract the real traits from here) ===
${input.sourceText?.trim() || "(no passage available: complete plausibly and consistently)"}`;

  try {
    const raw = await engine.run(prompt);
    let parsed: Record<string, unknown>;
    try {
      parsed = parseModelJson(raw ?? "") as Record<string, unknown>;
    } catch {
      return null;
    }
    const field = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
    const physical = clamp(field(parsed.physical), MAX_LEN);
    if (physical.length < 12) return null;
    const ageRaw = clamp(field(parsed.age), MAX_SHORT);
    const ethRaw = clamp(field(parsed.ethnicity), MAX_SHORT);
    return {
      physical,
      age: ageRaw.length > 0 ? ageRaw : null,
      ethnicity: ethRaw.length > 0 ? ethRaw : null,
    };
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
