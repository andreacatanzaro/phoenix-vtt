import { describe, expect, it } from "vitest";
import { MAX_GRID_PX, MIN_GRID_PX } from "@phoenix/shared";
import { dragTo, gridOf, handleAt, HANDLE_PX, nearestIntersection, refine, resizeFromCorner, startAlign } from "./align";

describe("startAlign", () => {
  it("puts the anchor in the middle of the map, with the grid the scene has now", () => {
    expect(startAlign({ w: 1800, h: 1200 }, 70)).toEqual({ anchor: { x: 900, y: 600 }, size: 70 });
  });
});

describe("resizeFromCorner", () => {
  it("makes the square as wide as the corner is far from the anchor", () => {
    const state = startAlign({ w: 1000, h: 1000 }, 70);
    expect(resizeFromCorner(state, { x: 590, y: 590 }).size).toBe(90);
  });

  it("uses the longer side when the corner is not on the diagonal", () => {
    const state = { anchor: { x: 100, y: 100 }, size: 70 };
    expect(resizeFromCorner(state, { x: 180, y: 160 }).size).toBe(80);
  });

  it("works when the corner is up and to the left of the anchor", () => {
    const state = { anchor: { x: 100, y: 100 }, size: 70 };
    expect(resizeFromCorner(state, { x: 40, y: 50 }).size).toBe(60);
  });

  it("never goes below the smallest or above the largest square", () => {
    const state = { anchor: { x: 100, y: 100 }, size: 70 };
    expect(resizeFromCorner(state, { x: 101, y: 101 }).size).toBe(MIN_GRID_PX);
    expect(resizeFromCorner(state, { x: 5000, y: 5000 }).size).toBe(MAX_GRID_PX);
  });

  it("keeps the anchor where it was", () => {
    const state = { anchor: { x: 100, y: 100 }, size: 70 };
    expect(resizeFromCorner(state, { x: 190, y: 190 }).anchor).toEqual({ x: 100, y: 100 });
  });
});

describe("gridOf", () => {
  it("gives the size and the offset that make the anchor fall on a crossing", () => {
    expect(gridOf({ anchor: { x: 905, y: 612 }, size: 90 })).toEqual({ gridPx: 90, gridOffsetX: 5, gridOffsetY: 72 });
  });

  it("keeps the offset between 0 and the size, also for an anchor near the start of the map", () => {
    expect(gridOf({ anchor: { x: 10, y: 0 }, size: 70 })).toEqual({ gridPx: 70, gridOffsetX: 10, gridOffsetY: 0 });
    expect(gridOf({ anchor: { x: -10, y: 140 }, size: 70 })).toEqual({ gridPx: 70, gridOffsetX: 60, gridOffsetY: 0 });
  });

  it("keeps two decimals, so a refined grid does not drift", () => {
    const grid = gridOf({ anchor: { x: 100.123456, y: 50 }, size: 70.456789 });
    expect(grid.gridPx).toBe(70.46);
    expect(grid.gridOffsetX).toBeCloseTo(29.67, 2);
  });
});

describe("nearestIntersection", () => {
  const state = { anchor: { x: 100, y: 100 }, size: 50 };

  it("finds the crossing closest to a point, counted from the anchor", () => {
    expect(nearestIntersection(state, { x: 255, y: 148 })).toEqual({ i: 3, j: 1 });
    expect(nearestIntersection(state, { x: 40, y: 20 })).toEqual({ i: -1, j: -2 });
  });

  it("is the anchor itself next to the anchor", () => {
    expect(nearestIntersection(state, { x: 110, y: 90 })).toEqual({ i: 0, j: 0 });
  });
});

