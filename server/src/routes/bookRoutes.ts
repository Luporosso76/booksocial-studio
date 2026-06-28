import { Hono } from "hono";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { books, links, media, pages } from "../db/repositories.js";
import { isVisualDomainKey } from "../content/imageDomains.js";
import { booksDir } from "../paths.js";
import { validateUpload } from "../uploads.js";
import { translateDirectivesToEnglish } from "../content/translate.js";
import { buildVisualBible } from "../services/visualBible.js";
import { VB_STEP_ORDER } from "../visualBibleJobs.js";
import { setJob, getJob } from "../analysisJobs.js";
import { bookDto, profileDto, linkDto, mediaDto } from "../serialize.js";
import {
  parseVisualPropsInput,
  parseVisualExtrasInput,
  err,
  jsonBody,
  parseUsagePolicy,
  sanitizeFileName,
  type RouteContext,
} from "./_shared.js";

export function mountBooks(api: Hono, ctx: RouteContext): void {
  const { deps } = ctx;

  api.get("/books", async (c) => c.json((await books.all()).map((b) => bookDto(b))));

  api.get("/books/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const [profile, chapters, bookLinks, bookMedia] = await Promise.all([
      books.currentProfile(id),
      books.chapters(id),
      links.byBook(id),
      media.uploadsByBook(id),
    ]);
    const usageMap = await media.usageByBook(id);
    const mediaDtos = bookMedia.map((m) => mediaDto(m, usageMap.get(m.id)));
    const cover = mediaDtos.find((m) => m.scope === "GENERAL")?.url ?? null;
    return c.json({
      book: bookDto(book, cover),
      profile: profileDto(profile),
      chapters: chapters.map((ch) => ({
        id: String(ch.id),
        bookId: String(ch.bookId),
        index: ch.index,
        title: ch.title,
        summary: null,
        excluded: ch.excluded, // capitolo escluso dalla generazione immagini (anti-frontespizio/toggle)
        scene: ch.scene, // scheda visiva: null se non ancora estratta
      })),
      links: bookLinks.map(linkDto),
      media: mediaDtos,
    });
  });

  // ---------------- books CRUD / import ----------------

  // Multipart upload of a .md file -> save to <data>/books/<name>.md (see booksDir() in paths.ts)
  // -> import + one-time analysis -> Book.
  api.post("/books/import", async (c) => {
    const form = await c.req.parseBody();
    const file = form["file"];
    if (!(file instanceof File)) {
      return c.json(err("Campo 'file' (.md) mancante nel multipart"), 400);
    }
    const author =
      typeof form["author"] === "string" && form["author"].trim() !== ""
        ? (form["author"] as string)
        : null;
    const language =
      typeof form["language"] === "string" && form["language"].trim() !== ""
        ? (form["language"] as string)
        : null;
    if (!language) {
      return c.json(err("Lingua del libro obbligatoria: selezionala durante l'import"), 400);
    }

    const { buffer: bookBuf } = await validateUpload(file, "book");
    const content = bookBuf.toString("utf8");
    const fileName = sanitizeFileName(file.name || "book.md");
    const dir = booksDir();
    await mkdir(dir, { recursive: true });
    const sourcePath = join(dir, fileName);
    await writeFile(sourcePath, content, "utf8");

    // Import VELOCE (libro + capitoli); l'analisi (lenta) parte in BACKGROUND.
    const { book, needsAnalysis, imp } = await deps.content.importBook(
      sourcePath,
      content,
      fileName,
      author,
      language,
    );
    if (needsAnalysis) {
      setJob(book.id, "analyzing");
      // Fire-and-forget: la richiesta HTTP non aspetta la fine dell'analisi.
      void deps.content
        .analyzeProfile(book, imp)
        .then(() => {
          setJob(book.id, "ready");
          // Bibbia visiva (TUTTI gli step) come job SEPARATO in background: il libro è già usabile,
          // la costruzione gira a parte ed è visibile via /visual-bible-status e /jobs.
          void buildVisualBible(
            { engine: deps.engine, chapterScenes: deps.chapterScenes },
            book.id,
            [...VB_STEP_ORDER],
          ).catch(() => {});
        })
        .catch((e: unknown) =>
          setJob(book.id, "failed", e instanceof Error ? e.message : String(e)),
        );
    } else {
      setJob(book.id, "ready");
    }
    return c.json(bookDto(book));
  });

  // POST /books/import-sample — importa il LIBRO CAMPIONE bundlato (samples/the-keeper-of-tides.md),
  // per l'onboarding/empty-state. Riusa la STESSA logica di /books/import (importBook + analisi in
  // background). Path risolto in modo robusto da routes.ts con fallback su più posizioni note.
  api.post("/books/import-sample", async (c) => {
    const here = dirname(fileURLToPath(import.meta.url));
    // routes.ts vive in server/src (dev/tsx) o server/dist (build): risali fino alla radice del repo.
    const candidates = [
      resolve(here, "..", "..", "samples", "the-keeper-of-tides.md"),
      resolve(here, "..", "..", "..", "samples", "the-keeper-of-tides.md"),
      resolve(process.cwd(), "samples", "the-keeper-of-tides.md"),
      resolve(process.cwd(), "..", "samples", "the-keeper-of-tides.md"),
    ];
    const samplePath = candidates.find((p) => existsSync(p));
    if (!samplePath) {
      return c.json(
        err("Libro campione non trovato (samples/the-keeper-of-tides.md assente)."),
        404,
      );
    }

    let content: string;
    try {
      content = await readFile(samplePath, "utf8");
    } catch (e) {
      return c.json(
        err(`Lettura libro campione fallita: ${e instanceof Error ? e.message : String(e)}`),
        500,
      );
    }

    const fileName = "the-keeper-of-tides.md";
    const dir = booksDir();
    await mkdir(dir, { recursive: true });
    const sourcePath = join(dir, fileName);
    await writeFile(sourcePath, content, "utf8");

    const { book, needsAnalysis, imp } = await deps.content.importBook(
      sourcePath,
      content,
      fileName,
      null,
      null,
    );
    if (needsAnalysis) {
      setJob(book.id, "analyzing");
      // Fire-and-forget: come /books/import, la richiesta non aspetta l'analisi (lenta).
      void deps.content
        .analyzeProfile(book, imp)
        .then(() => {
          setJob(book.id, "ready");
          void buildVisualBible(
            { engine: deps.engine, chapterScenes: deps.chapterScenes },
            book.id,
            [...VB_STEP_ORDER],
          ).catch(() => {});
        })
        .catch((e: unknown) =>
          setJob(book.id, "failed", e instanceof Error ? e.message : String(e)),
        );
    } else {
      setJob(book.id, "ready");
    }
    return c.json(bookDto(book));
  });

  // Stato dell'analisi di un libro (per il polling del frontend).
  api.get("/books/:id/analysis-status", async (c) => {
    const id = Number(c.req.param("id"));
    const job = getJob(id);
    if (job) return c.json({ status: job.status, error: job.error });
    const profile = await books.currentProfile(id);
    return c.json({ status: profile ? "ready" : "idle", error: null });
  });

  // Rename / set base hashtags.
  api.put("/books/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await jsonBody(c);
    if (typeof body.title === "string" && body.title.trim() !== "") {
      await books.rename(id, body.title.trim());
    }
    // Il frontend invia baseHashtags come string[]; lo storage e' una stringa unita da spazi.
    if (Array.isArray(body.baseHashtags)) {
      await books.setBaseHashtags(id, body.baseHashtags.map(String).join(" "));
    } else if (typeof body.baseHashtags === "string") {
      await books.setBaseHashtags(id, body.baseHashtags);
    }
    // Configurazione VISIVA per-libro. Aggiornata solo se almeno uno dei due campi è presente
    // nel body, così un PUT che tocca solo il titolo non azzera la config. I domini sono validati
    // contro le chiavi note (gli sconosciuti vengono scartati silenziosamente).
    if ("visualDomains" in body || "visualDirectives" in body) {
      const rawDomains = Array.isArray(body.visualDomains)
        ? body.visualDomains
        : typeof body.visualDomains === "string"
          ? body.visualDomains.split(",")
          : book.visualDomains;
      const domains = (rawDomains as unknown[])
        .map((d) => String(d).trim())
        .filter((d) => isVisualDomainKey(d));
      // Direttive: l'utente le scrive in italiano. Se cambiano, le TRADUCIAMO una volta in inglese
      // (la versione iniettata nel prompt); se nel body non ci sono, preserviamo originale + traduzione.
      let directives: string | null;
      let directivesEn: string | null;
      if ("visualDirectives" in body) {
        const src = body.visualDirectives == null ? "" : String(body.visualDirectives).trim();
        directives = src === "" ? null : src;
        directivesEn = src === "" ? null : await translateDirectivesToEnglish(deps.engine, src);
      } else {
        directives = book.visualDirectives;
        directivesEn = book.visualDirectivesEn;
      }
      await books.setVisualConfig(id, domains, directives, directivesEn);
    }
    // Oggetti/veicoli ricorrenti + mondo, modificabili a mano.
    if ("visualProps" in body) {
      await books.setVisualProps(id, parseVisualPropsInput(body.visualProps));
    }
    // Personaggi minori/incidentali canonici, modificabili a mano.
    if ("visualExtras" in body) {
      await books.setVisualExtras(id, parseVisualExtrasInput(body.visualExtras));
    }
    // Istruzioni-extra per-libro: aggiornate solo se almeno uno dei due campi è nel body; gli
    // assenti sono preservati.
    if ("textExtraInstructions" in body || "imageExtraInstructions" in body) {
      const t =
        "textExtraInstructions" in body
          ? body.textExtraInstructions == null
            ? null
            : String(body.textExtraInstructions)
          : book.textExtraInstructions;
      const i =
        "imageExtraInstructions" in body
          ? body.imageExtraInstructions == null
            ? null
            : String(body.imageExtraInstructions)
          : book.imageExtraInstructions;
      await books.setExtraInstructions(id, t, i);
    }
    const updated = await books.get(id);
    return c.json(updated ? bookDto(updated) : err("Libro non trovato"));
  });

  api.delete("/books/:id", async (c) => {
    const id = Number(c.req.param("id"));
    await books.delete(id);
    return c.json({ ok: true });
  });

  // Associate / dissociate book <-> page.
  api.post("/books/:id/pages", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await jsonBody(c);
    const pageId = typeof body.pageId === "string" ? body.pageId : null;
    if (!pageId) return c.json(err("pageId mancante"), 400);
    const linked = body.linked === true;
    await pages.setBook(pageId, linked ? id : null);
    return c.json({ ok: true });
  });

  // ---------------- chapters ----------------

  // Capitoli CON testo (per la lettura nella scheda libro).
  api.get("/books/:id/chapters", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const chapters = await books.chapters(id);
    return c.json(
      chapters.map((ch) => ({
        id: String(ch.id),
        index: ch.index,
        title: ch.title,
        text: ch.text,
        charCount: ch.charCount,
        excluded: ch.excluded, // escluso dalla generazione immagini
        scene: ch.scene, // scheda visiva: null se non ancora estratta
      })),
    );
  });

  // Esclude/include un capitolo dalla generazione immagini. Body: { excluded: boolean }.
  // 404 se il capitolo non esiste. Toggle manuale che scavalca l'auto-default del frontespizio.
  api.post("/books/:id/chapters/:idx/excluded", async (c) => {
    const id = Number(c.req.param("id"));
    const idx = Number(c.req.param("idx"));
    if (!Number.isInteger(idx) || idx < 0) return c.json(err("idx non valido"), 400);
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await jsonBody(c);
    const excluded = body.excluded === true;
    const ok = await books.setChapterExcluded(id, idx, excluded);
    if (!ok) return c.json(err("Capitolo non trovato"), 404);
    return c.json({ ok: true, excluded });
  });

  // ---------------- links ----------------

  api.get("/books/:id/links", async (c) => {
    const id = Number(c.req.param("id"));
    return c.json((await links.byBook(id)).map(linkDto));
  });

  api.post("/books/:id/links", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await jsonBody(c);
    if (typeof body.url !== "string" || body.url.trim() === "") {
      return c.json(err("url mancante"), 400);
    }
    const link = await links.insert({
      bookId: id,
      channel: typeof body.channel === "string" ? body.channel : "altro",
      label: typeof body.label === "string" ? body.label : null,
      url: body.url,
      isDefault: body.isDefault === true,
      usagePolicy: parseUsagePolicy(body.usagePolicy),
    });
    return c.json(linkDto(link));
  });

  // PUT /books/:id/links/:linkId — modifica un link esistente (tipo/etichetta/url/regola/default).
  api.put("/books/:id/links/:linkId", async (c) => {
    const linkId = Number(c.req.param("linkId"));
    const existing = await links.get(linkId);
    if (!existing) return c.json(err("Link non trovato"), 404);
    const body = await jsonBody(c);
    if (typeof body.url === "string" && body.url.trim() !== "") existing.url = body.url.trim();
    if (typeof body.channel === "string" && body.channel.trim() !== "")
      existing.channel = body.channel.trim();
    if ("label" in body)
      existing.label =
        typeof body.label === "string" && body.label.trim() !== "" ? body.label : null;
    if ("isDefault" in body) existing.isDefault = body.isDefault === true;
    if ("usagePolicy" in body) existing.usagePolicy = parseUsagePolicy(body.usagePolicy);
    await links.update(existing);
    const updated = await links.get(linkId);
    return c.json(linkDto(updated ?? existing));
  });

  api.delete("/books/:id/links/:linkId", async (c) => {
    await links.delete(Number(c.req.param("linkId")));
    return c.json({ ok: true });
  });
}
