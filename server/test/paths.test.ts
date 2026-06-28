import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveInsideDataDir, toDataRelativeStrict } from "../src/paths.js";

let dataDirPath: string;
beforeAll(() => {
  dataDirPath = mkdtempSync(join(tmpdir(), "bs-paths-"));
  process.env.BOOKSOCIAL_DATA_DIR = dataDirPath;
});

describe("resolveInsideDataDir", () => {
  it("resolves a relative path inside the data dir", () => {
    const p = resolveInsideDataDir("media/scene.png");
    expect(p.startsWith(dataDirPath)).toBe(true);
  });

  it("blocks an absolute path outside the data dir", () => {
    expect(() => resolveInsideDataDir("/etc/passwd")).toThrow();
  });

  it("blocks ../ traversal escaping the data dir", () => {
    expect(() => resolveInsideDataDir("../../../../etc/passwd")).toThrow();
  });
});

describe("toDataRelativeStrict", () => {
  it("returns a path relative to the data dir for a file inside it", () => {
    expect(toDataRelativeStrict("media/x.png")).toBe("media/x.png");
  });

  it("throws for an absolute path outside the data dir", () => {
    expect(() => toDataRelativeStrict("/etc/passwd")).toThrow();
  });

  it("throws for ../ traversal outside the data dir", () => {
    expect(() => toDataRelativeStrict("../../../../etc/passwd")).toThrow();
  });
});
