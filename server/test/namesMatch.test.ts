import { describe, expect, it } from "vitest";
import { namesMatch } from "../src/content/characterText.js";

// Confronto lasco fra nomi/oggetti, ma per TOKEN INTERI (mai sottostringhe): l'implementazione
// CONDIVISA usata da chapterSceneService, sceneImageService e visualBible.
describe("namesMatch (per-token, condivisa)", () => {
  it("un token del nome corto contenuto per intero nel lungo → match", () => {
    expect(namesMatch("Marco Romidi", "Marco")).toBe(true);
    expect(namesMatch("Marco", "Marco Romidi")).toBe(true);
    expect(namesMatch("Roberto Speranza", "Speranza")).toBe(true);
  });

  it("nomi identici → match", () => {
    expect(namesMatch("Anna", "Anna")).toBe(true);
  });

  it("case-insensitive e trim", () => {
    expect(namesMatch("  marco romidi ", "MARCO")).toBe(true);
    expect(namesMatch("ANNA", "anna")).toBe(true);
  });

  it("NON combacia per sottostringa dentro una parola", () => {
    // Il bug storico: "Anna".includes non deve far combaciare "Marianna".
    expect(namesMatch("Anna", "Marianna")).toBe(false);
    expect(namesMatch("Marianna", "Anna")).toBe(false);
    expect(namesMatch("Sara", "Rosaria")).toBe(false);
  });

  it("due nomi completi con lo stesso primo nome restano distinti", () => {
    expect(namesMatch("Marco Rossi", "Marco Bianchi")).toBe(false);
  });

  it("nomi/oggetti vuoti → nessun match", () => {
    expect(namesMatch("", "Marco")).toBe(false);
    expect(namesMatch("Marco", "")).toBe(false);
    expect(namesMatch("   ", "Marco")).toBe(false);
  });

  it("NOMI-OGGETTO per token interi: 'auto' NON combacia con 'autobus'", () => {
    expect(namesMatch("auto", "autobus")).toBe(false);
    expect(namesMatch("autobus", "auto")).toBe(false);
    // Ma un oggetto multi-parola combacia se il token intero è presente.
    expect(namesMatch("auto rossa", "auto")).toBe(true);
  });
});
