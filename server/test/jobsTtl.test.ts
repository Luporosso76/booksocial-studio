import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as vb from "../src/visualBibleJobs.js";
import * as sg from "../src/sceneGenJobs.js";

// Punto 4 del pacchetto "publishing & jobs": le Map in-memory dei job non devono trattenere per
// sempre le entry done/failed. Alla conclusione si programma la rimozione dopo 30 min (timer
// unref-ato); se il job riparte per lo stesso bookId, il timer va annullato.

const TTL_MS = 30 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("visualBibleJobs TTL", () => {
  it("rimuove il job dopo 30 minuti dalla conclusione", () => {
    vb.startVisualBible(101, ["sceneCards"]);
    vb.finishVisualBible(101);
    expect(vb.getVisualBible(101)).toBeDefined();

    vi.advanceTimersByTime(TTL_MS - 1000);
    expect(vb.getVisualBible(101)).toBeDefined(); // ancora leggibile dal polling

    vi.advanceTimersByTime(2000);
    expect(vb.getVisualBible(101)).toBeUndefined(); // reaped
  });

  it("annulla la rimozione se il job riparte per lo stesso libro", () => {
    vb.startVisualBible(102, ["sceneCards"]);
    vb.finishVisualBible(102);
    vi.advanceTimersByTime(TTL_MS - 1000);

    vb.startVisualBible(102, ["sceneCards"]); // restart: il timer precedente va annullato
    vi.advanceTimersByTime(TTL_MS);
    expect(vb.getVisualBible(102)).toBeDefined();
    expect(vb.getVisualBible(102)?.status).toBe("running");
  });
});

describe("sceneGenJobs TTL", () => {
  it("rimuove il job dopo 30 minuti da finishSceneGen", () => {
    sg.enqueueSceneBatch(201, { id: "b1", count: 1, aspect: "9:16", chapters: [1] });
    sg.finishSceneGen(201);
    expect(sg.getSceneGen(201)).toBeDefined();

    vi.advanceTimersByTime(TTL_MS + 1000);
    expect(sg.getSceneGen(201)).toBeUndefined();
  });

  it("rimuove il job dopo 30 minuti da failSceneGen", () => {
    sg.enqueueSceneBatch(202, { id: "b1", count: 1, aspect: "9:16", chapters: [1] });
    sg.failSceneGen(202, "boom");
    expect(sg.getSceneGen(202)).toBeDefined();

    vi.advanceTimersByTime(TTL_MS + 1000);
    expect(sg.getSceneGen(202)).toBeUndefined();
  });

  it("annulla la rimozione se un nuovo batch riparte per lo stesso libro", () => {
    sg.enqueueSceneBatch(203, { id: "b1", count: 1, aspect: "9:16", chapters: [1] });
    sg.finishSceneGen(203);
    vi.advanceTimersByTime(TTL_MS - 1000);

    sg.enqueueSceneBatch(203, { id: "b2", count: 1, aspect: "9:16", chapters: [1] }); // restart
    vi.advanceTimersByTime(TTL_MS);
    expect(sg.getSceneGen(203)).toBeDefined();
    expect(sg.getSceneGen(203)?.status).toBe("generating");
  });
});
