import { books, characters, visualDirectives } from "../db/repositories.js";
import type { ContentEngine } from "../content/engine.js";
import { extractChapterScene, type ExtractedChapterScene } from "../content/chapterScene.js";
import { domainHaystack, resolveOutfitMatch } from "../content/imagePrompt.js";
import { nameAppearsInText, namesMatch } from "../content/characterText.js";
import { sha256 } from "../content/importer.js";
import { SCENE_PROMPT_VERSION } from "../domain.js";
import type {
  BookChapter,
  BookCharacter,
  ChapterScene,
  ChapterSceneKind,
  TemporalPresence,
} from "../domain.js";

// Orchestratore della SCHEDA VISIVA per capitolo: estrae on-demand dal testo e mette in
// cache su book_chapter.scene_json. Usata sia dalla generazione immagini (grounding del prompt)
// sia dalla UI (vista/modifica per capitolo).

export interface ChapterSceneDeps {
  engine: ContentEngine;
}

export class ChapterSceneService {
  constructor(private readonly deps: ChapterSceneDeps) {}

  // Ritorna la scheda del capitolo: dalla cache se c'è, altrimenti la estrae e la salva.
  // Ritorna null se il capitolo non esiste o l'estrazione fallisce (best-effort).
  async getOrBuild(bookId: number, chapterIndex: number): Promise<ChapterScene | null> {
    const chapter = await books.chapter(bookId, chapterIndex);
    if (!chapter) return null;
    if (chapter.scene && isSceneFresh(chapter.scene, chapter.text)) return chapter.scene;
    return (await this.buildAndSave(bookId, chapter)) ?? chapter.scene ?? null;
  }

  // Ri-estrae SEMPRE la scheda (ignora la cache) e la salva. Per il bottone "(Ri)genera scheda".
  async regenerate(bookId: number, chapterIndex: number): Promise<ChapterScene | null> {
    const chapter = await books.chapter(bookId, chapterIndex);
    if (!chapter) return null;
    return this.buildAndSave(bookId, chapter);
  }

  // Salva le modifiche manuali dell'utente (marca source='USER').
  async save(
    bookId: number,
    chapterIndex: number,
    patch: Partial<ExtractedChapterScene>,
  ): Promise<ChapterScene | null> {
    const chapter = await books.chapter(bookId, chapterIndex);
    if (!chapter) return null;
    const scene = mergeUserScene(chapter.scene ?? null, chapter.text, patch);
    await books.setChapterScene(chapter.id, scene);
    return scene;
  }

