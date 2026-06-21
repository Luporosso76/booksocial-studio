import { ContentError } from "./engine.js";

// Extracts the first balanced { ... } JSON object from a model's text answer.
// Mirrors the Java ModelJson: the model is told to return only JSON but may wrap
// it in a ```json ... ``` fence, so we isolate the first balanced object.

export function parseModelJson(modelOutput: string): unknown {
  const json = extractObject(modelOutput);
  try {
    return JSON.parse(json);
  } catch (e) {
    throw new ContentError(`Risposta del modello non in JSON valido:\n${truncate(modelOutput)}`);
  }
}

function extractObject(s: string): string {
  const start = s.indexOf("{");
  if (start < 0) {
    throw new ContentError(`Nessun oggetto JSON nella risposta del modello:\n${truncate(s)}`);
  }
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
    } else {
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          return s.substring(start, i + 1);
        }
      }
    }
  }
  throw new ContentError("Oggetto JSON non bilanciato nella risposta del modello");
}

function truncate(s: string): string {
  return s.length <= 800 ? s : s.substring(0, 800) + "...";
}
