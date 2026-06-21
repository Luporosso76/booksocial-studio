import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname } from "node:path";
import { media } from "../db/repositories.js";

// Helper per usare le IMMAGINI GIA' CARICATE del libro (media_asset) nei visual.
// Niente IA a pagamento: leggiamo i file su disco e li passiamo a Satori come
// data URI base64. Ogni funzione e' best-effort: errori/file mancanti -> null,
// MAI un'eccezione (il renderer deve poter ricadere sul solo-testo).

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

function mimeForPath(path: string): string {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? "image/jpeg";
}

/**
 * Risolve un media_asset.id nel suo path su disco, verificando che il file esista.
 * Ritorna null se l'id non e' un media_asset valido o il file non c'e'.
 */
export async function resolveImagePath(imageId: number | null | undefined): Promise<string | null> {
  if (imageId == null || !Number.isInteger(imageId) || imageId <= 0) return null;
  try {
    const asset = await media.get(imageId);
    if (!asset?.path) return null;
    if (!existsSync(asset.path)) return null;
    return asset.path;
  } catch {
    return null;
  }
}

/**
 * Legge un file immagine su disco e lo codifica in un data URI base64 (per Satori).
 * Il mime e' dedotto dall'estensione. Errori di lettura -> null (mai crash).
 */
export async function loadImageDataUri(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  try {
    const buf = await readFile(path);
    if (buf.length === 0) return null;
    return `data:${mimeForPath(path)};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Comodita': risolve un media_asset.id direttamente in un data URI (o null).
 */
export async function imageIdToDataUri(imageId: number | null | undefined): Promise<string | null> {
  const path = await resolveImagePath(imageId);
  return loadImageDataUri(path);
}
