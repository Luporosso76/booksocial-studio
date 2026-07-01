import { describe, expect, it } from "vitest";
import { sdCliSpawnPlan } from "../src/media/imageGen.js";

describe("sdCliSpawnPlan", () => {
  it("leaves sd-cli direct when no resource env is set", () => {
    expect(sdCliSpawnPlan("/opt/sd-cli", ["--steps", "8"], {})).toEqual({
      command: "/opt/sd-cli",
      args: ["--steps", "8"],
    });
  });

  it("wraps sd-cli with nice, ionice and taskset when configured", () => {
    expect(
      sdCliSpawnPlan("/opt/sd-cli", ["--steps", "8"], {
        SDCPP_NICE: "10",
        SDCPP_IONICE: "best-effort:7",
        SDCPP_CPUSET: "4-15",
      }),
    ).toEqual({
      command: "nice",
      args: [
        "-n",
        "10",
        "ionice",
        "-c",
        "2",
        "-n",
        "7",
        "taskset",
        "-c",
        "4-15",
        "/opt/sd-cli",
        "--steps",
        "8",
      ],
    });
  });

  it("ignores invalid optional resource env values", () => {
    expect(
      sdCliSpawnPlan("/opt/sd-cli", ["--steps", "8"], {
        SDCPP_NICE: "abc",
        SDCPP_IONICE: "best-effort:99",
        SDCPP_CPUSET: "4-15;rm",
      }),
    ).toEqual({
      command: "/opt/sd-cli",
      args: ["--steps", "8"],
    });
  });
});
