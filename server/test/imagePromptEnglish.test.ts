import { describe, expect, it } from "vitest";
import { buildSceneDescription } from "../src/content/imagePrompt.js";
import type { ContentEngine } from "../src/content/engine.js";

class ScriptedEngine implements ContentEngine {
  readonly prompts: string[] = [];

  constructor(private readonly responses: string[]) {}

  name(): string {
    return "scripted";
  }

  async run(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    const next = this.responses.shift();
    if (next == null) throw new Error("Unexpected engine call");
    return next;
  }
}

describe("image prompt English normalization", () => {
  it("translates appended canonical character fragments to English", async () => {
    const engine = new ScriptedEngine([
      `Create a single cinematic image of a windsurfer.
Subject:
An athletic rider on a complete windsurf rig.
Scene:
Cabarete reef.
TAGS: windsurf, cabarete, reef
CHARACTERS: Marco Romidi`,
      `Create a single cinematic image of a windsurfer.
Subject:
An athletic rider on a complete windsurf rig.
The person shown is Italian Roman, light olive skin, age about 35, short dark brown hair.
Scene:
Cabarete reef.`,
    ]);

    const scene = await buildSceneDescription(engine, {
      chapterExcerpt: "Marco Romidi rides a windsurf near Cabarete reef.",
      chapterTitle: "Windsurf",
      bookTitle: "Test book",
      characters: [
        {
          name: "Marco Romidi",
          ethnicity: "italiano romano, pelle olivastra chiara",
          age: "circa 35 anni",
          physical: "capelli castano scuro corti e ordinati, corporatura asciutta",
        },
      ],
      imageProfile: "gemini (gemini-2.5-flash-image) = Gemini native image model.",
    });

    expect(scene?.description).toContain("Subject:\nAn athletic rider");
    expect(scene?.description).toContain("Italian Roman, light olive skin, age about 35");
    expect(scene?.description).not.toContain("italiano romano");
    expect(scene?.description).not.toContain("pelle olivastra");
    expect(engine.prompts).toHaveLength(2);
    expect(engine.prompts[1]).toContain("translate FINAL image-generation prompts to ENGLISH");
  });

  it("instructs the text engine to build compact subject-first prompts for Z-Image", async () => {
    const engine = new ScriptedEngine([
      `Exactly two Italian men are visible in a wide evening salon, both full body beside an unrolled practice mat.
TAGS: salon, practice mat, tension
CHARACTERS: Luca Bianchi, Marco Neri`,
      `Exactly two Italian men are visible in a wide evening salon, both full body beside an unrolled practice mat.`,
    ]);

    const scene = await buildSceneDescription(engine, {
      chapterExcerpt: "Luca and Marco stand in a dim salon beside an unrolled practice mat.",
      chapterTitle: "The mat",
      bookTitle: "Test book",
      characters: [
        {
          name: "Luca Bianchi",
          ethnicity: "Italian, light olive skin",
          age: "around 49 years old",
          physical: "lean build, short neat dark brown hair",
        },
        {
          name: "Marco Neri",
          ethnicity: "Italian, Mediterranean skin",
          age: "around 52 years old",
          physical: "slim build, short slightly receding dark brown hair",
        },
      ],
      imageProfile: "local = Z-Image Turbo via stable-diffusion.cpp.",
    });

    expect(scene?.description).toContain("Exactly two Italian men");
    expect(engine.prompts[0]).toContain("ORDER FOR Z-IMAGE");
    expect(engine.prompts[0]).toContain("stable-diffusion.cpp / sd-cli");
    expect(engine.prompts[0]).toContain("exact number of visible people");
    expect(engine.prompts[0]).toContain("lateral medium close-up");

    expect(engine.prompts[0]).toContain("POSITIVE ONLY");
    expect(engine.prompts[0]).not.toContain("no extra people, no cropped bodies, no readable text");
    expect(engine.prompts[0]).toContain("COMPRESS THE CANONICAL VISUAL RULES");
    expect(engine.prompts[0]).not.toContain("TRANSCRIBE every");
    expect(engine.prompts[0]).not.toContain("write the Gemini prompt");
    expect(engine.prompts).toHaveLength(2);
  });

  it("does not append a duplicate canonical reminder when the character traits are already present", async () => {
    const engine = new ScriptedEngine([
      `Exactly one Italian Roman man with light olive skin, about 35 years old and short dark brown hair stands still on the beach.
TAGS: beach, stillness, melancholy
CHARACTERS: Marco Romidi`,
      `Exactly one Italian Roman man with light olive skin, about 35 years old and short dark brown hair stands still on the beach.`,
    ]);

    const scene = await buildSceneDescription(engine, {
      chapterExcerpt: "Marco Romidi stands still on the beach.",
      chapterTitle: "Beach",
      bookTitle: "Test book",
      characters: [
        {
          name: "Marco Romidi",
          ethnicity: "Italian Roman, light olive skin",
          age: "about 35 years old",
          physical: "short dark brown hair, lean build",
        },
      ],
      imageProfile: "local = Z-Image Turbo via stable-diffusion.cpp.",
    });

    expect(scene?.description).toContain("Exactly one Italian Roman man");
    expect(engine.prompts[1]).not.toContain("The person shown is");
    expect(engine.prompts[1]).not.toContain("The people shown are");
    expect(engine.prompts).toHaveLength(2);
  });
});
