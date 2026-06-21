import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";

// Estrae la SCHEDA VISIVA di un capitolo dal suo testo: ambiente/luogo, oggetti principali
// (soggetto iconico) e secondari, personaggi presenti. Serve a FONDARE il prompt immagine
// invece di farlo dedurre al modello dal grezzo del capitolo (vedi imagePrompt.ts).
// Best-effort: se il modello non risponde o l'output non è valido, ritorna null.

export interface ChapterSceneInput {
  chapterText: string;
  chapterTitle?: string | null;
  language: string; // lingua del libro: la scheda è scritta in questa lingua (user-facing + editabile)
  knownCharacters: string[]; // nomi del cast noti (dal pre-pass NLP/analisi) per il match
}

// Risultato grezzo dell'estrazione (senza i campi di persistenza source/model/updatedAt).
export interface ExtractedChapterScene {
  location: string | null;
  environment: string | null;
  mainObjects: string[];
  secondaryObjects: string[];
  characters: string[];
  // Vincoli CONCRETI di fisica/realismo per illustrare scene di questo capitolo (vedi prompt).
  physicsRules: string[];
}

// Soglia oltre la quale il capitolo viene letto a BLOCCHI (chunk) e poi unito: così l'estrazione
// è completa anche su capitoli MOLTO lunghi, dove un singolo passaggio perderebbe scene/personaggi
// della seconda metà. ~12k caratteri per blocco (pochi token per GPT-5.5), con un po' di overlap.
const CHUNK_CHARS = 12000;
const CHUNK_OVERLAP = 600;
const MAX_CHUNKS = 12; // tetto di sicurezza per capitoli enormi (12 × 12k = 144k char)

// Divide il testo in blocchi sequenziali con piccolo overlap (per non spezzare malamente una scena).
function splitIntoChunks(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length && chunks.length < MAX_CHUNKS) {
    const end = Math.min(text.length, start + CHUNK_CHARS);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

// Unisce le schede parziali dei blocchi in una sola. location/environment = unione dei valori
// DISTINTI dei blocchi (così i capitoli multi-scena elencano tutte le ambientazioni, non solo la
// prima); oggetti/personaggi = UNIONE deduplicata.
function mergeScenes(parts: ExtractedChapterScene[]): ExtractedChapterScene {
  const joinDistinct = (
    sel: (p: ExtractedChapterScene) => string | null,
    max: number,
  ): string | null => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parts) {
      const v = sel(p);
      if (!v) continue;
      // ogni blocco può già contenere più luoghi separati da virgola: splittali e dedup.
      for (const piece of v.split(/[,;]/)) {
        const t = piece.trim();
        const k = t.toLowerCase();
        if (t !== "" && !seen.has(k)) {
          seen.add(k);
          out.push(t);
        }
      }
    }
    return out.length === 0 ? null : out.slice(0, max).join(", ");
  };
  const union = (sel: (p: ExtractedChapterScene) => string[], max: number): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of parts) {
      for (const x of sel(p)) {
        const k = x.toLowerCase().trim();
        if (k && !seen.has(k)) {
          seen.add(k);
          out.push(x);
        }
      }
    }
    return out.slice(0, max);
  };
  return {
    location: joinDistinct((p) => p.location, 4),
    environment: joinDistinct((p) => p.environment, 3),
    mainObjects: union((p) => p.mainObjects, 8),
    secondaryObjects: union((p) => p.secondaryObjects, 8),
    characters: union((p) => p.characters, 40),
    // UNIONE dedup delle regole di fisica/realismo tra i blocchi (cap multi-scena).
    physicsRules: union((p) => p.physicsRules, 10),
  };
}

export async function extractChapterScene(
  engine: ContentEngine,
  input: ChapterSceneInput,
): Promise<ExtractedChapterScene | null> {
  const passage = (input.chapterText ?? "").trim();
  if (passage === "") return null;
  const chunks = splitIntoChunks(passage);
  // Estrazione SERIALE dei blocchi (l'engine è una risorsa singola): poi merge.
  const parts: ExtractedChapterScene[] = [];
  for (const chunk of chunks) {
    const part = await extractOnePass(engine, { ...input, chapterText: chunk });
    if (part) parts.push(part);
  }
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : mergeScenes(parts);
}

