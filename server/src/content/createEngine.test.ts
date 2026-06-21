import { test } from "node:test";
import assert from "node:assert/strict";
import { appConfig } from "../config.js";
import { createEngine } from "./engine.js";

// Test PURO sull'instradamento di createEngine(): nessuna rete reale, nessun DB.
// appConfig è un oggetto mutabile: regoliamo i campi rilevanti prima di chiamare createEngine()
// e ripristiniamo lo stato originale dopo. Non invochiamo mai .run() per i provider HTTP con chiave
// (niente rete). createEngine() ritorna un WRAPPER DINAMICO che costruisce il motore concreto a ogni
// name()/run(): la cache aiSettings è vuota nei test, quindi il routing ricade su appConfig (env).

function withConfig<T>(patch: Partial<typeof appConfig>, fn: () => T): T {
  const original: Partial<typeof appConfig> = {};
  for (const k of Object.keys(patch) as (keyof typeof appConfig)[]) {
    original[k] = appConfig[k] as never;
    appConfig[k] = patch[k] as never;
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(original) as (keyof typeof appConfig)[]) {
      appConfig[k] = original[k] as never;
    }
  }
}

test("createEngine: ollama non richiede chiave e instrada su name()='ollama'", () => {
  withConfig({ contentProvider: "ollama" }, () => {
    const engine = createEngine();
    assert.equal(engine.name(), "ollama");
  });
});

test("createEngine: openai con chiave instrada su name()='openai'", () => {
  withConfig({ contentProvider: "openai", openaiApiKey: "sk-test" }, () => {
    const engine = createEngine();
    assert.equal(engine.name(), "openai");
  });
});

test("createEngine: openai senza OPENAI_API_KEY -> run() rifiuta con errore esplicito", async () => {
  await withConfig({ contentProvider: "openai", openaiApiKey: null }, () => {
    const engine = createEngine();
    return assert.rejects(() => engine.run("x"), /OPENAI_API_KEY/);
  });
});

test("createEngine: google senza GOOGLE_API_KEY -> run() rifiuta con errore esplicito", async () => {
  await withConfig({ contentProvider: "google", googleApiKey: null }, () => {
    const engine = createEngine();
    return assert.rejects(() => engine.run("x"), /GOOGLE_API_KEY/);
  });
});

test("createEngine: gemini (CLI ad abbonamento) instrada su name()='gemini'", () => {
  withConfig({ contentProvider: "gemini" }, () => {
    const engine = createEngine();
    assert.equal(engine.name(), "gemini");
  });
});

test("createEngine: openai-compatible con chiave instrada su name()='openai-compatible'", () => {
  withConfig({ contentProvider: "openai-compatible", openaiApiKey: "sk-test" }, () => {
    const engine = createEngine();
    assert.equal(engine.name(), "openai-compatible");
  });
});
