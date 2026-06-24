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
  // DIRETTIVE VISIVE del libro (autoriali): possono evidenziare oggetti/luoghi/dettagli importanti
  // (es. design fisso di un oggetto ricorrente) da nominare con precisione nella scheda. Opzionale.
  directives?: string | null;
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
  // Azione/momento centrale VISIVO del capitolo (non-spoiler), o null. Fonda il soggetto dell'immagine.
  keyMoment: string | null;
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
    // Momento chiave: il primo non vuoto tra i blocchi (di norma la scena d'apertura è la più iconica).
    keyMoment: parts.map((p) => p.keyMoment).find((m) => m != null && m.trim() !== "") ?? null,
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
  const cast = input.knownCharacters.length > 0 ? input.knownCharacters.join(", ") : "(none known)";

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
  "physics_rules": ["3-8 CONCRETE physics/realism constraints to illustrate scenes of THIS chapter"],
  "key_moment": "the central, VISUAL ACTION or MOMENT of the chapter (one short, non-spoiler sentence): what is HAPPENING that could be illustrated (who does what, where); if the chapter is static/descriptive, leave it empty"
}

RULES:
- "main_objects"/"secondary_objects": ONLY objects/subjects PHYSICALLY PRESENT and visible in the chapter's
  scenes, that you could actually draw there. STRICTLY EXCLUDE objects merely NAMED, REMEMBERED, IMAGINED,
  EXPECTED or used as a METAPHOR/figure of speech but NOT actually present in the scene (e.g. an activity
  cited in a memory — "a friend who did windsurfing" — or an object that is talked about but is not in the
  scene). An object NAMED in the text is NOT enough: it must be there, now, in the drawable scene.
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
  FLASHBACKS / SHOWN MEMORIES: if the chapter NARRATES a SCENE of the past (a flashback, a memory told as a
  scene, a shown dream) in which a character APPEARS and ACTS — you could draw them INSIDE that scene —
  then that character IS PRESENT: INCLUDE them.
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
- Concrete and visual: no abstract emotions, no events/plot, no spoilers. Only what you SEE.
- If a field cannot be determined, use "" (empty string) or [] (empty list). No inventions.
- Write in ${input.language}.

KNOWN CHARACTERS (for matching): ${cast}
BOOK ART DIRECTION (object/detail hints, if any): ${input.directives?.trim() || "(none)"}
CHAPTER TITLE: ${input.chapterTitle?.trim() || "(none)"}
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
    return {
      location: str(j.location),
      environment: str(j.environment),
      mainObjects: strArr(j.main_objects),
      secondaryObjects: strArr(j.secondary_objects),
      characters: strArr(j.characters),
      physicsRules: ruleArr(j.physics_rules),
      keyMoment: str(j.key_moment),
    };
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