  // RICALCOLO COMPLETO della presenza dei personaggi per capitolo (book_character.chapters).
  // PRESENZA = presenza FISICA nelle scene, NON semplice menzione del nome. L'unica fonte affidabile
  // è la scheda visiva GPT di ogni capitolo, che estrae solo i personaggi effettivamente IN SCENA
  // (chi è soltanto nominato/ricordato/atteso è escluso dal prompt di estrazione). Quindi:
  //   - per ogni capitolo, ogni personaggio del cast che combacia (namesMatch lasco) con un nome
  //     della scheda (card.characters, già canonicalizzato sul cast da canonicalizeCharacters) è "presente".
  // Il PROTAGONISTA/narratore NON è più forzato in tutti i capitoli: vale anche per lui la presenza
  // fisica della scheda (il prompt include esplicitamente il personaggio-POV/«io» quando è in scena).
  // Così è corretto anche per libri con prologhi, flashback o capitoli dal POV di un ALTRO personaggio.
  // NB: NIENTE scan deterministico del testo né merge NLP — un nome citato non implica presenza in
  // scena (scelta utente: precisione > recall). Un presente che GPT manca si recupera editando la scheda.
  // Scrive i risultati in bulk (transazione) e ritorna il cast aggiornato.
  async recomputeCharacterChapters(bookId: number): Promise<BookCharacter[]> {
    const cast = await characters.byBook(bookId);
    const chapters = await books.chapters(bookId);
    if (cast.length === 0 || chapters.length === 0) return cast;

    // Indici di presenza accumulati per id personaggio.
    const presence = new Map<number, Set<number>>();
    const sceneKinds = new Map<number, Set<ChapterSceneKind>>();
    for (const c of cast) {
      presence.set(c.id, new Set<number>());
      sceneKinds.set(c.id, new Set<ChapterSceneKind>());
    }

    // Per ogni capitolo: scheda visiva (cache o estrazione GPT on-demand) → match al cast.
    // Presente = combacia con un personaggio FISICAMENTE in scena secondo la scheda GPT.
    // Distinguo card NULL (estrazione fallita) da card valida ma SENZA personaggi: la prima va
    // preservata (no perdita dati su fallimenti transitori GPT), la seconda è "nessun presente".
    const failedChapters = new Set<number>();
    for (const chapter of chapters) {
      const card = await this.getOrBuild(bookId, chapter.index);
      if (!card) {
        failedChapters.add(chapter.index);
        continue;
      }
      const cardNames = card.characters.map((n) => n.trim()).filter((n) => n.length > 0);
      for (const c of cast) {
        if (
          cardNames.some((n) => namesMatch(c.name, n)) &&
          nameAppearsInText(c.name, chapter.text)
        ) {
          presence.get(c.id)!.add(chapter.index);
          sceneKinds.get(c.id)!.add(card.kind);
        }
      }
      for (const moment of card.altMoments ?? []) {
        const momentNames = moment.characters.map((n) => n.trim()).filter((n) => n.length > 0);
        for (const c of cast) {
          if (
            momentNames.some((n) => namesMatch(c.name, n)) &&
            nameAppearsInText(c.name, chapter.text)
          ) {
            presence.get(c.id)!.add(chapter.index);
            sceneKinds.get(c.id)!.add(moment.type);
          }
        }
      }
      const pov = (card.pov ?? "").trim();
      if (pov !== "") {
        for (const c of cast) {
          if (namesMatch(c.name, pov)) {
            presence.get(c.id)!.add(chapter.index);
            sceneKinds.get(c.id)!.add(card.kind);
          }
        }
      }
    }

    // Capitoli senza scheda affidabile (estrazione fallita): conserva la presenza PRECEDENTE di
    // ogni personaggio per quegli indici invece di azzerarla nel salvataggio bulk.
    if (failedChapters.size > 0) {
      for (const c of cast) {
        for (const idx of c.chapters) {
          if (failedChapters.has(idx)) presence.get(c.id)!.add(idx);
        }
      }
    }

    // Persisti in bulk (transazione) e ritorna il cast aggiornato.
    await characters.setChaptersBulk(
      cast.map((c) => {
        const chapterSet = presence.get(c.id)!;
        const computed = classifyTemporalPresence(sceneKinds.get(c.id)!);
        const inFailed = [...chapterSet].some((idx) => failedChapters.has(idx));
        return {
          characterId: c.id,
          chapters: [...chapterSet],
          temporalPresence: resolveTemporalPresence(computed, c.temporalPresence ?? null, inFailed),
        };
      }),
    );
    return characters.byBook(bookId);
  }

