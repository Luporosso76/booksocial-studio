import { describe, expect, it } from "vitest";
import { imagePromptDialectBlocks } from "../src/content/imagePrompt.js";

const TAGS_CONTRACT = `"TAGS: " followed by 3 to 6 short lowercase keywords`;
const CHARACTERS_CONTRACT = `"CHARACTERS: " followed by the NAMES (from the CAST) of the named characters you ACTUALLY depicted`;
const NON_NEGOTIABLES_PHRASE = `Spend the words on the NON-NEGOTIABLES instead`;
const NO_STYLE_WORDS = `style/medium words ("illustration", "graphic novel", "comic", "art", "photo")`;

const combos: Array<[boolean, boolean]> = [
  [true, false],
  [false, true],
  [false, false],
];

describe("imagePromptDialectBlocks", () => {
  it("keeps the TAGS and CHARACTERS output contract in every dialect", () => {
    for (const [structuredForGemini, tailoredForZImage] of combos) {
      const { outputFormatBlock } = imagePromptDialectBlocks(structuredForGemini, tailoredForZImage);
      expect(outputFormatBlock).toContain(TAGS_CONTRACT);
      expect(outputFormatBlock).toContain(CHARACTERS_CONTRACT);
    }
  });

  it("keeps the NON-NEGOTIABLES clause where it was before (Gemini + legacy output blocks)", () => {
    const gemini = imagePromptDialectBlocks(true, false);
    const legacy = imagePromptDialectBlocks(false, false);
    expect(gemini.outputFormatBlock).toContain(NON_NEGOTIABLES_PHRASE);
    expect(legacy.outputFormatBlock).toContain(NON_NEGOTIABLES_PHRASE);

    const zimage = imagePromptDialectBlocks(false, true);
    expect(zimage.outputFormatBlock).not.toContain(NON_NEGOTIABLES_PHRASE);
  });

  it("keeps the no-style-words warning where it was before (Gemini + legacy orderBlock)", () => {
    const gemini = imagePromptDialectBlocks(true, false);
    const legacy = imagePromptDialectBlocks(false, false);
    expect(gemini.orderBlock).toContain(NO_STYLE_WORDS);
    expect(legacy.orderBlock).toContain(NO_STYLE_WORDS);
  });

  it("preserves the dialect-specific ORDER guidance", () => {
    const gemini = imagePromptDialectBlocks(true, false);
    const zimage = imagePromptDialectBlocks(false, true);
    const legacy = imagePromptDialectBlocks(false, false);
    expect(gemini.orderBlock).toContain("ORDER (write the Gemini prompt as PLAIN TEXT sections");
    expect(zimage.orderBlock).toContain("ORDER FOR Z-IMAGE");
    expect(legacy.orderBlock).toContain("ORDER (write the paragraph in THIS sequence");

    expect(zimage.styleRule).toContain("STYLE AND QUALITY");
    expect(legacy.styleRule).toContain("RULES: NO style words");
  });

  it("per-provider directive handling: Z-Image COMPRESSES, Gemini/legacy TRANSCRIBE in full", () => {
    const gemini = imagePromptDialectBlocks(true, false);
    const zimage = imagePromptDialectBlocks(false, true);
    const legacy = imagePromptDialectBlocks(false, false);

    expect(zimage.directiveRule).toContain("COMPRESS THE CANONICAL VISUAL RULES");
    expect(zimage.directiveRule).not.toContain("TRANSCRIBE every");

    expect(gemini.directiveRule).toContain("TRANSCRIBE");
    expect(legacy.directiveRule).toContain("TRANSCRIBE");
  });

  it("Z-Image order is positive-only (no negation-leak) and front-loads pose+equipment", () => {
    const zimage = imagePromptDialectBlocks(false, true);
    expect(zimage.orderBlock).toContain("POSITIVE ONLY");

    expect(zimage.orderBlock).not.toContain("no extra people");
    expect(zimage.orderBlock).not.toContain("no cropped bodies");

    expect(zimage.orderBlock).toContain("POSE + EQUIPMENT");
    expect(zimage.orderBlock.indexOf("POSE + EQUIPMENT")).toBeLessThan(
      zimage.orderBlock.indexOf("PEOPLE (after the pose)"),
    );
  });
});
