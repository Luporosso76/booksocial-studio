import { test } from "node:test";
import assert from "node:assert/strict";
import { settings } from "../db/repositories.js";
import * as keyring from "../secrets/keyring.js";
import * as aiSettings from "./aiSettings.js";
import { getText } from "./aiSettings.js";

// Test PURO di aiSettings: nessuna RETE. Il DB (settings) è sostituito con uno stub IN-MEMORY
// (l'oggetto `settings` è mutabile). Il keyring è LOCALE (secret-tool, non rete): lo usiamo davvero
// ma puliamo le chiavi ai.key.* in coda; se secret-tool non è disponibile, i test si saltano.
// Verifichiamo: save({keys:{openai}}) rende effectiveView().keys.openai===true SENZA esporre il valore,
// e che il provider scelto via save() si riflette in getText().provider.

const dbStore = new Map<string, string>();
const origSettingsGet = settings.get;
const origSettingsSet = settings.set;

function installDbStub(): void {
  dbStore.clear();
  settings.get = async (k: string) => dbStore.get(k) ?? null;
  settings.set = async (k: string, v: string) => {
    dbStore.set(k, v);
  };
}

function restoreDbStub(): void {
  settings.get = origSettingsGet;
  settings.set = origSettingsSet;
}

// Ripulisce le chiavi e la cache, poi ripristina lo stub DB.
async function cleanup(): Promise<void> {
  for (const k of ["ai.key.openai", "ai.key.anthropic", "ai.key.google"]) {
    await keyring.remove(k).catch(() => {});
  }
  restoreDbStub();
  // Ricarica con DB reale-vuoto/keyring pulito così le altre suite non ereditano la cache di test.
  await aiSettings.load().catch(() => {});
}

test("aiSettings.save: la chiave openai diventa keys.openai===true senza esporre il valore", async (t) => {
  if (!(await keyring.isAvailable())) {
    t.skip("keyring (secret-tool) non disponibile");
    return;
  }
  installDbStub();
  try {
    const secret = "secret-value-123";
    const view = await aiSettings.save({ keys: { openai: secret } });
    assert.equal(view.keys.openai, true);
    // La vista NON deve contenere il valore della chiave da nessuna parte.
    assert.equal(JSON.stringify(view).includes(secret), false);
    // Anche chiamando effectiveView() direttamente dopo save (cache ricaricata).
    assert.equal(aiSettings.effectiveView().keys.openai, true);
    assert.equal(JSON.stringify(aiSettings.effectiveView()).includes(secret), false);
    // Il valore è in chiaro in cache (serve a chiamare le API) ma solo via getText(), mai nella view.
    assert.equal(getText().openaiApiKey, secret);
  } finally {
    await cleanup();
  }
});

test("aiSettings.save: il provider testo scelto si riflette in getText().provider", async () => {
  installDbStub();
  try {
    const view = await aiSettings.save({ text: { provider: "anthropic" } });
    assert.equal(view.text.provider, "anthropic");
    assert.equal(getText().provider, "anthropic");
  } finally {
    await cleanup();
  }
});

test("aiSettings.save: keys=null rimuove la chiave (keys.openai torna false)", async (t) => {
  if (!(await keyring.isAvailable())) {
    t.skip("keyring (secret-tool) non disponibile");
    return;
  }
  installDbStub();
  try {
    await aiSettings.save({ keys: { openai: "x" } });
    assert.equal(aiSettings.effectiveView().keys.openai, true);
    const view = await aiSettings.save({ keys: { openai: null } });
    assert.equal(view.keys.openai, false);
  } finally {
    await cleanup();
  }
});
