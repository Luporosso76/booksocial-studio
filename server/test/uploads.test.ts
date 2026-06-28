import { describe, it, expect } from "vitest";
import { validateUpload } from "../src/uploads.js";

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function file(bytes: number[] | string, name: string, type: string): File {
  const data = typeof bytes === "string" ? bytes : new Uint8Array(bytes);
  return new File([data], name, { type });
}

describe("validateUpload", () => {
  it("accepts a valid markdown book", async () => {
    const { buffer } = await validateUpload(file("# Title\n\ntext", "book.md", "text/markdown"), "book");
    expect(buffer.toString("utf8")).toContain("Title");
  });

  it("rejects a book with a wrong extension", async () => {
    await expect(validateUpload(file("x", "book.exe", "text/plain"), "book")).rejects.toThrow();
  });

  it("rejects an empty file", async () => {
    await expect(validateUpload(file("", "book.md", "text/markdown"), "book")).rejects.toThrow();
  });

  it("accepts a valid PNG image", async () => {
    const { ext } = await validateUpload(file([...PNG_HEADER, 1, 2, 3], "p.png", "image/png"), "image");
    expect(ext).toBe("png");
  });

  it("rejects an image whose content is not an image", async () => {
    await expect(
      validateUpload(file([0, 1, 2, 3, 4, 5, 6, 7, 8], "fake.png", "image/png"), "image"),
    ).rejects.toThrow();
  });

  it("rejects a disallowed image MIME", async () => {
    await expect(
      validateUpload(file([...PNG_HEADER, 1], "p.png", "application/x-msdownload"), "image"),
    ).rejects.toThrow();
  });

  it("accepts a valid audio file (ID3 magic)", async () => {
    const id3 = [0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0, 0, 0, 0, 0];
    const { ext } = await validateUpload(file(id3, "song.mp3", "audio/mpeg"), "audio");
    expect(ext).toBe("mp3");
  });

  it("rejects audio whose content is not audio (magic mismatch)", async () => {
    await expect(
      validateUpload(file([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "fake.mp3", "audio/mpeg"), "audio"),
    ).rejects.toThrow();
  });
});
