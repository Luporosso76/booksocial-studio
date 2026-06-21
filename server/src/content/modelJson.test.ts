import { test } from "node:test";
import assert from "node:assert/strict";
import { parseModelJson } from "./modelJson.js";
import { ContentError } from "./engine.js";

// Test PURI: nessuna rete, nessun DB. parseModelJson isola il primo oggetto JSON
// bilanciato dalla risposta testuale del modello.

test("parseModelJson: oggetto JSON nudo", () => {
  assert.deepEqual(parseModelJson('{"a":1,"b":"x"}'), { a: 1, b: "x" });
});

test("parseModelJson: JSON dentro fence ```json", () => {
  const out = 'Ecco il risultato:\n```json\n{"ok":true}\n```\nfine.';
  assert.deepEqual(parseModelJson(out), { ok: true });
});

test("parseModelJson: oggetti annidati e graffe in stringa", () => {
  const out = 'prefix {"nested":{"k":"}{"},"n":2} suffix';
  assert.deepEqual(parseModelJson(out), { nested: { k: "}{" }, n: 2 });
});

test("parseModelJson: nessun oggetto -> ContentError", () => {
  assert.throws(() => parseModelJson("nessun json qui"), ContentError);
});

test("parseModelJson: JSON malformato -> ContentError", () => {
  assert.throws(() => parseModelJson('{"a": }'), ContentError);
});
