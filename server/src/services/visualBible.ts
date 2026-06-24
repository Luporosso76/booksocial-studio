// Orchestratore della "bibbia visiva" per-libro: esegue in SEQUENZA gli step canonici che rendono
// stabili e coerenti tutte le immagini del libro (aspetto fisico, schede capitolo, abiti, oggetti &
// mondo, personaggi minori, presenza). L'ordine NON è arbitrario: outfits/props/minors leggono le
// SCHEDE CAPITOLO, che quindi devono esistere prima (sceneCards precede). Ogni step è best-effort:
// un errore marca SOLO quello step come 'failed' e si prosegue col successivo.
//
// Le funzioni-step sono ESPORTATE e condivise con gli endpoint sincroni di routes.ts (stessa logica,
// nessuna duplicazione). Il callback `onItem` permette al chiamante (orchestratore) di avanzare i
// contatori del job; gli endpoint sincroni lo omettono.

import { books, characters } from "../db/repositories.js";
import type { ContentEngine } from "../content/engine.js";
import type { ChapterSceneService } from "./chapterSceneService.js";
import { generateAppearance } from "../content/characterAppearance.js";
import { generateOutfits } from "../content/characterOutfits.js";
import { generateVisualProps } from "../content/visualProps.js";
import { extractMinorsForChapter } from "../content/minorCharacters.js";
import { collectCharacterPassages } from "../content/characterText.js";
import type { MinorCharacter } from "../domain.js";
import {
  startVisualBible,
  setStepRunning,
  setStepStatus,
  setStepTotal,
  bumpStep,
  finishVisualBible,
  VB_STEP_ORDER,
  type VBStepKey,
} from "../visualBibleJobs.js";

export interface VisualBibleDeps {
  engine: ContentEngine;
  chapterScenes: ChapterSceneService;
}

// Callback opzionali per riportare l'avanzamento al job (totale noto + un item completato).
interface StepHooks {
  onTotal?: (total: number) => void;
  onItem?: () => void;
}

// ---- STEP: aspetto fisico canonico (physical, source=AI) per ogni personaggio ----
export async function stepAppearance(
  engine: ContentEngine,
  bookId: number,
  opts: { onlyWeak?: boolean } = {},
  hooks: StepHooks = {},
): Promise<string[]> {
  const book = await books.get(bookId);
  if (!book) return [];
  const lang = book.language || "italiano";
  const country = book.visualProps?.country ?? null;
  const chapters = await books.chapters(bookId);
  const cast = await characters.byBook(bookId);
  hooks.onTotal?.(cast.length);
  const updated: string[] = [];
  for (const ch of cast) {
    if (opts.onlyWeak && (ch.physical ?? "").trim().length >= 80) {
      hooks.onItem?.();
      continue;
    }
    const relevant =
      ch.chapters.length > 0 ? chapters.filter((c) => ch.chapters.includes(c.index)) : chapters;
    const sourceText = collectCharacterPassages(relevant, ch.name);
    const desc = await generateAppearance(engine, {
      name: ch.name,
      role: ch.role,
      occupation: ch.occupation,
      personality: ch.personality,
      physical: ch.physical,
      notes: ch.notes,
      bookTitle: book.title,
      language: lang,
      sourceText,
      country,
    });
    if (desc) {
      await characters.update({ ...ch, physical: desc, updatedAt: Date.now() });
      updated.push(ch.name);
    }
    hooks.onItem?.();
  }
  return updated;
}

// ---- STEP: abiti canonici (outfits_json) per ogni personaggio, legati alle ambientazioni ----
export async function stepOutfits(
  engine: ContentEngine,
  bookId: number,
  hooks: StepHooks = {},
): Promise<string[]> {
  const book = await books.get(bookId);
  if (!book) return [];
  const lang = book.language || "italiano";
  const country = book.visualProps?.country ?? null;
  const chapters = await books.chapters(bookId);
  const settingSet = new Set<string>();
  for (const ch of chapters) {
    const sc = ch.scene;
    if (!sc) continue;
    // Vocabolario per le keyword "when" = luogo + ambiente + oggetti principali delle schede, così
    // le keyword degli abiti combaciano con ciò contro cui resolveOutfit confronta.
    for (const v of [sc.location, sc.environment, ...sc.mainObjects]) {
      const t = (v ?? "").trim();
      if (t) settingSet.add(t);
    }
  }
  const settings = [...settingSet];
  const cast = await characters.byBook(bookId);
  hooks.onTotal?.(cast.length);
  const updated: string[] = [];
  for (const ch of cast) {
    const relevant =
      ch.chapters.length > 0 ? chapters.filter((c) => ch.chapters.includes(c.index)) : chapters;
    const sourceText = collectCharacterPassages(relevant, ch.name);
    const outfits = await generateOutfits(engine, {
      name: ch.name,
      role: ch.role,
      occupation: ch.occupation,
      personality: ch.personality,
      physical: ch.physical,
      bookTitle: book.title,
      language: lang,
      settings,
      sourceText,
      country,
      directives: book.visualDirectives ?? null,
    });
    if (outfits) {
      await characters.update({ ...ch, outfits, updatedAt: Date.now() });
      updated.push(ch.name);
    }
    hooks.onItem?.();
  }
  return updated;
}