// Una singola estrazione su una porzione di testo (un blocco o l'intero capitolo se corto).
async function extractOnePass(
  engine: ContentEngine,
  input: ChapterSceneInput,
): Promise<ExtractedChapterScene | null> {
  const text = (input.chapterText ?? "").trim();
  if (text === "") return null;
  const cast =
    input.knownCharacters.length > 0 ? input.knownCharacters.join(", ") : "(nessuno noto)";

  const prompt = `Sei un assistente che prepara SCHEDE VISIVE di capitoli per generare illustrazioni.
Dal capitolo seguente estrai SOLO ciò che è VISIVO e CONCRETO (niente trama o spoiler), per aiutare a
disegnare immagini ambientate in quel capitolo.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, con questa forma:
{
  "location": "il LUOGO concreto del capitolo, breve; se la scena si SPOSTA, elenca i luoghi principali in ordine narrativo separati da virgola",
  "environment": "interno/esterno, ora del giorno, clima/atmosfera visiva; se cambia tra le scene, riassumi le principali",
  "main_objects": ["1-4 OGGETTI o SOGGETTI ICONICI e visivi FISICAMENTE PRESENTI nelle scene del capitolo (oggetti concreti, mezzi, animali, edifici o elementi naturali su cui si concentra la scena); vedi regola sotto"],
  "secondary_objects": ["piccoli oggetti di contorno FISICAMENTE PRESENTI nella scena"],
  "characters": ["SOLO i personaggi FISICAMENTE PRESENTI nelle scene di questo capitolo (vedi regola sotto)"],
  "physics_rules": ["3-8 vincoli CONCRETI di fisica/realismo per illustrare scene di QUESTO capitolo"]
}

REGOLE:
- "main_objects"/"secondary_objects": SOLO oggetti/soggetti FISICAMENTE PRESENTI e visibili nelle scene
  del capitolo, che si potrebbero davvero disegnare lì. ESCLUDI TASSATIVAMENTE gli oggetti soltanto
  NOMINATI, RICORDATI, IMMAGINATI, ATTESI o usati come METAFORA/modo di dire ma NON realmente presenti
  nella scena (es. un'attività citata in un ricordo — "un amico che faceva windsurf" — o un oggetto di
  cui si parla ma che in scena non c'è). Un oggetto NOMINATO nel testo NON basta: serve che sia lì, ora,
  nella scena illustrabile.
- "physics_rules": elenca da 3 a 8 vincoli CONCRETI e VISIVI di fisica/realismo per disegnare questo
  capitolo, calati nel SUO contesto: come si comportano gravità/appoggio, acqua/onde, vento/moto,
  luce/ombre nelle scene di QUESTO capitolo, e soprattutto cosa NON deve accadere (errori plausibili
  che il modello immagine commetterebbe qui). Esempi di FORMA (adattali al capitolo, non copiarli):
  "le persone in acqua sono immerse fino al busto, mai sedute sopra la superficie", "la barca poggia
  sull'acqua con la chiglia immersa, non galleggia sopra il pelo dell'acqua", "le ombre cadono tutte
  dalla stessa parte coerenti col sole basso". Concreti, visivi, niente trama. Se il capitolo non
  suggerisce vincoli particolari, dai comunque le regole di base pertinenti alla sua ambientazione.
- "characters": elenca SOLO i personaggi FISICAMENTE PRESENTI nelle scene del capitolo — chi
  EFFETTIVAMENTE compare sul posto, qui e ora, e che si potrebbe disegnare nella scena (è visibile,
  agisce, parla o viene percepito mentre è presente). Tra questi:
  (a) chi ha un NOME PROPRIO ED è presente nella scena;
  (b) le figure indicate in modo descrittivo SENZA nome SOLO SE corrispondono a un personaggio del CAST
      NOTO qui sotto (è l'elenco dei personaggi rilevanti del libro): fai il match anche quando il testo usa
      una descrizione e il cast usa un'etichetta diversa per lo stesso personaggio, e in tal caso usa il
      NOME del cast.
  FLASHBACK / RICORDI MOSTRATI: se il capitolo NARRA una SCENA del passato (un flashback, un ricordo
  raccontato come scena, un sogno mostrato) in cui un personaggio COMPARE e AGISCE — lo si potrebbe
  disegnare DENTRO quella scena — allora quel personaggio È PRESENTE: INCLUDILO.
  ESCLUDI invece chi è soltanto NOMINATO, EVOCATO, ATTESO o di cui si PARLA o si PENSA SENZA una scena
  che lo mostri (es. una persona citata in un dialogo o in un pensiero, qualcuno assente o lontano di
  cui ci si limita a parlare). Un NOME nel testo NON basta: serve la presenza in una scena — anche
  passata o ricordata, purché EFFETTIVAMENTE MOSTRATA. ESCLUDI anche le comparse incidentali prive di nome e NON nel cast (un autista,
  un cameriere, un commesso, un passante, uno sconosciuto di passaggio), anche se parlano, litigano o
  aiutano in una singola scena. Il personaggio dal cui PUNTO DI VISTA è raccontato il capitolo —
  incluso il NARRATORE in prima persona ("io") — È presente nelle scene a cui partecipa: includilo
  SEMPRE se identificabile, usando il suo NOME dal cast. Ma se in QUESTO capitolo non compare in scena
  (es. capitolo dal POV di un altro, prologo, scena in cui non c'è), NON includerlo.
- Concreto e visivo: niente emozioni astratte, niente eventi/trama, niente spoiler. Solo cosa si VEDE.
- Se un campo non è determinabile, usa "" (stringa vuota) o [] (lista vuota). Niente invenzioni.
- LINGUA: scrivi TUTTI i valori testuali del JSON nella lingua del libro (${input.language}); anche se
  queste istruzioni sono in italiano, l'output deve essere in ${input.language}.

PERSONAGGI NOTI (per il match): ${cast}
TITOLO CAPITOLO: ${input.chapterTitle?.trim() || "(nessuno)"}
=== TESTO DEL CAPITOLO ===
${text}`;

  try {
    const raw = await engine.run(prompt);
    const j = parseModelJson(raw) as Record<string, unknown>;
    const strArr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .map((x) => String(x).trim())
            .filter((x) => x.length > 0 && x.length <= 120)
            .slice(0, 8)
        : [];
    // Le regole di fisica sono FRASI: cap di lunghezza più generoso e fino a 8 per blocco.
    const ruleArr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .map((x) => String(x).trim())
            .filter((x) => x.length > 0 && x.length <= 240)
            .slice(0, 8)
        : [];
    const str = (v: unknown): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === "" ? null : s.slice(0, 200);
    };
    return {
      location: str(j.location),
      environment: str(j.environment),
      mainObjects: strArr(j.main_objects),
      secondaryObjects: strArr(j.secondary_objects),
      characters: strArr(j.characters),
      physicsRules: ruleArr(j.physics_rules),
    };
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
