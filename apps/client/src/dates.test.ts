import { describe, expect, it } from "vitest";
import { fromLocalInput, toLocalInput } from "./dates";

describe("datetime-local conversion", () => {
  it("round-trips an instant to the minute", () => {
    const iso = new Date(2026, 11, 1, 18, 30).toISOString();
    expect(toLocalInput(iso)).toBe("2026-12-01T18:30");
    expect(fromLocalInput("2026-12-01T18:30")).toBe(iso);
  });

  it("empty or invalid values mean no date", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("non una data")).toBe("");
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("ieri")).toBeNull();
  });
});
