import { Hono } from "hono";
import { books, characters } from "../db/repositories.js";
import { stepAppearance, stepOutfits } from "../services/visualBible.js";
import { characterDto } from "../serialize.js";
import { parseOutfitsInput, err, jsonBody, type RouteContext } from "./_shared.js";

export function mountCharacters(api: Hono, ctx: RouteContext): void {
  const { deps } = ctx;

  // ---------------- characters ----------------

  api.get("/books/:id/characters", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    return c.json((await characters.byBook(id)).map(characterDto));
  });

  // Crea un personaggio manuale (source='USER', in coda all'ordinamento).
  api.post("/books/:id/characters", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await jsonBody(c);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name === "") return c.json(err("name mancante"), 400);
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v : null;
    const now = Date.now();
    const created = await characters.insert({
      bookId: id,
      name,
      role: str(body.role),
      occupation: str(body.occupation),
      personality: str(body.personality),
      physical: str(body.physical),
      age: str(body.age),
      ethnicity: str(body.ethnicity),
      notes: str(body.notes),
      source: "USER",
      sortOrder: await characters.nextSortOrder(id),
      mentions: null,
      chapters: [],
      outfits: { default: null, contexts: [], signature: null },
      createdAt: now,
      updatedAt: now,
    });
    return c.json(characterDto(created));
  });

  api.post("/books/:id/minors/promote", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await jsonBody(c);
    const index = Number(body.index);
    const minors = book.visualExtras.minors;
    if (!Number.isInteger(index) || index < 0 || index >= minors.length) {
      return c.json(err("Indice del personaggio minore non valido"), 400);
    }
    const minor = minors[index]!;
    const name = minor.label.trim();
    if (name === "")
      return c.json(err("Il personaggio minore non ha un'etichetta utilizzabile come nome"), 400);
    const now = Date.now();
    const created = await characters.insert({
      bookId: id,
      name,
      role: null,
      occupation: null,
      personality: null,
      physical: minor.appearance.trim() !== "" ? minor.appearance.trim() : null,
      age: null,
      ethnicity: null,
      notes: null,
      source: "USER",
      sortOrder: await characters.nextSortOrder(id),
      mentions: null,
      chapters: [],
      outfits: {
        default: minor.outfit && minor.outfit.trim() !== "" ? minor.outfit.trim() : null,
        contexts: [],
        signature: null,
      },
      createdAt: now,
      updatedAt: now,
    });
    await books.setVisualExtras(id, { minors: minors.filter((_, i) => i !== index) });
    return c.json(characterDto(created));
  });

  api.get("/books/:id/character-scene-appearances", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    return c.json(await deps.chapterScenes.sceneAppearances(id));
  });

  api.get("/books/:id/scene-kinds", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    return c.json(await deps.chapterScenes.sceneKindChapters(id));
  });

  api.put("/books/:id/characters/:cid/scene-membership", async (c) => {
    const id = Number(c.req.param("id"));
    const cid = Number(c.req.param("cid"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const existing = await characters.get(cid);
    if (!existing || existing.bookId !== id) return c.json(err("Personaggio non trovato"), 404);
    const body = await jsonBody(c);
    const idxList = (v: unknown): number[] =>
      Array.isArray(v)
        ? [
            ...new Set(
              (v as unknown[]).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0),
            ),
          ].sort((a, b) => a - b)
        : [];
    await deps.chapterScenes.setSceneMembership(id, cid, {
      present: idxList(body.present),
      flashback: idxList(body.flashback),
      dream: idxList(body.dream),
    });
    const fresh = await characters.get(cid);
    return c.json(fresh ? characterDto(fresh) : err("Personaggio non trovato"));
  });

  // Aggiorna i campi forniti; marca source='USER' (e' un'edit manuale).
  api.put("/characters/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const existing = await characters.get(id);
    if (!existing) return c.json(err("Personaggio non trovato"), 404);
    const body = await jsonBody(c);
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() !== "" ? v : null;
    const TEMPORAL_PRESENCE_VALUES = [
      "present",
      "flashback_only",
      "dream_only",
      "past_dream_only",
    ] as const;
    type TemporalPresenceValue = (typeof TEMPORAL_PRESENCE_VALUES)[number];
    const isTemporalPresence = (v: unknown): v is TemporalPresenceValue =>
      typeof v === "string" && (TEMPORAL_PRESENCE_VALUES as readonly string[]).includes(v);
    let temporalPresence = existing.temporalPresence ?? null;
    let temporalPresenceLocked = existing.temporalPresenceLocked ?? false;
    if ("temporalPresence" in body) {
      const raw = body.temporalPresence;
      if (isTemporalPresence(raw)) {
        temporalPresence = raw;
        temporalPresenceLocked = true;
      } else if (raw === null || raw === "auto") {
        temporalPresenceLocked = false;
      }
    }
    const updated = {
      ...existing,
      temporalPresence,
      temporalPresenceLocked,
      name:
        typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : existing.name,
      role: "role" in body ? str(body.role) : existing.role,
      occupation: "occupation" in body ? str(body.occupation) : existing.occupation,
      personality: "personality" in body ? str(body.personality) : existing.personality,
      physical: "physical" in body ? str(body.physical) : existing.physical,
      age: "age" in body ? str(body.age) : existing.age,
      ethnicity: "ethnicity" in body ? str(body.ethnicity) : existing.ethnicity,
      notes: "notes" in body ? str(body.notes) : existing.notes,
      source: "USER" as const,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : existing.sortOrder,
      outfits: "outfits" in body ? parseOutfitsInput(body.outfits) : existing.outfits,
      updatedAt: Date.now(),
    };
    await characters.update(updated);
    // Presenza per capitolo editabile a mano: sovrascrive book_character.chapters (indici 0-based,
    // dedup+ordinati). Utile quando la derivazione dalle schede scena GPT manca un presente (es.
    // protagonista in prima persona mai nominato). NB: un ricalcolo completo della presenza
    // (recompute-character-chapters / build bibbia visiva) ricostruisce dai cards e può sovrascrivere.
    if (Array.isArray(body.chapters)) {
      const chs = [
        ...new Set(
          (body.chapters as unknown[])
            .map((x) => Number(x))
            .filter((n) => Number.isInteger(n) && n >= 0),
        ),
      ].sort((a, b) => a - b);
      await characters.setChapters(id, chs);
    }
    const fresh = await characters.get(id);
    return c.json(fresh ? characterDto(fresh) : err("Personaggio non trovato"));
  });

  api.delete("/characters/:id", async (c) => {
    await characters.delete(Number(c.req.param("id")));
    return c.json({ ok: true });
  });

  // POST /books/:id/characters/generate-appearance — genera/arricchisce l'ASPETTO FISICO CANONICO
  // (descrizione precisa, completa, STABILE, solo fisica) di ogni personaggio del libro e lo salva in
  // `physical` (source=AI). Serve a dare un aspetto coerente a TUTTE le immagini, colmando le
  // descrizioni deboli. Body opzionale: { onlyWeak?: boolean } = solo le descrizioni corte/assenti.
  api.post("/books/:id/characters/generate-appearance", async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await books.get(bookId);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const body = await jsonBody(c);
    const onlyWeak = body.onlyWeak === true;
    const updated = await stepAppearance(deps.engine, bookId, { onlyWeak });
    const fresh = await characters.byBook(bookId);
    return c.json({ updated, characters: fresh.map(characterDto) });
  });

  // POST /books/:id/characters/generate-outfits — genera l'ABBIGLIAMENTO CANONICO (default + abiti per
  // contesto) di ogni personaggio, legato alle ambientazioni ricorrenti del libro (dalle schede), e lo
  // salva in outfits_json. Cosi' un personaggio veste sempre uguale nella stessa scena ricorrente.
  api.post("/books/:id/characters/generate-outfits", async (c) => {
    const bookId = Number(c.req.param("id"));
    const book = await books.get(bookId);
    if (!book) return c.json(err("Libro non trovato"), 404);
    const updated = await stepOutfits(deps.engine, bookId);
    const fresh = await characters.byBook(bookId);
    return c.json({ updated, characters: fresh.map(characterDto) });
  });
}
