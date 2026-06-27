import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import { languageName } from "./language.js";
import type { MinorCharacter } from "../domain.js";

// Estrae i PERSONAGGI MINORI/incidentali di un capitolo: figure secondarie (spesso senza nome) che
// CONTANO visivamente e NON sono nel cast principale né pura folla di sfondo. Serve a dare loro un
// look FISSO e coerente nelle scene dove compaiono (vedi imagePrompt.ts extrasBlock).
// Best-effort: ritorna [] se il motore fallisce.

export interface MinorsInput {
  chapterText: string;
  chapterTitle?: string | null;
  language: string; // lingua del libro: label/when sono scritti in questa lingua (user-facing + editabile)
  knownCast: string[]; // nomi del cast noto (da ESCLUDERE: non sono minori)
  sceneKeywords: string; // keyword della scheda del capitolo (luogo/ambiente/oggetti), riusabili per `when`
}

// Cap del testo passato al modello: un singolo passaggio basta (i minori si individuano dalle scene
// del capitolo, non serve coprire capitoli enormi a blocchi come per la scheda visiva).
const MAX_CHARS = 16000;
const MAX_MINORS = 4;

export async function extractMinorsForChapter(
  engine: ContentEngine,
  input: MinorsInput,
): Promise<MinorCharacter[]> {
  const text = (input.chapterText ?? "").trim().slice(0, MAX_CHARS);
  if (text === "") return [];
  const cast = input.knownCast.length > 0 ? input.knownCast.join(", ") : "(none known)";
  const sceneKeywords = (input.sceneKeywords ?? "").trim() || "(not available)";
  const language = languageName(input.language);

  const prompt = `You are an assistant that prepares VISUAL CARDS for generating consistent illustrations. From
the following chapter, identify the INCIDENTAL/MINOR figures that MATTER visually and are NOT in the
known cast and are NOT pure background crowd: meaning a SPECIFIC person, often unnamed, who appears in a
scene and would actually be drawn (e.g. an occasional partner in a scene, a recurring unnamed figure,
an operator/worker who acts in the scene). Each of these must be given a FIXED appearance so they remain
consistent every time that scene recurs.

Reply EXCLUSIVELY with a valid JSON object, no text before or after:
{
  "minors": [
    { "label": "role+brief context (e.g. 'the protagonist's companion (bar scene)')", "when": "2-5 keywords in ${language} matching the scene of THIS chapter", "appearance": "FIXED specific physical appearance: age, build, hair color+style, face, skin tone", "outfit": "clothing appropriate to the context, or "" " }
  ]
}

RULES:
- 0 to ${MAX_MINORS} entries. Include ONLY incidental figures that would be DRAWN in a scene.
- STRICTLY EXCLUDE: anyone already in the KNOWN CAST below; pure crowd/background (a crew, passers-by,
  waiters, or extras with no role) — that is handled elsewhere with a variety rule.
- "appearance": INVENT a plausible, specific and VARIED one (age, build, hair color+style, face, skin
  tone) — it must remain IDENTICAL across images.
- "when": a few KEYWORDS (in ${language}) that will match the chapter card
  (location/setting/objects); you may REUSE the scene keywords provided below.
- "outfit": clothing appropriate to the context, or "" if not relevant.
- LANGUAGE: write label/when/appearance/outfit in ${language}. Even though these instructions are in English,
  those values MUST be in ${language}. Concrete and visual, no plot details.

KNOWN CAST (EXCLUDE): ${cast}
SCENE KEYWORDS (reusable for "when"): ${sceneKeywords}
CHAPTER TITLE: ${input.chapterTitle?.trim() || "(none)"}
=== CHAPTER TEXT ===
${text}`;

  try {
    const raw = await engine.run(prompt);
    const j = parseModelJson(raw) as Record<string, unknown>;
    const minors = Array.isArray(j.minors)
      ? j.minors
          .map((m) => {
            const o = (m ?? {}) as Record<string, unknown>;
            return {
              label: typeof o.label === "string" ? o.label.trim().slice(0, 100) : "",
              when: typeof o.when === "string" ? o.when.trim().slice(0, 80) : "",
              appearance: typeof o.appearance === "string" ? o.appearance.trim().slice(0, 240) : "",
              outfit:
                typeof o.outfit === "string" && o.outfit.trim() !== ""
                  ? o.outfit.trim().slice(0, 200)
                  : null,
            };
          })
          .filter((m) => m.label !== "" && m.appearance !== "")
          .slice(0, MAX_MINORS)
      : [];
    return minors;
  } catch (e) {
    if (e instanceof ContentError) return [];
    throw e;
  }
}
