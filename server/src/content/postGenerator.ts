import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import type { BookProfile, ChapterMarketingCardData, MediaType } from "../domain.js";
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
  // Istruzioni-extra APPEND-ONLY: globale + per-libro, già combinate dal chiamante. Accodate in
  // fondo al prompt come guida aggiuntiva; NON sostituiscono il core (no-spoiler/lingua/JSON restano).
  extraInstructions?: string | null;
  // Scheda marketing del capitolo (comprensione narrativa pre-calcolata): se presente, è la FONTE
  // primaria dell'idea. `chosenAngle` = angolo scelto dall'idea ranker (hook+tipo) da preferire.
  marketingCard?: ChapterMarketingCardData | null;
  chosenAngle?: { type: string; hook: string } | null;
}

export interface GeneratedPost {
  message: string;
  hashtags: string; // final (base + specific), ready to publish
  baseHashtags: string; // always included (configured on the book)
  specificHashtags: string; // generated for this post
  mediaType: MediaType;
  rationale: string | null;
  // Indice del capitolo da cui è stata estratta l'idea (pipeline skill), o null.
  // Lo valorizza ContentService, che conosce il capitolo scelto.
  sourceChapterIndex?: number | null;
  // Chiave dell'angolo marketing-card usato (per la rotazione LRU degli angoli). Lo valorizza
  // ContentService. null se nessuna card/angolo.
  chosenAngleKey?: string | null;
}

export async function generatePost(
  engine: ContentEngine,
  req: GenerateRequest,
): Promise<GeneratedPost> {
  const first = await generateOnce(engine, req);
  // TERZO PASSO — QUALITY JUDGE: scarta i post GENERICI (che starebbero bene per qualunque libro),
  // senza dettaglio reale dal capitolo, da "quarta di copertina" o con rischio spoiler. Se bocciato,
  // UNA rigenerazione mirata (con il motivo del rifiuto) e si tiene il migliore. Best-effort: se il
  // giudice non risponde, si tiene il post così com'è (non blocca mai la generazione).
  const verdict = await judgePost(engine, first.message, req).catch(() => null);
  if (!verdict || !verdict.needsRegeneration) return first;
  const retry = await generateOnce(engine, req, verdict).catch(() => null);
  if (!retry) return first;
  const v2 = await judgePost(engine, retry.message, req).catch(() => null);
  // Tieni il retry se NON va più rigenerato o se è almeno meno generico del primo.
  const retryBetter =
    !v2 || !v2.needsRegeneration || v2.genericnessScore <= verdict.genericnessScore;
  return retryBetter ? retry : first;
}

// Una singola generazione (idea → post → umanizzazione). `regenHint` (opzionale) = verdetto del
// giudice sul tentativo precedente, accodato come correzione mirata per evitare lo stesso difetto.
async function generateOnce(
  engine: ContentEngine,
  req: GenerateRequest,
  regenHint?: PostVerdict,
): Promise<GeneratedPost> {
  const prompt = buildPrompt(req, regenHint);
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
  const rawMessage = textRequired(j, "message");
  // SECONDO PASSO — UMANIZZAZIONE (anti-AI): riscrive il testo per togliere i segni residui da
  // "macchina" (vocabolario IA, em-dash, regola del tre, parallelismi negativi, chiuse moraleggianti,
  // passivo, filler). Best-effort: se fallisce o torna fuori scala, tiene l'originale.
  const message = await humanizeMessage(engine, rawMessage, req.language).catch(() => rawMessage);
  return {
    message,
    hashtags: specific, // final = specific until ContentService adds the base
    baseHashtags: "",
    specificHashtags: specific,
    mediaType: media,
    rationale: text(j, "rationale"),
  };
}

// Verdetto del QUALITY JUDGE su un post generato.
interface PostVerdict {
  genericnessScore: number; // 0 = unico per questo libro, 10 = va bene per qualunque libro
  usesRealChapterDetail: boolean;
  soundsLikeBackCover: boolean;
  spoilerRisk: "low" | "medium" | "high";
  needsRegeneration: boolean;
}

