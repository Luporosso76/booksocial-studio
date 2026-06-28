import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TextCfg } from "../src/content/aiSettings.js";

type BuildEngine = (cfg: TextCfg, provider: string, modelOverride?: string) => { name(): string };
let buildEngine: BuildEngine;

beforeAll(async () => {
  process.env.BOOKSOCIAL_DATA_DIR = mkdtempSync(join(tmpdir(), "bs-engine-"));
  ({ buildEngine } = await import("../src/content/engine.js"));
});

const SUPPORTED = ["opencode", "codex", "claude", "agy", "ollama"];
const UNSUPPORTED = [
  "openai",
  "anthropic",
  "google",
  "openai-compatible",
  "none",
  "",
  "totally-made-up-provider",
];

function baseCfg(): TextCfg {
  return {
    provider: "opencode",
    ollamaBaseUrl: "http://localhost:11434/v1",
    ollamaModel: "llama3",
    opencodeModel: "test-model",
    codexModel: null,
    claudeModel: null,
    agyModel: null,
    fallbackProvider: "none",
    fallbackModel: "",
  };
}

describe("buildEngine provider registry", () => {
  for (const provider of UNSUPPORTED) {
    it(`throws a clear error for unsupported provider '${provider || "(empty)"}'`, () => {
      let caught: Error | undefined;
      try {
        buildEngine(baseCfg(), provider);
      } catch (e) {
        caught = e as Error;
      }
      expect(caught).toBeInstanceOf(Error);
      const msg = caught!.message;
      for (const s of SUPPORTED) {
        expect(msg).toContain(s);
      }
    });
  }

  for (const provider of SUPPORTED) {
    it(`builds an engine (no unsupported error) for supported provider '${provider}'`, () => {
      const engine = buildEngine(baseCfg(), provider);
      expect(typeof engine.name).toBe("function");
    });
  }
});
