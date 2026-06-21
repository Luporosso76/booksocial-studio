import { test } from "node:test";
import assert from "node:assert/strict";
import { appConfig } from "../config.js";
import { createImageEngine } from "./imageEngine.js";

// Test PURO sull'instradamento di createImageEngine(): nessuna rete, nessuno spawn reale.
// appConfig è mutabile: regoliamo IMAGE_PROVIDER e le chiavi prima di chiamare createImageEngine()
// e ripristiniamo lo stato dopo. Non invochiamo mai .generate() (niente HTTP/sd-cli).

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

test("createImageEngine: none -> available()=false", () => {
  withConfig({ imageProvider: "none" }, () => {
    const engine = createImageEngine();
    assert.equal(engine.name(), "none");
    assert.equal(engine.available(), false);
  });
});

test("createImageEngine: openai senza chiave -> available()=false", () => {
  withConfig({ imageProvider: "openai", openaiApiKey: null }, () => {
    const engine = createImageEngine();
    assert.equal(engine.name(), "openai");
    assert.equal(engine.available(), false);
  });
});

test("createImageEngine: openai con chiave -> available()=true", () => {
  withConfig({ imageProvider: "openai", openaiApiKey: "sk-test" }, () => {
    const engine = createImageEngine();
    assert.equal(engine.name(), "openai");
    assert.equal(engine.available(), true);
  });
});

test("createImageEngine: google senza chiave -> available()=false", () => {
  withConfig({ imageProvider: "google", googleApiKey: null }, () => {
    const engine = createImageEngine();
    assert.equal(engine.name(), "google");
    assert.equal(engine.available(), false);
  });
});

test("createImageEngine: google con chiave -> available()=true", () => {
  withConfig({ imageProvider: "google", googleApiKey: "g-test" }, () => {
    const engine = createImageEngine();
    assert.equal(engine.name(), "google");
    assert.equal(engine.available(), true);
  });
});

test("createImageEngine: local è selezionato quando IMAGE_PROVIDER=local", () => {
  withConfig({ imageProvider: "local" }, () => {
    const engine = createImageEngine();
    assert.equal(engine.name(), "local-sdcli");
  });
});

test("createImageEngine: local disabilitato via IMAGEGEN_ENABLED=false -> available()=false", () => {
  const prev = process.env.IMAGEGEN_ENABLED;
  process.env.IMAGEGEN_ENABLED = "false";
  try {
    withConfig({ imageProvider: "local" }, () => {
      const engine = createImageEngine();
      assert.equal(engine.available(), false);
    });
  } finally {
    if (prev === undefined) delete process.env.IMAGEGEN_ENABLED;
    else process.env.IMAGEGEN_ENABLED = prev;
  }
});

test("createImageEngine: auto senza locale disponibile -> name()='none', available()=false", () => {
  const prev = process.env.IMAGEGEN_ENABLED;
  process.env.IMAGEGEN_ENABLED = "false"; // forza il locale a non disponibile
  try {
    withConfig({ imageProvider: "auto" }, () => {
      const engine = createImageEngine();
      assert.equal(engine.name(), "none");
      assert.equal(engine.available(), false);
    });
  } finally {
    if (prev === undefined) delete process.env.IMAGEGEN_ENABLED;
    else process.env.IMAGEGEN_ENABLED = prev;
  }
});