  async sceneAppearances(
    bookId: number,
  ): Promise<Record<number, { present: number[]; flashback: number[]; dream: number[] }>> {
    const cast = await characters.byBook(bookId);
    const chapters = await books.chapters(bookId);
    const acc = new Map<
      number,
      { present: Set<number>; flashback: Set<number>; dream: Set<number> }
    >();
    for (const c of cast) {
      acc.set(c.id, {
        present: new Set<number>(),
        flashback: new Set<number>(),
        dream: new Set<number>(),
      });
    }
    const bucketForKind = (kind: ChapterSceneKind): "present" | "flashback" | "dream" =>
      kind === "waking" ? "present" : kind === "flashback" ? "flashback" : "dream";
    const add = (names: string[], bucket: "present" | "flashback" | "dream", idx: number): void => {
      const clean = names.map((n) => n.trim()).filter((n) => n.length > 0);
      for (const c of cast) {
        if (clean.some((n) => namesMatch(c.name, n))) acc.get(c.id)![bucket].add(idx);
      }
    };
    for (const chapter of chapters) {
      const scene = chapter.scene;
      if (!scene) continue;
      add(scene.characters, bucketForKind(scene.kind), chapter.index);
      for (const moment of scene.altMoments ?? []) {
        add(moment.characters, moment.type === "flashback" ? "flashback" : "dream", chapter.index);
      }
    }
    const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);
    const out: Record<number, { present: number[]; flashback: number[]; dream: number[] }> = {};
    for (const [id, sets] of acc) {
      out[id] = {
        present: sorted(sets.present),
        flashback: sorted(sets.flashback),
        dream: sorted(sets.dream),
      };
    }
    return out;
  }

  async sceneKindChapters(
    bookId: number,
  ): Promise<{ present: number[]; flashback: number[]; dream: number[] }> {
    const chapters = await books.chapters(bookId);
    const present = new Set<number>();
    const flashback = new Set<number>();
    const dream = new Set<number>();
    for (const chapter of chapters) {
      const scene = chapter.scene;
      if (!scene) continue;
      if (scene.kind === "waking") present.add(chapter.index);
      else if (scene.kind === "flashback") flashback.add(chapter.index);
      else if (scene.kind === "dream") dream.add(chapter.index);
      for (const moment of scene.altMoments ?? []) {
        if (moment.type === "flashback") flashback.add(chapter.index);
        else if (moment.type === "dream") dream.add(chapter.index);
      }
    }
    const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);
    return { present: sorted(present), flashback: sorted(flashback), dream: sorted(dream) };
  }

  async setSceneMembership(
    bookId: number,
    characterId: number,
    desired: { present: number[]; flashback: number[]; dream: number[] },
  ): Promise<void> {
    const character = await characters.get(characterId);
    if (!character) return;
    const name = character.name;
    const want = {
      waking: new Set(desired.present),
      flashback: new Set(desired.flashback),
      dream: new Set(desired.dream),
    };
    const chapters = await books.chapters(bookId);
    const pending: { chapterId: number; scene: ChapterScene }[] = [];
    for (const chapter of chapters) {
      const scene = chapter.scene;
      if (!scene) continue;
      const idx = chapter.index;
      let changedMain = false;
      let changedAlt = false;
      let mainChars = scene.characters;
      if (scene.kind === "waking" || scene.kind === "flashback" || scene.kind === "dream") {
        const next = reconcileMembership(mainChars, name, want[scene.kind].has(idx));
        if (next !== mainChars) {
          mainChars = next;
          changedMain = true;
        }
      }
      const moments = scene.altMoments ?? [];
      const nextMoments = moments.map((moment) => {
        if (moment.type !== "flashback" && moment.type !== "dream") return moment;
        const next = reconcileMembership(moment.characters, name, want[moment.type].has(idx));
        if (next === moment.characters) return moment;
        changedAlt = true;
        return { ...moment, characters: next };
      });
      if (!changedMain && !changedAlt) continue;
      const updated = mergeUserScene(scene, chapter.text, {
        ...(changedMain ? { characters: mainChars } : {}),
        ...(changedAlt ? { altMoments: nextMoments } : {}),
      });
      pending.push({ chapterId: chapter.id, scene: updated });
    }
    await books.setChapterScenesBulk(pending);
    await this.recomputeCharacterChapters(bookId);
  }

  private async buildAndSave(bookId: number, chapter: BookChapter): Promise<ChapterScene | null> {
    const cast = await characters.byBook(bookId);
    const book = await books.get(bookId);
    if (!book) return null;
    const alwaysOn = (await visualDirectives.byBook(bookId))
      .filter((d) => d.enabled && d.triggers.length === 0)
      .map((d) => (d.body ?? "").trim())
      .filter((s) => s !== "");
    const profile = await books.currentProfile(bookId);
    const synopsis = (profile?.synopsisLong ?? profile?.synopsisShort ?? "").trim() || null;
    const extracted = await extractChapterScene(this.deps.engine, {
      chapterText: chapter.text,
      chapterTitle: chapter.title,
      language: book.language,
      knownCharacters: cast.map((c) => c.name),
      directives: alwaysOn.length > 0 ? alwaysOn.join("\n") : null,
      synopsis,
    });
    if (!extracted) return null;
    const pov = (extracted.pov ?? "").trim();
    const sceneCharacters = canonicalizeCharacters(extracted.characters, cast).filter(
      (n) => nameAppearsInText(n, chapter.text) || (pov !== "" && namesMatch(n, pov)),
    );
    const scene: ChapterScene = {
      ...extracted,
      characters: sceneCharacters,
      source: "AI",
      model: this.deps.engine.name(),
      promptVersion: SCENE_PROMPT_VERSION,
      sourceHash: sha256(chapter.text),
      updatedAt: Date.now(),
    };
    await books.setChapterScene(chapter.id, scene);
    return scene;
  }

  async placeMinorInScenes(bookId: number, name: string, when: string): Promise<number> {
    const kws = when
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (kws.length === 0) return 0;
    const matchOutfits = { default: null, contexts: [{ when, outfit: "" }], signature: null };
    const matches = (haystack: string): boolean =>
      resolveOutfitMatch(matchOutfits, haystack).fromContext;
    const chapters = await books.chapters(bookId);
    let changedCount = 0;
    for (const chapter of chapters) {
      const scene = chapter.scene;
      if (!scene) continue;
      let changedMain = false;
      let mainChars = scene.characters;
      if (matches(domainHaystack(scene, chapter.text))) {
        const next = reconcileMembership(mainChars, name, true);
        if (next !== mainChars) {
          mainChars = next;
          changedMain = true;
        }
      }
      let changedAlt = false;
      const nextMoments = (scene.altMoments ?? []).map((moment) => {
        const haystack = [
          moment.location ?? "",
          moment.environment ?? "",
          ...moment.mainObjects,
          ...moment.secondaryObjects,
        ]
          .join(" ")
          .toLowerCase();
        if (!matches(haystack)) return moment;
        const next = reconcileMembership(moment.characters, name, true);
        if (next === moment.characters) return moment;
        changedAlt = true;
        return { ...moment, characters: next };
      });
      if (!changedMain && !changedAlt) continue;
      await this.save(bookId, chapter.index, {
        ...(changedMain ? { characters: mainChars } : {}),
        ...(changedAlt ? { altMoments: nextMoments } : {}),
      });
      changedCount++;
    }
    return changedCount;
  }
}