// TERZO PASSO anti-genericità: un editor severo giudica il post contro la FONTE (capitolo o scheda).
// Boccia (needsRegeneration) se il post potrebbe valere per qualunque libro, non usa un dettaglio
// reale, suona da quarta di copertina o rischia spoiler. La soglia è ricalcolata in codice (non ci si
// fida solo del flag del modello). Throwa su parse fallito → il chiamante lo ignora (non blocca).
async function judgePost(
  engine: ContentEngine,
  message: string,
  req: GenerateRequest,
): Promise<PostVerdict> {
  const lang = req.language || "Italian";
  const hasChapter =
    !!req.chapterExcerpt &&
    req.chapterExcerpt.trim() !== "" &&
    req.chapterExcerpt.trim() !== "(non fornito)";
  // La FONTE per il giudizio deve combaciare con quella che ha GUIDATO la generazione: l'excerpt è
  // breve ma la marketing card può contenere citazioni/dettagli presi più in profondità nel capitolo.
  // Includerla evita che il judge bocci ingiustamente un post che usa un dettaglio reale della card.
  const cardSource = req.marketingCard
    ? `\n\nCHAPTER MARKETING CARD (also a valid source of real details/quotes):\n${JSON.stringify(req.marketingCard).slice(0, 6000)}`
    : "";
  const source = hasChapter
    ? `CHAPTER (the post should draw a concrete detail from here):\n${req.chapterExcerpt!.slice(0, 8000)}${cardSource}`
    : `BOOK SCHEDA:\nSynopsis: ${nz(req.profile.synopsisShort)}\nTone: ${nz(req.profile.tone)}${cardSource}`;
  const prompt = `You are a STRICT social editor for a book page. Judge the POST below against its SOURCE.
The post is in ${lang}. Reply with ONLY a valid JSON object, nothing else:
{
  "genericness_score": 0-10 (0 = clearly born from THIS specific book/chapter, 10 = could be posted for ANY book),
  "uses_real_chapter_detail": true/false (does it use a concrete, specific detail/image/line from the SOURCE?),
  "has_specific_image": true/false (is there a concrete image/moment, not just abstractions?),
  "sounds_like_back_cover": true/false (does it read like generic blurb / marketing back-cover?),
  "spoiler_risk": "low" | "medium" | "high",
  "needs_regeneration": true/false
}
RULE: if the post could fit ANY book, or has no concrete detail from the SOURCE, or reads like a back-cover blurb → needs_regeneration = true. Be strict.

=== SOURCE ===
${source}

=== POST TO JUDGE ===
${message}`;

  const raw = await engine.run(prompt);
  const j = parseModelJson(raw) as Record<string, unknown>;
  const num = (v: unknown): number => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 5;
  };
  const bool = (v: unknown): boolean => v === true || v === "true";
  const genericnessScore = num(j["genericness_score"]);
  const usesRealChapterDetail = bool(j["uses_real_chapter_detail"]);
  const soundsLikeBackCover = bool(j["sounds_like_back_cover"]);
  const risk = String(j["spoiler_risk"] ?? "low").toLowerCase();
  const spoilerRisk: PostVerdict["spoilerRisk"] =
    risk === "high" ? "high" : risk === "medium" ? "medium" : "low";
  // Soglia ricalcolata in codice: non fidarsi solo del flag del modello.
  const needsRegeneration =
    bool(j["needs_regeneration"]) ||
    genericnessScore >= 7 ||
    !usesRealChapterDetail ||
    soundsLikeBackCover ||
    spoilerRisk === "high";
  return {
    genericnessScore,
    usesRealChapterDetail,
    soundsLikeBackCover,
    spoilerRisk,
    needsRegeneration,
  };
}

