import { existsSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { dataDir } from "./paths.js";
import * as aiSettings from "./content/aiSettings.js";

const SUPPORTED_TEXT = ["opencode", "codex", "claude", "agy", "ollama"];

export function validateStartupConfig(): void {
  const dir = dataDir();
  const probe = join(dir, `.write-probe-${process.pid}`);
  try {
    writeFileSync(probe, "ok");
    rmSync(probe, { force: true });
  } catch (e) {
    throw new Error(
      `Data directory is not writable: ${dir}. ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!ffmpegPath || !existsSync(ffmpegPath)) {
    console.warn("[config] ffmpeg not found (ffmpeg-static): reel/video rendering may fail.");
  }

  let provider = "";
  try {
    provider = aiSettings.getText().provider;
  } catch {
    provider = "";
  }
  if (!SUPPORTED_TEXT.includes(provider)) {
    console.warn(
      `[config] text provider '${provider || "none"}' not configured/supported: choose opencode/codex/claude/agy/ollama in Settings → AI.`,
    );
  }
}
