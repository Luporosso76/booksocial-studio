import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import { languageName } from "./language.js";
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
  presentAge?: string | null;
  bookTitle?: string | null;
  language: string;
  // Ambientazioni/contesti ricorrenti del libro (da luoghi+ambienti delle schede capitolo): aiutano
  // a creare abiti per le scene reali e a scegliere keyword `when` che combaceranno con le schede.
  settings: string[];
  flashbackSettings?: string[];
  dreamSettings?: string[];
  // GROUNDING: passaggi reali del libro che nominano il personaggio (per cogliere i capi che il libro
  // gli fa indossare in certe scene). Opzionale.
  sourceText?: string | null;
  // Paese del libro → coerenza di clima/cultura del vestiario quando il testo non specifica. Opzionale.
  country?: string | null;
  // DIRETTIVE VISIVE del libro (autoriali): possono prescrivere come ci si veste in attività/scene
  // specifiche (es. pratica spirituale/yoga/meditazione, cerimonia, sport). Se presenti, sono
  // AUTORITATIVE e devono diventare un contesto outfit dedicato. Opzionale.
  directives?: string | null;
  avoidColors?: string[];
}

const COLOR_FAMILIES: Record<string, string[]> = {
  blu: ["blu", "blue", "azzurr", "celest", "navy", "bleu", "azul", "blau", "cobalto", "indaco", "denim"],
  rosso: ["ross", "red", "rouge", "rojo", "rot", "scarlatt", "cremisi", "bordeaux", "granata", "vermigli"],
  verde: ["verde", "green", "vert", "grün", "grun", "oliva", "salvia", "smeraldo", "menta", "kaki", "khaki"],
  giallo: ["giall", "yellow", "jaune", "amarill", "gelb", "senape", "ocra", "oro", "dorat", "gold", "ambra"],
  arancione: ["arancio", "orange", "naranja", "terracotta", "ruggine", "rust", "corallo", "coral", "zucca"],
  viola: ["viola", "purple", "violet", "morad", "lila", "lavand", "prugna", "melanzana", "malva", "glicine"],
  rosa: ["rosa", "pink", "rose", "fucsia", "fuchsia", "magenta", "cipria", "salmone", "salmon", "pesca"],
  marrone: ["marron", "brown", "brun", "marrón", "braun", "cammell", "camel", "cioccolat", "tabacco", "sabbia", "beige", "cuoio", "nocciola"],
  grigio: ["grigi", "grey", "gray", "gris", "grau", "antracit", "fumo", "argent", "silver", "piombo"],
  nero: ["ner", "black", "noir", "negro", "schwarz", "ebano", "carbone"],
  bianco: ["bianc", "white", "blanc", "blanco", "weiß", "weiss", "avori", "ivory", "crema", "cream", "panna", "latte"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stemMatchesWord(hay: string, stem: string): boolean {
  return new RegExp(`(^|[^\\p{L}])${escapeRegExp(stem)}`, "u").test(hay);
}

export function extractOutfitColors(o: CharacterOutfits | null | undefined): string[] {
  if (!o) return [];
  const hay = [o.default ?? "", o.signature ?? "", ...(o.contexts ?? []).map((c) => c.outfit ?? "")]
    .join(" ")
    .toLowerCase();
  const found: string[] = [];
  for (const [family, syn] of Object.entries(COLOR_FAMILIES)) {
    if (syn.some((s) => stemMatchesWord(hay, s))) found.push(family);
  }
  return found;
}

const MAX_CTX = 8;

export async function generateOutfits(
  engine: ContentEngine,
  input: OutfitsInput,
): Promise<CharacterOutfits | null> {
  const settings =
    input.settings.length > 0 ? input.settings.slice(0, 24).join("; ") : "(not available)";
  const language = languageName(input.language);
  const presentAge = input.presentAge?.trim() ?? "";
  const flashbackSettings = (input.flashbackSettings ?? [])
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .slice(0, 12)
    .join("; ");
  const dreamSettings = (input.dreamSettings ?? [])
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .slice(0, 12)
    .join("; ");
  const flashbackRule =
    flashbackSettings === ""
      ? ""
      : `\n- FLASHBACK / MEMORY OUTFITS (DEDICATED, MANDATORY): this character appears in one or more MEMORY/PAST (flashback) scenes set in: ${flashbackSettings}. You MUST add to "contexts" one or more DEDICATED entries for these. For each: "when" = the SETTING words of that memory PLUS the words for "flashback, memory, past" written in ${language}; "outfit" = clothing coherent with THAT era/memory — a YOUNGER version of the character wearing the garments of that time/place — NOT today's clothes. For these flashback/memory entries ONLY, you MUST ALSO fill: "age" = the character's APPARENT age IN that memory, ABSOLUTE (not a difference/delta) and grounded in that memory's text (e.g. "circa 25", "adolescente ~16"). HARD CONSTRAINT: a memory happens in the PAST, so this age MUST be STRICTLY LOWER than the character's PRESENT AGE (${presentAge || "unknown"}) — never equal, never higher; estimate how many years back the memory is and subtract from the present age; "appearance" = the VISIBLE differences of the past self vs the canonical present look (e.g. "viso più giovane, guance più piene, niente capelli grigi, pelle più liscia, meno rughe"), acting on FACE / SKIN / amount-of-greying only — NEVER change the HAIR COLOUR stated for the character. Never leave a flashback dressed in the present-day default; this fixes the memory outfit + past self so they stay consistent across renders.`;
  const dreamRule =
    dreamSettings === ""
      ? ""
      : `\n- DREAM OUTFITS (DEDICATED): this character appears in one or more DREAM scenes set in: ${dreamSettings}. Add to "contexts" one or more DEDICATED entries for these. For each: "when" = the SETTING words of that dream PLUS the word for "dream" written in ${language}; "outfit" = the concrete clothing of that dreamlike scene. For these dream entries ONLY, you MUST ALSO fill: "age" = the character's APPARENT age IN that dream, ABSOLUTE and grounded in that dream's text (e.g. "circa 30"); anchor it to the PRESENT AGE (${presentAge || "unknown"}) — usually LOWER OR EQUAL to it, and only higher if the dream's text clearly shows an older/future self; "appearance" = the VISIBLE differences of the dream self vs the canonical present look (face / skin / amount-of-greying only), NEVER changing the HAIR COLOUR stated for the character. This keeps the dream look + dream self consistent across renders.`;

  const prompt = `Define a character's CANONICAL WARDROBE for CONSISTENT illustrations: the character must
ALWAYS dress the same way in the same situation. Given the character, write a DEFAULT outfit plus a few
CONTEXT outfits tied to the book's recurring settings.

Reply with ONLY a valid JSON object, no text before or after:
{
  "default": "the character's typical everyday outfit (concrete garments + colors)",
  "contexts": [
    { "when": "2-5 CONTEXT keywords (places/activities) separated by commas, written in ${language}", "outfit": "concrete, coherent clothing for that context", "age": "ONLY for flashback/memory or dream contexts: the character's ABSOLUTE apparent age in that scene (e.g. \\"circa 25\\"); omit or null otherwise", "appearance": "ONLY for flashback/memory or dream contexts: visible past/dream-self differences vs the present look (face/skin/greying only, never recolour hair); omit or null otherwise" }
  ],
  "signature": "a SINGLE item the book says this character ALWAYS wears (a straw hat, particular glasses, a signature cap, a specific necklace), or \\"\\" if the book gives none"
}

RULES:
- "signature" (SIGNATURE ITEM): the single distinctive accessory/garment the book ties to THIS character as a
  recognisable trademark. Fill it in BOTH these cases, as long as it is in the BOOK PASSAGES (never invented):
  (a) the book says it is worn PERMANENTLY / ALWAYS ("always wore a straw hat", "never took off his round glasses");
  (b) the book introduces it as HIS/HER characteristic item via a possessive or a defining description, even
      WITHOUT the word "always" — e.g. "his Crocodile-Dundee-style hat", "the man with the round glasses",
      "her red scarf". IMPORTANT: such a phrase often does NOT repeat the character's name — it uses a pronoun
      or "the man/the woman". When a BOOK PASSAGE about THIS character describes "he/she/the man/the woman" (or
      "his/her") wearing a specific, distinctive item, ATTRIBUTE it to this character and use it as the signature.
  It is a permanent identity marker added to EVERY outfit in every scene, so it must be a single concrete
  accessory/garment, NOT a full outfit. If the passages give no such distinctive item, leave it "". Do NOT
  invent one. Do NOT duplicate it inside "default"/"contexts".
- BOOK ART DIRECTION IS AUTHORITATIVE: if the "BOOK ART DIRECTION" below states how a character dresses for
  a specific activity or scene type (e.g. spiritual practice / yoga / meditation / reiki, ceremony, sport,
  work), you MUST add a DEDICATED context for it: its "when" keywords name that activity (prefer words from
  the SETTINGS vocabulary so they match the scene cards, e.g. "meditazione, yoga, reiki, tappetino") and its
  "outfit" is EXACTLY the clothing the direction describes. This OVERRIDES the "MODERN, NOT AGING" default
  below for that context. Never leave such an activity dressed in the generic everyday outfit.
- FAITHFUL TO THE BOOK: capture EVERY garment, color or accessory the "BOOK PASSAGES" below attribute to the
  character (skipping none), RESPECT each and put it in the right context; do NOT invent against the text.
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
  the chapter scene cards), written in ${language} (e.g. "beach, sea, surf" or "meditation, yoga, mat"
  or "office, work"). Each "outfit" is the CONCRETE clothing suited to that context, coherent with its climate.${flashbackRule}${dreamRule}
- CAST COLOUR DISTINCTION: these dominant colour families are ALREADY used by OTHER characters of this
  book: ${(input.avoidColors ?? []).length > 0 ? (input.avoidColors ?? []).join(", ") : "(none yet)"}. Give
  THIS character a DIFFERENT dominant colour identity — do NOT build this character's DEFAULT outfit and
  SIGNATURE piece around those already-taken colour families; pick a distinct family so the cast doesn't
  collapse onto one hue (e.g. not everyone in blue). EXCEPTION: if the BOOK PASSAGES explicitly assign a
  colour to a garment of THIS character, always keep it even if it collides.
- Realistic outfits, consistent with the character; no uniforms/costumes unless the role truly requires it
  (no gi/martial-arts outfit for a meditation scene). CLOTHING ONLY, no physical appearance.
- LANGUAGE: write ALL string values (default, when, outfit, signature) in ${language}. Even though these
  instructions are in English, the values MUST be in ${language}. If you don't know what to put in a field,
  use "" or [].

CHARACTER: ${input.name}
ROLE: ${input.role?.trim() || "(unspecified)"}
OCCUPATION: ${input.occupation?.trim() || "(unspecified)"}
APPEARANCE (for consistency, do NOT describe it in the outfits): ${input.physical?.trim() || "(none)"}
PRESENT AGE (canonical, today — anchor for any flashback/dream age; a memory MUST be younger than this): ${presentAge || "(unspecified)"}
BOOK: ${input.bookTitle?.trim() || "(untitled)"} — country/setting: ${input.country?.trim() || "(not stated)"}
RECURRING SETTINGS OF THE BOOK (use these words for the "when" keywords): ${settings}
FLASHBACK/MEMORY SETTINGS where this character appears (need a dedicated past-era outfit): ${flashbackSettings || "(none)"}
DREAM SETTINGS where this character appears (need a dedicated dream outfit): ${dreamSettings || "(none)"}
=== BOOK ART DIRECTION (authoritative on clothing for specific activities/scenes) ===
${input.directives?.trim() || "(none)"}
=== BOOK PASSAGES MENTIONING ${input.name.toUpperCase()} (garments worn, if cited) ===
${input.sourceText?.trim() || "(no passage available)"}`;

  try {
    const raw = await engine.run(prompt);
    const j = parseModelJson(raw) as Record<string, unknown>;
    const def =
      typeof j.default === "string" && j.default.trim() !== ""
        ? j.default.trim().slice(0, 200)
        : null;
    const signature =
      typeof j.signature === "string" && j.signature.trim() !== ""
        ? j.signature.trim().slice(0, 120)
        : null;
    const contexts = Array.isArray(j.contexts)
      ? j.contexts
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            const when = typeof o.when === "string" ? o.when.trim() : "";
            const outfit = typeof o.outfit === "string" ? o.outfit.trim() : "";
            const age = typeof o.age === "string" && o.age.trim() !== "" ? o.age.trim().slice(0, 60) : null;
            const appearance =
              typeof o.appearance === "string" && o.appearance.trim() !== ""
                ? o.appearance.trim().slice(0, 300)
                : null;
            return { when: when.slice(0, 80), outfit: outfit.slice(0, 200), age, appearance };
          })
          .filter((x) => x.when !== "" && x.outfit !== "")
          .slice(0, MAX_CTX)
      : [];
    if (!def && contexts.length === 0 && !signature) return null;
    return { default: def, contexts, signature };
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
