// MOTORE DI VARIETÀ (puro, senza I/O). Dato lo stato di disponibilità reale
// (#immagini, #citazioni, reel disponibile?, #musica) e lo storico recente d'uso,
// sceglie per uno slot un ContentFormat valido, pesando la combinazione per FAVORIRE
// la varietà: penalizza formati/immagini/citazioni/musica usati di recente e aggiunge
// un po' di casualità, poi prende il candidato col punteggio migliore.
//
// Il formato è il PRODOTTO delle dimensioni (textMode × visualKind × visualContent ×
// aspect), filtrato sui vincoli di materiale disponibile. Nessuna matrice scritta a mano.

import type {
  ContentFormat,
  ContentType,
  ContentUsage,
  FormatAspect,
  MediaType,
  TextMode,
  VisualContent,
  VisualKindChoice,
} from "../domain.js";
import type { VisualKind } from "../media/spec.js";

// Disponibilità reale dell'ambiente/libro per questo slot.
export interface Availability {
  imageCount: number; // # immagini reali del libro
  quoteCount: number; // # citazioni reali (o key_quotes)
  reelAvailable: boolean; // il renderer reel è utilizzabile in questo ambiente
  musicCount: number; // # tracce musicali in libreria
}

export interface ChooseOpts {
  availability: Availability;
  recent: ContentUsage[]; // storico recente per pagina (createdAt DESC)
  // Restringe la scelta del visualKind ai soli ammessi (deciso dal TIPO della quota:
  // post → none/card, reel → reel, story → story). Se nessun candidato
  // valido rispetta il vincolo, si degrada con grazia ai candidati non vincolati.
  allowedVisualKinds?: VisualKindChoice[];
  // Sorgente di casualità iniettabile (per test). Default Math.random.
  rng?: () => number;
}

// Mappa il TIPO di pubblicazione (quota) ai visualKind ammessi per il motore di varietà.
export function allowedKindsForType(type: ContentType): VisualKindChoice[] {
  switch (type) {
    case "reel":
      return ["reel"];
    case "story":
      return ["story"];
    case "post":
    default:
      // storyboard (griglia 2×2 multi-pannello) RIMOSSO su richiesta utente: i post usano
      // immagini SINGOLE (card) o solo testo.
      return ["none", "card"];
  }
}

const TEXT_MODES: TextMode[] = ["full", "short", "none"];
// 'storyboard' escluso di proposito: nessuna immagine multi-pannello, solo singole.
const VISUAL_KINDS: VisualKindChoice[] = ["none", "card", "reel", "story"];
const VISUAL_CONTENTS: VisualContent[] = ["text", "images", "mixed"];

// Un candidato è una combinazione concreta di dimensioni.
interface Candidate extends ContentFormat {}

// Genera tutte le combinazioni VALIDE date le disponibilità.
function enumerateCandidates(av: Availability): Candidate[] {
  const out: Candidate[] = [];
  const hasImages = av.imageCount > 0;
  const hasQuotes = av.quoteCount > 0;

  for (const textMode of TEXT_MODES) {
    for (const visualKind of VISUAL_KINDS) {
      // Vincolo: i visual che mostrano testo richiedono materiale testuale reale
      // (citazioni). card/storyboard/reel/story senza citazioni non hanno senso a
      // meno che il post stesso abbia testo: per coerenza richiediamo quote per i
      // visual testuali, e immagini per i visual basati su immagini.
      const visualKindsList: VisualContent[] = visualKind === "none" ? ["text"] : VISUAL_CONTENTS;

      for (const visualContent of visualKindsList) {
        // visualContent=images / mixed richiedono immagini reali.
        if ((visualContent === "images" || visualContent === "mixed") && !hasImages) continue;

        // I visual che producono materiale richiedono il materiale giusto:
        if (
          visualKind === "card" ||
          visualKind === "storyboard" ||
          visualKind === "reel" ||
          visualKind === "story"
        ) {
          // serve almeno testo reale (citazione) OPPURE immagini per uno sfondo.
          if (!hasQuotes && !hasImages) continue;
          // visualContent=text richiede citazioni reali.
          if (visualContent === "text" && !hasQuotes) continue;
        }

        // reel richiede il renderer reel disponibile.
        if (visualKind === "reel" && !av.reelAvailable) continue;

        // Se non c'è alcun visual ma il testo del post è "none", non resta nulla.
        if (visualKind === "none" && textMode === "none") continue;

        // Aspect ammessi per destinazione (specifiche Meta):
        //  - story/reel → 9:16 (verticale a tutto schermo);
        //  - storyboard (nel POST) → 1:1, così le 4 parti vanno a GRIGLIA 2×2 nel quadrato;
        //  - card (nel feed) → SEMPRE 4:5 (scelta utente: ritratto = massimo spazio nel feed mobile);
        //  - none → nessun visual.
        let allowedAspects: (FormatAspect | null)[];
        if (visualKind === "none") {
          allowedAspects = [null];
        } else if (visualKind === "story" || visualKind === "reel") {
          allowedAspects = ["9:16"];
        } else if (visualKind === "storyboard") {
          allowedAspects = ["1:1"];
        } else {
          // card (post nel feed): formato FISSO 4:5.
          allowedAspects = ["4:5"];
        }

        for (const aspect of allowedAspects) {
          out.push({ textMode, visualKind, visualContent, aspect });
        }
      }
    }
  }
  return out;
}

