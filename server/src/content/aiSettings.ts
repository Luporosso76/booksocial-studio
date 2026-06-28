import { appConfig } from "../config.js";
import { settings } from "../db/repositories.js";
import * as keyring from "../secrets/keyring.js";

// ============================================================================
// CONFIGURAZIONE RUNTIME dei provider AI (testo + immagini), persistita e
// pilotata dalle Impostazioni. La config NON-segreta vive nel DB (app_setting),
// le CHIAVI nel keyring (secret-tool). Qui teniamo una CACHE IN-MEMORY SINCRONA
// così che createEngine() / createImageEngine() possano leggere la config a
// runtime senza await e senza riavvio del server.
//
// FALLBACK ENV: per ogni campo, il valore EFFETTIVO è quello salvato (DB/keyring)
// ?? appConfig (env). Default app: testo opencode/openai/gpt-5.5, immagini local.
//
// SICUREZZA: le chiavi in cache sono in chiaro in memoria (servono a chiamare le
// API). NON vanno MAI loggate né esposte via effectiveView() (solo boolean).
// ============================================================================

export interface TextCfg {
  provider: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
  openaiModel: string;
  anthropicApiKey: string | null;
  anthropicModel: string;
  googleApiKey: string | null;
  googleModel: string;
  googleBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  opencodeModel: string;
  codexModel: string | null;
  claudeModel: string | null;
  agyModel: string | null;
  fallbackProvider: string;
  fallbackModel: string;
}

export interface ImageCfg {
  provider: string;
  openaiApiKey: string | null;
  openaiBaseUrl: string;
  openaiImageModel: string;
  googleApiKey: string | null;
  googleBaseUrl: string;
  googleImageModel: string;
  // Provider immagine dedicati (chiave propria + modello).
  stabilityApiKey: string | null;
  stabilityImageModel: string;
  bflApiKey: string | null;
  bflImageModel: string;
  replicateApiKey: string | null;
  replicateImageModel: string;
  falApiKey: string | null;
  falImageModel: string;
  agyImageModel: string;
  codexImageModel: string;
  fallbackProvider: string;
  fallbackModel: string;
}

export interface ImageStyleCfg {
  preset: string;
  customStyle: string;
  intensity: number;
  vividness: number;
  steps: number | null;
  cfg: number | null;
}

export const STYLE_PROVIDERS = [
  "local",
  "openai",
  "google",
  "stability",
  "bfl",
  "replicate",
  "fal",
  "agy",
] as const;

export const DEFAULT_IMAGE_STYLE: ImageStyleCfg = {
  preset: "graphic-novel",
  customStyle: "",
  intensity: 75,
  vividness: 55,
  steps: null,
  cfg: null,
};

export interface EffectiveView {
  text: {
    provider: string;
    openaiBaseUrl: string;
    openaiModel: string;
    anthropicModel: string;
    googleModel: string;
    googleBaseUrl: string;
    ollamaBaseUrl: string;
    ollamaModel: string;
    opencodeModel: string;
    codexModel: string | null;
    claudeModel: string | null;
    agyModel: string | null;
    fallbackProvider: string;
    fallbackModel: string;
  };
  image: {
    provider: string;
    openaiImageModel: string;
    googleImageModel: string;
    stabilityImageModel: string;
    bflImageModel: string;
    replicateImageModel: string;
    falImageModel: string;
    agyImageModel: string;
    codexImageModel: string;
    fallbackProvider: string;
    fallbackModel: string;
  };
  keys: {
    openai: boolean;
    anthropic: boolean;
    google: boolean;
    stability: boolean;
    bfl: boolean;
    replicate: boolean;
    fal: boolean;
  };
  // Istruzioni-extra GLOBALI: testo APPEND-ONLY accodato ai prompt. "" = nessun extra.
  extra: {
    textPrompt: string;
    imagePrompt: string;
  };
  imageStyle: Record<string, ImageStyleCfg>;
}

