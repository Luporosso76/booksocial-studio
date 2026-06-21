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
    input.settings.length > 0 ? input.settings.slice(0, 24).join("; ") : "(non disponibili)";
  const objects =
    input.objects.length > 0 ? input.objects.slice(0, 60).join("; ") : "(non disponibili)";
  const cast = input.characters.length > 0 ? input.characters.join(", ") : "(nessuno)";

  const prompt = `Definisci il CANONE VISIVO degli OGGETTI ricorrenti di un libro e i fatti del MONDO, per
illustrazioni COERENTI: gli oggetti importanti devono essere resi SEMPRE uguali.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo:
{
  "country": "paese principale dell'ambientazione (o "" se non chiaro)",
  "driving_side": "right" oppure "left" (lato di guida di quel paese; "" se non determinabile)",
  "props": [
    { "name": "etichetta breve dell'oggetto (es. 'auto di Roberto')", "when": "2-5 keyword del contesto in cui appare, separate da virgola, in ${input.language}", "description": "aspetto CANONICO FISSO e concreto da rendere sempre uguale", "owner": "nome del personaggio proprietario, oppure "" " }
  ]
}

REGOLE:
- "props": da 0 a ${MAX_PROPS} OGGETTI o VEICOLI concreti, IMPORTANTI e RICORRENTI, che devono restare
  IDENTICI tra le immagini (tipicamente: l'AUTO di un personaggio → modello/colore SPECIFICO; un oggetto
  distintivo che torna più volte). Per i veicoli indica marca+modello+colore se deducibili dal testo,
  altrimenti scegli un modello plausibile e FISSALO. NON includere scenografia generica (tavoli, sedie),
  né la "porta rossa" simbolica (è già gestita altrove).
- "when": poche KEYWORD (in ${input.language}) che combaceranno col testo della scheda di capitolo
  (luogo/ambiente/oggetti), es. "auto, macchina, strada, guida".
- "owner": il personaggio a cui l'oggetto appartiene (scegli tra il CAST), se applicabile; altrimenti "".
- "driving_side": deducilo dal paese (la maggior parte guida a destra; Regno Unito/Irlanda/Giappone/
  Australia ecc. a sinistra). Se l'ambientazione è ambigua, usa "".
- LINGUA: scrivi name/description/when nella lingua del libro (${input.language}); anche se queste
  istruzioni sono in italiano, l'output deve essere in ${input.language}. Concreto e visivo, niente trama.

LIBRO: ${input.bookTitle?.trim() || "(senza titolo)"}
CAST: ${cast}
AMBIENTAZIONI RICORRENTI: ${settings}
OGGETTI VISTI NELLE SCHEDE: ${objects}`;

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
