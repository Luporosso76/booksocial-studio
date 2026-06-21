// MODULI-DOMINIO del prompt immagine, SCOPPIATI per libro.
// Storicamente questi blocchi (windsurf, porta-rossa simbolica, pratica spirituale, set
// cinematografico, veicoli/luoghi) erano hardcodati nel prompt e applicati a OGNI libro: bastava che
// un capitolo NOMINASSE il windsurf perché il modello sfornasse un windsurf, anche in un libro che col
// mare non c'entra nulla. Ora ogni blocco è un MODULO attivabile per-libro (book.visualDomains) e
// incluso SOLO se è davvero pertinente alla scena del capitolo (match keyword sulla scheda visiva).
// Così: il libro del mare riceve le regole windsurf solo nei capitoli che mostrano davvero il windsurf;
// il libro della porta rossa riceve la porta solo dove la porta c'è; e i due non si contaminano.

export interface VisualDomain {
  key: string;
  label: string; // etichetta per la UI
  description: string; // descrizione per la UI
  // Keyword (minuscole) cercate nella scheda visiva del capitolo (luogo + ambiente + oggetti) per
  // decidere se il modulo è PERTINENTE a quella scena. In italiano e inglese (le schede sono in lingua libro).
  triggers: string[];
  block: string; // testo iniettato nel prompt immagine
}

