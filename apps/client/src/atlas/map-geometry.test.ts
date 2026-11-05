import { describe, expect, it } from "vitest";
import { ARROW_SIDE, arrowShape, CLOSE_PX, closesPolygon, polygonAttribute, toMapPoint } from "./map-geometry";

const box = { left: 100, top: 50, width: 400, height: 200 };

describe("toMapPoint", () => {
  it("is the place on the picture as a fraction of its width and height", () => {
    expect(toMapPoint(box, { x: 300, y: 150 })).toEqual({ x: 0.5, y: 0.5 });
    expect(toMapPoint(box, { x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(toMapPoint(box, { x: 500, y: 250 })).toEqual({ x: 1, y: 1 });
  });

  it("stays on the picture when the pointer is outside it", () => {
    expect(toMapPoint(box, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(toMapPoint(box, { x: 900, y: 900 })).toEqual({ x: 1, y: 1 });
  });

  it("is the origin for a picture that has no size yet", () => {
    expect(toMapPoint({ left: 0, top: 0, width: 0, height: 0 }, { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
  });
});

describe("closesPolygon", () => {
  const first = { x: 0.5, y: 0.5 };

  it("closes the shape when the pointer is near the first point and there are at least three", () => {
    expect(closesPolygon(box, [first, { x: 0.8, y: 0.5 }, { x: 0.8, y: 0.8 }], first, { x: 300 + CLOSE_PX - 1, y: 150 })).toBe(true);
  });

  it("does not close it with fewer than three points, nor when the pointer is far from the first one", () => {
    expect(closesPolygon(box, [first, { x: 0.8, y: 0.5 }], first, { x: 300, y: 150 })).toBe(false);
    expect(closesPolygon(box, [first, { x: 0.8, y: 0.5 }, { x: 0.8, y: 0.8 }], first, { x: 300 + CLOSE_PX + 5, y: 150 })).toBe(false);
  });
});

describe("polygonAttribute", () => {
  it("writes the points the way a drawing of the polygon wants them", () => {
    expect(polygonAttribute([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 0.5, y: 0.6 }])).toBe("0.1,0.2 0.3,0.4 0.5,0.6");
  });
});

describe("polygonAttribute on a picture that is not square", () => {
  it("spreads the points over the width the drawing has, so a shape is not stretched", () => {
    expect(polygonAttribute([{ x: 0.5, y: 0.2 }, { x: 1, y: 0.4 }], 2)).toBe("1,0.2 2,0.4");
  });
});

describe("arrowShape", () => {
  it("is a line from one pin to the other, kept off the pins, with a head at the end", () => {
    const arrow = arrowShape({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 1);
    expect(arrow?.line.x1).toBeCloseTo(0.23, 6);
    expect(arrow?.line.x2).toBeCloseTo(0.77, 6);
    expect(arrow?.line.y1).toBeCloseTo(0.5, 6);
    expect(arrow?.line.y2).toBeCloseTo(0.5, 6);
    const [tip, wingA, wingB] = (arrow?.head ?? "").split(" ").map((p) => p.split(",").map(Number));
    expect(tip?.[0]).toBeCloseTo(0.77, 6);
    expect(wingA?.[0]).toBeCloseTo(0.745, 6);
    expect(wingB?.[0]).toBeCloseTo(0.745, 6);
    expect(Math.abs((wingA?.[1] ?? 0) - (wingB?.[1] ?? 0))).toBeCloseTo(0.0125 * 2, 6);
  });

  it("works in the units of the drawing, so the same exit is the same shape on a wide picture", () => {
    const arrow = arrowShape({ x: 0.25, y: 0.5 }, { x: 0.75, y: 0.5 }, 2);
    expect(arrow?.line.x1).toBeCloseTo(0.53, 6);
    expect(arrow?.line.x2).toBeCloseTo(1.47, 6);
  });

  it("points the right way when the exit goes up and to the left", () => {
    const arrow = arrowShape({ x: 0.8, y: 0.8 }, { x: 0.2, y: 0.2 }, 1);
    expect((arrow?.line.x2 ?? 1) < (arrow?.line.x1 ?? 0)).toBe(true);
    expect((arrow?.line.y2 ?? 1) < (arrow?.line.y1 ?? 0)).toBe(true);
  });

  it("can be moved to the side of its way, so the two ways of a reciprocal exit do not lie on the same line", () => {
    const there = arrowShape({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 1, ARROW_SIDE);
    const back = arrowShape({ x: 0.8, y: 0.5 }, { x: 0.2, y: 0.5 }, 1, ARROW_SIDE);
    // Each keeps to its own right-hand side: going right it is lower on the picture, coming back it is higher.
    expect(there?.line.y1).toBeCloseTo(0.5 + ARROW_SIDE, 6);
    expect(back?.line.y1).toBeCloseTo(0.5 - ARROW_SIDE, 6);
    expect(Math.abs((there?.line.y1 ?? 0) - (back?.line.y1 ?? 0))).toBeCloseTo(ARROW_SIDE * 2, 6);
    // And along the way it is where it was.
    expect(there?.line.x1).toBeCloseTo(0.23, 6);
    expect(there?.line.x2).toBeCloseTo(0.77, 6);
  });

  it("moves the head with the line", () => {
    const arrow = arrowShape({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 1, ARROW_SIDE);
    const tip = (arrow?.head ?? "").split(" ")[0]?.split(",").map(Number);
    expect(tip?.[1]).toBeCloseTo(0.5 + ARROW_SIDE, 6);
  });

  it("is nothing when the pins are too close for an arrow to be seen between them, or on the same spot", () => {
    expect(arrowShape({ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.5 }, 1)).toBeNull();
    expect(arrowShape({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1)).toBeNull();
  });
});