// Patch accettata da save(): solo i campi NON-segreti, più le chiavi separate.
// Per le chiavi: stringa => put, null => remove, assente (undefined) => invariata.
export interface AiSettingsPatch {
  text?: {
    provider?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
    anthropicModel?: string;
    googleModel?: string;
    googleBaseUrl?: string;
    ollamaBaseUrl?: string;
    ollamaModel?: string;
    opencodeModel?: string;
    codexModel?: string;
    claudeModel?: string;
    agyModel?: string;
    fallbackProvider?: string;
    fallbackModel?: string;
  };
  image?: {
    provider?: string;
    openaiImageModel?: string;
    googleImageModel?: string;
    stabilityImageModel?: string;
    bflImageModel?: string;
    replicateImageModel?: string;
    falImageModel?: string;
    agyImageModel?: string;
    codexImageModel?: string;
    fallbackProvider?: string;
    fallbackModel?: string;
  };
  keys?: {
    openai?: string | null;
    anthropic?: string | null;
    google?: string | null;
    stability?: string | null;
    bfl?: string | null;
    replicate?: string | null;
    fal?: string | null;
  };
  // Istruzioni-extra GLOBALI: stringa => salva (vuota = rimuove l'extra), assente => invariata.
  extra?: {
    textPrompt?: string;
    imagePrompt?: string;
  };
  imageStyle?: Record<string, Partial<ImageStyleCfg>>;
}

// ---------------------------------------------------------------------------
// Chiavi app_setting (config non-segreta) e keyring (segreti).
// ---------------------------------------------------------------------------
const DB_KEYS = {
  textProvider: "ai.text.provider",
  openaiModel: "ai.text.openaiModel",
  openaiBaseUrl: "ai.text.openaiBaseUrl",
  anthropicModel: "ai.text.anthropicModel",
  googleModel: "ai.text.googleModel",
  googleBaseUrl: "ai.text.googleBaseUrl",
  ollamaBaseUrl: "ai.text.ollamaBaseUrl",
  ollamaModel: "ai.text.ollamaModel",
  opencodeModel: "ai.text.opencodeModel",
  codexModel: "ai.text.codexModel",
  claudeModel: "ai.text.claudeModel",
  agyModel: "ai.text.agyModel",
  textFallback: "ai.text.fallbackProvider",
  textFallbackModel: "ai.text.fallbackModel",
  imageProvider: "ai.image.provider",
  openaiImageModel: "ai.image.openaiImageModel",
  googleImageModel: "ai.image.googleImageModel",
  stabilityImageModel: "ai.image.stabilityImageModel",
  bflImageModel: "ai.image.bflImageModel",
  replicateImageModel: "ai.image.replicateImageModel",
  falImageModel: "ai.image.falImageModel",
  agyImageModel: "ai.image.agyImageModel",
  codexImageModel: "ai.image.codexImageModel",
  imageFallback: "ai.image.fallbackProvider",
  imageFallbackModel: "ai.image.fallbackModel",
  // Istruzioni-extra GLOBALI: testo APPEND-ONLY accodato a TUTTI i prompt POST/IMMAGINE.
  // Non-segrete → app_setting. La controparte PER-LIBRO vive sulle colonne book.*_extra_instructions.
  textPromptExtra: "prompt.text.extra",
  imagePromptExtra: "prompt.image.extra",
} as const;

const KEY_KEYS = {
  openai: "ai.key.openai",
  anthropic: "ai.key.anthropic",
  google: "ai.key.google",
  stability: "ai.key.stability",
  bfl: "ai.key.bfl",
  replicate: "ai.key.replicate",
  fal: "ai.key.fal",
} as const;

// ---------------------------------------------------------------------------
// CACHE IN-MEMORY. Mappa { chiave -> valore } caricata da DB + keyring.
// undefined (chiave assente nella cache) => si applica il fallback env.
// ---------------------------------------------------------------------------
interface Cache {
  db: Map<string, string | null>;
  keys: Map<string, string | null>;
}

