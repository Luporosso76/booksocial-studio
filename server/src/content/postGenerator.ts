import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import type { BookProfile, MediaType } from "../domain.js";
import { MEDIA_TYPES } from "../domain.js";

// Generates one post from the compact book scheda (not the whole book), the
// requested angle, and recent posts (to avoid repetition). Prompt ported almost
// verbatim from Java PostGenerator: ABSOLUTE ANTI-SPOILER RULE, hashtag base+specific.

// Personaggi (concisi) da iniettare nel prompt: nome — ruolo/lavoro — carattere — aspetto.
export interface CharacterBrief {
  name: string;
  role: string | null;
  occupation: string | null;
  personality: string | null;
  physical: string | null;
}

export interface GenerateRequest {
  profile: BookProfile;
  pageName: string;
  angle: string;
  mediaType: MediaType;
  recentMessages: string[];
  chapterExcerpt: string | null;
  characters: CharacterBrief[];
  language: string;
}

export interface GeneratedPost {
  message: string;
  hashtags: string; // final (base + specific), ready to publish
  baseHashtags: string; // always included (configured on the book)
  specificHashtags: string; // generated for this post
  mediaType: MediaType;
  rationale: string | null;
  // Indice del capitolo da cui è stata estratta l'idea, o null.
  // Lo valorizza ContentService, che conosce il capitolo scelto.
  sourceChapterIndex?: number | null;
}

export async function generatePost(
  engine: ContentEngine,
  req: GenerateRequest,
): Promise<GeneratedPost> {
  const prompt = buildPrompt(req);
  const response = await engine.run(prompt);
  const j = parseModelJson(response) as Record<string, unknown>;

  let media = req.mediaType;
  const mt = j["media_type"];
  if (typeof mt === "string") {
    const upper = mt.toUpperCase() as MediaType;
    if (MEDIA_TYPES.includes(upper)) {
      media = upper;
    }
  }
  const specific = text(j, "hashtags") ?? "";
  return {
    message: textRequired(j, "message"),
    hashtags: specific, // final = specific until ContentService adds the base
    baseHashtags: "",
    specificHashtags: specific,
    mediaType: media,
    rationale: text(j, "rationale"),
  };
}

function buildPrompt(req: GenerateRequest): string {
  // Se abbiamo il testo reale di un capitolo, usa il prompt "capitolo": trova UNA idea viva
  // del capitolo e la rende umana. La logica delle ex-skill OpenCode (idea-extractor + tagore)
  // e' INCORPORATA nel prompt, quindi funziona con QUALSIASI modello (openai/anthropic/google/
  // ollama/opencode) senza skill installate sul sistema. Senza capitolo, ricade sulla sola scheda.
  const hasChapter =
    !!req.chapterExcerpt &&
    req.chapterExcerpt.trim() !== "" &&
    req.chapterExcerpt.trim() !== "(non fornito)";
  return hasChapter ? buildChapterPrompt(req) : buildSchedaPrompt(req);
}

