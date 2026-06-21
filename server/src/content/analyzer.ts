import type { ContentEngine } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import { CURRENT_PROMPT_VERSION } from "../domain.js";

// One-time book analysis -> compact BookProfile (scheda). This is the only point
// where the model sees the full text; every later generation uses only the scheda.
// The prompt is carefully tuned: analysis quality depends on it.

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
): Promise<AnalyzedProfile> {
  const prompt = buildPrompt(book, fullText, seedCharacters);
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
): string {
  const author = book.author == null ? "(non indicato)" : book.author;
  const seedBlock =
    seedCharacters.length > 0
      ? `\nPERSONAGGI RILEVATI (nomi reali, da profilare; aggiungi eventuali mancanti): ${seedCharacters.join(", ")}\n`
      : "";
  return `Sei un analista editoriale. Analizza il libro seguente e produci una SCHEDA strutturata
che servira' a generare post social di marketing, SENZA dover rileggere il libro ogni volta.
${seedBlock}

REGOLA CRITICA SUGLI SPOILER: la scheda alimentera' post pubblici. Devi separare con
attenzione cio' che e' SICURO mostrare ai potenziali lettori (premessa, atmosfera, temi,
situazione iniziale dei personaggi, ganci) da cio' che NON va MAI rivelato (finale,
colpi di scena, rivelazioni, morti, identita' segrete, esiti dei conflitti). Popola
"spoiler_policy.do_not_reveal" con questi elementi sensibili in modo esplicito.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, con questa forma:
{
  "title": "...",
  "synopsis_short": "1-2 frasi, da quarta di copertina, SENZA spoiler",
  "synopsis_long": "1 paragrafo, SENZA spoiler",
  "genres": "generi separati da virgola",
  "tone": "tono e voce narrativa",
  "target_audience": "lettore ideale",
  "themes": ["tema/argomento principale 1", "tema 2"],
  "main_topics": ["argomento trattato 1", "argomento 2"],
  "conflicts": [{"type": "interiore/interpersonale/sociale/...", "description": "il conflitto SENZA rivelarne l'esito"}],
  "central_question": "la domanda drammatica centrale (senza risposta/spoiler)",
  "characters": [{"name": "...", "role": "protagonista/antagonista/...", "occupation": "lavoro o ruolo sociale (anche intuito)", "physical_description": "aspetto fisico, anche se INTUITO dal testo: eta' approssimativa, corporatura, capelli, tratti distintivi", "traits": "carattere e comportamento", "starting_situation": "situazione iniziale senza spoiler"}],
  "setting": "ambientazione e periodo",
  "key_quotes": [{"quote": "...", "context": "perche' e' notevole", "is_spoiler": false}],
  "marketing_hooks": ["gancio di vendita SENZA spoiler 1", "gancio 2"],
  "content_angles": ["spunto per un post SENZA spoiler 1", "spunto 2", "spunto 3"],
  "spoiler_policy": {
    "safe_to_share": ["elemento sicuro 1", "elemento 2"],
    "do_not_reveal": ["colpo di scena/finale/rivelazione da NON pubblicare mai 1", "elemento 2"]
  }
}

LINGUA: scrivi TUTTI i valori testuali del JSON nella lingua del libro: ${book.language}. Anche se queste
istruzioni sono in italiano, l'output (sinossi, generi, tono, temi, descrizioni, ecc.) deve essere in ${book.language}.
Le chiavi del JSON restano in inglese come indicato. Sii concreto e specifico, niente frasi promozionali vuote.
Le citazioni con "is_spoiler": true non saranno mai usate nei post.

Titolo dichiarato: ${book.title}
Autore: ${author}

=== TESTO DEL LIBRO ===
${fullText}`;
}

function text(j: Record<string, unknown>, field: string): string | null {
  const v = j[field];
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
}
