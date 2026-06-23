import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";

// Genera l'ASPETTO FISICO CANONICO di un personaggio: una descrizione precisa, completa e STABILE,
// da usare IDENTICA in tutte le immagini (coerenza). Arricchisce/colma le descrizioni deboli o
// incomplete partendo dalle info esistenti, senza contraddirle. SOLO aspetto fisico: niente abiti
// (gestiti a parte), niente personalità/ruolo. Best-effort: ritorna null se il motore fallisce.

export interface AppearanceInput {
  name: string;
  role?: string | null;
  occupation?: string | null;
  personality?: string | null;
  physical?: string | null;
  notes?: string | null;
  bookTitle?: string | null;
  language: string; // lingua del libro: la descrizione è scritta in questa lingua
  // GROUNDING: passaggi reali del libro che nominano il personaggio (per estrarre i tratti DESCRITTI
  // invece di inventarli). Opzionale: assente → comportamento storico (solo dai campi noti).
  sourceText?: string | null;
  // Ambientazione: paese principale del libro → ancora etnia/carnagione plausibili quando il testo
  // non le specifica (es. Rep. Dominicana). Opzionale.
  country?: string | null;
}

const MAX_LEN = 320;

export async function generateAppearance(
  engine: ContentEngine,
  input: AppearanceInput,
): Promise<string | null> {
  const prompt = `You are a visual director defining the CANONICAL PHYSICAL APPEARANCE of a character, to be
used IDENTICALLY across ALL the book's illustrations (to keep images consistent). Given the character and the
available information, write ONE PRECISE, COMPLETE and STABLE physical description.

RULES:
- PHYSICAL APPEARANCE ONLY: apparent age, build (and rough weight), height, hair (COLOR + cut/length), eyes
  (color), face and features, skin tone/ethnicity, and any permanent distinctive traits (beard/moustache,
  glasses, moles, scars, tattoos). Pick SPECIFIC, definite values, never vague ones.
- FAITHFUL TO THE BOOK: if the "BOOK PASSAGES" below describe a trait (hair/eye color, height, scars, age,
  ethnicity…), USE IT exactly; never contradict it. Only FILL IN details the book does NOT give, plausibly,
  fixing them once and for all.
- ETHNICITY/SKIN TONE: if the text does not specify it, anchor it plausibly to the book's setting
  (country: ${input.country?.trim() || "not stated"}), unless the text hints otherwise.
- Also RESPECT the "EXISTING PHYSICAL INFO" (do not contradict it).
- NO clothing or outfit (handled separately). NO personality, role, biography, emotions or actions. Only how
  the character physically LOOKS.
- Concise: one sentence or a few, at most ~280 characters. Write in ${input.language}. No preamble, no quotes:
  ONLY the description.

CHARACTER: ${input.name}
ROLE: ${input.role?.trim() || "(unspecified)"}
OCCUPATION: ${input.occupation?.trim() || "(unspecified)"}
EXISTING PHYSICAL INFO: ${input.physical?.trim() || "(none)"}
NOTES: ${input.notes?.trim() || "(none)"}
BOOK: ${input.bookTitle?.trim() || "(untitled)"} — setting/country: ${input.country?.trim() || "(not stated)"}
=== BOOK PASSAGES MENTIONING ${input.name.toUpperCase()} (extract the real traits from here) ===
${input.sourceText?.trim() || "(no passage available: complete plausibly and consistently)"}`;

  try {
    const raw = await engine.run(prompt);
    const cleaned = (raw ?? "")
      .trim()
      .replace(/^```[a-z]*\n?|\n?```$/gi, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    if (cleaned.length < 12) return null;
    return cleaned.length > MAX_LEN ? `${cleaned.slice(0, MAX_LEN).trimEnd()}…` : cleaned;
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