export const VISUAL_DOMAINS: readonly VisualDomain[] = [
  {
    key: "sea_windsurf",
    label: "Mare / windsurf / surf",
    description:
      "Regole per spiaggia, mare, onde e attrezzatura da windsurf/surf/kite: geometria della vela, postura del rider, posizione delle onde. Attive solo nei capitoli che mostrano davvero queste cose.",
    triggers: [
      "windsurf",
      "surf",
      "surfboard",
      "kite",
      "kitesurf",
      "vela",
      "sail",
      "boma",
      "boom",
      "rig",
      "tavola",
      "board",
      "onda",
      "onde",
      "wave",
      "waves",
      "mare",
      "sea",
      "ocean",
      "oceano",
      "spiaggia",
      "beach",
      "surfista",
      "rider",
    ],
    block: `EQUIPMENT (windsurf, surfboard, kite, sail): ON THE WATER a rigged sail NEVER stands by itself — it
requires a rider on the board with BOTH HANDS ON THE BOOM (the horizontal bar). Do NOT leave such gear
vague (e.g. "a windsurf center"): the image model will invent an upright sail with no boom and no rider.
So EITHER show the rider actively sailing (see WINDSURF SAILING POSTURE below), OR show the gear AT REST
ON LAND/BEACH — any of these is fine, the sail does NOT have to lean on the board: a board lying FLAT on
the sand with the SAIL/RIG DETACHED and lying separately; a fully rigged sail STANDING UPRIGHT on the
beach (rig set up on the sand, mast roughly VERTICAL / perpendicular to the ground); or the rig leaning
against the board. A standing rig is allowed ONLY on land — NEVER an unmanned upright sail standing ON THE
WATER, and never a board riding a wave by itself (no "ghost" riders). THE BOOM must ALWAYS be drawn
COMPLETE and in its CORRECT shape: one elongated closed loop (oval) fixed to the mast at the front and
meeting again behind the sail — never broken, halved or malformed, and never a sail without its boom.
WINDSURF SAILING POSTURE (ONLY when a windsurfer is actively sailing — get the GEOMETRY right, these images
keep getting it wrong): show the rider PLANING across OPEN WATER, board flat with a spray wake behind it —
NOT wading or launching in the shallows. The RIG leans FORWARD: the MAST is raked toward the NOSE of the
board (mast base forward) with the sail extending forward over the front of the board — NEVER a vertical
mast, and NEVER a mast leaning back toward the rider's body. The rider stands on the WINDWARD side while the
SAIL fills with wind and bellies out on the FAR (leeward) side, away from the body. BOTH HANDS grip the boom
(the horizontal bar) on the rider's side near the FRONT of the rig, arms fairly EXTENDED: the FRONT (mast)
hand grips the boom CLOSE TO THE MAST (just behind where boom meets mast), and the BACK hand grips the boom
only a shoulder-to-arm's width behind it, roughly level with the MIDDLE of the sail — NEVER both hands far
back near the tail of the boom (a rider cannot control a windsurf rig with the hands placed back there).
The rider leans OUT and BACK as a COUNTERWEIGHT against the sail's pull, hips toward
the rig, hooked into the harness, body low, back leg bent. Feet near the rail in the FOOTSTRAPS: FRONT foot
angled forward toward the nose (~45°), BACK foot more ACROSS the board. The rider's HEAD and GAZE face
FORWARD in the board's DIRECTION OF TRAVEL (where the rider is going) — NEVER turned toward the sail, and
not down at the board.
BOARD HARDWARE: a windsurf or surf board has its FIN(S) UNDERNEATH at the TAIL (the rear end of the board),
never at the front; on a windsurf board the MAST BASE sits about THREE-QUARTERS of the way from the tail
toward the nose (in the forward part of the board, well ahead of the fins), never at the tail.
FRAMING (hands are hard to render): PREFER an OVER-THE-SHOULDER or FROM-BEHIND view with the rider's BACK
toward the camera, so the arms reaching to the boom read naturally and the grip is not a fragile close-up;
AVOID a front three-quarter close-up that puts both hands and the grip in sharp foreground focus. Whatever
the view, ALWAYS state BOTH hand positions explicitly in the description (front hand near the mast, back
hand near the middle of the sail).
WAVE LOCATION (surfing/riding a wave): a wave is ridden OUT AT SEA over the reef / outer break, with the
beach DISTANT in the background — NEVER a rider surfing a wave right at the shore, because the shorebreak
closes out onto the sand. Keep any wave-riding action well offshore.`,
  },
  {
    key: "red_door",
    label: "Porta rossa / soglia simbolica",
    description:
      "La porta rossa ricorrente con design FISSO e sempre identico (lastra rossa Ferrari liscia, una maniglia bianca in legno, niente pannelli né buco serratura, sola in una radura). Attiva solo nei capitoli in cui la porta è davvero presente.",
    triggers: [
      "porta",
      "door",
      "soglia",
      "threshold",
      "doorway",
      "portale",
      "portal",
      "sogno",
      "dream",
      "vuoto",
      "void",
      "onirico",
      "radura",
    ],
    block: `SYMBOLIC RED DOOR / DREAM SCENE (WHEN the scene is the symbolic red door, a void or a dream): keep it
CLEAN and evocative, one clear simple subject, no clutter and no text. This is ONE specific door that
RECURS again and again throughout the book: it must look the SAME every single time — do NOT reinvent,
restyle or vary it between images. THE RED DOOR HAS A FIXED, ALWAYS-IDENTICAL DESIGN — render it EXACTLY
the same in every image:
- a SOLITARY door standing upright ALONE at the centre of a circular forest clearing with low grass and
  dense tall trees all around; there is NO building, NO wall and NO surrounding frame — just the door
  standing on its own.
- standard door proportions: a plain UPRIGHT RECTANGLE of normal door height (about 2.1 m tall, ~0.9 m wide).
- the whole door is a SMOOTH, FLAT slab — NO panels, NO inset rectangles, NO mouldings, NO glass, NO window.
- colour: a bright, vivid FERRARI RED, uniform across the ENTIRE slab and its edges (one single red).
- exactly ONE handle: a simple WHITE WOODEN handle on the RIGHT side at MID-HEIGHT (about hip height), always
  the same shape, size and position. This handle is the ONLY white element. There is NO keyhole, NO lock, NO
  visible hinges, NO other hardware.
- keep the rectangle proportions, the flat panel-less surface and the handle's position IDENTICAL across all
  scenes — never add panels, never move, resize or duplicate the handle, never change the shape.
This DESIGN OVERRIDES any other description: if the SCENE CARD, the chapter title or the text calls the door
"red and white", "with white panels/frame", or places the handle differently, FOLLOW THIS canonical design
instead (red flat slab, no panels, one white wooden handle on the right at mid-height, no keyhole). The
background is a black, STARLESS night sky — NO stars, NO moon, NO constellations, NEVER a starry sky — or a
shaft of pale light cutting through dark fog. For any OTHER dreamlike or void scene (not the door), keep ONE
iconic element floating in mist or light, uncluttered.`,
  },
  {
    key: "spiritual_practice",
    label: "Pratica spirituale (meditazione/reiki/yoga)",
    description:
      "Resa veritiera di meditazione, reiki, yoga, preghiera. Attiva solo nei capitoli in cui la pratica avviene davvero.",
    triggers: [
      "medit",
      "meditazione",
      "meditation",
      "reiki",
      "yoga",
      "preghiera",
      "pray",
      "prayer",
      "mantra",
      "spirit",
      "guarigione",
      "healing",
      "tappetino",
      "olistic",
      "mindfulness",
      "consapevolezza",
      "zen",
      "chakra",
    ],
    block: `SPIRITUAL PRACTICE (WHEN the scene involves meditation, reiki, yoga or prayer): render the practice
TRUTHFULLY in a calm, serene mood with warm soft light. Meditation → a person seated cross-legged on a
mat, spine upright, hands resting on the knees or in the lap, eyes closed, relaxed (NOT a stiff or
strained pose). Reiki → a practitioner's hands hovering just above, or resting lightly on, a person lying
on a treatment table in a calm white room with candles or incense — it is NOT medical and NOT a massage.
Yoga → anatomically correct, balanced poses. Prayer → a quiet reverent posture.
PRACTICE CLOTHING (this OVERRIDES any elegant/formal habitual wardrobe noted in the CAST): dress EVERYONE
in MODERN, everyday comfortable clothes suited to the activity — yoga: fitted activewear (leggings and a
fitted top or tank); meditation: soft loose trousers and a simple t-shirt or light sweater; reiki: relaxed
casual clothes (e.g. a t-shirt and soft trousers); prayer: modest everyday comfortable clothes. NEVER a
suit, blazer, shirt-and-tie, dress or any elegant/formal outfit; and NEVER a MARTIAL-ARTS GI or
karate/judo/taekwondo uniform, NO belt (obi), NO dojo robe, kimono, monk's or priest's robe, NO uniform or
costume of any kind. These are ORDINARY modern people in ordinary casual clothes — NOT martial artists,
monks or clerics — even if the scene is meditative or "Eastern" in mood.`,
  },
  {
    key: "film_set",
    label: "Set cinematografico",
    description:
      "Resa di un set cinematografico reale (telecamere, luci, troupe, ciak). Attiva solo nei capitoli ambientati su un set.",
    triggers: [
      "film",
      "cinema",
      "ciak",
      "clapperboard",
      "troupe",
      "set cinematografico",
      "movie set",
      "regista",
    ],
    block: `FILM SET (WHEN the scene is on a film or cinema set): show a REAL working set — cameras, lights and
softboxes, crew, a clapperboard (blank, no text), cables, and monitors with blank screens; an actor may
hold a script with BLANK pages. NEVER render it as a generic office or meeting room.`,
  },
  {
    key: "vehicles_places",
    label: "Veicoli e luoghi (auto/ospedale/casa)",
    description:
      "Resa plausibile di auto su strade di lago/montagna, stanze d'ospedale, scene domestiche quiete. Attiva solo nei capitoli pertinenti.",
    triggers: [
      "auto",
      "automobile",
      "macchina",
      "car",
      "strada",
      "road",
      "ospedale",
      "hospital",
      "lago",
      "lake",
      "clinica",
      "reparto",
      "ward",
    ],
    block: `VEHICLES & PLACES (WHEN the scene involves a lakeside road, a hospital or a quiet home): a car sits or
drives PLAUSIBLY on a lakeside mountain road or in a parking area — a parked car rests on its wheels on
the ground, with the lake and mountains coherent under ONE horizon. A hospital room reads as a plausible
ward (a bed, soft light). A depressed or quiet domestic scene conveys its mood through light and emptiness,
NOT through clutter.`,
  },
];

