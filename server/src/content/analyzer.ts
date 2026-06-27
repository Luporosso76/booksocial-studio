import type { ContentEngine } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import { languageName } from "./language.js";
import { CURRENT_PROMPT_VERSION } from "../domain.js";

// One-time book analysis -> compact BookProfile (scheda). This is the ONLY phase
// where the model sees the full text; every later generation uses only the scheda.
// Prompt ported almost verbatim from Java BookAnalyzer (the quality depends on it).

export interface AnalyzedProfile {
  synopsisShort: string | null;
  synopsisLong: string | null;
  genres: string | null;
  tone: string | null;
  targetAudience: string | null;
  analysisJson: string;
  promptVersion: number;
  model: string;
}

export async function analyzeBook(
  engine: ContentEngine,
  book: { title: string; author: string | null; language: string; contentHash: string },
  fullText: string,
  // Nomi reali rilevati dal pre-pass NLP (spaCy): usati SOLO come seeding nel prompt.
  // Opzionale: se assente o vuoto, il prompt resta identico a prima.
  seedCharacters: string[] = [],
  outputLanguage?: string,
): Promise<AnalyzedProfile> {
  const prompt = buildPrompt(book, fullText, seedCharacters, outputLanguage);
  const response = await engine.run(prompt);
  const j = parseModelJson(response) as Record<string, unknown>;

  return {
    synopsisShort: text(j, "synopsis_short"),
    synopsisLong: text(j, "synopsis_long"),
    genres: text(j, "genres"),
    tone: text(j, "tone"),
    targetAudience: text(j, "target_audience"),
    analysisJson: JSON.stringify(j),
    promptVersion: CURRENT_PROMPT_VERSION,
    model: engine.name(),
  };
}

function buildPrompt(
  book: { title: string; author: string | null; language: string },
  fullText: string,
  seedCharacters: string[],
  outputLanguage?: string,
): string {
  const author = book.author == null ? "(not specified)" : book.author;
  const langName = languageName(outputLanguage || book.language);
  const seedBlock =
    seedCharacters.length > 0
      ? `\nDETECTED CHARACTERS (real names to profile; add any missing ones): ${seedCharacters.join(", ")}\n`
      : "";
  return `You are an editorial analyst. Analyze the following book and produce a structured PROFILE CARD
that will be used to generate marketing social posts WITHOUT having to re-read the book each time.
${seedBlock}

CRITICAL SPOILER RULE: the card will feed public posts. You must carefully separate what is SAFE
to show potential readers (premise, atmosphere, themes, characters' initial situation, hooks) from
what must NEVER be revealed (ending, plot twists, revelations, deaths, secret identities, conflict
outcomes). Populate "spoiler_policy.do_not_reveal" with these sensitive elements explicitly.

Reply EXCLUSIVELY with a valid JSON object, no text before or after, in this form:
{
  "title": "...",
  "synopsis_short": "1-2 sentences, back-cover style, NO spoilers",
  "synopsis_long": "1 paragraph, NO spoilers",
  "genres": "comma-separated genres",
  "tone": "narrative tone and voice",
  "target_audience": "ideal reader",
  "themes": ["main theme/topic 1", "theme 2"],
  "main_topics": ["topic covered 1", "topic 2"],
  "conflicts": [{"type": "inner/interpersonal/social/...", "description": "the conflict WITHOUT revealing its outcome"}],
  "central_question": "the central dramatic question (no answer/spoiler)",
  "characters": [{"name": "...", "role": "protagonist/antagonist/...", "occupation": "job or social role (even if inferred)", "age": "approximate age or age range, even if INFERRED (e.g. 'about 35', 'teenager ~16', 'elderly ~70'); '' if truly impossible to tell", "ethnicity": "ethnicity / skin tone / visible heritage, even if INFERRED from the text or its setting (e.g. 'Dominican, brown skin', 'East-Asian', 'white European'); '' only if impossible to infer", "physical_description": "physical appearance EXCLUDING age and ethnicity (those go in their own fields): build, height, hair COLOR + cut, eye color, distinctive features", "traits": "personality and behaviour", "starting_situation": "initial situation without spoilers"}],
  "setting": "setting and time period",
  "key_quotes": [{"quote": "...", "context": "why it is noteworthy", "is_spoiler": false}],
  "marketing_hooks": ["sales hook NO spoiler 1", "hook 2"],
  "content_angles": ["post idea NO spoiler 1", "idea 2", "idea 3"],
  "spoiler_policy": {
    "safe_to_share": ["safe element 1", "element 2"],
    "do_not_reveal": ["plot twist/ending/revelation NEVER to publish 1", "element 2"]
  }
}

LANGUAGE: write ALL text values in the JSON in ${langName}, regardless of the language of the original book text.
Even though these instructions are in English, the output (synopsis, genres, tone, themes, descriptions, etc.) must be in ${langName}.
JSON keys remain in English as shown. Be concrete and specific, no empty promotional phrases.
Quotes with "is_spoiler": true will never be used in posts.

Declared title: ${book.title}
Author: ${author}

=== BOOK TEXT ===
${fullText}`;
}

function text(j: Record<string, unknown>, field: string): string | null {
  const v = j[field];
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
}
