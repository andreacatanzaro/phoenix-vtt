import type { TokenView } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { boardSize, cellAt, clampCell, duplicateSpot, fitView, groupDrop, keepCenterOnResize, MAX_ZOOM, MIN_ZOOM, panBy, samePoint, textCells, toScene, toScreen, tokenAt, tokenRect, viewCenter, viewFor, zoomAt } from "./geometry";

const scene = { gridPx: 70, gridOffsetX: 10, gridOffsetY: 20, mapWidth: 1400, mapHeight: 700 };
const tok = (id: string, x: number, y: number, size = 1): TokenView => ({ id, sceneId: "s", kind: "token", label: id, color: "gold", imageId: null, x, y, size, hidden: false, travels: false, ownerAccountId: null });

describe("screen and scene", () => {
  it("go back and forth", () => {
    const view = { zoom: 2, panX: 30, panY: -10 };
    const p = { x: 123, y: 45 };
    const back = toScene(view, toScreen(view, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });
});

describe("cells", () => {
  it("finds the square of a point, with the grid offset", () => {
    expect(cellAt(scene, { x: 10, y: 20 })).toEqual({ x: 0, y: 0 });
    expect(cellAt(scene, { x: 79, y: 89 })).toEqual({ x: 0, y: 0 });
    expect(cellAt(scene, { x: 80, y: 90 })).toEqual({ x: 1, y: 1 });
    expect(cellAt(scene, { x: 0, y: 0 })).toEqual({ x: -1, y: -1 });
  });

  it("keeps a cell inside what the server accepts", () => {
    expect(clampCell({ x: 5000, y: -5000 })).toEqual({ x: 1000, y: -1000 });
    expect(clampCell({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it("places a token in pixels, size included", () => {
    expect(tokenRect(scene, tok("a", 2, 1, 2))).toEqual({ x: 150, y: 90, w: 140, h: 140 });
  });
});

describe("tokenAt", () => {
  it("hits the token under the point, the top one when they overlap, and nothing on empty ground", () => {
    const tokens = [tok("under", 1, 1, 2), tok("over", 2, 2)];
    expect(tokenAt(scene, tokens, { x: 10 + 2.5 * 70, y: 20 + 2.5 * 70 })?.id).toBe("over");
    expect(tokenAt(scene, tokens, { x: 10 + 1.5 * 70, y: 20 + 1.5 * 70 })?.id).toBe("under");
    expect(tokenAt(scene, tokens, { x: 15, y: 25 })).toBeNull();
  });

  it("covers every square of a big token and none outside it", () => {
    const big = [tok("big", 0, 0, 3)];
    expect(tokenAt(scene, big, { x: 10 + 3 * 70 - 1, y: 20 + 3 * 70 - 1 })?.id).toBe("big");
    expect(tokenAt(scene, big, { x: 10 + 3 * 70, y: 20 })).toBeNull();
  });
});

describe("board size", () => {
  it("is the map when there is one, a plain grid when not", () => {
    expect(boardSize(scene)).toEqual({ w: 1400, h: 700 });
    expect(boardSize({ mapWidth: null, mapHeight: null, gridPx: 50 })).toEqual({ w: 1500, h: 1000 });
  });
});

describe("zoomAt", () => {
  it("keeps the point under the pointer where it was", () => {
    const view = { zoom: 1, panX: 40, panY: 10 };
    const anchor = { x: 300, y: 200 };
    const before = toScene(view, anchor);
    const next = zoomAt(view, 1.5, anchor);
    const after = toScene(next, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.zoom).toBeCloseTo(1.5);
  });

  it("stops at the limits and does not drift once there", () => {
    const max = zoomAt({ zoom: MAX_ZOOM, panX: 5, panY: 6 }, 2, { x: 100, y: 100 });
    expect(max).toEqual({ zoom: MAX_ZOOM, panX: 5, panY: 6 });
    expect(zoomAt({ zoom: MIN_ZOOM, panX: 0, panY: 0 }, 0.5, { x: 1, y: 1 }).zoom).toBe(MIN_ZOOM);
  });
});

describe("fitView", () => {
  it("shows the whole board, centered", () => {
    const v = fitView({ w: 1000, h: 500 }, { w: 500, h: 500 });
    expect(v.zoom).toBeCloseTo(0.5);
    expect(v.panX).toBeCloseTo(0);
    expect(v.panY).toBeCloseTo(125);
  });

  it("does not break on an empty screen", () => {
    expect(fitView({ w: 1000, h: 500 }, { w: 0, h: 0 })).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});

describe("panBy", () => {
  it("moves the view by the drag", () => {
    expect(panBy({ zoom: 2, panX: 10, panY: 10 }, { x: 100, y: 100 }, { x: 130, y: 90 })).toEqual({ zoom: 2, panX: 40, panY: 0 });
  });
});

describe("text tokens", () => {
  it("a short text takes one square, a longer one takes more room, wide before tall", () => {
    expect(textCells("Ciao")).toEqual({ w: 1, h: 1 });
    expect(textCells("x".repeat(13))).toEqual({ w: 3, h: 1 });
    expect(textCells("x".repeat(200))).toEqual({ w: 12, h: 2 });
  });

  it("places a text by the room it needs", () => {
    expect(tokenRect(scene, { x: 1, y: 1, size: 1, kind: "text", label: "x".repeat(13) })).toEqual({ x: 80, y: 90, w: 210, h: 70 });
  });

  it("a text is found by a point anywhere on its room", () => {
    const note: TokenView = { ...tok("n", 0, 0), kind: "text", label: "x".repeat(13) };
    expect(tokenAt(scene, [note], { x: 10 + 2.5 * 70, y: 25 })?.id).toBe("n");
    expect(tokenAt(scene, [note], { x: 10 + 3.5 * 70, y: 25 })).toBeNull();
  });
});

describe("the camera", () => {
  const screen = { w: 800, h: 600 };

  it("finds the point of the scene in the middle of the screen", () => {
    expect(viewCenter({ zoom: 2, panX: 100, panY: 50 }, screen)).toEqual({ x: 150, y: 125 });
  });

  it("builds the view that puts a point in the middle, and the two agree", () => {
    const view = viewFor({ x: 700, y: 450 }, 1.5, screen);
    expect(view.zoom).toBe(1.5);
    const back = viewCenter(view, screen);
    expect(back.x).toBeCloseTo(700);
    expect(back.y).toBeCloseTo(450);
  });

  it("keeps the zoom within the limits", () => {
    expect(viewFor({ x: 0, y: 0 }, 100, screen).zoom).toBe(MAX_ZOOM);
    expect(viewFor({ x: 0, y: 0 }, 0.0001, screen).zoom).toBe(MIN_ZOOM);
  });
});

describe("resizing the screen", () => {
  it("keeps the point in the middle and the zoom, so the person keeps their place", () => {
    const view = { zoom: 2, panX: -300, panY: -150 };
    const before = { w: 800, h: 600 };
    const after = { w: 1200, h: 500 };
    const next = keepCenterOnResize(view, before, after);
    expect(next.zoom).toBe(2);
    const was = viewCenter(view, before);
    const now = viewCenter(next, after);
    expect(now.x).toBeCloseTo(was.x);
    expect(now.y).toBeCloseTo(was.y);
  });

  it("changes nothing when the size does not change", () => {
    const view = { zoom: 1.25, panX: 40, panY: -10 };
    const same = keepCenterOnResize(view, { w: 800, h: 600 }, { w: 800, h: 600 });
    expect(same.panX).toBeCloseTo(40);
    expect(same.panY).toBeCloseTo(-10);
  });
});

describe("duplicateSpot", () => {
  it("is one square down and to the right", () => {
    expect(duplicateSpot(3, 4)).toEqual({ x: 4, y: 5 });
  });

  it("steps the other way on an edge of the board, so the copy is always valid", () => {
    expect(duplicateSpot(1000, 5)).toEqual({ x: 999, y: 6 });
    expect(duplicateSpot(5, 1000)).toEqual({ x: 6, y: 999 });
    expect(duplicateSpot(1000, 1000)).toEqual({ x: 999, y: 999 });
  });
});

describe("groupDrop", () => {
  const grid = { gridPx: 70 };
  const group = [{ id: "a", x: 1, y: 1 }, { id: "b", x: 3, y: 2 }];

  it("moves every token by the same whole number of squares, rounding the drag", () => {
    expect(groupDrop(grid, group, { x: 150, y: 70 })).toEqual([{ id: "a", x: 3, y: 2 }, { id: "b", x: 5, y: 3 }]);
  });

  it("lists nothing when the drag was too short to change a square", () => {
    expect(groupDrop(grid, group, { x: 20, y: -30 })).toEqual([]);
  });

  it("keeps every token on the board", () => {
    const moved = groupDrop(grid, [{ id: "a", x: 999, y: 0 }], { x: 700, y: 0 });
    expect(moved).toEqual([{ id: "a", x: 1000, y: 0 }]);
  });

  it("does not list a token the board refused to move at all", () => {
    expect(groupDrop(grid, [{ id: "a", x: 1000, y: 5 }], { x: 700, y: 0 })).toEqual([]);
  });

  it("moves backwards too", () => {
    expect(groupDrop(grid, group, { x: -70, y: -70 })).toEqual([{ id: "a", x: 0, y: 0 }, { id: "b", x: 2, y: 1 }]);
  });
});

describe("samePoint", () => {
  it("is true for two places at the same spot, also when they are different objects", () => {
    expect(samePoint({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(true);
  });

  it("is false when either coordinate differs", () => {
    expect(samePoint({ x: 3, y: 4 }, { x: 3, y: 5 })).toBe(false);
    expect(samePoint({ x: 3, y: 4 }, { x: 2, y: 4 })).toBe(false);
  });

  it("treats two missing places as the same and a missing one as different from a place", () => {
    expect(samePoint(null, null)).toBe(true);
    expect(samePoint(null, { x: 0, y: 0 })).toBe(false);
    expect(samePoint({ x: 0, y: 0 }, null)).toBe(false);
  });
});