describe("refine", () => {
  it("moves a crossing far from the anchor and spreads the change over all the squares between", () => {
    const state = { anchor: { x: 100, y: 100 }, size: 50 };
    // The crossing 20 squares to the right should be at 1110 instead of 1100: each square is 0.5 px wider.
    const next = refine(state, { i: 20, j: 0 }, { x: 1110, y: 100 });
    expect(next.size).toBeCloseTo(50.5, 5);
    expect(next.anchor).toEqual({ x: 100, y: 100 });
  });

  it("uses both directions when the crossing is off both axes, so the grid stays square", () => {
    const state = { anchor: { x: 0, y: 0 }, size: 50 };
    const next = refine(state, { i: 10, j: 10 }, { x: 510, y: 520 });
    expect(next.size).toBeCloseTo(51.5, 5);
  });

  it("works for a crossing up and to the left of the anchor", () => {
    const state = { anchor: { x: 500, y: 500 }, size: 50 };
    const next = refine(state, { i: -10, j: 0 }, { x: -10, y: 500 });
    expect(next.size).toBeCloseTo(51, 5);
  });

  it("does nothing when the crossing is the anchor", () => {
    const state = { anchor: { x: 100, y: 100 }, size: 50 };
    expect(refine(state, { i: 0, j: 0 }, { x: 130, y: 120 })).toEqual(state);
  });

  it("keeps the size inside the limits", () => {
    const state = { anchor: { x: 0, y: 0 }, size: 50 };
    expect(refine(state, { i: 1, j: 0 }, { x: 9000, y: 0 }).size).toBe(MAX_GRID_PX);
    expect(refine(state, { i: 10, j: 0 }, { x: 1, y: 0 }).size).toBe(MIN_GRID_PX);
  });
});

describe("handleAt", () => {
  const state = { anchor: { x: 500, y: 500 }, size: 60 };

  it("offers the anchor in the step Offset, and nothing else", () => {
    expect(handleAt("offset", state, { x: 505, y: 497 }, 1)).toEqual({ kind: "anchor" });
    expect(handleAt("offset", state, { x: 560, y: 560 }, 1)).toBeNull();
  });

  it("offers the corner of the square in the step Size, and the anchor stays out of reach", () => {
    expect(handleAt("size", state, { x: 562, y: 558 }, 1)).toEqual({ kind: "corner" });
    expect(handleAt("size", state, { x: 500, y: 500 }, 1)).toBeNull();
  });

  it("offers the crossing under the pointer in the step Refine, but never the anchor", () => {
    expect(handleAt("refine", state, { x: 622, y: 380 }, 1)).toEqual({ kind: "crossing", crossing: { i: 2, j: -2 } });
    expect(handleAt("refine", state, { x: 501, y: 501 }, 1)).toBeNull();
    expect(handleAt("refine", state, { x: 530, y: 530 }, 1)).toBeNull();
  });

  it("keeps the reach the same on the screen: the closer the zoom, the smaller it is on the map", () => {
    const edge = HANDLE_PX - 1;
    expect(handleAt("offset", state, { x: 500 + edge, y: 500 }, 1)).not.toBeNull();
    expect(handleAt("offset", state, { x: 500 + edge, y: 500 }, 4)).toBeNull();
    expect(handleAt("offset", state, { x: 500 + edge / 4, y: 500 }, 4)).not.toBeNull();
  });
});

describe("dragTo", () => {
  const base = { anchor: { x: 500, y: 500 }, size: 60 };

  it("moves the anchor and keeps the size", () => {
    expect(dragTo({ kind: "anchor" }, base, { x: 40, y: 50 })).toEqual({ anchor: { x: 40, y: 50 }, size: 60 });
  });

  it("sizes the square from the corner", () => {
    expect(dragTo({ kind: "corner" }, base, { x: 590, y: 585 })).toEqual({ anchor: base.anchor, size: 90 });
  });

  it("refines from the state the drag began with, so a long drag does not add up", () => {
    const handle = { kind: "crossing", crossing: { i: 10, j: 0 } } as const;
    expect(dragTo(handle, base, { x: 1110, y: 500 }).size).toBeCloseTo(61, 5);
    expect(dragTo(handle, base, { x: 1120, y: 500 }).size).toBeCloseTo(62, 5);
  });
});
