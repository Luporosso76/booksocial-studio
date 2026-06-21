import { open } from "node:fs/promises";

// Legge le dimensioni (e quindi l'aspect ratio = w/h) di un'immagine SENZA dipendenze
// esterne (niente sharp): parsing dell'header per JPEG e PNG, gli unici formati caricati
// dagli utenti. Legge solo i primi byte del file (l'header), non l'intero file.
// Ritorna null se non determinabile: in tal caso il chiamante è prudente (no immagine).

const HEAD_BYTES = 131072; // 128KB: copre l'EXIF iniziale dei JPEG prima del segmento SOF.

async function readHead(path: string, n: number = HEAD_BYTES): Promise<Buffer | null> {
  let fh;
  try {
    fh = await open(path, "r");
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

// PNG: firma di 8 byte, poi chunk IHDR con width@16 height@20 (big-endian).
function pngSize(b: Buffer): { w: number; h: number } | null {
  if (b.length < 24) return null;
  if (b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// JPEG: scorre i segmenti FFxx fino a un marker SOF (Start Of Frame), che contiene
// altezza e larghezza. Salta gli altri segmenti usando la loro lunghezza.
function jpegSize(b: Buffer): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < b.length) {
    if (b[off] !== 0xff) {
      off++; // resync su un eventuale byte di padding
      continue;
    }
    const marker = b[off + 1]!;
    // Marker standalone senza payload: SOI/EOI/RSTn/TEM.
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01
    ) {
      off += 2;
      continue;
    }
    const len = b.readUInt16BE(off + 2);
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      if (off + 9 > b.length) return null;
      return { h: b.readUInt16BE(off + 5), w: b.readUInt16BE(off + 7) };
    }
    off += 2 + len;
  }
  return null;
}

// Aspect ratio (larghezza/altezza) dell'immagine, o null se non determinabile.
export async function imageAspectRatio(path: string): Promise<number | null> {
  const head = await readHead(path);
  if (!head) return null;
  const dim = pngSize(head) ?? jpegSize(head);
  if (!dim || dim.w <= 0 || dim.h <= 0) return null;
  return dim.w / dim.h;
}