function mergeUserScene(
  prev: ChapterScene | null,
  chapterText: string,
  patch: Partial<ExtractedChapterScene>,
): ChapterScene {
  return {
    location: patch.location !== undefined ? patch.location : (prev?.location ?? null),
    environment: patch.environment !== undefined ? patch.environment : (prev?.environment ?? null),
    mainObjects: patch.mainObjects !== undefined ? patch.mainObjects : (prev?.mainObjects ?? []),
    secondaryObjects:
      patch.secondaryObjects !== undefined
        ? patch.secondaryObjects
        : (prev?.secondaryObjects ?? []),
    characters: patch.characters !== undefined ? patch.characters : (prev?.characters ?? []),
    pov: patch.pov !== undefined ? patch.pov : (prev?.pov ?? null),
    physicsRules: patch.physicsRules !== undefined ? patch.physicsRules : (prev?.physicsRules ?? []),
    keyMoment: patch.keyMoment !== undefined ? patch.keyMoment : (prev?.keyMoment ?? null),
    kind: patch.kind !== undefined ? patch.kind : (prev?.kind ?? "waking"),
    altMoments: patch.altMoments !== undefined ? patch.altMoments : (prev?.altMoments ?? []),
    source: "USER",
    model: prev?.model ?? null,
    promptVersion: SCENE_PROMPT_VERSION,
    sourceHash: sha256(chapterText),
    updatedAt: Date.now(),
  };
}

function isSceneFresh(scene: ChapterScene, chapterText: string): boolean {
  return scene.promptVersion === SCENE_PROMPT_VERSION && scene.sourceHash === sha256(chapterText);
}

export function classifyTemporalPresence(
  kinds: ReadonlySet<ChapterSceneKind>,
): TemporalPresence | null {
  if (kinds.size === 0) return null;
  if (kinds.has("waking")) return "present";
  const hasFlashback = kinds.has("flashback");
  const hasDream = kinds.has("dream");
  if (hasFlashback && hasDream) return "past_dream_only";
  if (hasFlashback) return "flashback_only";
  if (hasDream) return "dream_only";
  return null;
}

export function resolveTemporalPresence(
  computed: TemporalPresence | null,
  existing: TemporalPresence | null,
  presentInFailedChapter: boolean,
): TemporalPresence | null {
  if (computed === null && presentInFailedChapter) return existing;
  return computed;
}

function reconcileMembership(names: string[], name: string, shouldBePresent: boolean): string[] {
  const present = names.some((n) => namesMatch(name, n));
  if (shouldBePresent && !present) return [...names, name];
  if (!shouldBePresent && present) return names.filter((n) => !namesMatch(name, n));
  return names;
}

// Canonicalizza i nomi dei personaggi estratti dal GPT sul cast del libro: quando un nome estratto
// combacia (namesMatch lasco) con un membro del cast, usa il NOME del cast. Preserva l'ordine di
// estrazione e deduplica (case-insensitive). NON aggiunge personaggi dall'NLP/menzioni: la scheda
// elenca solo chi è FISICAMENTE in scena (scelta utente: presenza fisica, non semplice menzione).
function canonicalizeCharacters(extracted: string[], cast: BookCharacter[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of extracted) {
    const match = cast.find((c) => namesMatch(c.name, n));
    const name = match ? match.name : n;
    const key = name.toLowerCase().trim();
    if (key !== "" && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}
