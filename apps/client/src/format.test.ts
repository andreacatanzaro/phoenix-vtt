import { describe, expect, it } from "vitest";
import { formatGameTime } from "./format";

describe("formatGameTime", () => {
  it("shows minutes, hours, or both", () => {
    expect(formatGameTime(0)).toBe("0 min");
    expect(formatGameTime(45)).toBe("45 min");
    expect(formatGameTime(60)).toBe("1 h");
    expect(formatGameTime(90)).toBe("1 h 30 min");
    expect(formatGameTime(26 * 60 + 5)).toBe("26 h 5 min");
  });

  it("never shows a negative or fractional time", () => {
    expect(formatGameTime(-5)).toBe("0 min");
    expect(formatGameTime(10.9)).toBe("10 min");
  });
});
