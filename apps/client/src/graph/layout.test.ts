import { describe, expect, it } from "vitest";
import { edgeLine, fitPoints, MIN_GRAPH_ZOOM, NODE_GAP, placeNodes, zoomAround } from "./layout";

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe("placeNodes", () => {
  it("keeps where a node was put", () => {
    const placed = placeNodes([{ id: "a", at: { x: 500, y: -300 } }, { id: "b", at: null }]);
    expect(placed.get("a")).toEqual({ x: 500, y: -300 });
  });

  it("puts a single node that has no place in the middle", () => {
    expect(placeNodes([{ id: "a", at: null }]).get("a")).toEqual({ x: 0, y: 0 });
  });

  it("gives every node without a place its own, far enough from all the others", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `n${String(i)}`, at: null }));
    const points = [...placeNodes(items).values()];
    expect(points).toHaveLength(20);
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) expect(distance(points[i] ?? { x: 0, y: 0 }, points[j] ?? { x: 0, y: 0 })).toBeGreaterThanOrEqual(NODE_GAP - 1e-6);
  });

  it("keeps clear of the nodes that already have a place", () => {
    const placed = placeNodes([{ id: "fixed", at: { x: 0, y: 0 } }, { id: "new", at: null }]);
    expect(distance(placed.get("fixed") ?? { x: 0, y: 0 }, placed.get("new") ?? { x: 0, y: 0 })).toBeGreaterThanOrEqual(NODE_GAP);
  });

  it("gives the same places for the same nodes, so a reload does not shuffle the graph", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: `n${String(i)}`, at: null }));
    expect([...placeNodes(items)]).toEqual([...placeNodes(items)]);
  });

  it("a node that is added later does not move the ones that were placed before", () => {
    const first = placeNodes([{ id: "a", at: null }, { id: "b", at: null }]);
    const a = first.get("a");
    const b = first.get("b");
    // The two were then saved where they were put, and a third comes.
    const next = placeNodes([{ id: "a", at: a ?? null }, { id: "b", at: b ?? null }, { id: "c", at: null }]);
    expect(next.get("a")).toEqual(a);
    expect(next.get("b")).toEqual(b);
  });

  it("is nothing for no nodes", () => {
    expect(placeNodes([]).size).toBe(0);
  });
});

describe("fitPoints", () => {
  const screen = { w: 1000, h: 600 };

  it("shows all the points inside the screen, with some room around", () => {
    const points = [{ x: -400, y: -200 }, { x: 600, y: 300 }];
    const view = fitPoints(points, screen);
    for (const p of points) {
      const x = p.x * view.zoom + view.panX;
      const y = p.y * view.zoom + view.panY;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(screen.w);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(screen.h);
    }
  });

  it("puts the middle of the points in the middle of the screen", () => {
    const view = fitPoints([{ x: 100, y: 100 }, { x: 300, y: 500 }], screen);
    expect(200 * view.zoom + view.panX).toBeCloseTo(500, 5);
    expect(300 * view.zoom + view.panY).toBeCloseTo(300, 5);
  });

  it("does not blow a single node up: the zoom stays moderate", () => {
    expect(fitPoints([{ x: 0, y: 0 }], screen).zoom).toBeLessThanOrEqual(1);
  });

  it("shows nodes that are far apart too, however far: the zoom goes as low as it has to", () => {
    const points = [{ x: 0, y: 0 }, { x: 6000, y: 0 }];
    const view = fitPoints(points, screen);
    expect(view.zoom).toBeLessThan(0.25);
    for (const p of points) {
      const x = p.x * view.zoom + view.panX;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(screen.w);
    }
  });

  it("shows even the farthest places a node may have (a hundred thousand either way)", () => {
    const view = fitPoints([{ x: -100000, y: -100000 }, { x: 100000, y: 100000 }], screen);
    expect(view.zoom).toBeGreaterThanOrEqual(MIN_GRAPH_ZOOM);
    expect(-100000 * view.zoom + view.panX).toBeGreaterThan(0);
    expect(100000 * view.zoom + view.panX).toBeLessThan(screen.w);
  });

  it("is the plain view, centered, when there is nothing to show", () => {
    expect(fitPoints([], screen)).toEqual({ zoom: 1, panX: 500, panY: 300 });
  });
});

describe("edgeLine", () => {
  it("runs from the edge of one node to the edge of the other", () => {
    const line = edgeLine({ x: 0, y: 0 }, { x: 400, y: 0 }, 50, 50);
    expect(line).toEqual({ x1: 50, y1: 0, x2: 350, y2: 0 });
  });

  it("works along any direction", () => {
    const line = edgeLine({ x: 0, y: 0 }, { x: 300, y: 400 }, 50, 100);
    expect(distance({ x: line?.x1 ?? 0, y: line?.y1 ?? 0 }, { x: 0, y: 0 })).toBeCloseTo(50, 6);
    expect(distance({ x: line?.x2 ?? 0, y: line?.y2 ?? 0 }, { x: 300, y: 400 })).toBeCloseTo(100, 6);
  });

  it("is nothing when the two nodes touch or overlap, or are the same", () => {
    expect(edgeLine({ x: 0, y: 0 }, { x: 80, y: 0 }, 50, 50)).toBeNull();
    expect(edgeLine({ x: 5, y: 5 }, { x: 5, y: 5 }, 50, 50)).toBeNull();
  });
});

describe("zoomAround", () => {
  it("keeps the point under the pointer where it is", () => {
    const view = { zoom: 1, panX: 100, panY: 50 };
    const next = zoomAround(view, 2, { x: 300, y: 200 });
    // The point of the graph under (300, 200) was (200, 150), and still is.
    expect(200 * next.zoom + next.panX).toBeCloseTo(300, 6);
    expect(150 * next.zoom + next.panY).toBeCloseTo(200, 6);
    expect(next.zoom).toBe(2);
  });

  it("zooms out as far as the graph can be shown, and not further, and in up to a limit", () => {
    expect(zoomAround({ zoom: 0.01, panX: 0, panY: 0 }, 0.01, { x: 0, y: 0 }).zoom).toBe(MIN_GRAPH_ZOOM);
    expect(zoomAround({ zoom: 5, panX: 0, panY: 0 }, 10, { x: 0, y: 0 }).zoom).toBe(6);
  });
});
