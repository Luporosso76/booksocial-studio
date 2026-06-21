import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";

// Traduzione →EN di un prompt per il generatore di immagini, da QUALSIASI lingua di partenza. Il modello
// locale (Z-Image) rende meglio in inglese, ma l'utente può scrivere nella lingua del libro (qualunque
// sia): traduciamo col motore (opencode/gpt-5.5) prima di passare il prompt al generatore. Best-effort:
// se il motore non risponde, ritorna il testo originale (meglio generare qualcosa che fallire).
export async function translateToEnglish(engine: ContentEngine, text: string): Promise<string> {
  const src = text.trim();
  if (src === "") return src;
  const prompt = `You translate image-generation prompts to ENGLISH for a text-to-image model.
The text below may be written in ANY language; detect it automatically (do NOT assume any particular
language) and translate into natural, concise English suitable as an image prompt.
Keep ALL concrete visual details (subjects, colours, setting, mood). Do not add new content, do not
explain. If it is already English, return it unchanged.
Output ONLY the translated prompt on a single line, with no quotes and no preamble.

TEXT:
${src}`;
  try {
    const raw = await engine.run(prompt);
    const cleaned =
      (raw ?? "")
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)[0] ?? "";
    const out = cleaned.replace(/^["'`]+|["'`]+$/g, "").trim();
    return out.length > 0 ? out : src;
  } catch (e) {
    if (e instanceof ContentError) return src; // motore non disponibile: usa l'originale
    throw e;
  }
}

// Traduzione →EN delle DIRETTIVE D'ARTE per-libro, da QUALSIASI lingua di partenza (italiano o la
// lingua del libro, qualunque sia) verso l'inglese: a differenza di translateToEnglish (che collassa
// l'output a una riga, pensato per un prompt singolo), qui il testo può essere MULTI-RIGA (più note
// d'autore) e va preservato per intero. Best-effort: se il motore non risponde, ritorna l'originale.
export async function translateDirectivesToEnglish(
  engine: ContentEngine,
  text: string,
): Promise<string> {
  const src = text.trim();
  if (src === "") return src;
  const prompt = `You translate an author's ART-DIRECTION NOTES for an AI image generator into ENGLISH.
The notes may be written in ANY language; detect the source language automatically (do NOT assume it is any
particular language) and translate into English. The notes guide how to illustrate a specific book
(recurring objects, colours, settings, what to force or avoid). Translate the notes below into clear,
concise English instructions suitable to inject into an image prompt. PRESERVE the structure: keep separate
notes on separate lines, keep ALL concrete visual details, do NOT add, remove or explain anything. If a line
is already English, keep it unchanged.
Output ONLY the translated notes (multiple lines allowed), with no preamble, no quotes, no markdown.

NOTES:
${src}`;
  try {
    const raw = await engine.run(prompt);
    const cleaned = (raw ?? "")
      .replace(/^```[a-z]*\n?|\n?```$/gi, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    return cleaned.length > 0 ? cleaned : src;
  } catch (e) {
    if (e instanceof ContentError) return src; // motore non disponibile: usa l'originale
    throw e;
  }
}
