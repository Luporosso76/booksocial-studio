import type { ContentEngine } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import { languageName } from "./language.js";

export interface VisualDirectiveDraft {
  title: string;
  body: string;
  triggers: string[];
}

const MAX_BODY = 2000;
const MAX_TITLE = 120;

export async function generateVisualDirective(
  engine: ContentEngine,
  input: { intent: string; title?: string; bookTitle?: string | null; language: string },
): Promise<VisualDirectiveDraft> {
  const intent = input.intent.trim();
  const titleHint = (input.title ?? "").trim();
  const lang = languageName(input.language);
  const prompt = `You are an ART DIRECTOR helping curate a VISUAL DIRECTIVE for illustrating a specific book
with an AI image generator (Z-Image). The user gives you their INTENT (what they want to enforce or
achieve when this kind of scene appears) and you turn it into ONE precise, reusable visual directive,
written like a curated canonical art-direction block.

WRITE EVERYTHING IN THIS LANGUAGE: ${lang}. The book title is: ${input.bookTitle ?? "(unknown)"}.
${titleHint !== "" ? `Suggested title hint: ${titleHint}` : ""}

RULES for the directive body:
- Be POSITIVE and PRESCRIPTIVE: describe what the image SHOULD look like. Do NOT write a list of "do not"
  negations; state the correct configuration directly.
- Be explicit and CONCRETE about GEOMETRY, COLOUR, POSTURE, COMPOSITION and placement of elements.
- Stay strictly VISUAL: how things LOOK, not plot, backstory or narration.
- Make it reusable across scenes (a canonical rule), not a one-off description of a single image.

TRIGGERS: propose 3 to 8 lowercase keywords (in ${lang}) that signal when this directive applies — the
objects, places or actions whose presence in a scene means this directive should kick in. If the
directive should ALWAYS apply to every image of the book, return an EMPTY list instead.

USER INTENT:
${intent}

Output STRICT JSON only (no preamble, no markdown fence), with EXACTLY these keys:
{"title":"short label","body":"the directive paragraph(s)","triggers":["kw1","kw2"]}`;

  const raw = await engine.run(prompt);
  const parsed = parseModelJson(raw) as Record<string, unknown>;

  const titleRaw = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const bodyRaw = typeof parsed.body === "string" ? parsed.body.trim() : "";
  const title = (titleRaw !== "" ? titleRaw : titleHint).slice(0, MAX_TITLE);
  const body = bodyRaw.slice(0, MAX_BODY);

  const seen = new Set<string>();
  const triggers: string[] = [];
  if (Array.isArray(parsed.triggers)) {
    for (const t of parsed.triggers) {
      const k = String(t).trim().toLowerCase();
      if (k !== "" && !seen.has(k)) {
        seen.add(k);
        triggers.push(k);
      }
    }
  }

  return { title, body, triggers };
}
