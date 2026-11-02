import { describe, expect, it } from "vitest";
import { resolveRollMode } from "./roll-mode";

describe("resolveRollMode", () => {
  it("rolls normally with no sources", () => {
    expect(resolveRollMode([])).toBe("normal");
  });

  it("uses advantage or disadvantage from one or more sources", () => {
    expect(resolveRollMode(["advantage"])).toBe("advantage");
    expect(resolveRollMode(["advantage", "advantage", "advantage"])).toBe("advantage");
    expect(resolveRollMode(["disadvantage", "disadvantage"])).toBe("disadvantage");
  });

  it("cancels to a normal roll when both are present, however many of each", () => {
    expect(resolveRollMode(["advantage", "disadvantage"])).toBe("normal");
    expect(resolveRollMode(["advantage", "advantage", "advantage", "disadvantage"])).toBe("normal");
    expect(resolveRollMode(["disadvantage", "disadvantage", "advantage"])).toBe("normal");
  });
});
