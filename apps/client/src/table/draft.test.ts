import { describe, expect, it } from "vitest";
import { draftStyle } from "./draft";

describe("draftStyle", () => {
  it("puts the editor where the person clicked", () => {
    expect(draftStyle({ x: 300, y: 200 }).left).toBe("max(0.5rem, min(300px, calc(100% - 28rem)))");
    expect(draftStyle({ x: 300, y: 200 }).top).toBe("max(0.5rem, min(200px, calc(100% - 4.5rem)))");
  });

  it("never lets the left edge go below the edge of the screen, also on a screen narrower than the editor", () => {
    // On a screen narrower than 28rem, `100% - 28rem` is negative: the outer max keeps the editor in view.
    expect(draftStyle({ x: 0, y: 0 }).left).toMatch(/^max\(0\.5rem,/);
    expect(draftStyle({ x: 0, y: 0 }).top).toMatch(/^max\(0\.5rem,/);
  });
});
