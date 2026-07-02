import { describe, expect, it } from "vitest";
import { selectChapterScenes } from "../src/content/imagePrompt.js";
import type { ContentEngine } from "../src/content/engine.js";
import type { ChapterScene } from "../src/domain.js";

describe("selectChapterScenes directive guidance", () => {
  it("includes canonical directive bodies while choosing the moment", async () => {
    let capturedPrompt = "";
    const engine: ContentEngine = {
      name: () => "mock",
      run: async (prompt) => {
        capturedPrompt = prompt;
        return JSON.stringify([
          {
            subject: "windsurfer offshore",
            brief: "A windsurfer planes offshore in active water.",
            framing: "wide ocean view",
            characters: [],
            objects: ["windsurf"],
            mood: "energetic",
            momentType: "waking",
          },
        ]);
      },
    };
    const sceneCard: ChapterScene = {
      location: "Cabarete reef",
      environment: "strong wind and turquoise sea",
      mainObjects: ["windsurf"],
      secondaryObjects: [],
      characters: [],
      pov: null,
      physicsRules: [],
      keyMoment: "The windsurfer sails offshore.",
      kind: "waking",
      altMoments: [],
      source: "USER",
      model: null,
      updatedAt: Date.now(),
    };

    const selected = await selectChapterScenes(
      engine,
      {
        chapterTitle: "Wind returns",
        chapterExcerpt: "The windsurfer prepares for the reef.",
        bookTitle: "Test book",
        sceneCard,
        castNames: [],
        objectNames: ["windsurf"],
        directiveNames: ["Windsurf"],
        directiveGuidance: [
          "- Windsurf:\nACTIVE WINDSURF SCENE LOCATION: active windsurfing defaults to an on-water sailing scene, not a beach launch pose.",
        ],
      },
      1,
    );

    expect(selected?.[0]?.subject).toBe("windsurfer offshore");
    expect(capturedPrompt).toContain("CANONICAL VISUAL DIRECTIVES");
    expect(capturedPrompt).toContain("Apply them during scene");
    expect(capturedPrompt).toContain("ACTIVE WINDSURF SCENE LOCATION");
    expect(capturedPrompt).toContain("not a beach launch pose");
  });
});
