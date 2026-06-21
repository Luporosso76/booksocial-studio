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
}

const MAX_CTX = 5;

export async function generateOutfits(
  engine: ContentEngine,
  input: OutfitsInput,
): Promise<CharacterOutfits | null> {
  const settings =
    input.settings.length > 0 ? input.settings.slice(0, 24).join("; ") : "(non disponibili)";

  const prompt = `Definisci l'ABBIGLIAMENTO CANONICO di un personaggio per illustrazioni COERENTI: deve
vestire SEMPRE allo stesso modo nella stessa situazione. Dato il personaggio, scrivi un abito di DEFAULT
e alcuni abiti per CONTESTO legati alle ambientazioni ricorrenti del libro.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo:
{
  "default": "abito quotidiano tipico del personaggio (capi concreti + eventuali colori)",
  "contexts": [
    { "when": "2-5 parole chiave del CONTESTO (luoghi/attivita) separate da virgola, in ${input.language}", "outfit": "abbigliamento concreto e coerente per quel contesto" }
  ]
}

REGOLE:
- "default": come veste di norma il personaggio (capi concreti: es. "camicia azzurra, jeans scuri, sneakers");
  coerente con eta, ruolo e occupazione. Niente vaghezze tipo "abiti comodi".
- "contexts": da 0 a ${MAX_CTX} voci, SOLO per le situazioni ricorrenti in cui questo personaggio
  plausibilmente compare (scegli tra le AMBIENTAZIONI sotto). Ogni "when" sono poche KEYWORD che
  combaceranno col testo della scheda di capitolo (luogo/ambiente/oggetti), in ${input.language}
  (es. "spiaggia, mare, surf" oppure "meditazione, yoga, tappetino" oppure "ufficio, lavoro").
  Ogni "outfit" e' l'abbigliamento CONCRETO e adatto a quel contesto, descritto in modo specifico.
- Abiti realistici e coerenti col personaggio; niente divise/costumi a meno che il ruolo lo richieda
  davvero (no gi/arti marziali per scene di meditazione). Solo ABBIGLIAMENTO, niente aspetto fisico.
- LINGUA: scrivi i valori testuali del JSON (default, when, outfit) nella lingua del libro
  (${input.language}); anche se queste istruzioni sono in italiano, l'output deve essere in
  ${input.language}. Se non sai cosa mettere in un campo, usa "" o [].

PERSONAGGIO: ${input.name}
RUOLO: ${input.role?.trim() || "(non specificato)"}
OCCUPAZIONE: ${input.occupation?.trim() || "(non specificata)"}
ASPETTO (per coerenza, NON descriverlo negli abiti): ${input.physical?.trim() || "(nessuno)"}
LIBRO: ${input.bookTitle?.trim() || "(senza titolo)"}
AMBIENTAZIONI RICORRENTI DEL LIBRO: ${settings}`;

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
