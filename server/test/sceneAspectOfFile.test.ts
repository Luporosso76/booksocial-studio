import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sceneAspectOfFile } from "../src/routes/_shared.js";

function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

async function png(width: number, height: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bs-aspect-"));
  const path = join(dir, `${width}x${height}.png`);
  await writeFile(path, pngHeader(width, height));
  return path;
}

describe("sceneAspectOfFile", () => {
  it("maps a landscape image to the used wide content format", async () => {
    await expect(sceneAspectOfFile(await png(1344, 768))).resolves.toBe("1.91:1");
  });

  it("preserves a generated 9:16 portrait image as 9:16", async () => {
    await expect(sceneAspectOfFile(await png(768, 1344))).resolves.toBe("9:16");
  });

  it("preserves 4:5 instead of collapsing it to square", async () => {
    await expect(sceneAspectOfFile(await png(1024, 1280))).resolves.toBe("4:5");
  });

  it("preserves the wide 1.91:1 format", async () => {
    await expect(sceneAspectOfFile(await png(1216, 640))).resolves.toBe("1.91:1");
  });

  it("falls back to square when dimensions cannot be read", async () => {
    await expect(sceneAspectOfFile("/path/that/does/not/exist.png")).resolves.toBe("1:1");
  });
});
