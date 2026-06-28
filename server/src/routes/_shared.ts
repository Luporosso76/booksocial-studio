import { type Context, type Next } from "hono";
import { basename } from "node:path";
import { type ContentEngine } from "../content/engine.js";
import { ContentService } from "../services/contentService.js";
import { WeekPlanner } from "../services/weekPlanner.js";
import { Director } from "../media/director.js";
import { SceneImageService } from "../services/sceneImageService.js";
import { ChapterSceneService } from "../services/chapterSceneService.js";
import { type SceneAspect } from "../media/imageGen.js";
import { imageAspectRatio } from "../media/imageDimensions.js";
import { CharacterOutfits, BookVisualProps, DrivingSide, BookVisualExtras } from "../domain.js";

export interface AppDeps {
  engine: ContentEngine;
  content: ContentService;
  planner: WeekPlanner;
  director: Director;
  sceneImages: SceneImageService;
  chapterScenes: ChapterSceneService;
  secretsUnlocked: boolean;
}

export interface RouteContext {
  deps: AppDeps;
  requireSecrets: () => void;
  resolvePageToken: (
    pageId: string,
  ) => Promise<
    | { token: string; fail?: undefined }
    | { token?: undefined; fail: { body: Record<string, unknown>; status: 404 | 503 } }
  >;
  resolveIgContext: (pageId: string) => Promise<
    | { token: string; igUserId: string; fail?: undefined }
    | {
        token?: undefined;
        igUserId?: undefined;
        fail: { body: Record<string, unknown>; status: 404 | 503 };
      }
  >;
  runImageGenExclusive: (fn: () => Promise<void>) => Promise<void>;
}

// Normalizza l'input utente per gli oggetti/mondo del libro (PUT /books/:id).
export function parseVisualPropsInput(v: unknown): BookVisualProps {
  const o = (v ?? {}) as Record<string, unknown>;
  const props = Array.isArray(o.props)
    ? o.props
        .map((p) => {
          const x = (p ?? {}) as Record<string, unknown>;
          return {
            name: typeof x.name === "string" ? x.name.trim() : "",
            when: typeof x.when === "string" ? x.when.trim() : "",
            description: typeof x.description === "string" ? x.description.trim() : "",
            owner: typeof x.owner === "string" && x.owner.trim() !== "" ? x.owner.trim() : null,
          };
        })
        .filter((p) => p.name !== "" && p.description !== "")
    : [];
  const ds = typeof o.drivingSide === "string" ? o.drivingSide.trim().toLowerCase() : "";
  const drivingSide: DrivingSide | null = ds === "left" || ds === "right" ? ds : null;
  const country =
    typeof o.country === "string" && o.country.trim() !== "" ? o.country.trim() : null;
  return { props, drivingSide, country };
}

export function parseTriggersInput(v: unknown): string[] {
  const raw = Array.isArray(v)
    ? v.map((x) => String(x))
    : typeof v === "string"
      ? v.split(",")
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const k = t.trim().toLowerCase();
    if (k !== "" && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

// Normalizza l'input utente per i personaggi minori/incidentali del libro (PUT /books/:id).
export function parseVisualExtrasInput(v: unknown): BookVisualExtras {
  const o = (v ?? {}) as Record<string, unknown>;
  const minors = Array.isArray(o.minors)
    ? o.minors
        .map((m) => {
          const x = (m ?? {}) as Record<string, unknown>;
          return {
            label: typeof x.label === "string" ? x.label.trim() : "",
            when: typeof x.when === "string" ? x.when.trim() : "",
            appearance: typeof x.appearance === "string" ? x.appearance.trim() : "",
            outfit: typeof x.outfit === "string" && x.outfit.trim() !== "" ? x.outfit.trim() : null,
          };
        })
        .filter((m) => m.label !== "" && m.appearance !== "")
    : [];
  return { minors };
}

// Normalizza l'input utente per gli abiti di un personaggio (PUT /characters/:id).
export function parseOutfitsInput(v: unknown): CharacterOutfits {
  const o = (v ?? {}) as Record<string, unknown>;
  const def = typeof o.default === "string" && o.default.trim() !== "" ? o.default.trim() : null;
  const sig =
    typeof o.signature === "string" && o.signature.trim() !== "" ? o.signature.trim() : null;
  const contexts = Array.isArray(o.contexts)
    ? o.contexts
        .map((x) => {
          const c = (x ?? {}) as Record<string, unknown>;
          return {
            when: typeof c.when === "string" ? c.when.trim() : "",
            outfit: typeof c.outfit === "string" ? c.outfit.trim() : "",
          };
        })
        .filter((x) => x.when !== "" && x.outfit !== "")
    : [];
  return { default: def, contexts, signature: sig };
}

export const SCENE_ASPECTS: readonly SceneAspect[] = ["1:1", "4:5", "1.91:1", "9:16", "16:9"];
export function isSceneAspect(v: unknown): v is SceneAspect {
  return typeof v === "string" && (SCENE_ASPECTS as readonly string[]).includes(v);
}

// Aspect SDXL dell'immagine dal suo ratio reale (per rigenerarla nella stessa forma).
export async function sceneAspectOfFile(path: string): Promise<SceneAspect> {
  const r = await imageAspectRatio(path);
  if (r == null) return "1:1";
  if (r < 0.8) return "9:16";
  if (r > 1.25) return "1.91:1";
  return "1:1";
}

export function rateLimit(opts: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; reset: number }>();
  return async (c: Context, next: Next) => {
    const now = Date.now();
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    }
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "local";
    let e = hits.get(ip);
    if (!e || e.reset <= now) {
      e = { count: 0, reset: now + opts.windowMs };
      hits.set(ip, e);
    }
    e.count++;
    if (e.count > opts.max) {
      return c.json(
        { error: "rate-limited", retryAfterSec: Math.ceil((e.reset - now) / 1000) },
        429,
      );
    }
    return next();
  };
}

export function err(message: string): { error: string } {
  return { error: message };
}

export async function jsonBody(c: Context): Promise<any> {
  let raw: string;
  try {
    raw = await c.req.text();
  } catch {
    return {};
  }
  if (raw.trim() === "") return {};
  try {
    const v = JSON.parse(raw);
    return v != null && typeof v === "object" ? v : {};
  } catch {
    throw Object.assign(new Error("invalid-json"), { httpStatus: 400 });
  }
}

// Regola d'uso link valida (always|sometimes|manual), altrimenti null.
export function parseUsagePolicy(v: unknown): "always" | "sometimes" | "manual" | null {
  return v === "always" || v === "sometimes" || v === "manual" ? v : null;
}

export function sanitizeFileName(name: string): string {
  const base = basename(name)
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .trim();
  return base === "" ? "book.md" : base;
}
