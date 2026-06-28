import { Hono } from "hono";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { music } from "../db/repositories.js";
import { musicDir, resolveInsideDataDir } from "../paths.js";
import { validateUpload } from "../uploads.js";
import { musicDto } from "../serialize.js";
import { err, type RouteContext } from "./_shared.js";

export function mountMusic(api: Hono, _ctx: RouteContext): void {
  // ---------------- libreria musicale (per-libro) ----------------

  // GET /music — tutte le tracce (libreria globale).
  api.get("/music", async (c) => {
    const usageMap = await music.usageAll();
    return c.json((await music.all()).map((m) => musicDto(m, usageMap.get(m.id))));
  });

  // GET /books/:id/music — tracce del libro (+ eventuali globali).
  api.get("/books/:id/music", async (c) => {
    const usageMap = await music.usageAll();
    return c.json(
      (await music.byBook(Number(c.req.param("id")))).map((m) => musicDto(m, usageMap.get(m.id))),
    );
  });

  // POST /music — upload di una traccia (multipart: file, title?, mood?, bookId?).
  api.post("/music", async (c) => {
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) return c.json(err("file mancante"), 400);
    const titleRaw = typeof form["title"] === "string" ? (form["title"] as string).trim() : "";
    const mood =
      typeof form["mood"] === "string" && (form["mood"] as string).trim() !== ""
        ? (form["mood"] as string).trim()
        : null;
    const bookId =
      form["bookId"] != null && Number.isInteger(Number(form["bookId"]))
        ? Number(form["bookId"])
        : null;
    const title = titleRaw !== "" ? titleRaw : file.name.replace(/\.[^.]+$/, "") || "Traccia";

    const { buffer: buf, ext } = await validateUpload(file, "audio");
    const dir = musicDir();
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${randomUUID()}.${ext}`);
    await writeFile(path, buf);

    const track = await music.insert({
      bookId,
      title,
      path,
      durationSec: null, // best-effort: durata non calcolata.
      mood,
      addedAt: Date.now(),
    });
    return c.json(musicDto(track));
  });

  // DELETE /music/:id — rimuove la traccia dalla libreria (file lasciato su disco).
  api.delete("/music/:id", async (c) => {
    await music.delete(Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  // GET /music/:id/file — stream del file audio.
  api.get("/music/:id/file", async (c) => {
    const track = await music.get(Number(c.req.param("id")));
    if (!track) return c.json(err("Traccia non trovata"), 404);
    try {
      const p = resolveInsideDataDir(track.path);
      const buf = await readFile(p);
      const ext = extname(p).toLowerCase();
      const type =
        ext === ".wav"
          ? "audio/wav"
          : ext === ".ogg"
            ? "audio/ogg"
            : ext === ".m4a" || ext === ".aac"
              ? "audio/aac"
              : ext === ".flac"
                ? "audio/flac"
                : "audio/mpeg";
      c.header("Content-Type", type);
      c.header("Cache-Control", "private, max-age=3600");
      return c.body(buf);
    } catch {
      return c.json(err("File audio assente su disco"), 404);
    }
  });
}
