// SPEC visivi: l'IA-regista NON disegna pixel, produce uno di questi oggetti JSON
// (scegliendo tra TEMPLATE FISSI). I renderer (Satori/Remotion) li eseguono in modo
// deterministico. La validazione qui applica DEFAULT su ogni campo errato/mancante,
// cosi' un renderer riceve sempre uno spec ben formato.

export type VisualKind = "quote_card" | "reel_text" | "storyboard";
export const VISUAL_KINDS: VisualKind[] = ["quote_card", "reel_text", "storyboard"];

// Proporzioni ufficiali Meta: feed immagini 1:1/4:5/1.91:1; storie & reel 9:16.
export type Aspect = "1:1" | "4:5" | "1.91:1" | "9:16";
export const ASPECTS: Aspect[] = ["1:1", "4:5", "1.91:1", "9:16"];

// Template FISSI noti per ciascun kind (enumerati nel prompt del director).
export const TEMPLATES: Record<VisualKind, string[]> = {
  quote_card: ["classic", "serif-bold", "minimal", "gradient"],
  reel_text: ["fade-sequence", "kinetic", "quote-focus"],
  storyboard: ["two-col", "stacked"],
};

// Palette/accent ammessi (chiavi simboliche; i renderer le mappano a colori reali).
export const PALETTES = ["ink", "warm", "cool", "mono", "brand"] as const;
export type Palette = (typeof PALETTES)[number];

export interface QuoteCardSpec {
  kind: "quote_card";
  template: string;
  aspect: Aspect;
  quote: string;
  source: string;
  palette: string;
  accent: string;
  // Immagine di sfondo: id REALE di un media_asset del libro (o null = solo testo).
  imageId?: number | null;
}

export interface ReelScene {
  text?: string;
  quote?: string;
  anim: string;
  sec: number;
  cta?: string;
  // Immagine di sfondo della scena: id REALE di un media_asset del libro (o null).
  // Piu' scene con immagini diverse = slideshow.
  imageId?: number | null;
}

export interface ReelTextSpec {
  kind: "reel_text";
  template: string;
  aspect: "9:16";
  durationSec: number;
  scenes: ReelScene[];
  // mood = suggerimento descrittivo; trackId = music_track.id REALE da montare (o null
  // = reel silenzioso). Il renderer risolve trackId contro la libreria musicale.
  music: { mood: string; trackId?: number | null };
  background: { type: string; palette: string };
}

export interface StoryboardPanel {
  speaker: string;
  dialogue: string;
  bg: string;
  // Immagine di sfondo del pannello: id REALE di un media_asset del libro (o null).
  imageId?: number | null;
}

export interface StoryboardSpec {
  kind: "storyboard";
  aspect: string;
  panels: StoryboardPanel[];
}

export type VisualSpec = QuoteCardSpec | ReelTextSpec | StoryboardSpec;

// --------------------------- helpers ---------------------------

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

function asNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Coerci un riferimento immagine a intero positivo (media_asset.id) o null.
// Valori non validi (0, negativi, non numerici) -> null. NON valida l'esistenza
// reale dell'id (lo fa il director contro media.byBook).
function asImageId(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function pickTemplate(kind: VisualKind, v: unknown): string {
  const list = TEMPLATES[kind];
  return typeof v === "string" && list.includes(v) ? v : list[0]!;
}

const ANIMS = ["fade", "slide", "zoom", "none"];

// --------------------------- validation ---------------------------

function validateQuoteCard(o: Record<string, unknown>): QuoteCardSpec {
  return {
    kind: "quote_card",
    template: pickTemplate("quote_card", o.template),
    aspect: pickEnum<Aspect>(o.aspect, ASPECTS, "1:1"),
    quote: asString(o.quote, ""),
    source: asString(o.source, ""),
    palette: pickEnum(o.palette, PALETTES, "ink"),
    accent: asString(o.accent, "#c8553d"),
    imageId: asImageId(o.imageId),
  };
}

function validateReelText(o: Record<string, unknown>): ReelTextSpec {
  const rawScenes = Array.isArray(o.scenes) ? o.scenes : [];
  const scenes: ReelScene[] = rawScenes
    .map((s): ReelScene | null => {
      if (s == null || typeof s !== "object") return null;
      const r = s as Record<string, unknown>;
      const text = typeof r.text === "string" && r.text.trim() !== "" ? r.text : undefined;
      const quote = typeof r.quote === "string" && r.quote.trim() !== "" ? r.quote : undefined;
      if (text === undefined && quote === undefined) return null;
      const scene: ReelScene = {
        anim: pickEnum(r.anim, ANIMS, "fade"),
        sec: asNumber(r.sec, 3, 1, 15),
      };
      if (text !== undefined) scene.text = text;
      if (quote !== undefined) scene.quote = quote;
      if (typeof r.cta === "string" && r.cta.trim() !== "") scene.cta = r.cta;
      scene.imageId = asImageId(r.imageId);
      return scene;
    })
    .filter((s): s is ReelScene => s !== null);

  // Garantisci almeno una scena (i renderer non devono ricevere liste vuote).
  if (scenes.length === 0) {
    scenes.push({ anim: "fade", sec: 3, text: "" });
  }

  const music = (o.music ?? {}) as Record<string, unknown>;
  const background = (o.background ?? {}) as Record<string, unknown>;

  return {
    kind: "reel_text",
    template: pickTemplate("reel_text", o.template),
    aspect: "9:16",
    durationSec: asNumber(o.durationSec, scenes.reduce((a, s) => a + s.sec, 0) || 9, 3, 90),
    scenes,
    music: { mood: asString(music.mood, "calm"), trackId: asImageId(music.trackId) },
    background: {
      type: asString(background.type, "gradient"),
      palette: pickEnum(background.palette, PALETTES, "ink"),
    },
  };
}

function validateStoryboard(o: Record<string, unknown>): StoryboardSpec {
  const rawPanels = Array.isArray(o.panels) ? o.panels : [];
  const panels: StoryboardPanel[] = rawPanels
    .map((p): StoryboardPanel | null => {
      if (p == null || typeof p !== "object") return null;
      const r = p as Record<string, unknown>;
      const dialogue = asString(r.dialogue, "");
      if (dialogue === "") return null;
      return {
        speaker: asString(r.speaker, ""),
        dialogue,
        bg: pickEnum(r.bg, PALETTES, "ink"),
        imageId: asImageId(r.imageId),
      };
    })
    .filter((p): p is StoryboardPanel => p !== null);

  if (panels.length === 0) {
    panels.push({ speaker: "", dialogue: "", bg: "ink" });
  }

  return {
    kind: "storyboard",
    aspect: pickEnum<Aspect>(o.aspect, ASPECTS, "9:16"),
    panels,
  };
}

/**
 * Valida/normalizza un oggetto grezzo in uno VisualSpec del kind richiesto,
 * applicando default su ogni campo mancante o errato. Non lancia mai.
 */
export function validateSpec(kind: VisualKind, raw: unknown): VisualSpec {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (kind) {
    case "reel_text":
      return validateReelText(o);
    case "storyboard":
      return validateStoryboard(o);
    case "quote_card":
    default:
      return validateQuoteCard(o);
  }
}

export function isVisualKind(v: unknown): v is VisualKind {
  return typeof v === "string" && (VISUAL_KINDS as string[]).includes(v);
}
