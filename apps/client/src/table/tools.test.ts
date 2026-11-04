// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isTypingTarget, TOOL_KEYS, toolForKey, TOOLS } from "./tools";

describe("tools", () => {
  it("each tool has its own key, as on Owlbear Rodeo", () => {
    expect(TOOL_KEYS).toEqual({ move: "w", select: "s", measure: "m", pointer: "q", text: "t" });
    expect(new Set(Object.values(TOOL_KEYS)).size).toBe(TOOLS.length);
  });

  it("a key picks its tool, in either case, and an unknown key picks none", () => {
    expect(toolForKey("w")).toBe("move");
    expect(toolForKey("S")).toBe("select");
    expect(toolForKey("Q")).toBe("pointer");
    expect(toolForKey("x")).toBeNull();
    expect(toolForKey("Escape")).toBeNull();
  });

  it("keys typed in a field are not for the board", () => {
    for (const tag of ["input", "textarea", "select"]) expect(isTypingTarget(document.createElement(tag))).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
