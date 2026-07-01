import { describe, expect, it } from "vitest";
import { pickLeastRepeatedSceneSelection } from "../src/services/sceneImageService.js";
import type { SceneSelection } from "../src/content/imagePrompt.js";

function scene(subject: string, brief: string, objects: string[] = []): SceneSelection {
  return {
    subject,
    brief,
    framing: "wide shot",
    characters: [],
    objects,
    mood: "quiet",
    momentType: "waking",
  };
}

describe("pickLeastRepeatedSceneSelection", () => {
  it("keeps the first candidate when there is no scene history", () => {
    const scenes = [
      scene("restaurant table", "Two friends talk at dawn in a Roman restaurant."),
      scene("airport gear bags", "Travel bags wait outside the airport."),
    ];

    expect(pickLeastRepeatedSceneSelection(scenes, [])).toBe(scenes[0]);
  });

  it("prefers the candidate least represented by existing chapter prompts", () => {
    const scenes = [
      scene("restaurant table", "A restaurant table at dawn anchors a quiet departure conversation.", [
        "plates",
        "glasses",
      ]),
      scene("airport gear bags", "Dark windsurf travel gear bags stand outside Santo Domingo airport.", [
        "windsurf bags",
        "passport",
      ]),
    ];
    const history = [
      "The restaurant table sits at the center of a medium shot with plates and glasses at dawn.",
      "A wide shot from inside the empty restaurant shows the table anchoring the conversation.",
      "The Roman restaurant table fills the foreground while two men talk near dawn.",
    ];

    expect(pickLeastRepeatedSceneSelection(scenes, history)).toBe(scenes[1]);
  });
});
