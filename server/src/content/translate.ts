import type { ContentEngine } from "./engine.js";
import { ContentError } from "./engine.js";

export async function translateToEnglish(engine: ContentEngine, text: string): Promise<string> {
  const src = text.trim();
  if (src === "") return src;
  const prompt = `You translate image-generation prompts to ENGLISH for a text-to-image model.
Translate the text below into natural, concise English suitable as an image prompt.
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
    if (e instanceof ContentError) {
      console.warn(
        `[translate] traduzione EN fallita (motore non disponibile): testo NON tradotto`,
      );
      return src;
    }
    throw e;
  }
}

export async function translateDirectivesToEnglish(
  engine: ContentEngine,
  text: string,
): Promise<string> {
  const src = text.trim();
  if (src === "") return src;
  const prompt = `You translate an author's ART-DIRECTION NOTES for an AI image generator into ENGLISH.
The notes guide how to illustrate a specific book (recurring objects, colours, settings, what to force or
avoid). Translate the notes below into clear, concise English instructions suitable to inject into an
image prompt. PRESERVE the structure: keep separate notes on separate lines, keep ALL concrete visual
details, do NOT add, remove or explain anything. If a line is already English, keep it unchanged.
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
    if (e instanceof ContentError) {
      console.warn(
        `[translate] traduzione EN fallita (motore non disponibile): testo NON tradotto`,
      );
      return src;
    }
    throw e;
  }
}

export async function translateImagePromptToEnglishPreserveStructure(
  engine: ContentEngine,
  text: string,
): Promise<string> {
  const src = text.trim();
  if (src === "") return src;
  const prompt = `You translate FINAL image-generation prompts to ENGLISH for an AI image model.
Translate every non-English fragment into clear natural English, including character ethnicity, age,
skin tone, clothing, equipment, object names, and any appended canonical reminder.

Preserve the exact prompt structure: keep existing section headings such as Subject:, Scene:, Action:,
Composition:, Physical consistency:, Style:, Constraints:, and Output:. Keep line breaks.
Do not add new content, remove details, summarize, explain, or wrap the answer in markdown. If the text is
already fully English, return it unchanged.

Output ONLY the English prompt.

PROMPT:
${src}`;
  try {
    const raw = await engine.run(prompt);
    const cleaned = (raw ?? "")
      .replace(/^```[a-z]*\n?|\n?```$/gi, "")
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    return cleaned.length > 0 ? cleaned : src;
  } catch (e) {
    if (e instanceof ContentError) {
      console.warn(`[translate] traduzione EN del prompt immagine fallita: prompt NON tradotto`);
      return src;
    }
    throw e;
  }
}