// Prompt "capitolo": pipeline incorporata (ex-skill idea-extractor + tagore) — trova la singola
// idea viva del capitolo e la umanizza, tutto INLINE nel prompt (provider-agnostico). Output =
// lo stesso JSON del flusso scheda, cosi' il resto della pipeline (merge hashtag, salvataggio) non cambia.
function buildChapterPrompt(req: GenerateRequest): string {
  const p = req.profile;
  const recent =
    req.recentMessages.length === 0
      ? "(nessun post precedente)"
      : req.recentMessages.join("\n---\n");
  const language = req.language || "italiano";
  const characters = renderCharacters(req.characters);

  return `Sei un lettore appassionato che cura la pagina Facebook "${req.pageName}" e parli del libro ad altri lettori. Scrivi come una persona vera, NON come un'agenzia di marketing.

PROCEDIMENTO (due passi, da fare INTERNAMENTE — mostra SOLO il post finale nel JSON):

1. TROVA L'IDEA dal CAPITOLO qui sotto. Cerca la "live wire": UNA singola idea, scena, immagine, frase, contraddizione, scelta, costo o domanda che farebbe fermare un lettore — interessante anche per chi NON ha letto il libro. NON un riassunto del capitolo. Considera mentalmente 2-3 idee candidate e scegli la piu' forte in base a: rilevanza per il lettore, concretezza (un momento / una frase / un'immagine reali), tensione, valore autonomo (regge senza spiegare tutto il capitolo), coerenza con la voce del libro, sicurezza anti-spoiler. NON mostrare le candidate, i punteggi o l'analisi.

2. SCRIVI il post umanizzando quell'idea. Evita il "sapore IA" (cruciale, altrimenti si capisce che e' scritto da una macchina): niente significato gonfiato, niente parole-IA ("viaggio", "tessuto/arazzo", "testimonianza", "nel mondo di oggi", "immergiti/lasciati trasportare", "un'opera che", "non e' solo... e' anche..."), niente triplette di aggettivi, niente superlativi pubblicitari ("imperdibile", "straordinario", "capolavoro"), niente trattini lunghi (—) a raffica, al massimo una emoji e solo se serve. Concreto e specifico batte dieci aggettivi. Apri con qualcosa di vero (un'immagine, una frase del libro, una domanda secca), mai con frasi fatte o aperture meta ("In questo capitolo", "Questo post"). Alterna frasi corte e lunghe, tieni UNA sola linea emotiva, chiudi con una riga che apre un pensiero (non una CTA generica). Mostra, non promettere emozioni.

REGOLA ASSOLUTA - NIENTE SPOILER: non rivelare MAI finale, colpi di scena, morti, identita' segrete o esiti dei conflitti. Usa solo materiale sicuro. Gli elementi elencati in "spoiler_policy.do_not_reveal" della scheda NON devono comparire ne' essere allusi. Nel dubbio, taci il dettaglio.

VINCOLI:
- LINGUA: scrivi TUTTO l'output (message, rationale) nella lingua del libro: ${language}. Anche se queste istruzioni sono in italiano, la RISPOSTA deve essere in ${language}, con tono coerente col libro.
- Puoi citare tra « » BREVI passaggi reali e non-spoiler presi dal capitolo.
- Lunghezza adatta a Facebook (3-6 righe brevi).
- Inizia con qualcosa di vero (un'immagine, una frase del libro, una domanda secca), mai con frasi fatte.
- NON ripetere i post recenti elencati sotto. Se l'ANGOLO qui sotto e' indicato, lascia che orienti QUALE idea scegliere (cosi' post diversi pescano idee diverse).
- 5-10 hashtag pertinenti e specifici (niente generici tipo #libro #lettura #book).

Rispondi ESCLUSIVAMENTE con JSON valido, nient'altro prima o dopo:
{
  "message": "testo del post senza hashtag",
  "hashtags": "#tag1 #tag2 ...",
  "media_type": "${req.mediaType}",
  "rationale": "1 frase: quale idea del capitolo hai scelto e perche'"
}

=== SCHEDA LIBRO (contesto e nomi reali; la FONTE dell'idea resta il CAPITOLO) ===
Sinossi: ${nz(p.synopsisShort)}
Generi: ${nz(p.genres)}
Tono: ${nz(p.tone)}
Spoiler policy / dettagli (JSON): ${nz(p.analysisJson)}

=== PERSONAGGI (usa SOLO questi nomi reali) ===
${characters}

=== ANGOLO RICHIESTO (orienta la scelta dell'idea) ===
${nz(req.angle)}

=== CAPITOLO (FONTE: estrai da qui la singola idea, cita solo passaggi non-spoiler) ===
${req.chapterExcerpt}

=== POST RECENTI (non ripeterli) ===
${recent}`;
}