const cache: Cache = { db: new Map(), keys: new Map() };

// Valore DB salvato per k, oppure il fallback fornito (env). Stringa vuota => fallback.
function dbVal(k: string, fallback: string): string {
  const v = cache.db.get(k);
  return v != null && v !== "" ? v : fallback;
}

// Valore DB nullable: stringa salvata, oppure il fallback (che può essere null).
function dbValNullable(k: string, fallback: string | null): string | null {
  const v = cache.db.get(k);
  return v != null && v !== "" ? v : fallback;
}

// Chiave segreta: valore in cache, oppure il fallback env (appConfig). Mai loggata.
function keyVal(k: string, fallback: string | null): string | null {
  const v = cache.keys.get(k);
  return v != null && v !== "" ? v : fallback;
}

/**
 * Carica la config non-segreta (DB) e le chiavi (keyring) in memoria.
 * Va chiamata in index.ts PRIMA di createEngine() (await). È best-effort: se il
 * DB o il keyring non rispondono per una chiave, quel valore resta assente e si
 * applica il fallback env.
 */
export async function load(): Promise<void> {
  const db = new Map<string, string | null>();
  for (const k of Object.values(DB_KEYS)) {
    try {
      db.set(k, await settings.get(k));
    } catch {
      db.set(k, null);
    }
  }
  for (const p of STYLE_PROVIDERS) {
    const k = imageStyleKey(p);
    try {
      db.set(k, await settings.get(k));
    } catch {
      db.set(k, null);
    }
  }
  const keys = new Map<string, string | null>();
  for (const k of Object.values(KEY_KEYS)) {
    try {
      keys.set(k, await keyring.get(k));
    } catch {
      keys.set(k, null);
    }
  }
  cache.db = db;
  cache.keys = keys;
}

function imageStyleKey(provider: string): string {
  return `ai.imagestyle.${provider}`;
}

function clampPct(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mergeImageStyle(o: Record<string, unknown>): ImageStyleCfg {
  return {
    preset: typeof o.preset === "string" && o.preset !== "" ? o.preset : DEFAULT_IMAGE_STYLE.preset,
    customStyle:
      typeof o.customStyle === "string" ? o.customStyle : DEFAULT_IMAGE_STYLE.customStyle,
    intensity: clampPct(o.intensity, DEFAULT_IMAGE_STYLE.intensity),
    vividness: clampPct(o.vividness, DEFAULT_IMAGE_STYLE.vividness),
    steps: "steps" in o ? toNumberOrNull(o.steps) : DEFAULT_IMAGE_STYLE.steps,
    cfg: "cfg" in o ? toNumberOrNull(o.cfg) : DEFAULT_IMAGE_STYLE.cfg,
  };
}

/** Config EFFETTIVA dello STILE immagine per un provider (cache ?? default). SINCRONA. */
export function getImageStyle(provider: string): ImageStyleCfg {
  const raw = cache.db.get(imageStyleKey(provider));
  if (raw == null || raw === "") return { ...DEFAULT_IMAGE_STYLE };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return mergeImageStyle(parsed as Record<string, unknown>);
    }
  } catch {
    return { ...DEFAULT_IMAGE_STYLE };
  }
  return { ...DEFAULT_IMAGE_STYLE };
}

