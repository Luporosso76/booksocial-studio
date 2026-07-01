import { appConfig } from "../config.js";
import { settings } from "../db/repositories.js";
import * as keyring from "../secrets/keyring.js";

export interface TextCfg {
  provider: string;
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
  geminiApiKey: string | null;
  googleBaseUrl: string;
  geminiImageModel: string;

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
  "gemini",
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
    openaiBaseUrl: string;
    googleBaseUrl: string;
    openaiImageModel: string;
    geminiImageModel: string;
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
    google: boolean;
    gemini: boolean;
    stability: boolean;
    bfl: boolean;
    replicate: boolean;
    fal: boolean;
  };

  extra: {
    textPrompt: string;
    imagePrompt: string;
  };

  imageStyle: Record<string, ImageStyleCfg>;
}

export interface AiSettingsPatch {
  text?: {
    provider?: string;
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
    openaiBaseUrl?: string;
    googleBaseUrl?: string;
    openaiImageModel?: string;
    geminiImageModel?: string;
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
    google?: string | null;
    gemini?: string | null;
    stability?: string | null;
    bfl?: string | null;
    replicate?: string | null;
    fal?: string | null;
  };

  extra?: {
    textPrompt?: string;
    imagePrompt?: string;
  };

  imageStyle?: Record<string, Partial<ImageStyleCfg>>;
}

const DB_KEYS = {
  textProvider: "ai.text.provider",

  openaiBaseUrl: "ai.text.openaiBaseUrl",
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
  geminiImageModel: "ai.image.geminiImageModel",
  stabilityImageModel: "ai.image.stabilityImageModel",
  bflImageModel: "ai.image.bflImageModel",
  replicateImageModel: "ai.image.replicateImageModel",
  falImageModel: "ai.image.falImageModel",
  agyImageModel: "ai.image.agyImageModel",
  codexImageModel: "ai.image.codexImageModel",
  imageFallback: "ai.image.fallbackProvider",
  imageFallbackModel: "ai.image.fallbackModel",

  textPromptExtra: "prompt.text.extra",
  imagePromptExtra: "prompt.image.extra",
} as const;

const KEY_KEYS = {
  openai: "ai.key.openai",
  google: "ai.key.google",
  gemini: "ai.key.gemini",
  stability: "ai.key.stability",
  bfl: "ai.key.bfl",
  replicate: "ai.key.replicate",
  fal: "ai.key.fal",
} as const;

interface Cache {
  db: Map<string, string | null>;
  keys: Map<string, string | null>;
}

const cache: Cache = { db: new Map(), keys: new Map() };

function dbVal(k: string, fallback: string): string {
  const v = cache.db.get(k);
  return v != null && v !== "" ? v : fallback;
}

function dbValNullable(k: string, fallback: string | null): string | null {
  const v = cache.db.get(k);
  return v != null && v !== "" ? v : fallback;
}

function keyVal(k: string, fallback: string | null): string | null {
  const v = cache.keys.get(k);
  return v != null && v !== "" ? v : fallback;
}

function normalizeImageProvider(provider: string): string {
  return provider === "google" ? "gemini" : provider;
}

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

export function getImageStyle(provider: string): ImageStyleCfg {
  const raw = cache.db.get(imageStyleKey(provider));
  if (raw == null || raw === "") return { ...DEFAULT_IMAGE_STYLE };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return mergeImageStyle(parsed as Record<string, unknown>);
    }
  } catch {}
  return { ...DEFAULT_IMAGE_STYLE };
}

export function getText(): TextCfg {
  return {
    provider: dbVal(DB_KEYS.textProvider, appConfig.contentProvider),
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

export function getImage(): ImageCfg {
  return {
    provider: normalizeImageProvider(dbVal(DB_KEYS.imageProvider, appConfig.imageProvider)),
    openaiApiKey: keyVal(KEY_KEYS.openai, appConfig.openaiApiKey),
    openaiBaseUrl: dbVal(DB_KEYS.openaiBaseUrl, appConfig.openaiBaseUrl),
    openaiImageModel: dbVal(DB_KEYS.openaiImageModel, appConfig.openaiImageModel),
    googleApiKey: keyVal(KEY_KEYS.google, appConfig.googleApiKey),
    geminiApiKey: keyVal(KEY_KEYS.gemini, appConfig.geminiApiKey),
    googleBaseUrl: dbVal(DB_KEYS.googleBaseUrl, appConfig.googleBaseUrl),
    geminiImageModel: dbVal(DB_KEYS.geminiImageModel, appConfig.geminiImageModel),
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
    fallbackProvider: normalizeImageProvider(
      dbVal(DB_KEYS.imageFallback, appConfig.imageFallbackProvider),
    ),
    fallbackModel: dbVal(DB_KEYS.imageFallbackModel, appConfig.imageFallbackModel),
  };
}

export function getPromptExtras(): { text: string; image: string } {
  return {
    text: dbVal(DB_KEYS.textPromptExtra, ""),
    image: dbVal(DB_KEYS.imagePromptExtra, ""),
  };
}

export function effectiveView(): EffectiveView {
  const t = getText();
  const i = getImage();
  const extra = getPromptExtras();
  const imageStyle: Record<string, ImageStyleCfg> = {};
  for (const p of STYLE_PROVIDERS) imageStyle[p] = getImageStyle(p);
  return {
    text: {
      provider: t.provider,
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
      openaiBaseUrl: i.openaiBaseUrl,
      googleBaseUrl: i.googleBaseUrl,
      openaiImageModel: i.openaiImageModel,
      geminiImageModel: i.geminiImageModel,
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
      openai: i.openaiApiKey != null && i.openaiApiKey !== "",
      google: i.googleApiKey != null && i.googleApiKey !== "",
      gemini: i.geminiApiKey != null && i.geminiApiKey !== "",
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

const TEXT_FIELD_KEYS: Record<string, string> = {
  provider: DB_KEYS.textProvider,
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
  openaiBaseUrl: DB_KEYS.openaiBaseUrl,
  googleBaseUrl: DB_KEYS.googleBaseUrl,
  openaiImageModel: DB_KEYS.openaiImageModel,
  geminiImageModel: DB_KEYS.geminiImageModel,
  stabilityImageModel: DB_KEYS.stabilityImageModel,
  bflImageModel: DB_KEYS.bflImageModel,
  replicateImageModel: DB_KEYS.replicateImageModel,
  falImageModel: DB_KEYS.falImageModel,
  agyImageModel: DB_KEYS.agyImageModel,
  codexImageModel: DB_KEYS.codexImageModel,
  fallbackProvider: DB_KEYS.imageFallback,
  fallbackModel: DB_KEYS.imageFallbackModel,
};

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
      if (v === undefined) continue;
      if (v === null) {
        await keyring.remove(dbKey);
      } else if (typeof v === "string") {
        await keyring.put(dbKey, v);
      }
    }
  }
  if (patch.extra) {
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

function modelsKey(provider: string): string {
  return `ai.models.${provider}`;
}

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

export async function addModel(provider: string, model: string): Promise<string[]> {
  const trimmed = model.trim();
  const list = await getModels(provider);
  if (trimmed !== "" && !list.includes(trimmed)) {
    list.push(trimmed);
    await settings.set(modelsKey(provider), JSON.stringify(list));
  }
  return list;
}

export async function removeModel(provider: string, model: string): Promise<string[]> {
  const trimmed = model.trim();
  const list = await getModels(provider);
  const next = list.filter((m) => m !== trimmed);
  if (next.length !== list.length) {
    await settings.set(modelsKey(provider), JSON.stringify(next));
  }
  return next;
}