function buildSchedaPrompt(req: GenerateRequest): string {
  const p = req.profile;
  const recent =
    req.recentMessages.length === 0
      ? "(nessun post precedente)"
      : req.recentMessages.join("\n---\n");
  const excerpt =
    !req.chapterExcerpt || req.chapterExcerpt.trim() === "" ? "(non fornito)" : req.chapterExcerpt;
  const language = req.language || "italiano";
  const characters = renderCharacters(req.characters);

  return `Sei un lettore appassionato che cura la pagina Facebook "${req.pageName}" e parla del libro qui sotto ad altri lettori. Scrivi come una persona vera, NON come un'agenzia di marketing.

Obiettivo: far venire voglia di leggere il libro e accendere una conversazione vera (commenti, condivisioni). Niente click-bait.

REGOLA ASSOLUTA - NIENTE SPOILER: non rivelare MAI finale, colpi di scena, rivelazioni,
morti, identita' segrete o esiti dei conflitti. Usa solo materiale sicuro (premessa,
atmosfera, temi, situazione iniziale, domanda centrale). Gli elementi elencati in
"spoiler_policy.do_not_reveal" della scheda NON devono comparire ne' essere allusi.
Nel dubbio, taci il dettaglio: stuzzica la curiosita' senza svelare.

COSA PUOI USARE (è incoraggiato):
- CITA o parafrasa BREVI passaggi reali dal "TESTO DEL LIBRO" qui sotto, per far sentire la voce vera del libro: una frase che colpisce, un'immagine, un dettaglio concreto. Metti le citazioni tra virgolette « ». Scegli passaggi NON-spoiler.
- Puoi anche scrivere parole tue sul libro (temi, atmosfera, cosa lascia addosso), purché veritiere e coerenti con la scheda.

COME SCRIVERE — evita il "sapore IA" (questo è cruciale, altrimenti si capisce che è scritto da una macchina):
- Scrivi nella lingua del libro (${language}), naturale e parlato, come un messaggio a un amico. Alterna frasi corte e lunghe; va bene qualche imperfezione umana. Gli esempi di parole-IA qui sotto sono in italiano: applica lo STESSO principio nella lingua ${language}, evitando i suoi cliché equivalenti.
- VIETATE le parole e abitudini tipiche dell'IA: "viaggio", "tessuto/arazzo", "testimonianza", "nel mondo di oggi", "immergiti/lasciati trasportare", "un'opera che", "non è solo... è anche...", le triplette di aggettivi, i superlativi da pubblicità ("imperdibile", "straordinario", "capolavoro assoluto", "emozionante").
- Niente trattini lunghi (—) a raffica. Niente emoji a pioggia: al massimo una, e solo se serve davvero.
- Concreto e specifico: un dettaglio reale del libro vale più di dieci aggettivi. Niente frasi vuote da quarta di copertina.
- Non aprire con frasi fatte. Inizia con qualcosa di vero: un'immagine, una domanda secca, una frase del libro.
- Non spiegare al lettore cosa "proverà": mostra, non promettere emozioni.

Altri vincoli:
- LINGUA: scrivi TUTTO l'output (message, rationale) nella lingua del libro: ${language}, tono coerente col libro. Anche se queste istruzioni sono in italiano, la RISPOSTA deve essere in ${language}.
- NON ripetere i post recenti elencati sotto.
- Lunghezza adatta a Facebook (2-5 righe).
- 5-10 hashtag pertinenti e specifici (evita i generici tipo #libro #lettura #book).

Rispondi ESCLUSIVAMENTE con JSON valido:
{
  "message": "testo del post senza hashtag",
  "hashtags": "#tag1 #tag2 ...",
  "media_type": "TEXT|LINK|PHOTO|REEL",
  "rationale": "1 frase: perche' questo post dovrebbe funzionare"
}

=== SCHEDA LIBRO ===
Sinossi: ${nz(p.synopsisShort)}
Generi: ${nz(p.genres)}
Tono: ${nz(p.tone)}
Pubblico: ${nz(p.targetAudience)}
Dettagli (JSON): ${nz(p.analysisJson)}

=== PERSONAGGI ===
${characters}

=== ANGOLO RICHIESTO ===
${nz(req.angle)}

=== TESTO DEL LIBRO (usalo per citazioni reali, scegli passaggi non-spoiler) ===
${excerpt}

=== POST RECENTI (non ripeterli) ===
${recent}`;
}

// Merges base + specific hashtags avoiding duplicates (case-insensitive, base first).
export function mergeHashtags(base: string | null, specific: string | null): string {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const src of [base, specific]) {
    if (!src) continue;
    for (const tag of src.trim().split(/\s+/)) {
      if (tag.trim() === "") continue;
      const norm = tag.toLowerCase();
      if (!seen.has(norm)) {
        seen.add(norm);
        ordered.push(tag);
      }
    }
  }
  return ordered.join(" ");
}

function textRequired(j: Record<string, unknown>, field: string): string {
  const v = j[field];
  if (v == null || (typeof v === "string" && v.trim() === "")) {
    throw new ContentError(`Campo obbligatorio mancante nella risposta del modello: ${field}`);
  }
  return typeof v === "string" ? v : String(v);
}

function text(j: Record<string, unknown>, field: string): string | null {
  const v = j[field];
  if (v == null) return null;
  return typeof v === "string" ? v : String(v);
}

function nz(s: string | null): string {
  return s == null ? "" : s;
}

// Riga concisa per personaggio: Nome — ruolo/lavoro — carattere — aspetto fisico.
// Serve a rendere i post piu' concreti e fedeli, senza svelare esiti/finali.
function renderCharacters(list: CharacterBrief[]): string {
  if (!list || list.length === 0) return "(non forniti)";
  const lines: string[] = [];
  for (const c of list) {
    const roleJob = [c.role, c.occupation]
      .map((x) => x?.trim())
      .filter(Boolean)
      .join(", ");
    const parts = [roleJob, c.personality?.trim(), c.physical?.trim()].filter(Boolean);
    lines.push(parts.length ? `- ${c.name} — ${parts.join(" — ")}` : `- ${c.name}`);
  }
  return lines.join("\n");
}