/** Config EFFETTIVA del motore TESTO (cache ?? env). SINCRONA. */
export function getText(): TextCfg {
  return {
    provider: dbVal(DB_KEYS.textProvider, appConfig.contentProvider),
    openaiApiKey: keyVal(KEY_KEYS.openai, appConfig.openaiApiKey),
    openaiBaseUrl: dbVal(DB_KEYS.openaiBaseUrl, appConfig.openaiBaseUrl),
    openaiModel: dbVal(DB_KEYS.openaiModel, appConfig.openaiModel),
    anthropicApiKey: keyVal(KEY_KEYS.anthropic, appConfig.anthropicApiKey),
    anthropicModel: dbVal(DB_KEYS.anthropicModel, appConfig.anthropicModel),
    googleApiKey: keyVal(KEY_KEYS.google, appConfig.googleApiKey),
    googleModel: dbVal(DB_KEYS.googleModel, appConfig.googleModel),
    googleBaseUrl: dbVal(DB_KEYS.googleBaseUrl, appConfig.googleBaseUrl),
    ollamaBaseUrl: dbVal(DB_KEYS.ollamaBaseUrl, appConfig.ollamaBaseUrl),
    ollamaModel: dbVal(DB_KEYS.ollamaModel, appConfig.ollamaModel),
    opencodeModel: dbVal(DB_KEYS.opencodeModel, appConfig.opencodeModel),
    codexModel: dbValNullable(DB_KEYS.codexModel, appConfig.codexModel),
    claudeModel: dbValNullable(DB_KEYS.claudeModel, appConfig.claudeModel),
    agyModel: dbValNullable(DB_KEYS.agyModel, appConfig.agyModel),
    fallbackProvider: dbVal(DB_KEYS.textFallback, appConfig.textFallbackProvider),
    fallbackModel: dbVal(DB_KEYS.textFallbackModel, appConfig.textFallbackModel),
  };
}

/** Config EFFETTIVA del motore IMMAGINI (cache ?? env). SINCRONA. */
export function getImage(): ImageCfg {
  return {
    provider: dbVal(DB_KEYS.imageProvider, appConfig.imageProvider),
    openaiApiKey: keyVal(KEY_KEYS.openai, appConfig.openaiApiKey),
    openaiBaseUrl: dbVal(DB_KEYS.openaiBaseUrl, appConfig.openaiBaseUrl),
    openaiImageModel: dbVal(DB_KEYS.openaiImageModel, appConfig.openaiImageModel),
    googleApiKey: keyVal(KEY_KEYS.google, appConfig.googleApiKey),
    googleBaseUrl: dbVal(DB_KEYS.googleBaseUrl, appConfig.googleBaseUrl),
    googleImageModel: dbVal(DB_KEYS.googleImageModel, appConfig.googleImageModel),
    stabilityApiKey: keyVal(KEY_KEYS.stability, appConfig.stabilityApiKey),
    stabilityImageModel: dbVal(DB_KEYS.stabilityImageModel, appConfig.stabilityImageModel),
    bflApiKey: keyVal(KEY_KEYS.bfl, appConfig.bflApiKey),
    bflImageModel: dbVal(DB_KEYS.bflImageModel, appConfig.bflImageModel),
    replicateApiKey: keyVal(KEY_KEYS.replicate, appConfig.replicateApiKey),
    replicateImageModel: dbVal(DB_KEYS.replicateImageModel, appConfig.replicateImageModel),
    falApiKey: keyVal(KEY_KEYS.fal, appConfig.falApiKey),
    falImageModel: dbVal(DB_KEYS.falImageModel, appConfig.falImageModel),
    agyImageModel: dbVal(DB_KEYS.agyImageModel, appConfig.agyImageModel),
    codexImageModel: dbVal(DB_KEYS.codexImageModel, appConfig.codexImageModel),
    fallbackProvider: dbVal(DB_KEYS.imageFallback, appConfig.imageFallbackProvider),
    fallbackModel: dbVal(DB_KEYS.imageFallbackModel, appConfig.imageFallbackModel),
  };
}

/**
 * Istruzioni-extra GLOBALI: testo APPEND-ONLY accodato a TUTTI i prompt POST/IMMAGINE.
 * SINCRONA (legge la cache). "" = nessun extra. La controparte per-libro sta sulle colonne book.
 */
