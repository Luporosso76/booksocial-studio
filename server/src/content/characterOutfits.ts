import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import type { CharacterOutfits } from "../domain.js";

// Genera l'ABBIGLIAMENTO CANONICO di un personaggio: un abito di DEFAULT (quotidiano) + alcuni abiti
// per CONTESTO legati alle scene/ambientazioni RICORRENTI del libro, ognuno con keyword `when` che
// combaciano con la scheda del capitolo (luogo/ambiente/oggetti). Serve a vestire il personaggio
// SEMPRE allo stesso modo nella stessa scena. Best-effort: ritorna null se il motore fallisce.

export interface OutfitsInput {
  name: string;
  role?: string | null;
  occupation?: string | null;
  personality?: string | null;
  physical?: string | null;
  bookTitle?: string | null;
  language: string;
  // Ambientazioni/contesti ricorrenti del libro (da luoghi+ambienti delle schede capitolo): aiutano
  // a creare abiti per le scene reali e a scegliere keyword `when` che combaceranno con le schede.
  settings: string[];
  // GROUNDING: passaggi reali del libro che nominano il personaggio (per cogliere i capi che il libro
  // gli fa indossare in certe scene). Opzionale.
  sourceText?: string | null;
  // Paese del libro → coerenza di clima/cultura del vestiario quando il testo non specifica. Opzionale.
  country?: string | null;
}

const MAX_CTX = 5;

export async function generateOutfits(
  engine: ContentEngine,
  input: OutfitsInput,
): Promise<CharacterOutfits | null> {
  const settings =
    input.settings.length > 0 ? input.settings.slice(0, 24).join("; ") : "(not available)";

  const prompt = `Define a character's CANONICAL WARDROBE for CONSISTENT illustrations: the character must
ALWAYS dress the same way in the same situation. Given the character, write a DEFAULT outfit plus a few
CONTEXT outfits tied to the book's recurring settings.

Reply with ONLY a valid JSON object, no text before or after:
{
  "default": "the character's typical everyday outfit (concrete garments + colors)",
  "contexts": [
    { "when": "2-5 CONTEXT keywords (places/activities) separated by commas, written in ${input.language}", "outfit": "concrete, coherent clothing for that context" }
  ]
}

RULES:
- FAITHFUL TO THE BOOK: if the "BOOK PASSAGES" below say what the character wears (a garment, a color, an
  accessory in a certain scene), RESPECT it and put it in the right context; do NOT invent against the text.
  Only fill in what the book does not say.
- "default": how the character normally dresses (concrete garments, e.g. "light-blue shirt, dark jeans,
  sneakers"); consistent with age, role, occupation and with the CLIMATE/CULTURE of the setting
  (country: ${input.country?.trim() || "not stated"}). No vagueness like "comfortable clothes".
- ERA: if the book is set in a specific era/historical context (or a passage is a flashback/memory of the
  past), dress the character coherently with that era, not contemporary.
- MODERN, NOT AGING (UNLESS the era/role truly requires otherwise): dress the character in CONTEMPORARY,
  current everyday clothes. AVOID garments that read as dated or that make people look older than they are —
  NO cardigan, NO blazer or sport coat for casual scenes, NO twin-set, NO waistcoat/gilet, NO pleated dress
  trousers, NO buttoned-up shirt-and-belt "smart casual" by default. Prefer modern pieces suited to age and
  context: t-shirts, knit jumpers/sweatshirts/hoodies, jeans or chinos, casual dresses, sneakers/boots, and
  jackets like denim/bomber/field/leather. Formal wear (suit, dress) ONLY when the scene is genuinely formal.
- "contexts": 0 to ${MAX_CTX} entries, ONLY for the recurring situations where this character plausibly
  appears. Each "when" is a few KEYWORDS taken FROM THE VOCABULARY of the SETTINGS below (so they will match
  the chapter scene cards), written in ${input.language} (e.g. "beach, sea, surf" or "meditation, yoga, mat"
  or "office, work"). Each "outfit" is the CONCRETE clothing suited to that context, coherent with its climate.
- Realistic outfits, consistent with the character; no uniforms/costumes unless the role truly requires it
  (no gi/martial-arts outfit for a meditation scene). CLOTHING ONLY, no physical appearance.
- Write in ${input.language}. If you don't know what to put in a field, use "" or [].

CHARACTER: ${input.name}
ROLE: ${input.role?.trim() || "(unspecified)"}
OCCUPATION: ${input.occupation?.trim() || "(unspecified)"}
APPEARANCE (for consistency, do NOT describe it in the outfits): ${input.physical?.trim() || "(none)"}
BOOK: ${input.bookTitle?.trim() || "(untitled)"} — country/setting: ${input.country?.trim() || "(not stated)"}
RECURRING SETTINGS OF THE BOOK (use these words for the "when" keywords): ${settings}
=== BOOK PASSAGES MENTIONING ${input.name.toUpperCase()} (garments worn, if cited) ===
${input.sourceText?.trim() || "(no passage available)"}`;

  try {
    const raw = await engine.run(prompt);
    const j = parseModelJson(raw) as Record<string, unknown>;
    const def =
      typeof j.default === "string" && j.default.trim() !== ""
        ? j.default.trim().slice(0, 200)
        : null;
    const contexts = Array.isArray(j.contexts)
      ? j.contexts
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            const when = typeof o.when === "string" ? o.when.trim() : "";
            const outfit = typeof o.outfit === "string" ? o.outfit.trim() : "";
            return { when: when.slice(0, 80), outfit: outfit.slice(0, 200) };
          })
          .filter((x) => x.when !== "" && x.outfit !== "")
          .slice(0, MAX_CTX)
      : [];
    if (!def && contexts.length === 0) return null;
    return { default: def, contexts };
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
