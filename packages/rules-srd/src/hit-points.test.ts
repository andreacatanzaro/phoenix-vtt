import { describe, expect, it } from "vitest";
import { scaleHpMax } from "./hit-points";

describe("scaleHpMax", () => {
  it("rounds down whatever the factor", () => {
    expect(scaleHpMax(11, 0.5)).toBe(5);
    expect(scaleHpMax(10, 0.5)).toBe(5);
    expect(scaleHpMax(7, 0.75)).toBe(5);
    expect(scaleHpMax(9, 1.5)).toBe(13);
  });

  it("never takes a living maximum below 1", () => {
    expect(scaleHpMax(1, 0.5)).toBe(1);
    expect(scaleHpMax(3, 0.1)).toBe(1);
    expect(scaleHpMax(10, 0)).toBe(1);
  });

  it("leaves the maximum alone with a factor of 1", () => {
    expect(scaleHpMax(23, 1)).toBe(23);
  });

  it("rejects values that are not valid", () => {
    expect(() => scaleHpMax(-1, 0.5)).toThrow();
    expect(() => scaleHpMax(0, 0.5)).toThrow();
    expect(() => scaleHpMax(10.5, 0.5)).toThrow();
    expect(() => scaleHpMax(10, -0.5)).toThrow();
    expect(() => scaleHpMax(10, Number.NaN)).toThrow();
  });
});
