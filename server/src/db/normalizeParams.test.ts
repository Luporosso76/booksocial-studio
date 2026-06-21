import { test } from "node:test";
import assert from "node:assert/strict";
import { norm } from "./normalizeParams.js";

// Test PURI: nessuna rete, nessun DB. Verificano la normalizzazione dei bind param.

test("norm: undefined diventa null", () => {
  assert.deepEqual(norm([undefined]), [null]);
});

test("norm: boolean diventa 0/1", () => {
  assert.deepEqual(norm([true, false]), [1, 0]);
});

test("norm: number/string/null/bigint restano invariati", () => {
  const big = 10n;
  assert.deepEqual(norm([42, "ciao", null, big]), [42, "ciao", null, big]);
});

test("norm: array misto", () => {
  assert.deepEqual(norm([undefined, true, "x", 7, false]), [null, 1, "x", 7, 0]);
});

test("norm: array vuoto resta vuoto", () => {
  assert.deepEqual(norm([]), []);
});
