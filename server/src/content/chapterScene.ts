import type { ContentEngine } from "./engine.js";
import type { ChapterMoment, ChapterSceneKind } from "../domain.js";
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
  // La scena PRINCIPALE del capitolo (mai vuota). La sua natura è in `kind`.
  keyMoment: string | null;
  // Natura della scena principale: 'waking' reale, 'dream' onirica, 'flashback' del passato.
  kind: ChapterSceneKind;
  youngerYears: number | null; // solo kind='flashback': anni più giovani dei personaggi
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
    // Natura + anni: dal primo blocco con un keyMoment valido (la scena principale scelta sopra).
    kind: (parts.find((p) => p.keyMoment != null && p.keyMoment.trim() !== "") ?? parts[0]!).kind,
    youngerYears:
      (parts.find((p) => p.keyMoment != null && p.keyMoment.trim() !== "") ?? parts[0]!).youngerYears,
    // Momenti sogno/flashback: unione dedup per keyMoment tra i blocchi (cap a 6).
    altMoments: (() => {
      const seen = new Set<string>();
      const out: ChapterMoment[] = [];
      for (const p of parts) {
        for (const m of p.altMoments) {
          const k = `${m.type}|${(m.keyMoment ?? "").toLowerCase()}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(m);
        }
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
  return ensurePresentFilled(scene);
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
      youngerYears: first!.youngerYears,
      altMoments: rest,
    };
  }

  // 2) Presente compilato che DUPLICA un altMoment sogno/flashback → il presente È quel momento (il
  //    modello l'ha classificato 'waking' per errore): adotta la sua NATURA sul presente (così è reso
  //    come sogno/flashback) e scarta il duplicato. Gli altri momenti restano.
  if (km !== "" && scene.altMoments.length > 0) {
    const kmWords = new Set(norm(km));
    if (kmWords.size > 0) {
      // Parole troppo comuni per essere un "soggetto distintivo" (ricorrono in molte scene).
      const generic = new Set([
        "marco","roberto","sara","mare","acqua","riva","spiaggia","reef","onde","onda","uomo","donna",
        "casa","letto","porta","strada","luce","notte","giorno","scena","corpo","mani","occhi",
      ]);
      const kmDistinct = [...kmWords].filter((w) => w.length > 4 && !generic.has(w));
      let kind = scene.kind;
      let youngerYears = scene.youngerYears;
      const kept: ChapterMoment[] = [];
      for (const m of scene.altMoments) {
        const mw = norm(m.keyMoment ?? "");
        const overlap = mw.length === 0 ? 0 : mw.filter((w) => kmWords.has(w)).length / mw.length;
        // Soggetto distintivo del momento (es. "tartaruga") che compare ANCHE nel presente → stessa scena.
        const subjWords = new Set([...mw, ...norm(m.mainObjects.join(" "))]);
        const sharedSubj = kmDistinct.some((w) => subjWords.has(w));
        if ((overlap > 0.55 || sharedSubj) && kind === "waking") {
          kind = m.type; // il presente assume la natura del momento duplicato (sogno/flashback)
          youngerYears = m.youngerYears;
          continue; // scarta il duplicato
        }
        if (overlap > 0.7) continue; // duplicato puro → scarta
        kept.push(m);
      }
      return { ...scene, kind, youngerYears, altMoments: kept };
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
  const cast =
    input.knownCharacters.length > 0 ? input.knownCharacters.join(", ") : "(none known)";

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
  "key_moment": "the chapter's MAIN drawable scene — the single dominant moment the chapter narrates, the one you would pick as the chapter's image (one short, non-spoiler sentence: who does what, where). ALWAYS fill this: every chapter has a main scene. It stays the main scene EVEN IF, in story terms, the whole chapter takes place in the past (a flashback) or inside a dream — that dominant scene is still the 'present' here, never empty. A dream/memory/flashback goes in alt_moments ONLY when it is SECONDARY: briefly recounted or glimpsed WHILE a DIFFERENT main scene is happening. Example A: Marco sits at a table telling friends about a dream → key_moment = Marco at the table talking (the dream goes in alt_moments). Example B: the chapter takes place entirely in Marco's childhood (a flashback) → key_moment = that childhood scene itself, and alt_moments stays []",
  "kind": "waking | dream | flashback — the NATURE of the MAIN scene in key_moment: 'waking' if it really happens in the story's present; 'dream' if the WHOLE main scene is a dream; 'flashback' if the WHOLE main scene is a past memory/flashback (characters younger). Detect from the text (e.g. 'ho sognato', 'I dreamt' → dream; 'years before', 'as a child', 'remembered' → flashback). Default 'waking'.",
  "younger_years": 0,
  "alt_moments": [{ "type": "dream | flashback", "location": "place/era of this moment (for flashback: the PAST)", "environment": "indoor/outdoor, light, atmosphere of this moment", "main_objects": ["iconic subjects/objects of THIS moment"], "secondary_objects": ["minor objects of this moment"], "characters": ["characters appearing INSIDE this moment"], "physics_rules": ["concrete physics/realism constraints for this moment"], "key_moment": "the VISUAL action of this dream/flashback (one short sentence)", "whose": "name of the character who dreams/relives it (or '')", "younger_years": 0 }]
}

RULES:
- "main_objects"/"secondary_objects": ONLY objects/subjects PHYSICALLY PRESENT and visible in the chapter's
  scenes, that you could actually draw there. STRICTLY EXCLUDE objects merely NAMED, REMEMBERED, IMAGINED,
  EXPECTED or used as a METAPHOR/figure of speech but NOT actually present in the scene (e.g. an activity
  cited in a memory — "a friend who did windsurfing" — or an object that is talked about but is not in the
  scene). An object NAMED in the text is NOT enough: it must be there, now, in the drawable scene.
  HOMONYMS / FIGURATIVE USE — do NOT take a word literally as a physical object when the text uses it as the
  NAME of a technique, move, manoeuvre, exercise, game, dance, recipe, brand, song, place-name or as a
  nickname/figure of speech. The same word can mean a thing OR an action/concept: judge by context. E.g. "fare
  la tartaruga" / "the turtle roll" is a SURF MANOEUVRE, NOT a sea turtle → do NOT add a turtle; "the eagle
  pose" is a yoga position, not a bird; "a butterfly stroke" is swimming, not an insect. Only add the literal
  animal/object when the text clearly means the real physical thing IS in the scene.
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
- "alt_moments" (dreams / memories / flashbacks): add an entry ONLY for a dream/memory/flashback that is
  SECONDARY — embedded inside the chapter while its MAIN scene (key_moment) is something else (a character,
  during the main scene, briefly dreams of / recalls / flashes back to another time). If the chapter has no
  such secondary vision, return [] — never invent one. CRUCIAL: if the chapter's MAIN scene IS itself the
  dream/flashback (the whole chapter takes place in it), that belongs in "key_moment" and you set the top-level
  "kind" accordingly ('dream' or 'flashback') — do NOT move the only scene into alt_moments and never leave
  key_moment empty. Each entry is built like a real scene (its own location/environment/main_objects/
  characters/physics_rules/key_moment). "type": "dream" | "flashback" — there are only TWO: a 'flashback' is a
  real PAST scene (a memory/flashback are the SAME thing), a 'dream' is an oniric/unreal scene. "whose" = the
  character who dreams/relives it (the narrator / POV when first-person).
- YOUNGER YEARS (rejuvenation): for EVERY 'flashback' — both the top-level "younger_years" when kind='flashback'
  AND each flashback in alt_moments — estimate how many years YOUNGER the characters are in that past scene and
  put that NUMBER in younger_years (e.g. a childhood scene of an adult ≈ 30; "ten years ago" ≈ 10). Never leave
  a flashback's younger_years at 0. For 'dream' and 'waking', younger_years is 0. Put a flashback's era/place
  in "location".
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
        const yy = Number(m.younger_years);
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
          youngerYears: Number.isFinite(yy) && yy > 0 ? yy : null,
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
      physicsRules: ruleArr(j.physics_rules),
      keyMoment: str(j.key_moment),
      kind: j.kind === "dream" || j.kind === "flashback" ? j.kind : "waking",
      youngerYears: (() => {
        const y = Number(j.younger_years);
        return Number.isFinite(y) && y > 0 ? y : null;
      })(),
      altMoments: altArr(j.alt_moments),
    };
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}
