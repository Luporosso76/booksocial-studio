import { describe, it, expect } from "vitest";
import { enumToDay, dayToEnum } from "../src/serialize.js";

describe("enumToDay / dayToEnum", () => {
  it("round-trips all weekdays", () => {
    for (let d = 1; d <= 7; d++) {
      expect(enumToDay(dayToEnum(d))).toBe(d);
    }
  });

  it("throws on an invalid day enum instead of defaulting", () => {
    expect(() => enumToDay("FUNDAY")).toThrow();
    expect(() => enumToDay(null)).toThrow();
  });
});
