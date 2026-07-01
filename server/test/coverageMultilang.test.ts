import { describe, expect, it } from "vitest";
import { coverageTokens } from "../src/content/imagePrompt.js";

describe("coverageTokens — mappa apparenza multilingua", () => {
  it("mappa i termini italiani a inglese", () => {
    const t = coverageTokens("capelli castani corti, pelle olivastra, barba");
    expect(t).toContain("hair");
    expect(t).toContain("brown");
    expect(t).toContain("short");
    expect(t).toContain("olive");
    expect(t).toContain("beard");
  });

  it("mappa i termini francesi a inglese (accenti inclusi)", () => {
    const t = coverageTokens("cheveux bruns courts, peau mate, barbe");
    expect(t).toContain("hair");
    expect(t).toContain("brown");
    expect(t).toContain("short");
    expect(t).toContain("skin");
  });

  it("mappa i termini spagnoli a inglese", () => {
    const t = coverageTokens("pelo negro corto, piel clara");
    expect(t).toContain("hair");
    expect(t).toContain("black");
    expect(t).toContain("short");
    expect(t).toContain("skin");
    expect(t).toContain("light");
  });

  it("mappa i termini tedeschi a inglese", () => {
    const t = coverageTokens("kurze braune haare, helle haut");
    expect(t).toContain("short");
    expect(t).toContain("brown");
    expect(t).toContain("hair");
    expect(t).toContain("skin");
    expect(t).toContain("light");
  });

  it("i demonimi principali convergono su una forma inglese comune tra le lingue", () => {
    for (const src of ["italiano", "italien", "italienisch"]) {
      expect(coverageTokens(src)).toContain("italian");
    }
    for (const src of ["francese", "francais", "franzosisch"]) {
      expect(coverageTokens(src)).toContain("french");
    }
  });

  it("lascia invariati i termini inglesi (passthrough) e scarta le stopword multilingua", () => {
    expect(coverageTokens("short brown hair")).toEqual(["short", "brown", "hair"]);

    expect(coverageTokens("el pelo y la barba")).not.toContain("el");
    expect(coverageTokens("les cheveux et la barbe")).not.toContain("et");
  });
});