// SECONDO PASSO anti-AI: prende il post generato e lo RISCRIVE perché suoni umano, rimuovendo i
// pattern tipici dell'IA (guida "signs of AI writing"). Mantiene lingua, significato, lunghezza e le
// citazioni reali tra « » INTATTE. Restituisce SOLO il testo riscritto. Best-effort: su risultato
// vuoto o fuori scala (troncato/dilungato) ritorna l'originale, così non peggiora mai il post.
async function humanizeMessage(
  engine: ContentEngine,
  message: string,
  language: string,
): Promise<string> {
  const original = (message ?? "").trim();
  if (original === "") return message;
  const lang = language || "Italian";
  const prompt = `Rewrite the text below so it sounds written by a REAL PERSON, not by an AI. It is a social post about a book.

HARD RULES:
- Same LANGUAGE (${lang}), same MEANING, similar length (do not lengthen).
- Keep the « » quotes INTACT, word for word (they are real text from the book): do not rewrite them, do not shift their meaning.
- Do NOT add hashtags, titles, outer quotes, preambles or explanations.
- Return ONLY the rewritten text, nothing else.

REMOVE the typical AI tells (apply them to ${lang} — use the equivalent forms in that language, the examples below are illustrative):
- inflated vocabulary / AI-words: "journey", "tapestry", "testament", "delve", "explore", "unveil", "intricate", "vibrant", "in the landscape/in the era", "embrace", "navigate the complexities", "ultimately", "it's worth noting", "in today's world", "dive in/let yourself be carried", "a work that".
- negative parallelisms: "it's not just X, it's also Y", "not only… but also…" → say it directly.
- the rule of three: avoid lists/triplets of adjectives or nouns.
- moralizing / back-cover closers: "it reminds us that…", "it teaches us that…", "deep down it's a story about…", "a story that will stay with you".
- promotional superlatives: "unmissable", "extraordinary", "masterpiece", "thrilling".
- vague attributions ("many think", "it is said that"), run of rhetorical questions, filler.
- run of em-dashes (—) → use commas/periods. At most ONE emoji, only if it was already there or it helps.

MAKE IT HUMAN:
- natural, spoken ${lang}, like a message to a friend; a little imperfection is fine.
- alternate short and long sentences; prefer the ACTIVE voice over the passive.
- concrete and specific beats adjectives; show, don't promise emotions.
- open with something real (an image, a line from the book, a sharp question), never with clichés or meta-openings.

TEXT TO REWRITE:
${original}`;

  let out: string;
  try {
    out = (await engine.run(prompt)) ?? "";
  } catch {
    return message; // motore non disponibile: tieni l'originale
  }
  // Ripulisci eventuali recinti di codice / virgolette esterne aggiunte dal modello.
  let cleaned = out.trim();
  cleaned = cleaned
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("«") && cleaned.endsWith("»") && original.indexOf("«") !== 0)
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  // Guardia di scala: se il modello ha troncato o si è dilungato troppo, scarta la riscrittura.
  if (cleaned === "") return message;
  if (cleaned.length < original.length * 0.4 || cleaned.length > original.length * 2.5) {
    return message;
  }
  return cleaned;
}

function buildPrompt(req: GenerateRequest, regenHint?: PostVerdict): string {
  // Se abbiamo il testo reale di un capitolo, usa il prompt "capitolo": trova UNA idea viva
  // del capitolo e la rende umana. La logica delle ex-skill OpenCode (idea-extractor + tagore)
  // e' INCORPORATA nel prompt, quindi funziona con QUALSIASI modello (openai/anthropic/google/
  // ollama/opencode) senza skill installate sul sistema. Senza capitolo, ricade sulla sola scheda.
  const hasChapter =
    !!req.chapterExcerpt &&
    req.chapterExcerpt.trim() !== "" &&
    req.chapterExcerpt.trim() !== "(non fornito)";
  const base = hasChapter ? buildChapterPrompt(req) : buildSchedaPrompt(req);
  return appendRegenHint(appendExtraInstructions(base, req.extraInstructions), regenHint);
}