// ---- STEP: canone OGGETTI/VEICOLI ricorrenti + lato di guida (visual_props_json) ----
export async function stepProps(
  engine: ContentEngine,
  bookId: number,
  hooks: StepHooks = {},
): Promise<void> {
  const book = await books.get(bookId);
  if (!book) return;
  hooks.onTotal?.(1);
  const chapters = await books.chapters(bookId);
  const settingSet = new Set<string>();
  const objectSet = new Set<string>();
  for (const ch of chapters) {
    const sc = ch.scene;
    if (!sc) continue;
    for (const v of [sc.location, sc.environment]) {
      const t = (v ?? "").trim();
      if (t) settingSet.add(t);
    }
    for (const o of [...sc.mainObjects, ...sc.secondaryObjects]) {
      const t = (o ?? "").trim();
      if (t) objectSet.add(t);
    }
  }
  const cast = await characters.byBook(bookId);
  const props = await generateVisualProps(engine, {
    bookTitle: book.title,
    language: book.language || "italiano",
    settings: [...settingSet],
    objects: [...objectSet],
    characters: cast.map((ch) => ch.name),
  });
  if (props) await books.setVisualProps(bookId, props);
  hooks.onItem?.();
}

// ---- STEP: PERSONAGGI MINORI/incidentali canonici (visual_extras_json), dedup per label ----
export async function stepMinors(
  engine: ContentEngine,
  bookId: number,
  hooks: StepHooks = {},
): Promise<void> {
  const book = await books.get(bookId);
  if (!book) return;
  const chapters = await books.chapters(bookId);
  hooks.onTotal?.(chapters.length);
  const cast = await characters.byBook(bookId);
  const knownCast = cast.map((ch) => ch.name);
  const minors: MinorCharacter[] = [];
  const seen = new Set<string>();
  for (const ch of chapters) {
    const sc = ch.scene;
    const sceneKeywords = sc
      ? [sc.location ?? "", sc.environment ?? "", ...sc.mainObjects].join(" ").toLowerCase().trim()
      : "";
    const extracted = await extractMinorsForChapter(engine, {
      chapterText: ch.text,
      chapterTitle: ch.title,
      language: book.language || "italiano",
      knownCast,
      sceneKeywords,
    });
    for (const m of extracted) {
      const key = m.label.toLowerCase().trim();
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      minors.push(m);
    }
    hooks.onItem?.();
  }
  await books.setVisualExtras(bookId, { minors });
}

// ---- STEP: schede capitolo (build/cache di ogni scheda visiva) ----
async function stepSceneCards(
  chapterScenes: ChapterSceneService,
  bookId: number,
  hooks: StepHooks = {},
): Promise<void> {
  const chapters = await books.chapters(bookId);
  hooks.onTotal?.(chapters.length);
  for (const ch of chapters) {
    // Rigenera SEMPRE la scheda (ignora la cache), così ogni capitolo riceve il keyMoment aggiornato.
    await chapterScenes.regenerate(bookId, ch.index);
    hooks.onItem?.();
  }
}

// ---- STEP: ricalcolo presenza personaggi per capitolo ----
async function stepPresence(
  chapterScenes: ChapterSceneService,
  bookId: number,
  hooks: StepHooks = {},
): Promise<void> {
  hooks.onTotal?.(1);
  await chapterScenes.recomputeCharacterChapters(bookId);
  hooks.onItem?.();
}

// Esegue UN singolo step avvolto in try/catch (best-effort): aggiorna lo stato del job e prosegue.
async function runStep(bookId: number, key: VBStepKey, fn: () => Promise<void>): Promise<void> {
  setStepRunning(bookId, key);
  try {
    await fn();
    setStepStatus(bookId, key, "done");
  } catch (e) {
    setStepStatus(bookId, key, "failed");
    console.warn(
      `[visualBible] step '${key}' fallito per libro ${bookId}:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

// Costruisce la bibbia visiva eseguendo gli step richiesti IN ORDINE CANONICO. Best-effort per step.
export async function buildVisualBible(
  deps: VisualBibleDeps,
  bookId: number,
  stepKeys: VBStepKey[],
): Promise<void> {
  const ordered = VB_STEP_ORDER.filter((k) => stepKeys.includes(k));
  startVisualBible(bookId, ordered);
  for (const key of ordered) {
    const hooks: StepHooks = {
      onTotal: (total) => setStepTotal(bookId, key, total),
      onItem: () => bumpStep(bookId, key),
    };
    await runStep(bookId, key, async () => {
      switch (key) {
        case "appearance":
          await stepAppearance(deps.engine, bookId, {}, hooks);
          break;
        case "sceneCards":
          await stepSceneCards(deps.chapterScenes, bookId, hooks);
          break;
        case "outfits":
          await stepOutfits(deps.engine, bookId, hooks);
          break;
        case "props":
          await stepProps(deps.engine, bookId, hooks);
          break;
        case "minors":
          await stepMinors(deps.engine, bookId, hooks);
          break;
        case "presence":
          await stepPresence(deps.chapterScenes, bookId, hooks);
          break;
      }
    });
  }
  finishVisualBible(bookId);
}
