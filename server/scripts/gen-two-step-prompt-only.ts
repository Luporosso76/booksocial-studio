import * as aiSettings from "../src/content/aiSettings.js";
import { createEngine } from "../src/content/engine.js";
import { applyStyleForProvider } from "../src/media/imageGen.js";
import { media } from "../src/db/repositories.js";
import { ChapterSceneService } from "../src/services/chapterSceneService.js";
import {
  pickLeastRepeatedSceneSelection,
  SceneImageService,
} from "../src/services/sceneImageService.js";

const BOOK = Number(process.argv[2] ?? 6);
const CHAP = Number(process.argv[3] ?? 11);
const COUNT = Math.max(1, Math.min(12, Math.floor(Number(process.argv[4])) || 8));
const PICK = process.argv[5] ?? "fresh";

const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

async function existingPromptTextsForChapter(bookId: number, chapterIndex: number): Promise<string[]> {
  return (await media.byBook(bookId))
    .filter((m) => m.chapterIdx === chapterIndex && m.genPrompt && m.genPrompt.trim() !== "")
    .map((m) => [m.tags.join(" "), m.genPrompt ?? ""].filter((s) => s.trim() !== "").join("\n"));
}

async function main() {
  await aiSettings.load();
  const textEngine = createEngine();
  const imageCfg = aiSettings.getImage();
  const chapterScenes = new ChapterSceneService({ engine: textEngine });
  const sceneImages = new SceneImageService({ engine: textEngine, chapterScenes });

  log(
    `two-step prompt-only: libro ${BOOK} cap ${CHAP} count ${COUNT} pick ${PICK} ` +
      `(text ${textEngine.name()}, image ${imageCfg.provider}/${imageCfg.geminiImageModel})`,
  );

  const scenes = await sceneImages.selectScenesForChapter(BOOK, CHAP, COUNT);
  console.log("\n===== PASS 1 SELECTED SCENES =====\n");
  console.log(JSON.stringify(scenes, null, 2));
  console.log("\n==================================\n");

  const pickIndex = Math.floor(Number(PICK));
  const selected =
    PICK === "fresh"
      ? pickLeastRepeatedSceneSelection(
          scenes ?? [],
          await existingPromptTextsForChapter(BOOK, CHAP),
        )
      : Number.isInteger(pickIndex)
        ? scenes?.[Math.max(0, pickIndex)] ?? null
        : scenes?.[0] ?? null;

  console.log("===== PASS 1 CHOSEN SCENE =====\n");
  console.log(JSON.stringify(selected, null, 2));
  console.log("\n===============================\n");

  const prompt = await sceneImages.buildPromptForChapter(
    BOOK,
    CHAP,
    selected ? { selectedScene: selected } : undefined,
  );
  const resolved = prompt ? applyStyleForProvider(prompt, imageCfg.provider) : null;
  console.log("===== PASS 2 FINAL IMAGE PROMPT =====\n");
  console.log(resolved ?? "(null)");
  console.log("\n=====================================\n");
  process.exit(0);
}

main().catch((e) => {
  log(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
});
