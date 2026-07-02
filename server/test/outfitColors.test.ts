import { describe, expect, it } from "vitest";
import { extractOutfitColors } from "../src/content/characterOutfits.js";
import type { CharacterOutfits } from "../src/domain.js";

// Estrazione FAMIGLIE colore a CONFINE DI PAROLA: gli stem (prefissi) devono matchare all'inizio di
// una parola ("ross" → "rossa/rosso"), MAI in mezzo ("grosso" NON è rosso).
function outfit(defaultText: string): CharacterOutfits {
  return { default: defaultText, contexts: [], signature: null };
}

describe("extractOutfitColors (confine di parola)", () => {
  it("'maglione grosso' → NON rileva rosso (falso positivo storico)", () => {
    expect(extractOutfitColors(outfit("maglione grosso"))).not.toContain("rosso");
  });

  it("'camicia rossa' → rosso", () => {
    expect(extractOutfitColors(outfit("camicia rossa"))).toContain("rosso");
  });

  it("'cintura dorata' → giallo", () => {
    expect(extractOutfitColors(outfit("cintura dorata"))).toContain("giallo");
  });

  it("'polo nera' → nero", () => {
    expect(extractOutfitColors(outfit("polo nera"))).toContain("nero");
  });

  it("'T-shirt bordeaux' → rosso", () => {
    expect(extractOutfitColors(outfit("T-shirt bordeaux"))).toContain("rosso");
  });

  it("outfit assente → nessun colore", () => {
    expect(extractOutfitColors(null)).toEqual([]);
    expect(extractOutfitColors(undefined)).toEqual([]);
  });

  it("scandisce anche signature e contexts", () => {
    const o: CharacterOutfits = {
      default: null,
      contexts: [{ when: "mare", outfit: "costume verde", age: null, appearance: null }],
      signature: "cappello blu",
    };
    const colors = extractOutfitColors(o);
    expect(colors).toContain("verde");
    expect(colors).toContain("blu");
  });
});
