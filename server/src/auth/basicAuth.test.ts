import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBasicAuth, safeEqual, credentialsMatch } from "./basicAuth.js";

// Test PURI: nessuna rete, nessun server. Verificano parsing e confronto credenziali Basic.

function basic(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`, "utf8").toString("base64");
}

test("parseBasicAuth: header valido", () => {
  assert.deepEqual(parseBasicAuth(basic("admin", "secret")), { user: "admin", pass: "secret" });
});

test("parseBasicAuth: password con ':' preservata", () => {
  assert.deepEqual(parseBasicAuth(basic("admin", "a:b:c")), { user: "admin", pass: "a:b:c" });
});

test("parseBasicAuth: schema case-insensitive", () => {
  assert.deepEqual(parseBasicAuth(basic("u", "p").replace("Basic", "basic")), {
    user: "u",
    pass: "p",
  });
});

test("parseBasicAuth: header assente o di altro schema", () => {
  assert.equal(parseBasicAuth(null), null);
  assert.equal(parseBasicAuth(undefined), null);
  assert.equal(parseBasicAuth(""), null);
  assert.equal(parseBasicAuth("Bearer xyz"), null);
});

test("parseBasicAuth: payload senza ':' è invalido", () => {
  const noColon = "Basic " + Buffer.from("nopassword", "utf8").toString("base64");
  assert.equal(parseBasicAuth(noColon), null);
});

test("safeEqual: uguaglianza e disuguaglianza", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});

test("credentialsMatch: corrette / errate / assenti", () => {
  const expected = { user: "admin", pass: "secret" };
  assert.equal(credentialsMatch({ user: "admin", pass: "secret" }, expected), true);
  assert.equal(credentialsMatch({ user: "admin", pass: "wrong" }, expected), false);
  assert.equal(credentialsMatch({ user: "wrong", pass: "secret" }, expected), false);
  assert.equal(credentialsMatch(null, expected), false);
});
