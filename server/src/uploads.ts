function envBytes(name: string, fallbackMb: number): number {
  const v = process.env[name];
  const n = v && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallbackMb * 1024 * 1024;
}

export const MAX_BOOK_BYTES = envBytes("MAX_BOOK_BYTES", 20);
export const MAX_IMAGE_BYTES = envBytes("MAX_IMAGE_BYTES", 15);
export const MAX_MUSIC_BYTES = envBytes("MAX_MUSIC_BYTES", 80);

export type UploadKind = "book" | "image" | "audio";

interface KindRule {
  maxBytes: number;
  exts: string[];
  mimePrefixes: string[];
  mimes: string[];
}

const RULES: Record<UploadKind, KindRule> = {
  book: {
    maxBytes: MAX_BOOK_BYTES,
    exts: ["md", "markdown"],
    mimePrefixes: ["text/"],
    mimes: ["text/markdown", "text/x-markdown", "text/plain", "application/octet-stream", ""],
  },
  image: {
    maxBytes: MAX_IMAGE_BYTES,
    exts: ["png", "jpg", "jpeg", "webp"],
    mimePrefixes: ["image/"],
    mimes: ["application/octet-stream", ""],
  },
  audio: {
    maxBytes: MAX_MUSIC_BYTES,
    exts: ["mp3", "wav", "ogg", "oga", "m4a", "flac", "aac"],
    mimePrefixes: ["audio/", "video/ogg"],
    mimes: ["application/octet-stream", ""],
  },
};

function fail(msg: string, status = 400): never {
  throw Object.assign(new Error(msg), { httpStatus: status });
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0
    ? name
        .slice(i + 1)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
    : "";
}

function imageMagicOk(buf: Buffer, ext: string): boolean {
  const isPng =
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isWebp =
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP";
  if (ext === "png") return isPng;
  if (ext === "jpg" || ext === "jpeg") return isJpeg;
  if (ext === "webp") return isWebp;
  return false;
}

export async function validateUpload(
  file: File,
  kind: UploadKind,
): Promise<{ buffer: Buffer; ext: string }> {
  const rule = RULES[kind];
  if (file.size > rule.maxBytes) {
    fail(`File too large: ${file.size} bytes (max ${rule.maxBytes}).`, 413);
  }
  const ext = extOf(file.name || "");
  if (!rule.exts.includes(ext)) {
    fail(`Extension not allowed "${ext || "(none)"}": allowed ${rule.exts.join(", ")}.`);
  }
  const mime = (file.type || "").toLowerCase();
  const mimeOk = rule.mimes.includes(mime) || rule.mimePrefixes.some((p) => mime.startsWith(p));
  if (!mimeOk) {
    fail(`MIME type not allowed "${mime || "(empty)"}".`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    fail("Empty file.");
  }
  if (buffer.length > rule.maxBytes) {
    fail(`File too large: ${buffer.length} bytes (max ${rule.maxBytes}).`, 413);
  }
  if (kind === "image" && !imageMagicOk(buffer, ext)) {
    fail("File content does not match a valid image (magic bytes).");
  }
  return { buffer, ext };
}
