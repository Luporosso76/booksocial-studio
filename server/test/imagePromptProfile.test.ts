import { describe, expect, it } from "vitest";
import { buildScenePrompt } from "../src/media/imageGen.js";
import { geminiImagePromptProfile } from "../src/media/imageEngine.js";

describe("geminiImagePromptProfile", () => {
  it("uses compact direct guidance for gemini-2.5-flash-image", () => {
    const profile = geminiImagePromptProfile("gemini (gemini-2.5-flash-image)", "gemini-2.5-flash-image");

    expect(profile).toContain("compact, direct prompt");
    expect(profile).toContain("Subject:");
    expect(profile).toContain("Constraints:");
    expect(profile).toContain("markdown fences");

    expect(profile).toContain("major support");
    expect(profile).toContain("complete frame");
    expect(profile).not.toContain("triangular sail");
    expect(profile).not.toContain("windsurf");
    expect(profile).toContain("plausible geometry");
    expect(profile).toContain("complete undamaged objects and supports");
  });

  it("uses compact flash guidance for gemini-3.1-flash-image", () => {
    const profile = geminiImagePromptProfile("gemini (gemini-3.1-flash-image)", "gemini-3.1-flash-image");

    expect(profile).toContain("compact, direct prompt");
    expect(profile).toContain("Front-load the full subject");
    expect(profile).not.toContain("balanced prompt");
  });

  it("routes any flash/pro model family correctly (3.1-flash-lite / 3-pro)", () => {
    expect(
      geminiImagePromptProfile("gemini (gemini-3.1-flash-lite-image)", "gemini-3.1-flash-lite-image"),
    ).toContain("compact, direct prompt");
    expect(
      geminiImagePromptProfile("gemini (gemini-3-pro-image)", "gemini-3-pro-image"),
    ).toContain("longer, highly controlled professional prompt");
  });

  it("uses balanced guidance only for an unknown non-flash non-pro model", () => {
    const profile = geminiImagePromptProfile("gemini (gemini-x-image)", "gemini-x-image");

    expect(profile).toContain("balanced prompt");
    expect(profile).toContain("complete composition");
    expect(profile).toContain("large connected shapes before fine technical details");
  });

  it("uses longer controlled guidance for gemini-3-pro-image", () => {
    const profile = geminiImagePromptProfile("gemini (gemini-3-pro-image)", "gemini-3-pro-image");

    expect(profile).toContain("longer, highly controlled professional prompt");
    expect(profile).toContain("lighting and colour");
    expect(profile).toContain("its support and the connected parts");
  });

  it("keeps the markdown examples generic and does not bake in the sample subject", () => {
    const profile = geminiImagePromptProfile("gemini (gemini-3-pro-image)", "gemini-3-pro-image");

    expect(profile).not.toContain("Chilean");
    expect(profile).not.toContain("37-year-old");
    expect(profile).not.toContain("olive skin");
    expect(profile).not.toContain("dark-brown hair");
  });

  it("preserves section headings and inserts style as a section for structured Gemini prompts", () => {
    const prompt = buildScenePrompt(`Create a single cinematic image of a windsurfer.
Subject:
A complete rider and rig.
Scene:
Turquoise ocean water.
Constraints:
No extra sails.
Output:
16:9 landscape image.`);

    expect(prompt).toContain("Subject:\nA complete rider and rig.");
    expect(prompt).toContain("Style:\nRendered as a single full-bleed uninterrupted");
    expect(prompt.indexOf("Style:")).toBeLessThan(prompt.indexOf("Constraints:"));
    expect(prompt).not.toContain("Subject: A complete rider and rig. Scene:");
  });

  it("keeps non-structured prompts as a single flowing line", () => {
    const prompt = buildScenePrompt("A windsurfer\nleans across turquoise water");

    expect(prompt).toContain("A windsurfer leans across turquoise water.");
    expect(prompt.split("Rendered as")[0]).not.toContain("\n");
  });
});