// Restituisce i blocchi-dominio da iniettare nel prompt, in ordine di registry. Regole:
//   - se `enabled` è NON vuoto → si considerano solo i moduli abilitati per il libro;
//   - se `enabled` è vuoto (libro non configurato) → si considerano TUTTI i moduli (retrocompat),
//     comunque filtrati per pertinenza;
//   - un modulo è incluso solo se almeno una delle sue keyword compare nell'`haystack` (scheda visiva
//     del capitolo, o testo del capitolo come fallback) → pertinenza alla scena.
export function selectDomainBlocks(opts: {
  enabled: readonly string[];
  haystack: string;
}): string[] {
  const hay = opts.haystack.toLowerCase();
  const enabledSet = new Set(opts.enabled.map((k) => k.trim()).filter((k) => k.length > 0));
  const candidates =
    enabledSet.size > 0 ? VISUAL_DOMAINS.filter((d) => enabledSet.has(d.key)) : VISUAL_DOMAINS;
  return candidates.filter((d) => d.triggers.some((t) => hay.includes(t))).map((d) => d.block);
}

// Chiavi valide (per validare l'input dell'endpoint di configurazione).
export function isVisualDomainKey(key: string): boolean {
  return VISUAL_DOMAINS.some((d) => d.key === key);
}
