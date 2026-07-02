import { describe, expect, it } from "vitest";
import {
  classifyTemporalPresence,
  resolveTemporalPresence,
} from "../src/services/chapterSceneService.js";
import { flashbackBlock, type SceneCharacter } from "../src/content/imagePrompt.js";
import type { ChapterSceneKind } from "../src/domain.js";

// A) Classificazione: dai TIPI di scena in cui un personaggio compare deriva la presenza temporale.
describe("classifyTemporalPresence", () => {
  const kinds = (...k: ChapterSceneKind[]) => new Set<ChapterSceneKind>(k);

  it("nessuna scena classificata → null (retrocompat = present a valle)", () => {
    expect(classifyTemporalPresence(kinds())).toBeNull();
  });

  it("qualsiasi scena presente (waking) → present", () => {
    expect(classifyTemporalPresence(kinds("waking"))).toBe("present");
    // Anche con flashback/sogno: basta UNA scena presente per essere 'present'.
    expect(classifyTemporalPresence(kinds("waking", "flashback"))).toBe("present");
    expect(classifyTemporalPresence(kinds("waking", "dream", "flashback"))).toBe("present");
  });

  it("solo flashback → flashback_only", () => {
    expect(classifyTemporalPresence(kinds("flashback"))).toBe("flashback_only");
  });

  it("solo sogno → dream_only", () => {
    expect(classifyTemporalPresence(kinds("dream"))).toBe("dream_only");
  });

  it("flashback + sogno, nessuna scena presente → past_dream_only", () => {
    expect(classifyTemporalPresence(kinds("flashback", "dream"))).toBe("past_dream_only");
  });
});

// A2) Preservazione su capitoli FALLITI: se la classificazione è null ma il personaggio è presente
// in un capitolo la cui scheda è fallita, si conserva la presenza temporale ESISTENTE (no azzeramento).
describe("resolveTemporalPresence (capitoli falliti)", () => {
  it("computed != null → usa sempre computed (ignora l'esistente)", () => {
    expect(resolveTemporalPresence("present", "flashback_only", false)).toBe("present");
    expect(resolveTemporalPresence("present", "flashback_only", true)).toBe("present");
    expect(resolveTemporalPresence("flashback_only", null, true)).toBe("flashback_only");
  });

  it("computed null + presenza in capitolo fallito → conserva l'esistente", () => {
    // Il caso del bug: unica scena in un capitolo fallito → NON deve diventare null (→ present a valle).
    expect(resolveTemporalPresence(null, "flashback_only", true)).toBe("flashback_only");
    expect(resolveTemporalPresence(null, "dream_only", true)).toBe("dream_only");
  });

  it("computed null senza capitoli falliti → null (comportamento invariato)", () => {
    expect(resolveTemporalPresence(null, "flashback_only", false)).toBeNull();
    expect(resolveTemporalPresence(null, null, false)).toBeNull();
  });
});

// B) Uso nel prompt immagine: il flashbackBlock NON ringiovanisce un personaggio flashback_only
// (la sua età canonica è GIÀ del passato), fissa un'età assoluta a chi ne ha una (età del CONTESTO
// flashback/sogno del foglio personaggio) e NON applica alcun ringiovanimento a tappeto.
describe("flashbackBlock temporal presence", () => {
  const present: SceneCharacter = { name: "Anna", temporalPresence: "present" };
  const flashbackOnly: SceneCharacter = { name: "Gianluca", temporalPresence: "flashback_only" };

  it("aggiunge una clausola di eccezione per il personaggio flashback_only (niente doppio ringiovanimento)", () => {
    // Anna (presente) riceve un'età di CONTESTO; Gianluca (flashback_only, senza età) resta escluso.
    const ctxAges = new Map([["anna", { age: "25", appearance: null }]]);
    const block = flashbackBlock({ setting: "gioventù" }, [present, flashbackOnly], ctxAges);
    // Il flashback_only è escluso dal ringiovanimento: clausola d'eccezione col suo nome.
    expect(block).toContain("EXCEPTION");
    expect(block).toContain("Gianluca");
    expect(block).toContain("NOT younger");
    // Anna ha un'età di contesto → NON è nell'eccezione.
    expect(block).not.toMatch(/EXCEPTION[^.]*\bAnna\b/);
    expect(block).toContain("Anna is 25 years old");
  });

  it("con soli personaggi presenti e nessuna età NON aggiunge eccezione né ringiovanimento a tappeto", () => {
    const block = flashbackBlock({ setting: "gioventù" }, [present]);
    expect(block).not.toContain("EXCEPTION");
    // Nessun ringiovanimento a tappeto: priorità 4 = nessun vincolo d'età per un presente senza età.
    expect(block).not.toMatch(/YOUNGER than/);
  });

  it("un'età di CONTESTO flashback dà l'età assoluta (+aspetto) e NON causa doppio ringiovanimento", () => {
    const chars: SceneCharacter[] = [{ name: "Marco", temporalPresence: "present" }];
    const ctxAges = new Map([["marco", { age: "9", appearance: "younger face, no grey" }]]);
    const block = flashbackBlock({ setting: "infanzia" }, chars, ctxAges);
    expect(block).toContain("Marco is 9 years old, younger face, no grey");
    // Nessuna eccezione e nessun ringiovanimento a tappeto.
    expect(block).not.toContain("EXCEPTION");
    expect(block).not.toMatch(/YOUNGER than/);
  });

  it("l'età di CONTESTO esclude un flashback_only dall'eccezione (no età + 'non cambiarla' insieme)", () => {
    const ctxAges = new Map([["gianluca", { age: "17", appearance: null }]]);
    const block = flashbackBlock({ setting: "passato" }, [flashbackOnly], ctxAges);
    // Ha un'età di contesto → governa lui, niente clausola d'eccezione.
    expect(block).not.toContain("EXCEPTION");
    expect(block).toContain("Gianluca is 17 years old");
  });
});