// Sul retry, accoda la diagnosi del giudice come correzione mirata: forza un dettaglio concreto
// della fonte ed evita il difetto rilevato (genericità / quarta di copertina / spoiler).
function appendRegenHint(prompt: string, hint: PostVerdict | undefined): string {
  if (!hint) return prompt;
  const issues: string[] = [];
  if (!hint.usesRealChapterDetail) issues.push("it did NOT use a concrete detail from the source");
  if (hint.soundsLikeBackCover) issues.push("it sounded like a generic back-cover blurb");
  if (hint.genericnessScore >= 7) issues.push("it was too generic (could fit any book)");
  if (hint.spoilerRisk === "high") issues.push("it risked a spoiler");
  const why = issues.length > 0 ? issues.join("; ") : "it was too generic";
  return `${prompt}

=== RETRY — the previous attempt was REJECTED (${why}) ===
Write a DIFFERENT post that anchors on a CONCRETE, specific detail, image or line from THIS chapter/book. It must NOT read like a back-cover blurb and must NOT fit any other book. Keep it strictly non-spoiler.`;
}

// Accoda (APPEND-ONLY) le istruzioni-extra dell'utente in fondo al prompt, senza toccare il core.
// Sono guida aggiuntiva: le regole assolute del prompt (no-spoiler, lingua di output, formato JSON)
// restano sovraordinate. Vuoto/assente => prompt invariato.
function appendExtraInstructions(prompt: string, extra: string | null | undefined): string {
  const e = (extra ?? "").trim();
  if (e === "") return prompt;
  return `${prompt}

=== EXTRA INSTRUCTIONS (added by the user — additional guidance, follow it whenever relevant; it must NOT override the ABSOLUTE NO-SPOILER RULE, the output LANGUAGE, or the JSON output format above) ===
${e}`;
}

