import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { books, characters } from "../db/repositories.js";
import { type SceneAspect } from "../media/imageGen.js";
import {
  enqueueSceneBatch,
  nextSceneBatch,
  clearSceneQueue,
  cancelSceneBatch,
  setSceneGenWaiting,
  bumpSceneCreated,
  finishSceneGen,
  failSceneGen,
  getSceneGen,
  type SceneBatch,
} from "../sceneGenJobs.js";
import { isSceneAspect, err, jsonBody, type RouteContext } from "./_shared.js";

// Controller per ANNULLARE le attività in corso: generazione immagini (per libro) e
// generazione settimana (per pagina). L'endpoint /cancel abortisce il controller.
const activeSceneGen = new Map<number, AbortController>();

export function mountImageGen(api: Hono, ctx: RouteContext): void {
  const { deps, runImageGenExclusive } = ctx;

  // ---------------- generazione immagini AI di scena ----------------

  // GET /imagegen/available — il motore locale (sd-cli + modello) è installato?
  // Il frontend usa questo per mostrare/nascondere il pulsante "Genera immagini scena".
  api.get("/imagegen/available", (c) => {
    return c.json({ available: deps.sceneImages.available() });
  });

  // POST /books/:id/generate-images — genera un POOL di immagini di scena (graphic-novel) e le
  // salva nella libreria del libro (riusabili come sfondo + fallback). Body: { count, aspect }.
  // ASINCRONO (~minuti per immagine, GPU seriale): ritorna subito, il frontend fa polling.
  api.post("/books/:id/generate-images", async (c) => {
    const id = Number(c.req.param("id"));
    const book = await books.get(id);
    if (!book) return c.json(err("Libro non trovato"), 404);
    if (!deps.sceneImages.available()) {
      return c.json(
        err("Generazione immagini non disponibile (sd-cli/modello assenti su questo ambiente)."),
        503,
      );
    }
    const body = await jsonBody(c);
    const count = Math.max(1, Math.min(20, Math.floor(Number(body.count)) || 1));
    const aspect: SceneAspect = isSceneAspect(body.aspect) ? body.aspect : "1:1";
    // Capitoli scelti (MULTISELECT): array di indici >= 0. `count` è PER CAPITOLO quando ne scegli.
    // Vuoto/assente = AUTO (count immagini totali su capitoli vari, anti-spoiler). Accetta anche
    // `chapterIndex` singolo.
    const rawCh: unknown[] = Array.isArray(body.chapters) ? body.chapters : [];
    let chapters = [
      ...new Set(
        rawCh.map((n) => Math.floor(Number(n))).filter((n) => Number.isInteger(n) && n >= 0),
      ),
    ];
    if (chapters.length === 0) {
      const single = Math.floor(Number(body.chapterIndex));
      if (Number.isInteger(single) && single >= 0) chapters = [single];
    }
    // "Genera per personaggio" (MULTI, opzionale): nomi dal cast del libro. Se valorizzati, il batch
    // featura quei personaggi sui capitoli dove compaiono. Accetta anche `character`
    // singolo (stringa) e lo tratta come lista di uno. Validazione: OGNI nome dev'essere nel cast
    // (case-insensitive); 400 se uno non esiste. I nomi vengono normalizzati al canonico del cast.
    const rawNames: string[] = Array.isArray(body.characters)
      ? body.characters.filter((n: unknown): n is string => typeof n === "string")
      : typeof body.character === "string"
        ? [body.character]
        : [];
    const wantedNames = [...new Set(rawNames.map((n) => n.trim()).filter((n) => n !== ""))];
    let charNames: string[] | undefined;
    if (wantedNames.length > 0) {
      const cast = await characters.byBook(id);
      const normalized: string[] = [];
      for (const name of wantedNames) {
        const match = cast.find((c) => c.name.toLowerCase() === name.toLowerCase());
        if (!match) return c.json(err(`Personaggio non trovato nel cast del libro: ${name}`), 400);
        if (!normalized.includes(match.name)) normalized.push(match.name); // canonico, dedup
      }
      charNames = normalized;
      // Pool capitoli: se l'utente non ha scelto capitoli espliciti, usa l'UNIONE dei capitoli dei
      // personaggi selezionati (∩ regole anti-spoiler applicate più a valle dalla pipeline).
      // escludi dall'unione i capitoli marcati `excluded` (frontespizio/toggle). I capitoli
      // scelti ESPLICITAMENTE nel body restano onorati (questo ramo scatta solo se chapters è vuoto).
      if (chapters.length === 0) {
        const excludedIdx = new Set(
          (await books.chapters(id)).filter((ch) => ch.excluded).map((ch) => ch.index),
        );
        const union = new Set<number>();
        for (const name of normalized) {
          const ch = cast.find((c) => c.name === name);
          for (const idx of ch?.chapters ?? []) if (!excludedIdx.has(idx)) union.add(idx);
        }
        if (union.size > 0) chapters = [...union];
      }
    }
    const forceFlashback = body.flashback === true;
    let moment: number | undefined;
    if (body.moment != null && body.moment !== "") {
      const mRaw = Math.floor(Number(body.moment));
      if (mRaw === -1) moment = -1;
      else if (Number.isInteger(mRaw) && mRaw >= 0 && chapters.length === 1) moment = mRaw;
    }
    const batch: SceneBatch = {
      id: randomUUID(),
      count,
      aspect,
      chapters,
      ...(charNames ? { characters: charNames } : {}),
      ...(forceFlashback ? { forceFlashback: true } : {}),
      ...(moment != null ? { moment } : {}),
    };

    // Accoda. started=true → non era in corso: avvio il worker. started=false → già in corso: il
    // batch si aggiunge alla coda e il worker esistente lo raccoglierà (senza fermarsi).
    const started = enqueueSceneBatch(id, batch);
    if (!started) return c.json({ queued: true, started: false, batch });

    const ac = new AbortController();
    activeSceneGen.set(id, ac);
    setSceneGenWaiting(id, true);
    // VARIETÀ DI COMPOSIZIONE: ruota tra più inquadrature lungo il lotto. Due assi di varietà:
    // (1) SOLO 2 slot su 8 SENZA persone (ambientazioni/oggetti iconici); 6/8 hanno persone; (2) tra quelle
    // con persone NON sempre il protagonista — spinta ai SECONDARI (Sara, Elena, Marco…), anche DA SOLI o
    // in coppia/gruppetto, scelti tra quelli realmente presenti nel capitolo. Per l'attrezzatura che
    // richiede un rider (windsurf, surf, vela condotta): o c'è la persona che la usa, o è a riposo — mai
    // vele dritte senza nessuno né rider fantasma.
    // NO-PERSON in 2 VARIANTI DISTINTE (luogo + attrezzatura a riposo): tenute diverse per non avere due
    // immagini vuote quasi-duplicate. Generico: vale anche per libri non balneari (strada/edificio/ecc.).
    const NO_PERSON_PLACE =
      "Composition: NO person in the frame — an atmospheric WIDE view of the LOCATION itself (the landscape, sea, sky, or street of THIS passage), letting light, weather and space carry the mood. Do NOT place sports equipment lying on the ground here.";
    const NO_PERSON_GEAR_REST =
      "Composition: NO person in the frame — a still, close or medium view of an ICONIC OBJECT or DETAIL that actually belongs to THIS passage, at rest on a plausible surface (a table, a shelf, a windowsill, the ground...), physically coherent with gravity and its setting. Choose an object the chapter REALLY describes; NEVER invent sports gear, beaches, sails or boards that the passage does not mention. Use this object-at-rest framing ONLY here.";
    // ANGOLI BILANCIATI: non sempre "di spalle". Si alterna behind / three-quarter FRONT (volto in parte
    // visibile) / profilo / candid frontale / figura distante. Resta vietato lo sguardo IN CAMERA e il
    // ritratto in posa: il volto può vedersi, ma lo sguardo è sull'azione/soggetto, mai sull'obiettivo.
    // 8 slot: 2 SENZA persone (PLACE, GEAR_REST) + 6 CON persone, variando soggetto/angolo.
    const COMPOSITIONS = [
      "Composition: feature a SECONDARY character (NOT the protagonist) present in THIS passage, ALONE, in THREE-QUARTER FRONT view — face partly visible, candid, eyes on the subject/action (NOT on the camera), a natural alive pose. Render faithfully from the CAST by appearance. If no secondary character is present, feature whatever named character IS present; only if NO character appears, fall back to the iconic subject/place ALONE.",
      NO_PERSON_PLACE,
      "Composition: TWO characters who appear TOGETHER in THIS passage (protagonist + a secondary, or two secondaries), in a candid natural interaction with each other or the scene, faces turned toward what they are doing — never toward the camera, never a posed portrait. If only one is present, feature that one alone; if none, the iconic subject/place ALONE.",
      "Composition: the PROTAGONIST seen FROM BEHIND or over-the-shoulder (face not visible), actively USING the gear/equipment or walking toward the subject. No posed portrait, no eye contact.",
      "Composition: feature a SECONDARY character present in THIS passage IN CLOSE/MEDIUM SHOT in the FOREGROUND, INTERACTING with the scene (touching, handling or reaching for the iconic subject), candid, gaze on what they are doing — never on the camera, never a posed portrait. Render faithfully from the CAST by appearance. If no secondary is present, feature whatever named character IS present; only if none, the iconic subject ALONE.",
      NO_PERSON_GEAR_REST,
      "Composition: TWO DIFFERENT characters present in THIS passage, or a small GROUP of three, sharing the moment in a candid natural way (talking, walking, working together), faces turned toward each other or the action — never toward the camera. If fewer are present, feature those who are; if none, the iconic subject/place ALONE.",
      "Composition: a character present in THIS passage (prefer a SECONDARY) in PROFILE (side view) or as a SMALL DISTANT figure in a wide landscape, in motion and absorbed in the subject/action, gaze on the scene — never toward the camera. If no person fits, the iconic subject ALONE.",
    ];
    // WORKER: svuota la CODA in sequenza finché ci sono batch e non è annullato. I batch accodati
    // mentre gira vengono raccolti senza fermarsi. `compIdx` ruota le composizioni su TUTTO il flusso.
    void runImageGenExclusive(async () => {
      setSceneGenWaiting(id, false);
      let compIdx = 0;
      try {
        let b;
        while (!ac.signal.aborted && (b = nextSceneBatch(id))) {
          const bAspect: SceneAspect = isSceneAspect(b.aspect) ? b.aspect : "1:1";
          if (b.chapters.length === 0) {
            // AUTO: count immagini su capitoli vari (anti-spoiler).
            const usedChapters: number[] = [];
            for (let i = 0; i < b.count && !ac.signal.aborted; i++) {
              const res = await deps.sceneImages.generateForBook(id, bAspect, {
                avoidChapterIndexes: usedChapters,
                angle: COMPOSITIONS[compIdx++ % COMPOSITIONS.length],
                ...(b.characters && b.characters.length > 0
                  ? { featureCharacters: b.characters }
                  : {}),
                ...(b.forceFlashback ? { forceFlashback: true } : {}),
                ...(b.moment != null ? { moment: b.moment } : { randomMoment: true }),
                signal: ac.signal,
              });
              if (res) bumpSceneCreated(id);
              if (res?.chapterIndex != null) usedChapters.push(res.chapterIndex);
            }
          } else {
            // count immagini PER ciascun capitolo selezionato.
            for (const ch of b.chapters) {
              for (let i = 0; i < b.count && !ac.signal.aborted; i++) {
                const res = await deps.sceneImages.generateForBook(id, bAspect, {
                  chapterIndex: ch,
                  angle: COMPOSITIONS[compIdx++ % COMPOSITIONS.length],
                  ...(b.characters && b.characters.length > 0
                    ? { featureCharacters: b.characters }
                    : {}),
                  ...(b.forceFlashback ? { forceFlashback: true } : {}),
                  ...(b.moment != null ? { moment: b.moment } : { randomMoment: true }),
                  signal: ac.signal,
                });
                if (res) bumpSceneCreated(id);
              }
            }
          }
        }
        finishSceneGen(id, ac.signal.aborted);
      } catch (e) {
        failSceneGen(id, e instanceof Error ? e.message : String(e));
      } finally {
        activeSceneGen.delete(id);
      }
    });
    return c.json({ queued: true, started: true, batch });
  });

  // POST /books/:id/generate-images/cancel — ANNULLA tutto: svuota la CODA e killa sd-cli.
  api.post("/books/:id/generate-images/cancel", (c) => {
    const id = Number(c.req.param("id"));
    clearSceneQueue(id); // i batch non ancora iniziati non partiranno
    const ac = activeSceneGen.get(id);
    if (ac) ac.abort(); // interrompe l'immagine in corso
    return c.json({ cancelled: !!ac });
  });

  api.post("/books/:id/generate-images/queue/:batchId/cancel", (c) => {
    const id = Number(c.req.param("id"));
    const batchId = c.req.param("batchId");
    const cancelled = cancelSceneBatch(id, batchId);
    return c.json({ cancelled });
  });

  // GET /books/:id/scenegen — avanzamento: totale (tutti i batch) + batch corrente + coda + cronometri.
  api.get("/books/:id/scenegen", (c) => {
    const j = getSceneGen(Number(c.req.param("id")));
    if (!j)
      return c.json({
        status: "idle",
        planned: 0,
        created: 0,
        waiting: false,
        error: null,
        cancelled: false,
        startedAt: 0,
        imageStartedAt: 0,
        current: null,
        queued: [],
      });
    return c.json({
      status: j.status,
      planned: j.plannedTotal, // totale immagini di tutti i batch
      created: j.createdTotal,
      waiting: j.waiting,
      error: j.error,
      cancelled: j.cancelled,
      startedAt: j.startedAt,
      imageStartedAt: j.imageStartedAt,
      current: j.current, // { aspect, chapters, planned, created } | null
      queued: j.queue.map((b) => ({
        id: b.id,
        count: b.count,
        aspect: b.aspect,
        chapters: b.chapters,
      })),
    });
  });
}
