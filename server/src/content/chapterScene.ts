import type { ContentEngine } from "./engine.js";
import type { ChapterMoment, ChapterSceneKind } from "../domain.js";
import { ContentError } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import { languageName } from "./language.js";

// Estrae la SCHEDA VISIVA di un capitolo dal suo testo: ambiente/luogo, oggetti principali
// (soggetto iconico) e secondari, personaggi presenti. Serve a FONDARE il prompt immagine
// invece di farlo dedurre al modello dal grezzo del capitolo (vedi imagePrompt.ts).
// Best-effort: se il modello non risponde o l'output non è valido, ritorna null.

export interface ChapterSceneInput {
  chapterText: string;
  chapterTitle?: string | null;
  language: string; // lingua del libro: la scheda è scritta in questa lingua (user-facing + editabile)
  knownCharacters: string[]; // nomi del cast noti (dal pre-pass NLP/analisi) per il match
  // DIRETTIVE VISIVE del libro (autoriali): possono evidenziare oggetti/luoghi/dettagli importanti
  // (es. design fisso di un oggetto ricorrente) da nominare con precisione nella scheda. Opzionale.
  directives?: string | null;
  synopsis?: string | null;
}

// Risultato grezzo dell'estrazione (senza i campi di persistenza source/model/updatedAt).
export interface ExtractedChapterScene {
  location: string | null;
  environment: string | null;
  mainObjects: string[];
  secondaryObjects: string[];
  characters: string[];
  pov: string | null;
  // Vincoli CONCRETI di fisica/realismo per illustrare scene di questo capitolo (vedi prompt).
  physicsRules: string[];
  // Azione/momento centrale VISIVO del capitolo (non-spoiler), o null. Fonda il soggetto dell'immagine.
  // La scena PRINCIPALE del capitolo (mai vuota). La sua natura è in `kind`.
  keyMoment: string | null;
  // Natura della scena principale: 'waking' reale, 'dream' onirica, 'flashback' del passato.
  kind: ChapterSceneKind;
  // Momenti sogno/flashback SECONDARI del capitolo (vuoto se non presenti). Vedi ChapterMoment.
  altMoments: ChapterMoment[];
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
    ps: ExtractedChapterScene[],
    sel: (p: ExtractedChapterScene) => string | null,
    max: number,
  ): string | null => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of ps) {
      const v = sel(p);
      if (!v) continue;
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
  const union = (
    ps: ExtractedChapterScene[],
    sel: (p: ExtractedChapterScene) => string[],
    max: number,
  ): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of ps) {
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
  const hasKey = (p: ExtractedChapterScene) => p.keyMoment != null && p.keyMoment.trim() !== "";
  const wakingParts = parts.filter((p) => p.kind === "waking" && hasKey(p));
  const nonWakingParts = parts.filter((p) => p.kind !== "waking" && hasKey(p));
  const hasWaking = wakingParts.length > 0;
  const mainParts = hasWaking ? wakingParts : parts;
  const mainRef = mainParts.find(hasKey) ?? parts.find(hasKey) ?? parts[0]!;
  const convertedNonWaking: ChapterMoment[] = hasWaking
    ? nonWakingParts.map((p) => ({
        type: p.kind === "flashback" ? "flashback" : "dream",
        location: p.location,
        environment: p.environment,
        mainObjects: p.mainObjects,
        secondaryObjects: p.secondaryObjects,
        characters: p.characters,
        physicsRules: p.physicsRules,
        keyMoment: p.keyMoment ?? "",
        whose: null,
      }))
    : [];
  return {
    location: joinDistinct(mainParts, (p) => p.location, 4),
    environment: joinDistinct(mainParts, (p) => p.environment, 3),
    mainObjects: union(mainParts, (p) => p.mainObjects, 8),
    secondaryObjects: union(mainParts, (p) => p.secondaryObjects, 8),
    characters: union(mainParts, (p) => p.characters, 40),
    pov: mainParts.map((p) => p.pov).find((v) => v != null && v.trim() !== "") ?? null,
    physicsRules: union(mainParts, (p) => p.physicsRules, 10),
    keyMoment: mainParts.map((p) => p.keyMoment).find((m) => m != null && m.trim() !== "") ?? null,
    kind: hasWaking ? "waking" : mainRef.kind,
    altMoments: (() => {
      const seen = new Set<string>();
      const out: ChapterMoment[] = [];
      for (const m of [...parts.flatMap((p) => p.altMoments), ...convertedNonWaking]) {
        const k = `${m.type}|${(m.keyMoment ?? "").toLowerCase()}`;
        if (seen.has(k) || (m.keyMoment ?? "").trim() === "") continue;
        seen.add(k);
        out.push(m);
      }
      return out.slice(0, 6);
    })(),
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
  const scene = parts.length === 1 ? parts[0]! : mergeScenes(parts);
  if (parts.length > 1) {
    const best = await pickBestKeyMoment(
      engine,
      input.chapterTitle ?? null,
      parts,
      scene.keyMoment,
    );
    if (best != null && best.trim() !== "") scene.keyMoment = best;
  }
  return ensurePresentFilled(scene);
}

async function pickBestKeyMoment(
  engine: ContentEngine,
  title: string | null,
  parts: ExtractedChapterScene[],
  fallback: string | null,
): Promise<string | null> {
  const hasKey = (p: ExtractedChapterScene) => p.keyMoment != null && p.keyMoment.trim() !== "";
  const wakingParts = parts.filter((p) => p.kind === "waking" && hasKey(p));
  const mainParts = wakingParts.length > 0 ? wakingParts : parts;
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const p of mainParts) {
    const km = (p.keyMoment ?? "").trim();
    const k = km.toLowerCase();
    if (km !== "" && !seen.has(k)) {
      seen.add(k);
      candidates.push(km);
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;
  const numbered = candidates.map((c, i) => `${i}. ${c}`).join("\n");
  const prompt = `You are choosing the SINGLE most visually ICONIC moment to illustrate a book chapter.
Below are candidate key moments (numbered), each extracted from a different part of the SAME chapter.
Pick the ONE that is the most visually striking, drawable and representative of the whole chapter, and NON-spoiler.
Reply with ONLY a valid JSON object, no text before or after: {"index": <number of the chosen candidate>}

CHAPTER TITLE: ${title?.trim() || "(none)"}
CANDIDATES:
${numbered}`;
  try {
    const raw = await engine.run(prompt);
    const j = parseModelJson(raw) as Record<string, unknown>;
    const idx = Number(j.index);
    if (Number.isInteger(idx) && idx >= 0 && idx < candidates.length) return candidates[idx]!;
    const chosen = typeof j.key_moment === "string" ? j.key_moment.trim() : "";
    if (chosen !== "") return chosen;
    return fallback;
  } catch {
    return fallback;
  }
}

// Guard deterministico: a volte il modello copia il contenuto di un sogno/ricordo ANCHE nel
// keyMoment presente (lo "vede" troppo vivido). Se il keyMoment presente combacia molto con quello
// di un altMoment, è una fuga → azzera il presente (il momento resta in altMoments) e togli dai
// mainObjects i soggetti che compaiono SOLO in quel momento non-presente.
// Garantisce che il PRESENTE (key_moment) sia SEMPRE compilato: il presente è la scena principale del
// capitolo, anche se narrativamente è un flashback/sogno. Se il modello ha lasciato il presente vuoto
// mettendo l'unica scena in alt_moments (errore tipico), PROMUOVE quel momento a presente. In più toglie
// un altMoment quasi identico al presente (evita un tab duplicato). NON azzera mai il presente.
function ensurePresentFilled(scene: ExtractedChapterScene): ExtractedChapterScene {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
  const km = (scene.keyMoment ?? "").trim();

  // 1) Presente vuoto ma c'è almeno un momento → promuovi il primo a scena presente.
  if (km === "" && scene.altMoments.length > 0) {
    const [first, ...rest] = scene.altMoments;
    return {
      ...scene,
      location: scene.location ?? first!.location,
      environment: scene.environment ?? first!.environment,
      mainObjects: scene.mainObjects.length > 0 ? scene.mainObjects : first!.mainObjects,
      secondaryObjects:
        scene.secondaryObjects.length > 0 ? scene.secondaryObjects : first!.secondaryObjects,
      characters: scene.characters.length > 0 ? scene.characters : first!.characters,
      physicsRules: scene.physicsRules.length > 0 ? scene.physicsRules : first!.physicsRules,
      keyMoment: first!.keyMoment,
      // Il momento promosso diventa la NATURA del presente (così è reso come sogno/flashback).
      kind: first!.type,
      altMoments: rest,
    };
  }

  if (km !== "" && scene.altMoments.length > 0) {
    const kmWords = new Set(norm(km));
    if (kmWords.size > 0) {
      const kept = scene.altMoments.filter((m) => {
        const mw = norm(m.keyMoment ?? "");
        const overlap = mw.length === 0 ? 0 : mw.filter((w) => kmWords.has(w)).length / mw.length;
        return overlap <= 0.7;
      });
      return { ...scene, altMoments: kept };
    }
  }
  return scene;
}

// Una singola estrazione su una porzione di testo (un blocco o l'intero capitolo se corto).
async function extractOnePass(
  engine: ContentEngine,
  input: ChapterSceneInput,
): Promise<ExtractedChapterScene | null> {
  const text = (input.chapterText ?? "").trim();
  if (text === "") return null;
  const cast = input.knownCharacters.length > 0 ? input.knownCharacters.join(", ") : "(none known)";
  const language = languageName(input.language);
  const synopsis = (input.synopsis ?? "").trim();

  const prompt = `You are an assistant preparing VISUAL CARDS of chapters to generate illustrations.
From the chapter below extract ONLY what is VISUAL and CONCRETE (no plot or spoilers), to help draw images
set in that chapter.

Reply with ONLY a valid JSON object, no text before or after, in this shape:
{
  "location": "the chapter's concrete PLACE, short; if the scene MOVES, list the main places in narrative order separated by commas",
  "environment": "indoor/outdoor, time of day, weather/visual atmosphere; if it changes across scenes, summarize the main ones",
  "main_objects": ["1-4 ICONIC, visual OBJECTS or SUBJECTS PHYSICALLY PRESENT in the chapter's scenes (concrete objects, vehicles, animals, buildings or natural elements the scene focuses on); see rule below"],
  "secondary_objects": ["small background objects PHYSICALLY PRESENT in the scene"],
  "characters": ["ONLY the characters PHYSICALLY PRESENT in this chapter's scenes (see rule below)"],
  "pov": "the NAME (from the KNOWN CHARACTERS list) of the chapter's point-of-view / narrating character. For a FIRST-PERSON chapter, map the 'I'/narrator to the matching cast name. Use '' if the chapter is omniscient, has no clear single POV, or you cannot map it to a known character. Return ONLY a name that is in KNOWN CHARACTERS, or ''",
  "physics_rules": ["3-8 CONCRETE physics/realism constraints to illustrate scenes of THIS chapter"],
  "key_moment": "the chapter's MAIN drawable scene — its single dominant moment (one short, non-spoiler sentence: who does what, where). ALWAYS fill this; never empty. Pick the dominant moment REGARDLESS of its time; its nature (present vs past vs dream) is recorded separately in 'kind'. A SECONDARY dream/memory/flashback — one that happens AROUND a present main scene (VERY COMMON: the character lives the present day then falls asleep and dreams, or is in the present and briefly recalls the past) — is NOT the main scene: put the present action in key_moment (kind='waking') and the dream/memory in alt_moments — output BOTH. But when the ENTIRE chapter is set in ONE other time or mode — a whole dream, OR a whole PAST scene that predates the BOOK NARRATIVE PRESENT (a reconstructed memory that fills the chapter, even if narrated as ordinary real action) — then THAT scene IS the key_moment and 'kind' is 'dream'/'flashback' accordingly, with alt_moments []. NEVER decide from the chapter TITLE — judge from the narrated body plus the temporal frame. Example A: the protagonist lives ordinary daytime events, then has a nightmare → key_moment = the daytime scene, kind='waking', nightmare in alt_moments. Example B: the chapter is ENTIRELY a character's childhood with no present frame → key_moment = that childhood scene, kind='flashback', alt_moments []. Example C: the present frame is a father grieving his late daughter, and THIS chapter is entirely a remembered day when she was still alive → key_moment = that remembered scene, kind='flashback', alt_moments []",
  "kind": "waking | dream | flashback — the NATURE of the MAIN scene in key_moment. 'waking' = it really happens in the STORY'S PRESENT (the 'now' defined by the BOOK NARRATIVE PRESENT above). 'dream' = an oniric/unreal scene. 'flashback' = a real scene set in the PAST relative to that present (a memory / earlier time), EVEN if it is narrated vividly as ordinary real action. TEMPORAL RULE (decisive): first place the chapter's MAIN scene on the timeline against the BOOK NARRATIVE PRESENT. If the whole main scene happens EARLIER than that present — it reconstructs a past the present frame treats as already over (e.g. events with a person/situation the synopsis presents as lost, gone, deceased, ended, or belonging to 'before') — then kind='flashback', NOT 'waking', even though nobody is dreaming and the prose feels present-tense. 'waking' is ONLY for action that sits in the story's actual present. A dream/memory that is SECONDARY to a present main scene still goes in alt_moments (kind stays 'waking'). Do NOT flip kind from the chapter TITLE alone. When the synopsis is '(not available)' or the chapter clearly sits in the present, default to 'waking'.",
  "alt_moments": [{ "type": "dream | flashback", "location": "place/era of this moment (for flashback: the PAST)", "environment": "indoor/outdoor, light, atmosphere of this moment", "main_objects": ["iconic subjects/objects of THIS moment"], "secondary_objects": ["minor objects of this moment"], "characters": ["characters appearing INSIDE this moment"], "physics_rules": ["concrete physics/realism constraints for this moment"], "key_moment": "the VISUAL action of this dream/flashback (one short sentence)", "whose": "name of the character who dreams/relives it (or '')" }]
}

RULES:
- "main_objects"/"secondary_objects": ONLY objects/subjects PHYSICALLY PRESENT and visible in the chapter's
  scenes, that you could actually draw there. STRICTLY EXCLUDE objects merely NAMED, REMEMBERED, IMAGINED,
  EXPECTED or used as a METAPHOR/figure of speech but NOT actually present in the scene (e.g. an activity
  cited in a memory — "a sport a friend used to practise" — or an object that is talked about but is not in the
  scene). An object NAMED in the text is NOT enough: it must be there, now, in the drawable scene.
  HOMONYMS / FIGURATIVE USE — do NOT take a word literally as a physical object when the text uses it as the
  NAME of a technique, move, manoeuvre, exercise, game, dance, recipe, brand, song, place-name or as a
  nickname/figure of speech. The same word can mean a thing OR an action/concept: judge by context. E.g. "the
  eagle pose" is a yoga position, not a bird; "a butterfly stroke" is a swimming style, not an insect; "the
  crab walk" is an exercise, not a crustacean. Only add the literal animal/object when the text clearly means
  the real physical thing IS in the scene.
  DREAMED / REMEMBERED OBJECTS: an object seen only inside a recounted dream, vision or memory is a main_object
  ONLY when illustrating THAT dream/memory IS the chapter's drawable scene; a passing mention of something
  dreamt or recalled while the character is elsewhere does NOT make it present — exclude it.
- "physics_rules": list 3 to 8 CONCRETE, VISUAL physics/realism constraints for drawing this chapter, fitted
  to ITS context: how gravity/support, water/waves, wind/motion, light/shadows behave in THIS chapter's
  scenes, and above all what must NOT happen (plausible errors the image model would make here). Examples of
  FORM (adapt them to the chapter, do not copy them): "people in water are submerged up to the torso, never
  sitting on top of the surface", "the boat rests on the water with its keel submerged, not floating above
  the water's surface", "shadows all fall on the same side, consistent with the low sun". Concrete, visual,
  no plot. If the chapter suggests no particular constraints, still give the basic rules relevant to its setting.
- "characters": list ONLY the characters PHYSICALLY PRESENT in the chapter's scenes — those who ACTUALLY
  appear on the spot, here and now, and could be drawn in the scene (visible, acting, speaking or perceived
  while present). Among these:
  (a) those who have a PROPER NAME AND are present in the scene;
  (b) figures described WITHOUT a name ONLY IF they correspond to a character in the KNOWN CAST below (the
      list of the book's relevant characters): make the match even when the text uses a description and the
      cast uses a different label for the same character, and in that case use the cast's NAME.
  A KNOWN CAST member is NEVER an "incidental extra": if a character from the KNOWN CAST appears in a scene of
  this chapter, INCLUDE them — EVEN when they are working or serving (a waiter, bartender, waitress, clerk,
  driver, guide). The incidental-extra exclusion below applies ONLY to UNNAMED people who are NOT in the cast.
  SCOPE — TOP-LEVEL "characters" = the MAIN scene (key_moment) ONLY. A character who appears ONLY inside a
  SECONDARY dream/memory/flashback of this chapter (i.e. inside an alt_moments entry, while the MAIN scene is
  a different, waking moment) MUST NOT be listed here: put them in THAT alt_moment's own "characters" instead.
  Listing someone here means they are physically in the MAIN drawn scene. This matters for people who are gone
  from the story's present (dead, absent, belonging to the past): if the main scene is in the present they are
  NOT in it — they only belong to the flashback where they are shown.
  WHOLE-CHAPTER MEMORY: if instead the chapter's MAIN scene IS itself the flashback/dream (kind='flashback'/
  'dream' — the whole chapter is that past/oniric scene), then the characters shown INSIDE it ARE the main
  scene's characters: INCLUDE them here.
  EXCLUDE instead anyone merely NAMED, EVOKED, EXPECTED or who is TALKED ABOUT or THOUGHT OF WITHOUT a scene
  that shows them (e.g. a person cited in a dialogue or a thought, someone absent or far away who is only
  spoken of). A NAME in the text is NOT enough: presence in a scene is required — even past or remembered,
  as long as it is ACTUALLY SHOWN. ALSO EXCLUDE incidental extras with no name and NOT in the cast (a driver,
  a waiter, a shop assistant, a passer-by, a stranger passing through), even if they speak, argue or help in a
  single scene. The character from whose POINT OF VIEW the chapter is told — including the first-person
  NARRATOR ("I") — IS present in the scenes they take part in: ALWAYS include them if identifiable, using
  their NAME from the cast. But if in THIS chapter they do not appear in a scene (e.g. a chapter from another's
  POV, a prologue, a scene where they are not present), do NOT include them.
- BOOK ART DIRECTION (below): if it names objects/places/details important to THIS book (e.g. the fixed
  design of a recurring object, a signature vehicle, a specific setting), and that element is PHYSICALLY
  PRESENT in this chapter's scene, name it PRECISELY in the matching field (main_objects/secondary_objects/
  location/environment) using the direction's wording. It does NOT add things that are not in the scene.
- "alt_moments" (dreams / memories / flashbacks): add an entry for EVERY dream/memory/flashback that is
  SECONDARY — i.e. it occurs while the chapter ALSO has a real waking scene (the character, around the main
  waking action, dreams / recalls / flashes back to another time). THE KEY RULE: a chapter that depicts a real
  waking scene AND a dream/memory/flashback (VERY COMMON — e.g. the character lives events then falls asleep
  and dreams, or is somewhere and remembers the past) MUST output BOTH: the waking scene as "key_moment" with
  kind='waking', AND the dream/memory/flashback as an alt_moments entry. Do NOT collapse such a chapter to only
  the dream/flashback, and do NOT leave alt_moments empty in that case. Return [] ONLY when the chapter has no
  dream/memory/flashback at all. The OPPOSITE rare case: if the chapter's MAIN scene IS itself the dream/
  flashback (the WHOLE chapter takes place inside it, no waking frame), that belongs in "key_moment" with the
  top-level "kind" set accordingly — then alt_moments stays []. Each entry is built like a real scene (its own
  location/environment/main_objects/characters/physics_rules/key_moment). "type": "dream" | "flashback" —
  there are only TWO: a 'flashback' is a real PAST scene (a memory/flashback are the SAME thing), a 'dream' is
  an oniric/unreal scene. "whose" = the character who dreams/relives it (the narrator / POV when first-person).
- Concrete and visual: no abstract emotions, no events/plot, no spoilers. Only what you SEE.
- If a field cannot be determined, use "" (empty string) or [] (empty list). No inventions.
- LANGUAGE: write ALL string values in ${language}. Even though these instructions are in English, the values
  MUST be in ${language}.

KNOWN CHARACTERS (for matching): ${cast}
BOOK ART DIRECTION (object/detail hints, if any): ${input.directives?.trim() || "(none)"}
CHAPTER TITLE: ${input.chapterTitle?.trim() || "(none)"}
=== BOOK NARRATIVE PRESENT (temporal frame — the story's "now"; use it ONLY to decide waking vs flashback) ===
${synopsis || "(not available — when absent, judge kind from the chapter body alone as usual)"}
=== CHAPTER TEXT ===
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
    const altArr = (v: unknown): ChapterMoment[] => {
      if (!Array.isArray(v)) return [];
      const out: ChapterMoment[] = [];
      for (const x of v) {
        if (x == null || typeof x !== "object") continue;
        const m = x as Record<string, unknown>;
        const type =
          m.type === "dream" || m.type === "flashback"
            ? m.type
            : m.type === "memory"
              ? "flashback"
              : null;
        const km = str(m.key_moment);
        if (!type || !km) continue;
        out.push({
          type,
          location: str(m.location),
          environment: str(m.environment),
          mainObjects: strArr(m.main_objects),
          secondaryObjects: strArr(m.secondary_objects),
          characters: strArr(m.characters),
          physicsRules: ruleArr(m.physics_rules),
          keyMoment: km,
          whose: str(m.whose),
        });
      }
      return out.slice(0, 6);
    };
    return {
      location: str(j.location),
      environment: str(j.environment),
      mainObjects: strArr(j.main_objects),
      secondaryObjects: strArr(j.secondary_objects),
      characters: strArr(j.characters),
      pov: str(j.pov),
      physicsRules: ruleArr(j.physics_rules),
      keyMoment: str(j.key_moment),
      kind: j.kind === "dream" || j.kind === "flashback" ? j.kind : "waking",
      altMoments: altArr(j.alt_moments),
    };
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