export function getPromptExtras(): { text: string; image: string } {
  return {
    text: dbVal(DB_KEYS.textPromptExtra, ""),
    image: dbVal(DB_KEYS.imagePromptExtra, ""),
  };
}

/** Vista EFFETTIVA per l'API: SENZA i valori delle chiavi (solo boolean). */
export function effectiveView(): EffectiveView {
  const t = getText();
  const i = getImage();
  const extra = getPromptExtras();
  const imageStyle: Record<string, ImageStyleCfg> = {};
  for (const p of STYLE_PROVIDERS) imageStyle[p] = getImageStyle(p);
  return {
    text: {
      provider: t.provider,
      openaiBaseUrl: t.openaiBaseUrl,
      openaiModel: t.openaiModel,
      anthropicModel: t.anthropicModel,
      googleModel: t.googleModel,
      googleBaseUrl: t.googleBaseUrl,
      ollamaBaseUrl: t.ollamaBaseUrl,
      ollamaModel: t.ollamaModel,
      opencodeModel: t.opencodeModel,
      codexModel: t.codexModel,
      claudeModel: t.claudeModel,
      agyModel: t.agyModel,
      fallbackProvider: t.fallbackProvider,
      fallbackModel: t.fallbackModel,
    },
    image: {
      provider: i.provider,
      openaiImageModel: i.openaiImageModel,
      googleImageModel: i.googleImageModel,
      stabilityImageModel: i.stabilityImageModel,
      bflImageModel: i.bflImageModel,
      replicateImageModel: i.replicateImageModel,
      falImageModel: i.falImageModel,
      agyImageModel: i.agyImageModel,
      codexImageModel: i.codexImageModel,
      fallbackProvider: i.fallbackProvider,
      fallbackModel: i.fallbackModel,
    },
    keys: {
      openai: t.openaiApiKey != null && t.openaiApiKey !== "",
      anthropic: t.anthropicApiKey != null && t.anthropicApiKey !== "",
      google: t.googleApiKey != null && t.googleApiKey !== "",
      stability: i.stabilityApiKey != null && i.stabilityApiKey !== "",
      bfl: i.bflApiKey != null && i.bflApiKey !== "",
      replicate: i.replicateApiKey != null && i.replicateApiKey !== "",
      fal: i.falApiKey != null && i.falApiKey !== "",
    },
    extra: {
      textPrompt: extra.text,
      imagePrompt: extra.image,
    },
    imageStyle,
  };
}

// Mappa campo-patch -> chiave app_setting per la sezione testo.
const TEXT_FIELD_KEYS: Record<string, string> = {
  provider: DB_KEYS.textProvider,
  openaiBaseUrl: DB_KEYS.openaiBaseUrl,
  openaiModel: DB_KEYS.openaiModel,
  anthropicModel: DB_KEYS.anthropicModel,
  googleModel: DB_KEYS.googleModel,
  googleBaseUrl: DB_KEYS.googleBaseUrl,
  ollamaBaseUrl: DB_KEYS.ollamaBaseUrl,
  ollamaModel: DB_KEYS.ollamaModel,
  opencodeModel: DB_KEYS.opencodeModel,
  codexModel: DB_KEYS.codexModel,
  claudeModel: DB_KEYS.claudeModel,
  agyModel: DB_KEYS.agyModel,
  fallbackProvider: DB_KEYS.textFallback,
  fallbackModel: DB_KEYS.textFallbackModel,
};

const IMAGE_FIELD_KEYS: Record<string, string> = {
  provider: DB_KEYS.imageProvider,
  openaiImageModel: DB_KEYS.openaiImageModel,
  googleImageModel: DB_KEYS.googleImageModel,
  stabilityImageModel: DB_KEYS.stabilityImageModel,
  bflImageModel: DB_KEYS.bflImageModel,
  replicateImageModel: DB_KEYS.replicateImageModel,
  falImageModel: DB_KEYS.falImageModel,
  agyImageModel: DB_KEYS.agyImageModel,
  codexImageModel: DB_KEYS.codexImageModel,
  fallbackProvider: DB_KEYS.imageFallback,
  fallbackModel: DB_KEYS.imageFallbackModel,
};

