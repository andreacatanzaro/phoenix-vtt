import type { TokenView } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { combineSelection, pointInPolygon, rectBetween, tokensInLasso, tokensInRect } from "./selection";

const scene = { gridPx: 100, gridOffsetX: 0, gridOffsetY: 0 };
const tok = (id: string, x: number, y: number, size = 1): TokenView => ({ id, sceneId: "s", kind: "token", label: id, color: "gold", imageId: null, x, y, size, hidden: false, travels: false, ownerAccountId: null });

describe("rectBetween", () => {
  it("is the same whichever corner it starts from", () => {
    expect(rectBetween({ x: 50, y: 40 }, { x: 10, y: 90 })).toEqual({ x: 10, y: 40, w: 40, h: 50 });
    expect(rectBetween({ x: 10, y: 90 }, { x: 50, y: 40 })).toEqual({ x: 10, y: 40, w: 40, h: 50 });
  });
});

describe("tokensInRect", () => {
  const tokens = [tok("a", 0, 0), tok("b", 3, 0), tok("c", 0, 3, 2)];

  it("takes the tokens the rectangle touches, even a little", () => {
    expect(tokensInRect(scene, tokens, { x: 90, y: 90, w: 5, h: 5 }).map((t) => t.id)).toEqual(["a"]);
    expect(tokensInRect(scene, tokens, { x: 0, y: 0, w: 400, h: 120 }).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("takes nothing from empty ground", () => {
    expect(tokensInRect(scene, tokens, { x: 150, y: 150, w: 50, h: 50 })).toEqual([]);
  });

  it("sees the whole size of a big token", () => {
    expect(tokensInRect(scene, tokens, { x: 150, y: 450, w: 10, h: 10 }).map((t) => t.id)).toEqual(["c"]);
  });

  it("does not take a token only edge to edge with the rectangle", () => {
    expect(tokensInRect(scene, tokens, { x: 100, y: 0, w: 50, h: 50 })).toEqual([]);
  });

  it("sees a text by the room it needs", () => {
    const note: TokenView = { ...tok("n", 0, 0), kind: "text", label: "x".repeat(18) };
    expect(tokensInRect(scene, [note], { x: 250, y: 10, w: 10, h: 10 }).map((t) => t.id)).toEqual(["n"]);
  });
});

describe("pointInPolygon", () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  it("tells inside from outside", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 5 }, square)).toBe(false);
  });

  it("works on a shape that is not convex", () => {
    const l = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon({ x: 2, y: 8 }, l)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 8 }, l)).toBe(false);
  });

  it("needs a real shape", () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe("tokensInLasso", () => {
  it("takes the tokens whose middle is inside the loop", () => {
    const tokens = [tok("a", 0, 0), tok("b", 2, 0), tok("c", 5, 5)];
    const loop = [{ x: 0, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 120 }, { x: 0, y: 120 }];
    expect(tokensInLasso(scene, tokens, loop).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("does not take a token only grazed by the loop", () => {
    const loop = [{ x: 90, y: 90 }, { x: 150, y: 90 }, { x: 150, y: 150 }, { x: 90, y: 150 }];
    expect(tokensInLasso(scene, [tok("a", 0, 0)], loop)).toEqual([]);
  });
});

describe("combineSelection", () => {
  const before = new Set(["a", "b"]);

  it("without Shift the shape replaces what was selected", () => {
    expect(combineSelection(before, ["c"], false)).toEqual(["c"]);
    expect(combineSelection(before, [], false)).toEqual([]);
  });

  it("with Shift the tokens in the shape that were not selected are added", () => {
    expect(combineSelection(before, ["c", "d"], true).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("with Shift the tokens in the shape that were selected are taken away", () => {
    expect(combineSelection(before, ["b"], true)).toEqual(["a"]);
  });

  it("with Shift, a shape holding both kinds does both", () => {
    expect(combineSelection(before, ["a", "c"], true).sort()).toEqual(["b", "c"]);
  });

  it("with Shift, an empty shape changes nothing, and the selection it was given is not touched", () => {
    expect(combineSelection(before, [], true).sort()).toEqual(["a", "b"]);
    expect([...before]).toEqual(["a", "b"]);
  });
});