// Costruisce mappe di "uso recente" pesate per recency: gli item più recenti pesano
// di più (la posizione 0 dello storico è la più recente).
interface RecencyWeights {
  visualKind: Map<string, number>;
  textMode: Map<string, number>;
  visualContent: Map<string, number>;
  aspect: Map<string, number>;
  imageIds: Map<number, number>;
  quoteKeys: Map<string, number>;
  musicIds: Map<number, number>;
}

function buildWeights(recent: ContentUsage[]): RecencyWeights {
  const w: RecencyWeights = {
    visualKind: new Map(),
    textMode: new Map(),
    visualContent: new Map(),
    aspect: new Map(),
    imageIds: new Map(),
    quoteKeys: new Map(),
    musicIds: new Map(),
  };
  const n = recent.length;
  for (let i = 0; i < n; i++) {
    const u = recent[i]!;
    // Peso decrescente con la distanza dal presente: 1.0 per il più recente.
    const recency = (n - i) / n; // (0, 1]
    const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + recency);
    const addNum = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + recency);
    add(w.visualKind, u.visualKind);
    add(w.textMode, u.textMode);
    add(w.visualContent, u.visualContent);
    if (u.aspect) add(w.aspect, u.aspect);
    for (const id of u.imageIds) addNum(w.imageIds, id);
    if (u.quoteKey) add(w.quoteKeys, u.quoteKey);
    if (u.musicId != null) addNum(w.musicIds, u.musicId);
  }
  return w;
}

// Punteggio di un candidato: parte alto e viene penalizzato dall'uso recente delle
// sue dimensioni; più alto = migliore (più "vario" rispetto allo storico).
function scoreCandidate(
  c: Candidate,
  w: RecencyWeights,
  av: Availability,
  rng: () => number,
): number {
  let score = 10;
  score -= 3 * (w.visualKind.get(c.visualKind) ?? 0);
  score -= 2 * (w.textMode.get(c.textMode) ?? 0);
  score -= 2 * (w.visualContent.get(c.visualContent) ?? 0);
  if (c.aspect) score -= 1.5 * (w.aspect.get(c.aspect) ?? 0);

  // Leggera preferenza ad avere un visual quando c'è materiale (più ricco), ma non
  // dominante: la varietà resta il driver principale.
  if (c.visualKind !== "none" && (av.imageCount > 0 || av.quoteCount > 0)) score += 0.5;

  // Casualità reale per rompere i pareggi e variare ogni settimana.
  score += rng() * 3;
  return score;
}

/**
 * Sceglie il ContentFormat migliore (più vario) per uno slot. Funzione PURA.
 * Se nessuna combinazione è valida (nessun materiale e testo possibile), ricade
 * su un post di solo testo pieno senza visual.
 */
export function chooseFormat(opts: ChooseOpts): ContentFormat {
  const rng = opts.rng ?? Math.random;
  let candidates = enumerateCandidates(opts.availability);
  // Vincolo per TIPO: tieni solo i candidati col visualKind ammesso. Se il vincolo non
  // lascia candidati (es. reel richiesto ma materiale/ffmpeg assenti), degrada con grazia
  // ai candidati non vincolati invece di non produrre nulla.
  if (opts.allowedVisualKinds && opts.allowedVisualKinds.length > 0) {
    const allow = new Set<string>(opts.allowedVisualKinds);
    const filtered = candidates.filter((c) => allow.has(c.visualKind));
    if (filtered.length > 0) candidates = filtered;
  }
  if (candidates.length === 0) {
    return { textMode: "full", visualKind: "none", visualContent: "text", aspect: null };
  }
  const w = buildWeights(opts.recent);
  let best = candidates[0]!;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = scoreCandidate(c, w, opts.availability, rng);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/**
 * Mappa un ContentFormat al VisualKind dei renderer (spec.ts), o null se nessun visual.
 * - card → quote_card
 * - storyboard → storyboard
 * - reel → reel_text
 * - story → reel_text (SEMPRE video: anche con immagini è uno slideshow 9:16 con musica)
 * - none → null
 */
export function formatToVisualKind(cf: ContentFormat): VisualKind | null {
  switch (cf.visualKind) {
    case "card":
      return "quote_card";
    case "storyboard":
      return "storyboard";
    case "reel":
      return "reel_text";
    case "story":
      // La storia è SEMPRE un video (reel_text 9:16). Se il contenuto è basato su immagini
      // diventa uno slideshow con Ken Burns sulle foto del libro (vedi useImages), mai una
      // foto statica: così ha movimento e può montare la musica come gli altri video.
      return "reel_text";
    case "none":
    default:
      return null;
  }
}

/**
 * Mappa un ContentFormat al MediaType del dominio (per la bozza).
 * - reel / story-video → REEL
 * - story (foto) → STORY
 * - card / storyboard → PHOTO
 * - none → TEXT
 */
export function formatToMediaType(cf: ContentFormat): MediaType {
  switch (cf.visualKind) {
    case "reel":
      return "REEL";
    case "story":
      return "STORY";
    case "card":
    case "storyboard":
      return "PHOTO";
    case "none":
    default:
      return "TEXT";
  }
}