/**
 * Persiste la patch: campi non-segreti nel DB (app_setting), chiavi nel keyring
 * (stringa => put, null => remove, assente => invariata). Poi RICARICA la cache e
 * ritorna la vista effettiva (SENZA i valori delle chiavi).
 */
export async function save(patch: AiSettingsPatch): Promise<EffectiveView> {
  if (patch.text) {
    for (const [field, dbKey] of Object.entries(TEXT_FIELD_KEYS)) {
      const v = (patch.text as Record<string, unknown>)[field];
      if (typeof v === "string") {
        await settings.set(dbKey, v);
      }
    }
  }
  if (patch.image) {
    for (const [field, dbKey] of Object.entries(IMAGE_FIELD_KEYS)) {
      const v = (patch.image as Record<string, unknown>)[field];
      if (typeof v === "string") {
        await settings.set(dbKey, v);
      }
    }
  }
  if (patch.keys) {
    for (const [name, dbKey] of Object.entries(KEY_KEYS)) {
      const v = (patch.keys as Record<string, unknown>)[name];
      if (v === undefined) continue; // assente => invariata
      if (v === null) {
        await keyring.remove(dbKey);
      } else if (typeof v === "string") {
        await keyring.put(dbKey, v);
      }
    }
  }
  if (patch.extra) {
    // Stringa => salva (anche "" → svuota l'extra); assente => invariata.
    if (typeof patch.extra.textPrompt === "string") {
      await settings.set(DB_KEYS.textPromptExtra, patch.extra.textPrompt.trim());
    }
    if (typeof patch.extra.imagePrompt === "string") {
      await settings.set(DB_KEYS.imagePromptExtra, patch.extra.imagePrompt.trim());
    }
  }
  if (patch.imageStyle && typeof patch.imageStyle === "object") {
    for (const [provider, partial] of Object.entries(patch.imageStyle)) {
      if (!partial || typeof partial !== "object") continue;
      const current = getImageStyle(provider);
      const merged = mergeImageStyle({ ...current, ...partial });
      await settings.set(imageStyleKey(provider), JSON.stringify(merged));
    }
  }
  await load();
  return effectiveView();
}

// ---------------------------------------------------------------------------
// LISTA MODELLI per-provider, gestita da DB (chiave `ai.models.<provider>`,
// valore JSON array di stringhe). Letta/scritta on-demand via settings.get/set
// (NON passa dalla cache in-memory sincrona: sono operazioni async occasionali).
// ---------------------------------------------------------------------------
function modelsKey(provider: string): string {
  return `ai.models.${provider}`;
}

/** Lista modelli salvata per il provider (best-effort: [] se assente o JSON non valido). */
export async function getModels(provider: string): Promise<string[]> {
  let raw: string | null = null;
  try {
    raw = await settings.get(modelsKey(provider));
  } catch {
    return [];
  }
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}

/** Aggiunge un modello (trim + dedup), salva l'array e lo ritorna. */
export async function addModel(provider: string, model: string): Promise<string[]> {
  const trimmed = model.trim();
  const list = await getModels(provider);
  if (trimmed !== "" && !list.includes(trimmed)) {
    list.push(trimmed);
    await settings.set(modelsKey(provider), JSON.stringify(list));
  }
  return list;
}

/** Rimuove un modello, salva l'array risultante e lo ritorna. */
export async function removeModel(provider: string, model: string): Promise<string[]> {
  const trimmed = model.trim();
  const list = await getModels(provider);
  const next = list.filter((m) => m !== trimmed);
  if (next.length !== list.length) {
    await settings.set(modelsKey(provider), JSON.stringify(next));
  }
  return next;
}
