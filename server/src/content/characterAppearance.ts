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
}

const MAX_LEN = 320;

export async function generateAppearance(
  engine: ContentEngine,
  input: AppearanceInput,
): Promise<string | null> {
  const prompt = `Sei un direttore visivo che definisce l'ASPETTO FISICO CANONICO di un personaggio, da usare
IDENTICO in TUTTE le illustrazioni del libro (per garantire coerenza tra le immagini). Dato il personaggio e
le informazioni disponibili, scrivi UNA descrizione fisica PRECISA, COMPLETA e STABILE.

REGOLE:
- SOLO aspetto fisico: età apparente, corporatura (e peso indicativo), altezza, capelli (COLORE + taglio/
  lunghezza), occhi (colore), viso e lineamenti, carnagione, ed eventuali tratti distintivi permanenti
  (barba/baffi, occhiali, nei, cicatrici, tatuaggi). Scegli valori SPECIFICI e definiti, mai vaghi.
- RISPETTA le informazioni fisiche già date (non contraddirle); COMPLETA i dettagli MANCANTI in modo
  plausibile e coerente col personaggio e con l'ambientazione, fissandoli una volta per tutte.
- NIENTE vestiti o abbigliamento (li gestiamo separatamente). NIENTE personalità, ruolo, biografia,
  emozioni o azioni. Solo come APPARE fisicamente.
- Concisa: una frase o poche, massimo ~280 caratteri. LINGUA: scrivi la descrizione nella lingua del
  libro (${input.language}); anche se queste istruzioni sono in italiano, l'output deve essere in
  ${input.language}. Nessun preambolo, nessuna virgoletta: SOLO la descrizione.

PERSONAGGIO: ${input.name}
RUOLO: ${input.role?.trim() || "(non specificato)"}
OCCUPAZIONE: ${input.occupation?.trim() || "(non specificata)"}
INFORMAZIONI FISICHE ESISTENTI: ${input.physical?.trim() || "(nessuna)"}
NOTE: ${input.notes?.trim() || "(nessuna)"}
LIBRO: ${input.bookTitle?.trim() || "(senza titolo)"}`;

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
