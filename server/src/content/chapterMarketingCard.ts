import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import { languageName } from "./language.js";
import type { ChapterMarketingCardData } from "../domain.js";

// SCHEDA MARKETING DI CAPITOLO: comprensione NARRATIVA persistente del capitolo, separata
// dalla scheda scena (che è visiva). Serve a fondare la generazione dei post PRIMA di scriverli:
// sintesi non-spoiler, nucleo emotivo, verità umana, domanda al lettore, tensione, momento visivo,
// citazioni sicure candidate, focus personaggi e ANGOLI POST già pronti (con punteggi per il ranker).
// Best-effort: ritorna null se il motore fallisce o il JSON è irrecuperabile.

export const MARKETING_CARD_SCHEMA_VERSION = 1;

export interface MarketingCardInput {
  chapterText: string;
  chapterTitle?: string | null;
  language: string;
  knownCharacters: string[]; // nomi del cast (per il match e il focus personaggi)
  keyMoment?: string | null; // dalla scheda scena, se disponibile (momento iconico)
  spoilerPolicy?: string | null; // do_not_reveal / dettagli sensibili dalla scheda libro
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : 5;
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const risk = (v: unknown): "low" | "medium" | "high" => {
  const s = String(v ?? "low").toLowerCase();
  return s === "high" ? "high" : s === "medium" ? "medium" : "low";
};

export async function extractMarketingCard(
  engine: ContentEngine,
  input: MarketingCardInput,
): Promise<ChapterMarketingCardData | null> {
  const text = (input.chapterText ?? "").trim();
  if (text === "") return null;
  const lang = languageName(input.language);
  const cast = input.knownCharacters.length > 0 ? input.knownCharacters.join(", ") : "(none known)";

  const prompt = `You are a book-marketing analyst preparing a CHAPTER MARKETING CARD: the narrative
understanding of ONE chapter, used later to write social posts that feel born from THIS book. Extract
only what is true to the chapter. NEVER reveal spoilers (endings, twists, deaths, reveals, outcomes).

Reply with ONLY a valid JSON object, no text before or after, in this exact shape:
{
  "spoiler_level": "low|medium|high (how risky this chapter is to talk about openly)",
  "non_spoiler_summary": "2-3 sentences a stranger can read safely: what this chapter is ABOUT, no outcomes",
  "emotional_core": "the core emotion/feeling at play (one phrase)",
  "human_truth": "the universal human truth or question behind it (one phrase, relatable outside the plot)",
  "reader_question": "ONE question this chapter raises that a reader would want to answer or discuss",
  "main_tension": "the central tension/conflict at stake here, without revealing how it resolves",
  "visual_moment": "the single most concrete, depictable image/moment of the chapter (one short sentence)",
  "safe_quote_candidates": [
    { "quote": "a SHORT, real, NON-spoiler line or phrase from the chapter", "why_it_works": "why it lands", "spoiler_risk": "low|medium|high" }
  ],
  "character_focus": [
    { "name": "a character from the KNOWN CAST who is present", "state_in_this_chapter": "...", "desire": "...", "fear": "...", "change_without_spoiler": "how they shift here, no outcome spoiler" }
  ],
  "post_angles": [
    { "type": "micro-scene|reader-question|character|symbol|quote|conflict", "hook": "a concrete opening hook for a post (one line)", "reason": "why it works for THIS chapter", "concreteness": 0-10, "emotional_strength": 0-10, "spoiler_safety": 0-10, "freshness": 0-10 }
  ]
}

RULES:
- Give 5 to 8 post_angles, DISTINCT from each other, each anchored in a CONCRETE detail of THIS chapter (not generic). Score them honestly: concreteness (a real moment/line/image), emotional_strength, spoiler_safety (10 = totally safe), freshness (10 = not an obvious cliché).
- safe_quote_candidates: 0-4, only REAL short phrases from the chapter text, non-spoiler; [] if none fits.
- character_focus: only characters from the KNOWN CAST actually present in the chapter; [] if none.
- Everything NON-spoiler. The "spoiler_policy" items below must NOT appear nor be hinted at.
- Concrete and specific, no back-cover blurb language. Write all string values in ${lang}.
- If a field cannot be determined, use "" or [].

KNOWN CAST: ${cast}
KEY VISUAL MOMENT (from the scene card, if any): ${str(input.keyMoment) || "(none)"}
SPOILER POLICY / do-not-reveal: ${str(input.spoilerPolicy) || "(none specified)"}
CHAPTER TITLE: ${str(input.chapterTitle) || "(none)"}
=== CHAPTER TEXT ===
${text.slice(0, 20000)}`;

  let raw: string;
  try {
    raw = await engine.run(prompt);
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
  let j: Record<string, unknown>;
  try {
    j = parseModelJson(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  // Validazione citazioni: il modello può inventare/parafrasare. Tieni SOLO le citazioni davvero
  // presenti nel capitolo (match tollerante: minuscole, senza virgolette, spazi normalizzati).
  const normalizeForMatch = (s: string): string =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[«»“”‘’"']/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const hayNorm = normalizeForMatch(text);
  const safeQuotes = Array.isArray(j["safe_quote_candidates"])
    ? (j["safe_quote_candidates"] as unknown[])
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return {
            quote: str(o.quote),
            whyItWorks: str(o.why_it_works),
            spoilerRisk: risk(o.spoiler_risk),
          };
        })
        .filter((q) => {
          if (q.quote === "") return false;
          const qn = normalizeForMatch(q.quote);
          return qn.length >= 8 && hayNorm.includes(qn);
        })
        .slice(0, 4)
    : [];
  const characterFocus = Array.isArray(j["character_focus"])
    ? (j["character_focus"] as unknown[])
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return {
            name: str(o.name),
            stateInChapter: str(o.state_in_this_chapter),
            desire: str(o.desire),
            fear: str(o.fear),
            changeWithoutSpoiler: str(o.change_without_spoiler),
          };
        })
        .filter((c) => c.name !== "")
        .slice(0, 8)
    : [];
  const postAngles = Array.isArray(j["post_angles"])
    ? (j["post_angles"] as unknown[])
        .map((x) => {
          const o = (x ?? {}) as Record<string, unknown>;
          return {
            type: str(o.type) || "micro-scene",
            hook: str(o.hook),
            reason: str(o.reason),
            concreteness: num(o.concreteness),
            emotionalStrength: num(o.emotional_strength),
            spoilerSafety: num(o.spoiler_safety),
            freshness: num(o.freshness),
          };
        })
        .filter((a) => a.hook !== "")
        .slice(0, 8)
    : [];

  // Card vuota (niente angoli né sintesi) = estrazione fallita: meglio null che persistere il vuoto.
  const nonSpoilerSummary = str(j["non_spoiler_summary"]);
  if (postAngles.length === 0 && nonSpoilerSummary === "") return null;

  return {
    spoilerLevel: risk(j["spoiler_level"]),
    nonSpoilerSummary,
    emotionalCore: str(j["emotional_core"]),
    humanTruth: str(j["human_truth"]),
    readerQuestion: str(j["reader_question"]),
    mainTension: str(j["main_tension"]),
    visualMoment: str(j["visual_moment"]),
    safeQuotes,
    characterFocus,
    postAngles,
  };
}
