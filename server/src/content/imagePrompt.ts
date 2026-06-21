import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";
import type {
  ChapterScene,
  CharacterOutfits,
  BookVisualProps,
  BookVisualExtras,
} from "../domain.js";
import { selectDomainBlocks } from "./imageDomains.js";

// Rivede un prompt-immagine ESISTENTE applicando le MODIFICHE chieste dall'utente in italiano.
// Usato dalla rigenerazione: l'utente scrive cosa cambiare ("togli la persona", "cielo al tramonto",
// "porta rossa più accesa") e l'IA fonde vecchio prompt + modifiche in un nuovo prompt INGLESE,
// mantenendo stile/struttura e i divieti (no testo). Ritorna null se il modello fallisce (→ il
// chiamante ripiega sul vecchio prompt).
export async function reviseScenePrompt(
  engine: ContentEngine,
  input: { oldPrompt: string; changes: string },
): Promise<string | null> {
  const oldPrompt = (input.oldPrompt ?? "").trim();
  const changes = (input.changes ?? "").trim();
  if (oldPrompt === "" || changes === "") return null;

  const prompt = `You revise IMAGE-GENERATION prompts. Below is an existing English image prompt and a list
of CHANGE REQUESTS written in Italian by the user. Apply the requested changes to the prompt and output
ONLY the revised prompt as a single English block — no preamble, no quotes, no explanation, no markdown.
RULES:
- Keep the same overall STYLE and STRUCTURE of the prompt.
- PRESERVE the final style/medium sentence and the "no text / no letters / no signs / no speech bubbles /
  no watermark" constraints; it stays ONE single full-bleed illustration.
- Describe any person ONLY by physical appearance, NEVER by name.
- Apply the user's changes FAITHFULLY: add, remove or alter elements exactly as asked; if they ask to
  remove something, remove it; if they ask to change a colour/light/mood/subject, change it.
- Keep real objects and interiors in their correct, physically plausible configuration and orientation.

EXISTING PROMPT:
${oldPrompt}

CHANGE REQUESTS (Italian — apply these):
${changes}

REVISED PROMPT (English only):`;

  try {
    const raw = await engine.run(prompt);
    const cleaned = (raw ?? "")
      .trim()
      .replace(/^```[a-z]*\n?|\n?```$/gi, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    return cleaned.length >= 12 ? cleaned : null;
  } catch (e) {
    if (e instanceof ContentError) return null;
    throw e;
  }
}

// Costruisce la descrizione SOGGETTO+SCENA (in inglese, una riga) per l'immagine di scena,
// a partire da un estratto del capitolo e dai personaggi reali (col loro aspetto fisico).
// NON include parole di stile ("graphic novel" ecc.): quelle le aggiunge imageGen.buildScenePrompt.
// Best-effort: se il modello non risponde, ritorna un fallback semplice (o null).

export interface SceneCharacter {
  name: string;
  physical?: string | null;
  role?: string | null; // serve a distinguere il protagonista dai personaggi secondari
  outfits?: CharacterOutfits; // abbigliamento canonico (default + per contesto), V19
}

// Override FLASHBACK/ricordo (manuale, per-immagine): marca una generazione come scena del PASSATO,
// scavalcando età e guardaroba canonici (pensati per la coerenza nel presente). I personaggi vengono
// resi più GIOVANI e vestiti per l'epoca/luogo del ricordo, conservando l'IDENTITÀ. Tutti i campi
// opzionali: si attiva quando ne è presente almeno uno.
export interface SceneFlashback {
  youngerYears?: number | null; // di quanti anni più giovani rispetto all'età canonica
  setting?: string | null; // ambientazione/epoca del ricordo (testo libero, es. "spiaggia, gioventù")
  note?: string | null; // nota libera aggiuntiva
}

export interface SceneDescriptionInput {
  chapterExcerpt: string | null;
  chapterTitle?: string | null; // titolo del capitolo: spesso NOMINA il soggetto iconico
  characters: SceneCharacter[];
  bookTitle: string | null;
  angle?: string | null;
  // Scheda visiva del capitolo (V15): grounding affidabile per soggetto/ambiente/personaggi.
  sceneCard?: ChapterScene | null;
  // Configurazione VISIVA per-libro (V17): moduli-dominio attivi (windsurf, porta rossa, …) e
  // direttive d'arte libere. Scoppiano i blocchi specifici per libro invece di applicarli a tutti.
  visualDomains?: readonly string[];
  visualDirectives?: string | null;
  // Oggetti/veicoli ricorrenti canonici + lato di guida (V20).
  visualProps?: BookVisualProps;
  // Personaggi minori/incidentali con un look canonico (V21).
  visualExtras?: BookVisualExtras;
  // Override manuale per scene di FLASHBACK/ricordo: rende i personaggi più giovani e li veste per
  // l'epoca del ricordo, scavalcando età e outfit canonici SOLO per questa immagine. Assente = normale.
  flashback?: SceneFlashback | null;
}

// PHYSICS & REALISM (A1): regole HARD-CODED universali, valide per OGNI immagine di OGNI libro
// (non solo mare). Sono divieti/affermazioni positive che il modello deve rispettare; l'istruzione
// di verifica finale (vedi sotto) chiede di ricontrollare l'immagine contro queste regole. NON
// hardcodare il libro: qui solo fisica/realismo generale.
const PHYSICS_BASELINE = `PHYSICS & REALISM (mandatory, all images):
- GRAVITY & SUPPORT: no human or animal rests ON TOP of the water surface; people stand on solid
  ground or float immersed in the water (body in the water, not on it); aquatic animals (e.g. a
  turtle, a fish, a dolphin) swim IN the water or rest on sand/rock, NEVER perched on top of the
  water; when an aquatic animal surfaces to breathe, only the top of its shell/back and its head may
  break the surface, while its flippers, fins and limbs stay SUBMERGED — never spread up in the air
  above the waterline; every object or vehicle sits on a plausible supporting surface, none floating
  in mid-air.
- WATER & WAVES: waves advance and break TOWARD the shore (crests and foam roll landward), never
  back out to sea; the water surface and the horizon are level and flat-lying, not tilted or domed.
- WIND & MOTION: sailing, windsurfing, surfing or kiting require COHERENT wind and waves — no
  planing or surfing on a flat mirror-calm sea; sails, hair, flags and spray agree on one wind.
- LIGHT & SHADOW: a single coherent light source; all shadows fall in agreement with it; reflections
  and highlights are physically plausible.
- SCALE: realistic proportions between people, animals, objects and the setting.`;

// Combina la baseline universale (A1) con le regole di fisica/realismo SPECIFICHE del capitolo
// estratte nella scheda (A4). Ritorna sempre almeno la baseline; aggiunge il blocco capitolo solo
// se presente. Usato sia nel prompt sia per costruire l'istruzione di verifica finale.
function physicsBlock(card: ChapterScene | null | undefined): string {
  const rules = (card?.physicsRules ?? []).map((r) => r.trim()).filter((r) => r.length > 0);
  if (rules.length === 0) return PHYSICS_BASELINE;
  const lines = rules.map((r) => `- ${r}`).join("\n");
  return `${PHYSICS_BASELINE}
CHAPTER PHYSICS/REALISM RULES (must hold, specific to this chapter):
${lines}`;
}

// Blocco di GROUNDING dalla scheda capitolo: dà al modello luogo, soggetti iconici e personaggi
// presenti già estratti, invece di farli dedurre dal grezzo. Vuoto se la scheda è assente.
function sceneCardBlock(card: ChapterScene | null | undefined): string {
  if (!card) return "";
  const lines: string[] = [];
  if (card.location) lines.push(`- Location: ${card.location}`);
  if (card.environment)
    lines.push(`- Environment (drives lighting AND clothing): ${card.environment}`);
  if (card.mainObjects.length > 0)
    lines.push(
      `- Main visual subjects to CHOOSE FROM (pick the ONE iconic subject that fits this image): ${card.mainObjects.join(", ")}`,
    );
  if (card.secondaryObjects.length > 0)
    lines.push(
      `- Secondary objects to CHOOSE FROM (add only a couple if they fit): ${card.secondaryObjects.join(", ")}`,
    );
  if (card.characters.length > 0)
    lines.push(
      `- Characters present in the chapter to CHOOSE FROM (feature only the one or two that fit this image): ${card.characters.join(", ")}`,
    );
  if (lines.length === 0) return "";
  return `SCENE CARD (reliable grounding for THIS chapter — trust it for subject, setting and clothing).
These lists are a POOL of options for the chapter, NOT a checklist: a chapter may have many characters
and objects, but ONE image must stay simple — SELECT only what serves the single moment/scene you choose
to depict, and LEAVE OUT the rest. Never cram every character or object into one picture.
${lines.join("\n")}`;
}

// "Haystack" per decidere quali moduli-dominio sono pertinenti al capitolo: la SCHEDA visiva
// (luogo + ambiente + oggetti) se presente — fonte affidabile di ciò che è FISICAMENTE in scena —
// altrimenti, come fallback, il testo del capitolo. Niente personaggi (i domini riguardano scena/oggetti).
function domainHaystack(card: ChapterScene | null | undefined, passage: string): string {
  if (card) {
    return [
      card.location ?? "",
      card.environment ?? "",
      ...card.mainObjects,
      ...card.secondaryObjects,
    ]
      .join(" ")
      .toLowerCase();
  }
  return passage.toLowerCase();
}

// Blocco DIRETTIVE D'ARTE per-libro (V17): testo libero scritto dall'utente per QUESTO libro
// (es. dettagli ricorrenti, palette, luoghi). Vuoto se assente.
function directivesBlock(directives: string | null | undefined): string {
  const d = (directives ?? "").trim();
  if (d === "") return "";
  return `BOOK ART DIRECTION (specific to THIS book — follow it whenever relevant to the scene):
${d}`;
}

// Risolve l'ABITO da usare per un personaggio in questa scena: il primo abito-per-contesto le cui
// keyword combaciano con l'haystack (scheda del capitolo), altrimenti l'abito di default, altrimenti
// null (→ il modello veste secondo la logica generale). Così "stessa scena → stesso vestito".
function resolveOutfit(outfits: CharacterOutfits | undefined, haystack: string): string | null {
  if (!outfits) return null;
  for (const ctx of outfits.contexts) {
    const kws = ctx.when
      .toLowerCase()
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (kws.some((k) => haystack.includes(k))) return ctx.outfit;
  }
  return outfits.default ?? null;
}

// Blocco OGGETTI RICORRENTI + MONDO (V20): inietta gli oggetti/veicoli canonici pertinenti alla scena
// (match keyword sulla scheda, o proprietario presente in scena) e il LATO DI GUIDA quando la scena
// coinvolge auto/strade. Tutto da rendere IDENTICO tra le immagini.
function propsBlock(vp: BookVisualProps | undefined, haystack: string, names: string[]): string {
  if (!vp) return "";
  const nameSet = new Set(names.map((n) => n.toLowerCase()));
  const lines: string[] = [];
  for (const p of vp.props) {
    const kws = p.when
      .toLowerCase()
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const matchWhen = kws.some((k) => haystack.includes(k));
    const matchOwner = p.owner != null && nameSet.has(p.owner.toLowerCase());
    if (matchWhen || matchOwner) {
      lines.push(
        `- ${p.name}: ALWAYS render it as ${p.description}${p.owner ? ` (belongs to ${p.owner})` : ""}.`,
      );
    }
  }
  const carCtx =
    /auto|macchin|\bcar\b|strada|\broad\b|guida|volante|vialetto|parcheggi|traffic/.test(
      haystack,
    ) || lines.length > 0;
  if (vp.drivingSide && carCtx) {
    const side = vp.drivingSide;
    const wheel = side === "right" ? "left" : "right";
    lines.push(
      `- DRIVING SIDE: in this country (${vp.country ?? "the setting"}) vehicles drive on the ${side}; ` +
        `the steering wheel is on the ${wheel} side; keep traffic flow, parked cars and the driver's seat ` +
        `consistent with driving on the ${side}.`,
    );
  }
  if (lines.length === 0) return "";
  return `RECURRING OBJECTS & WORLD (canonical — render these EXACTLY and keep them IDENTICAL across images):
${lines.join("\n")}`;
}

// Blocco PERSONAGGI MINORI/incidentali canonici (V21): inietta le figure secondarie pertinenti alla
// scena (match keyword `when` sull'haystack della scheda) col loro aspetto FISSO, da rendere IDENTICO
// ogni volta che la scena torna. Vuoto se nessuna combacia.
function extrasBlock(extras: BookVisualExtras | undefined, haystack: string): string {
  if (!extras) return "";
  const lines: string[] = [];
  for (const m of extras.minors) {
    const kws = m.when
      .toLowerCase()
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (kws.some((k) => haystack.includes(k))) {
      lines.push(
        `- ${m.label}: an incidental character — ${m.appearance}${m.outfit ? `; wears ${m.outfit}` : ""}. Keep this character's look IDENTICAL whenever this scene recurs.`,
      );
    }
  }
  if (lines.length === 0) return "";
  return `INCIDENTAL CHARACTERS (canonical — keep identical across images):
${lines.join("\n")}`;
}

// Descrive l'INTERO cast (protagonista + secondari) col loro aspetto, così il modello può riconoscere
// CHI compare nel passaggio e renderlo — non solo il protagonista. I nomi servono SOLO al modello per
// il match col testo: nell'immagine i personaggi vanno resi per aspetto, mai col nome scritto.
// Per ogni personaggio aggiunge anche l'ABITO risolto per QUESTA scena (coerenza vestiti).
// `suppressOutfits`: in scene di flashback NON iniettiamo l'outfit canonico (presente), così la
// WARDROBE CONSISTENCY non forza i vestiti di oggi: a vestire ci pensa il blocco flashback (epoca).
function castBlock(chars: SceneCharacter[], haystack: string, suppressOutfits = false): string {
  if (chars.length === 0) return "(no named characters)";
  const fmt = (c: SceneCharacter) => {
    const p = (c.physical ?? "").trim();
    const outfit = suppressOutfits ? null : resolveOutfit(c.outfits, haystack);
    const outfitPart = outfit ? `; wears: ${outfit}` : "";
    if (!p) return outfit ? `${c.name} (wears: ${outfit})` : c.name;
    // Aspetto CANONICO completo (cap alto a 300): la coerenza richiede la descrizione intera, non un
    // estratto. Il cap evita solo casi patologici di descrizioni enormi.
    const short = p.length > 300 ? `${p.slice(0, 300).trimEnd()}…` : p;
    return `${c.name} (${short}${outfitPart})`;
  };
  // Protagonista = primo con ruolo esplicito (protagonista/principale/main), altrimenti il primo per sort_order.
  const protagIdx = chars.findIndex((c) => /protagon|principale|\bmain\b/i.test(c.role ?? ""));
  const pIdx = protagIdx >= 0 ? protagIdx : 0;
  // Fino a 10 secondari (ordinati per sort_order = importanza): copre i personaggi rilevanti senza
  // includere ogni comparsa. Il modello userà solo quelli realmente presenti nel passaggio.
  const others = chars.filter((_, i) => i !== pIdx).slice(0, 10);
  const lines = [`Protagonist — ${fmt(chars[pIdx]!)}.`];
  if (others.length > 0) lines.push(`Other characters — ${others.map(fmt).join("; ")}.`);
  return lines.join("\n");
}

// Risultato: descrizione (soggetto+scena) + tag (soggetti/mood per la catalogazione).
export interface SceneDescription {
  description: string;
  tags: string[];
}

// Blocco FLASHBACK/RICORDO (override manuale): quando una generazione è marcata come scena del
// passato, questo blocco SCAVALCA esplicitamente la regola dell'ETÀ e la WARDROBE CONSISTENCY — rende
// ogni personaggio del CAST più giovane (mantenendo l'identità) e lo veste per l'epoca/luogo del
// ricordo. Va posto DOPO il cast nel prompt (override esplicito, scoped). Vuoto se nessun flashback.
function flashbackBlock(fb: SceneFlashback | null | undefined): string {
  if (!fb) return "";
  const years =
    typeof fb.youngerYears === "number" && fb.youngerYears > 0
      ? `about ${Math.round(fb.youngerYears)} years`
      : "clearly";
  const setting = (fb.setting ?? "").trim();
  const note = (fb.note ?? "").trim();
  return `FLASHBACK / MEMORY OVERRIDE (this image only — it OVERRIDES the AGE rule and the WARDROBE CONSISTENCY rule above): this scene is a MEMORY set in the PAST. Render EVERY named character from the CAST ${years} YOUNGER than the age stated in their description — a more youthful face, smoother skin and a younger build — while keeping their IDENTITY unmistakable: SAME hair colour, SAME eye colour, SAME face structure and proportions, clearly the same person at a younger age. Do NOT dress them in their canonical present-day outfit; instead dress them for the time and place of this memory${setting ? `: ${setting}` : ""}, in clothes that fit the activity and era.${note ? ` ${note}` : ""}`;
}

// Fallback deterministico se il modello non è disponibile: immagine ATMOSFERICA (no persona),
// utilizzabile come sfondo per una citazione.
function fallbackScene(input: SceneDescriptionInput): SceneDescription | null {
  if (!input.bookTitle && input.characters.length === 0 && !input.chapterExcerpt) return null;
  return {
    description:
      "an empty path leading toward distant light at dawn, soft mist, long shadows, quiet evocative atmosphere, no people",
    tags: ["path", "light", "dawn", "atmosphere"],
  };
}

export async function buildSceneDescription(
  engine: ContentEngine,
  input: SceneDescriptionInput,
): Promise<SceneDescription | null> {
  // Tutto il capitolo (cap di sicurezza alto per capitoli enormi): GPT sceglie QUALE scena illustrare.
  const passage = (input.chapterExcerpt ?? "").trim().slice(0, 20000);
  if (passage === "" && input.characters.length === 0 && !input.bookTitle) return null;
  // Haystack della scena (scheda o testo) = base per selezione moduli E risoluzione abiti per contesto.
  const haystack = domainHaystack(input.sceneCard, passage);
  const flashback = flashbackBlock(input.flashback);
  // In flashback NON iniettiamo gli outfit canonici (presente): a vestire ci pensa il blocco flashback.
  const cast = castBlock(input.characters, haystack, !!input.flashback);
  const card = sceneCardBlock(input.sceneCard);
  const physics = physicsBlock(input.sceneCard);
  // Moduli-dominio per-libro (V17), pertinenti alla scena del capitolo, + direttive d'arte del libro.
  const domainBlocks = selectDomainBlocks({
    enabled: input.visualDomains ?? [],
    haystack,
  }).join("\n");
  const props = propsBlock(
    input.visualProps,
    haystack,
    input.characters.map((c) => c.name),
  );
  const extras = extrasBlock(input.visualExtras, haystack);
  const directives = directivesBlock(input.visualDirectives);

  const prompt = `You write IMAGE PROMPTS for an AI image model that wants a DETAILED, flowing
NATURAL-LANGUAGE description (full sentences), NOT a list of comma-separated tags. From the book passage,
output ONE rich English paragraph of about 80–120 words describing an EVOCATIVE, ATMOSPHERIC image that
captures the MOOD and THEME of the moment. The image is a BACKGROUND behind a quote (text will be placed
on top), so it must be emotional, cinematic and UNCLUTTERED. Favour mood over busy literal narration —
but you MAY depict the chapter's KEY MOMENT or central ACTION when that action is what the chapter turns
on (a person doing the pivotal activity of the scene): an event in the MIDDLE of the book is NOT a spoiler,
so do not shy away from it; just keep it evocative, not a cluttered literal illustration.
SUBJECT (CRUCIAL): identify the SINGLE most ICONIC, concrete, VISUAL focal point of the passage and make
IT the clear focal subject — an animal, a striking object, a vehicle, a building, a memorable place, OR
the central ACTION/moment itself when the chapter hinges on an event. The focal subject MUST be present
and recognizable — do NOT replace it with a generic mood or an empty landscape. Name it explicitly. The
CHAPTER TITLE and the SCENE CARD below very often NAME this subject: trust them and feature it.
THEN wrap it in ATMOSPHERE: evocative light and shadow, time of day, weather, setting; convey a clear
feeling (hope, melancholy, tension, calm, a turning point). Cinematic and uncluttered.
SAFE & PUBLISHABLE (these are public social-media backgrounds): NEVER depict graphic violence, blood,
open wounds, a corpse or dead body, death or gore, even when the passage describes such things.
Convey danger, fear, dread or tragedy through ATMOSPHERE ONLY — dark restless water, a heavy threatening
sky, looming shadow, an ominous empty space, tense light — never through a body or graphic detail.
INTIMACY (tasteful, NON-EXPLICIT only): romantic and sensual moments MAY be depicted when the passage calls
for them — a couple kissing or embracing, two people lying together in bed under the covers with only heads
and bare shoulders showing, a figure in lingerie or underwear (or a man in boxers), bare backs and bare
shoulders, a tender or sensual mood. But it MUST stay non-explicit and publishable on social media: NEVER
show genitals, NEVER show female nipples — a woman's breasts are ALWAYS covered or hidden (by sheets, an
arm, hair, the lingerie itself, shadow, or the framing: cropped out, seen from behind, or side-on). NO
sexual acts, NO penetration, NO explicit or pornographic poses, NO intercourse — only the elegant, IMPLIED
suggestion of intimacy. NEVER depict anyone who is not clearly an adult in any intimate or suggestive way.
GROUNDING: place every element in its correct, physically plausible place (objects ON the ground,
vehicles on their surface), with ONE clear horizon line and a coherent perspective.
${physics}
REAL-WORLD CONFIGURATION: render familiar real objects, interiors and man-made structures in their
CORRECT, conventional arrangement and ORIENTATION — furniture, seats, fixtures, doors, windows and
architectural elements sit and face the way they actually do in reality. Do NOT rotate, mirror or
rearrange them just to fit more of them into the frame, and keep one coherent, physically consistent
space.
${domainBlocks}
${props}
EXTRAS & CROWDS: render background and incidental people (a film crew, passers-by, a group, other beachgoers) with NATURAL VARIETY — different hair colours and styles, heights, builds, ages and skin tones, never a row of identical clones — and dress them appropriately for the place and activity (a film crew in casual production clothes with lanyards/headphones/cables; beachgoers in swimwear; city people in everyday urban clothes). They are ordinary varied people, not uniformed unless the setting truly requires it.
${extras}
PEOPLE: a scene with NO person (just the iconic subject/place) is ALLOWED, but it is NOT preferable a
priori — do not default to an empty landscape when the passage actually has people in it. When the
passage revolves around one or more CHARACTERS, FEATURE them — but ONLY characters who actually appear
in THIS passage. It does NOT have to be the protagonist: a SECONDARY character ALONE is an excellent
subject when the passage is about them, and two characters together is fine when the passage puts them
in the same moment. Render any person faithfully from the CAST below (build, hair, face — for what they
WEAR see CLOTHING) and have them INTERACT with the iconic subject (touching it, looking toward it,
moving toward it, using it). One or two figures AT MOST; keep it natural and uncluttered; avoid a posed
studio portrait or a face staring straight at the camera. If a COMPOSITION DIRECTIVE is given below, it
DECIDES who (if anyone) appears AND from what angle — FOLLOW IT: if it asks for a character who IS
present in this passage, you MUST feature that character; fall back to the iconic subject/place ALONE
with no person ONLY if NO named character from the CAST appears anywhere in this chapter.
CLOTHING (VARY it — never default to one fixed outfit): dress every person for the SETTING and ACTIVITY
of THIS passage, consistent within the scene. By the sea / swimming / on the beach of a warm seaside town
→ swimwear, or a lycra rash-guard and boardshorts when surfing or windsurfing, or a light t-shirt and
shorts. In a city, at work, a formal or public moment, indoors in the evening, or a cold place → longer
clothes: shirt and trousers, a jacket or coat. Meditation, yoga, reiki, prayer, exercising or sitting on a
practice/yoga mat, sleeping or resting at home → name CONCRETE modern casual clothes (e.g. a plain t-shirt
with soft joggers or leggings), comfortable and NOT formal wear; and NEVER a martial-arts GI, a karate/
judo/taekwondo uniform, a belt (obi), a dojo robe, a kimono or a monk's robe — a person on a practice/yoga
mat is an ORDINARY modern person in everyday clothes, not a martial artist or a monk. Do NOT use the vague
phrase "practice clothes": always name the actual modern garments. The CAST notes may mention a HABITUAL garment
(e.g. "often wears red shirts", "elegant suits", a signature hat) — treat it as a FAINT identity hint,
NOT a mandatory costume: use it only where the scene genuinely fits, otherwise dress the character for
what they are actually DOING here.
WARDROBE CONSISTENCY: when a character in the CAST below has a "wears:" outfit noted next to them, dress
THAT character EXACTLY in that outfit — it is their canonical look for this scene and must stay IDENTICAL
every time the same scene/context recurs. This overrides the general clothing guidance above for that
character. Characters WITHOUT a noted outfit follow the general CLOTHING rules.
DYNAMIC POSE: people must NOT look stiff or standing at attention. Give a natural, ALIVE pose with
implied motion — head turned or tilted, arms doing something (reaching, shielding eyes, holding gear,
mid-stride, leaning into the wind, crouching, sitting) — appropriate to the moment. A body in action or
mid-gesture, never a static frontal mannequin.
KEEP IT SIMPLE: one clear setting, few elements (diffusion models ruin busy scenes); leave calm space
for the text. Use the book's overall theme/title as mood guidance: ${input.bookTitle ?? "(book)"}.
RULES: NO style words (do NOT write "graphic novel", "illustration", "comic", "art"); NO quotes.
NO TEXT IN THE IMAGE: never request letters, words, writing, signs, labels, captions, SPEECH BUBBLES
or comic panels, phone/computer SCREENS showing text, notes or letters with visible writing, or tattoos
with words. It is ONE single full-bleed illustration — no panels, no balloons, no lettering. If such an
object is essential to the scene, render its screen/paper BLANK or turned away.
PEOPLE BY APPEARANCE: describe any person ONLY by physical appearance (build, hair, clothing, posture) —
NEVER by name (names end up rendered as written text in the image).
CHARACTER CONSISTENCY: keep each recurring character's CORE physical features — apparent age, build, hair
colour and style, face — the SAME and clearly recognisable in EVERY image, exactly as the CAST describes.
HAIR: render each character's hair EXACTLY as the CAST states — the same COLOUR and the same cut in every
image; NEVER lighten it, grey it, darken it, recolour it or restyle it on your own. If the CAST says black
hair it is BLACK every time; if it says blonde it is blonde every time. AGE: render each character at the
apparent age stated — neither younger nor markedly older (someone described as about 50 must NOT look 70).
Do NOT drift, restyle or exaggerate their look from one image to the next (especially the protagonist):
their face and build stay constant; only clothing and pose change with the scene.
RELATIVE SCALE: when two or more people share the frame, respect their RELATIVE heights and builds as given
in the CAST (e.g. a person stated as 1.60 m is clearly shorter than one at 1.85 m; a slim build is not drawn
as heavy). Keep human-to-human and human-to-object proportions realistic and consistent.
COLOR: if the iconic object has a signature COLOUR from the book, render the WHOLE object in THAT one
colour — INCLUDING its parts (handle, frame, hardware, panels). Do NOT invent a second colour, a
two-tone object or contrasting hardware (no "red-and-white door", no "white handle") unless the book
explicitly says so.
Concrete and visual.
ORDER (write the paragraph in THIS sequence — it is how the image model reads best):
1) the SHOT / framing (take it from the COMPOSITION DIRECTIVE: e.g. wide shot, close-up, three-quarter
   view, from behind); 2) the main SUBJECT (the iconic element), and if a person is present describe them
   by physical appearance; 3) what they are DOING and their pose; 4) their CLOTHING; 5) the SETTING and
   where each element sits (grounding, horizon); 6) the LIGHTING — time of day and quality of light, be
   specific (this model responds strongly to light); 7) the overall MOOD.
Write FLOWING SENTENCES in that order, not a tag list. Do NOT add style/medium words ("illustration",
"graphic novel", "comic", "art", "photo"): the visual style is appended afterwards, you only describe the
scene.
FINAL CHECK (do this before writing): re-read your description against the PHYSICS & REALISM rules and
the CHAPTER PHYSICS/REALISM RULES above — none of them may be violated. If any element breaks a rule
(a body resting on the water, a wave breaking out to sea, a sail without a rider, contradictory shadows,
an object floating with no support, wrong scale), rewrite that element so it complies. Do NOT output this
check or any reasoning — output ONLY the two lines below.
OUTPUT FORMAT — exactly TWO lines:
Line 1: the image description paragraph (~80–120 words, following the ORDER above).
Line 2: "TAGS: " followed by 3 to 6 short lowercase keywords (the main subject, the place, the mood),
comma-separated.

CHAPTER TITLE (strong hint for the iconic subject): ${input.chapterTitle?.trim() || "(none)"}
${card}
${directives}
CAST (the book's characters with their appearance — use the NAMES only to recognise who the passage is
about; in the IMAGE render them by appearance, NEVER write their name; feature ONLY those present in the
passage):
${cast}
${flashback}
${input.angle ? `COMPOSITION DIRECTIVE (follow this): ${input.angle}` : ""}
FULL CHAPTER TEXT (it may contain SEVERAL moments — CHOOSE the SINGLE moment that best fits the
COMPOSITION DIRECTIVE and the SCENE CARD, and depict only that one; find its iconic subject and mood here):
${passage || input.bookTitle || ""}`;

  try {
    const raw = await engine.run(prompt);
    const lines = (raw ?? "")
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // La riga TAGS (ovunque sia) → tag; TUTTE le altre righe → descrizione (il paragrafo lungo può
    // andare a capo su più righe: le uniamo, così non si perde testo).
    const tagLine = lines.find((l) => /^tags\s*:/i.test(l));
    const descLines = lines.filter((l) => !/^tags\s*:/i.test(l));
    const cleaned = descLines
      .join(" ")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    const tags = tagLine
      ? tagLine
          .replace(/^tags\s*:/i, "")
          .split(",")
          .map((t) =>
            t
              .trim()
              .toLowerCase()
              .replace(/[."'`]+$/g, ""),
          )
          .filter((t) => t.length > 0 && t.length <= 30)
          .slice(0, 6)
      : [];
    if (cleaned.length >= 8) return { description: cleaned, tags };
    return fallbackScene(input);
  } catch (e) {
    if (e instanceof ContentError) return fallbackScene(input);
    throw e;
  }
}
