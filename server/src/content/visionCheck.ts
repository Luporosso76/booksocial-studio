import { runOpenCodeVision } from "./engine.js";
import { parseModelJson } from "./modelJson.js";
import type { SceneQa } from "../domain.js";

export type { SceneQa } from "../domain.js";

const MAX_GEN_PROMPT = 2000;
const MAX_ISSUE_CHARS = 160;
const MAX_ISSUES = 10;

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`;
}

function buildQaPrompt(genPrompt: string, hardConstraints: string[] = []): string {
  const desc = truncate(genPrompt.trim(), MAX_GEN_PROMPT);
  const hard = hardConstraints.map((s) => s.trim()).filter((s) => s !== "");
  const lines = [
    "You are a FAIR but careful quality inspector for AI-generated illustrations.",
    "Look at the attached image. For context, here is the description it was generated from — use it",
    "ONLY to understand the intended subject and a few HARD constraints, NOT as a strict checklist:",
    `"""${desc}"""`,
    "",
    "Report a problem ONLY when you are CONFIDENT it is clearly visible and an ordinary viewer would",
    "notice it at a glance. When in doubt, do NOT report it. Report each of these REAL problems:",
    "- readable TEXT, letters, words, captions, signs, watermark or speech bubbles (a small realistic",
    "  brand logo/emblem on a real object — e.g. a car badge — is fine: IGNORE it);",
    "- clearly DEFORMED anatomy: obvious extra or missing limbs/fingers, mangled or fused hands/faces;",
    "- explicit nudity: visible genitals or female nipples (lingerie, bare shoulders/back are OK);",
    "- a martial-arts gi / karate uniform when the scene is clearly NOT about martial arts;",
    "- a COLLAGE / multiple panels / split frames (it must be ONE single illustration);",
    "- a MAJOR, OBVIOUS contradiction with the description, e.g.: the description states a specific",
    "  sky, colour, time of day or setting and the image clearly shows the opposite; the main subject is",
    "  completely ABSENT or a totally different thing.",
    "",
    "Do NOT report minor or subtle differences: exact age, exact pose or composition, whether a person",
    "is inside vs. beside a vehicle, exact colours or lighting, or subtle surface details — a door with a",
    "faint moulding/border still counts as smooth, a light handle still counts as white. These are",
    "acceptable artistic interpretation, NOT problems. Never invent a defect you are not sure you see.",
  ];
  if (hard.length > 0) {
    lines.push(
      "",
      "MANDATORY CONSTRAINTS (these specific facts are NON-NEGOTIABLE and OVERRIDE the rule just above",
      "about ignoring minor differences): for EACH item below, if the image clearly VIOLATES it you MUST",
      "report it as a problem — even when it would otherwise count as a minor age/ethnicity/detail",
      "difference. The exemption still applies to everything NOT listed here.",
      ...hard.map((h) => `- ${h}`),
    );
  }
  lines.push(
    "",
    "Write each real problem as a SHORT phrase in ITALIAN.",
    'Reply with ONLY this JSON, nothing else: {"ok": boolean, "issues": ["..."]}',
    'Set "ok" to true when there are no clear problems (empty issues).',
  );
  return lines.join("\n");
}

function coerce(parsed: unknown): SceneQa | null {
  if (parsed == null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const rawIssues = Array.isArray(obj.issues) ? obj.issues : [];
  const issues = rawIssues
    .filter((i): i is string => typeof i === "string")
    .map((i) => i.trim())
    .filter((i) => i !== "")
    .map((i) => truncate(i, MAX_ISSUE_CHARS))
    .slice(0, MAX_ISSUES);
  return { ok: issues.length === 0, issues };
}

export async function verifySceneImage(opts: {
  imagePath: string;
  genPrompt: string;
  binary: string;
  model: string;
  timeoutMs: number;

  hardConstraints?: string[];
}): Promise<SceneQa | null> {
  const out = await runOpenCodeVision({
    binary: opts.binary,
    model: opts.model,
    imagePath: opts.imagePath,
    prompt: buildQaPrompt(opts.genPrompt, opts.hardConstraints),
    timeoutMs: opts.timeoutMs,
  });
  if (out == null) return null;
  try {
    return coerce(parseModelJson(out));
  } catch {
    return null;
  }
}
