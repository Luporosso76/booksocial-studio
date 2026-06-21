import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
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
  const cast = input.knownCast.length > 0 ? input.knownCast.join(", ") : "(nessuno noto)";
  const sceneKeywords = (input.sceneKeywords ?? "").trim() || "(non disponibili)";

  const prompt = `Sei un assistente che prepara SCHEDE VISIVE per generare illustrazioni coerenti. Dal
capitolo seguente individua le figure INCIDENTALI/MINORI che CONTANO visivamente e che NON sono nel cast
noto e NON sono pura folla di sfondo: cioè una persona SPECIFICA, spesso senza nome, che compare in una
scena e che si disegnerebbe davvero (es. una partner occasionale in una scena, una figura ricorrente
senza nome, un'operatrice/operatore che agisce nella scena). A ognuna di queste va dato un aspetto FISSO
così da renderla coerente ogni volta che la scena torna.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo:
{
  "minors": [
    { "label": "ruolo+contesto breve (es. 'compagna di Roberto (scena del bar)')", "when": "2-5 keyword in ${input.language} che combaciano con la scena di QUESTO capitolo", "appearance": "aspetto fisico FISSO e specifico: eta, corporatura, capelli colore+taglio, viso, carnagione", "outfit": "abbigliamento adatto al contesto, oppure "" " }
  ]
}

REGOLE:
- Da 0 a ${MAX_MINORS} voci. Includi SOLO figure incidentali che si DISEGNEREBBERO in una scena.
- ESCLUDI TASSATIVAMENTE: chiunque sia già nel CAST NOTO qui sotto; la pura folla/sfondo (una troupe,
  passanti, camerieri o comparse senza ruolo) — quella è gestita altrove con una regola di varietà.
- "appearance": INVENTANE uno plausibile, specifico e VARIO (eta, corporatura, capelli colore+taglio,
  viso, carnagione) — deve restare IDENTICO tra le immagini.
- "when": poche KEYWORD (in ${input.language}) che combaceranno con la scheda del capitolo
  (luogo/ambiente/oggetti); puoi RIUSARE le keyword della scena fornite qui sotto.
- "outfit": abbigliamento adatto al contesto, oppure "" se non rilevante.
- LINGUA: scrivi label/when/appearance/outfit nella lingua del libro (${input.language}); anche se queste
  istruzioni sono in italiano, l'output deve essere in ${input.language}. Concreto e visivo, niente trama.

CAST NOTO (da ESCLUDERE): ${cast}
KEYWORD DELLA SCENA (riusabili per "when"): ${sceneKeywords}
TITOLO CAPITOLO: ${input.chapterTitle?.trim() || "(nessuno)"}
=== TESTO DEL CAPITOLO ===
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
