import type { TokenView } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { boardSize, cellAt, clampCell, fitView, MAX_ZOOM, MIN_ZOOM, panBy, toScene, toScreen, tokenAt, tokenRect, zoomAt } from "./geometry";

const scene = { gridPx: 70, gridOffsetX: 10, gridOffsetY: 20, mapWidth: 1400, mapHeight: 700 };
const tok = (id: string, x: number, y: number, size = 1): TokenView => ({ id, sceneId: "s", label: id, color: "gold", imageId: null, x, y, size, hidden: false, travels: false, ownerAccountId: null });

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