// Prompt "capitolo": pipeline incorporata (ex-skill idea-extractor + tagore) — trova la singola
// idea viva del capitolo e la umanizza, tutto INLINE nel prompt (provider-agnostico). Output =
// lo stesso JSON del flusso scheda, cosi' il resto della pipeline (merge hashtag, salvataggio) non cambia.
function buildChapterPrompt(req: GenerateRequest): string {
  const p = req.profile;
  const recent =
    req.recentMessages.length === 0 ? "(no previous posts)" : req.recentMessages.join("\n---\n");
  const language = req.language || "italiano";
  const characters = renderCharacters(req.characters);

  return `You are a passionate reader who runs the Facebook page "${req.pageName}" and talks about the book to other readers. Write like a real person, NOT like a marketing agency.

PROCEDURE (two steps, to do INTERNALLY — show ONLY the final post in the JSON):

1. FIND THE IDEA from the CHAPTER below. Before writing, internally extract (this is REASONING — never show it):
   - the most CONCRETE image or moment in the chapter (something you could almost see);
   - the human TENSION or truth behind it (what is really at stake for a person);
   - ONE reader-facing QUESTION it raises;
   - ONE short, real, NON-SPOILER quote or phrase from the chapter, if available;
   - ONE reason this matters OUTSIDE the plot (why a stranger should care);
   - ONE clichéd / generic version to AVOID.
   Then pick the single strongest idea, judged on: concreteness (a real moment / line / image, not a summary), tension, standalone value (holds up without explaining the chapter), consistency with the book's voice, anti-spoiler safety.
   HARD FILTER: the chosen idea MUST contain at least one CONCRETE detail from THIS chapter. If the post you are about to write could fit ANY book, discard it and choose another idea. Do NOT show the candidates, the checklist or the scores.
   If a "CHAPTER MARKETING CARD" is provided below, use it as the PRIMARY, pre-vetted source: build the post from its CHOSEN ANGLE and its concrete details / safe quotes (unless the REQUESTED ANGLE clearly points elsewhere). You must still satisfy the HARD FILTER above.

2. WRITE the post, humanizing that idea. Avoid the "AI flavor" (crucial, otherwise it reads as machine-written): no inflated meaning, no AI-words (in the OUTPUT language: words like "journey", "tapestry", "testament", "in today's world", "dive in/let yourself be carried", "a work that", "it's not just... it's also..."), no triplets of adjectives, no promotional superlatives ("unmissable", "extraordinary", "masterpiece"), no run of em-dashes (—), at most one emoji and only if useful. Concrete and specific beats ten adjectives. Open with something real (an image, a line from the book, a sharp question), never with clichés or meta-openings ("In this chapter", "This post"). Alternate short and long sentences, keep ONE emotional thread, close with a line that opens a thought (not a generic CTA). Show, don't promise emotions.

ABSOLUTE RULE - NO SPOILERS: never reveal the ending, plot twists, deaths, secret identities or the outcomes of conflicts. Use only safe material. The items listed in the scheda's "spoiler_policy.do_not_reveal" must NOT appear nor be hinted at. When in doubt, leave the detail out.

CONSTRAINTS:
- LANGUAGE: write ALL the output (message, rationale) in the book's language: ${language}. Even though these instructions are in English, the RESPONSE must be in ${language}, with a tone consistent with the book.
- You may quote SHORT, real, non-spoiler passages from the chapter inside « ».
- Length suited to Facebook (3-6 short lines).
- Start with something real (an image, a line from the book, a sharp question), never with clichés.
- Do NOT repeat the recent posts listed below. If the ANGLE below is given, let it steer WHICH idea to pick (so different posts draw different ideas).
- 5-10 relevant, specific hashtags (no generic ones like #book #reading #books).

Reply with ONLY valid JSON, nothing before or after:
{
  "message": "post text without hashtags",
  "hashtags": "#tag1 #tag2 ...",
  "media_type": "${req.mediaType}",
  "rationale": "1 sentence: which chapter idea you chose and why"
}

=== BOOK SCHEDA (context and real names; the SOURCE of the idea remains the CHAPTER) ===
Synopsis: ${nz(p.synopsisShort)}
Genres: ${nz(p.genres)}
Tone: ${nz(p.tone)}
Spoiler policy / details (JSON): ${nz(p.analysisJson)}

=== CHARACTERS (use ONLY these real names) ===
${characters}

=== REQUESTED ANGLE (steers the idea choice) ===
${nz(req.angle)}
${marketingCardBlock(req.marketingCard, req.chosenAngle)}
=== CHAPTER (SOURCE: extract the single idea from here, quote only non-spoiler passages) ===
${req.chapterExcerpt}

=== RECENT POSTS (do not repeat them) ===
${recent}`;
}

