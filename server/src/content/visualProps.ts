import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import type { BookVisualProps, DrivingSide } from "../domain.js";

// Genera il CANONE degli OGGETTI/VEICOLI ricorrenti del libro (aspetto fisso da rendere sempre uguale,
// es. l'auto di un personaggio = modello specifico) + i fatti del MONDO (paese, lato di guida).
// Best-effort: ritorna null se il motore fallisce.

export interface VisualPropsInput {
  bookTitle?: string | null;
  language: string;
  settings: string[]; // luoghi/ambienti distinti dalle schede (contesto)
  objects: string[]; // oggetti principali distinti dalle schede (per individuare ricorrenze)
  characters: string[]; // nomi del cast (per legare un oggetto a un proprietario)
}

const MAX_PROPS = 10;

export async function generateVisualProps(
  engine: ContentEngine,
  input: VisualPropsInput,
): Promise<BookVisualProps | null> {
  const settings =
    input.settings.length > 0 ? input.settings.slice(0, 24).join("; ") : "(not available)";
  const objects =
    input.objects.length > 0 ? input.objects.slice(0, 60).join("; ") : "(not available)";
  const cast = input.characters.length > 0 ? input.characters.join(", ") : "(none)";

  const prompt = `Define the VISUAL CANON of the recurring OBJECTS in a book and the WORLD FACTS, for
CONSISTENT illustrations: important objects must always be rendered the same way.

Reply EXCLUSIVELY with a valid JSON object, no text before or after:
{
  "country": "main country of the setting (or "" if unclear)",
  "driving_side": "right" or "left" (driving side for that country; "" if not determinable)",
  "props": [
    { "name": "short label for the object (e.g. 'Roberto's car')", "when": "2-5 context keywords where it appears, comma-separated, in ${input.language}", "description": "FIXED CANONICAL concrete appearance to always render the same way", "owner": "name of the character who owns it, or "" " }
  ]
}

RULES:
- "props": 0 to ${MAX_PROPS} concrete, IMPORTANT and RECURRING OBJECTS or VEHICLES that must stay
  IDENTICAL across images (typically: a character's CAR → specific make/model/color; a distinctive
  object that recurs). For vehicles, state make+model+color if deducible from the text, otherwise
  choose a plausible model and FIX it. Do NOT include generic scenery (tables, chairs), nor the
  symbolic "red door" (handled elsewhere).
- "when": a few KEYWORDS (in ${input.language}) that will match the chapter card text
  (location/setting/objects), e.g. "car, road, driving".
- "owner": the character the object belongs to (choose from the CAST), if applicable; otherwise "".
- "driving_side": deduce from the country (most countries drive on the right; UK/Ireland/Japan/
  Australia etc. on the left). If the setting is ambiguous, use "".
- Write name/description/when in ${input.language}. Concrete and visual, no plot details.

BOOK: ${input.bookTitle?.trim() || "(untitled)"}
CAST: ${cast}
RECURRING SETTINGS: ${settings}
OBJECTS SEEN IN THE CARDS: ${objects}`;

  try {
    const raw = await engine.run(prompt);
    const j = parseModelJson(raw) as Record<string, unknown>;
    const country =
      typeof j.country === "string" && j.country.trim() !== ""
        ? j.country.trim().slice(0, 80)
        : null;
    const ds = typeof j.driving_side === "string" ? j.driving_side.trim().toLowerCase() : "";
    const drivingSide: DrivingSide | null = ds === "left" || ds === "right" ? ds : null;
    const props = Array.isArray(j.props)
      ? j.props
          .map((p) => {
            const o = (p ?? {}) as Record<string, unknown>;
            return {
              name: typeof o.name === "string" ? o.name.trim().slice(0, 80) : "",
              when: typeof o.when === "string" ? o.when.trim().slice(0, 80) : "",
              description:
                typeof o.description === "string" ? o.description.trim().slice(0, 220) : "",
              owner:
                typeof o.owner === "string" && o.owner.trim() !== ""
                  ? o.owner.trim().slice(0, 80)
                  : null,
            };
          })
          .filter((p) => p.name !== "" && p.description !== "")
          .slice(0, MAX_PROPS)
      : [];
    if (props.length === 0 && !drivingSide && !country) return null;
    return { props, drivingSide, country };
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
