// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isTypingTarget, TOOL_KEYS, toolForKey, toolsFor, TOOLS } from "./tools";

describe("tools", () => {
  it("each tool has its own key, as on Owlbear Rodeo", () => {
    expect(TOOL_KEYS).toEqual({ move: "w", select: "s", measure: "m", pointer: "q", text: "t", start: "z" });
    expect(new Set(Object.values(TOOL_KEYS)).size).toBe(TOOLS.length);
  });

  it("a key picks its tool, in either case, and an unknown key picks none", () => {
    expect(toolForKey("w")).toBe("move");
    expect(toolForKey("S")).toBe("select");
    expect(toolForKey("Q")).toBe("pointer");
    expect(toolForKey("x")).toBeNull();
    expect(toolForKey("Escape")).toBeNull();
  });

  it("a player has the tools that act on tokens and the view, and the pointer", () => {
    expect(toolsFor({ isDm: false, preparing: false })).toEqual(["move", "select", "measure", "pointer"]);
  });

  it("the DM at the table adds the text", () => {
    expect(toolsFor({ isDm: true, preparing: false })).toEqual(["move", "select", "measure", "pointer", "text"]);
  });

  it("in the preparation there is no pointer (nobody to show it to), and there is the start zone", () => {
    expect(toolsFor({ isDm: true, preparing: true })).toEqual(["move", "select", "measure", "text", "start"]);
  });

  it("the start zone key picks it", () => {
    expect(toolForKey("z")).toBe("start");
  });

  it("keys typed in a field are not for the board", () => {
    for (const tag of ["input", "textarea", "select"]) expect(isTypingTarget(document.createElement(tag))).toBe(true);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