function buildSchedaPrompt(req: GenerateRequest): string {
  const p = req.profile;
  const recent =
    req.recentMessages.length === 0 ? "(no previous posts)" : req.recentMessages.join("\n---\n");
  const excerpt =
    !req.chapterExcerpt || req.chapterExcerpt.trim() === "" ? "(non fornito)" : req.chapterExcerpt;
  const language = req.language || "italiano";
  const characters = renderCharacters(req.characters);

  return `You are a passionate reader who runs the Facebook page "${req.pageName}" and talks about the book below to other readers. Write like a real person, NOT like a marketing agency.

Goal: make people want to read the book and spark a real conversation (comments, shares). No click-bait.

ABSOLUTE RULE - NO SPOILERS: never reveal the ending, plot twists, reveals,
deaths, secret identities or the outcomes of conflicts. Use only safe material (premise,
atmosphere, themes, opening situation, central question). The items listed in the scheda's
"spoiler_policy.do_not_reveal" must NOT appear nor be hinted at.
When in doubt, leave the detail out: tease curiosity without revealing.

WHAT YOU CAN USE (encouraged):
- QUOTE or paraphrase SHORT, real passages from the "BOOK TEXT" below, to convey the book's real voice: a striking line, an image, a concrete detail. Put quotes inside « ». Choose NON-spoiler passages.
- You may also write your own words about the book (themes, atmosphere, what it leaves you with), as long as they are truthful and consistent with the scheda.

HOW TO WRITE — avoid the "AI flavor" (this is crucial, otherwise it reads as machine-written):
- Natural, spoken language (in the OUTPUT language), like a message to a friend. Alternate short and long sentences; a little human imperfection is fine.
- FORBIDDEN: the words and habits typical of AI (in the output language): "journey", "tapestry", "testament", "in today's world", "dive in/let yourself be carried", "a work that", "it's not just... it's also...", triplets of adjectives, advertising superlatives ("unmissable", "extraordinary", "absolute masterpiece", "thrilling").
- No run of em-dashes (—). No shower of emoji: at most one, and only if truly needed.
- Concrete and specific: a real detail from the book is worth more than ten adjectives. No empty back-cover phrases.
- Do not open with clichés. Start with something real: an image, a sharp question, a line from the book.
- Don't tell the reader what they "will feel": show, don't promise emotions.

Other constraints:
- Write in ${language}, tone consistent with the book.
- Do NOT repeat the recent posts listed below.
- Length suited to Facebook (2-5 lines).
- 5-10 relevant, specific hashtags (avoid generic ones like #book #reading #books).

Reply with ONLY valid JSON:
{
  "message": "post text without hashtags",
  "hashtags": "#tag1 #tag2 ...",
  "media_type": "TEXT|LINK|PHOTO|REEL",
  "rationale": "1 sentence: why this post should work"
}

=== BOOK SCHEDA ===
Synopsis: ${nz(p.synopsisShort)}
Genres: ${nz(p.genres)}
Tone: ${nz(p.tone)}
Audience: ${nz(p.targetAudience)}
Details (JSON): ${nz(p.analysisJson)}

=== CHARACTERS ===
${characters}

=== REQUESTED ANGLE ===
${nz(req.angle)}

=== BOOK TEXT (use it for real quotes, choose non-spoiler passages) ===
${excerpt}

=== RECENT POSTS (do not repeat them) ===
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

// Blocco "scheda marketing del capitolo": comprensione narrativa pre-calcolata + angolo scelto dal
// ranker. Vuoto se la card non è disponibile (fallback al comportamento storico).
function marketingCardBlock(
  card: ChapterMarketingCardData | null | undefined,
  chosen: { type: string; hook: string } | null | undefined,
): string {
  if (!card) return "";
  const lines: string[] = [
    "",
    "=== CHAPTER MARKETING CARD (pre-computed, grounded analysis of THIS chapter — use it as the PRIMARY source of the idea) ===",
  ];
  if (card.nonSpoilerSummary) lines.push(`Non-spoiler summary: ${card.nonSpoilerSummary}`);
  if (card.emotionalCore) lines.push(`Emotional core: ${card.emotionalCore}`);
  if (card.humanTruth) lines.push(`Human truth: ${card.humanTruth}`);
  if (card.readerQuestion) lines.push(`Reader question: ${card.readerQuestion}`);
  if (card.mainTension) lines.push(`Main tension: ${card.mainTension}`);
  if (card.visualMoment) lines.push(`Visual moment: ${card.visualMoment}`);
  const quotes = card.safeQuotes.filter((q) => q.spoilerRisk !== "high" && q.quote.trim() !== "");
  if (quotes.length > 0) {
    lines.push(`Safe quotes you may use: ${quotes.map((q) => `«${q.quote}»`).join(" ")}`);
  }
  if (chosen && chosen.hook.trim() !== "") {
    lines.push(
      `CHOSEN ANGLE (prefer this hook unless the REQUESTED ANGLE points elsewhere) — [${chosen.type}] "${chosen.hook}"`,
    );
  }
  return lines.join("\n");
}

// Riga concisa per personaggio: Nome — ruolo/lavoro — carattere — aspetto fisico.
// Serve a rendere i post piu' concreti e fedeli, senza svelare esiti/finali.
function renderCharacters(list: CharacterBrief[]): string {
  if (!list || list.length === 0) return "(none provided)";
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
