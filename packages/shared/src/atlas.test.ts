import { describe, expect, it } from "vitest";
import { pointInPolygon, polygonCenter } from "./atlas";

const square = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }];
// An L: the square without its top right quarter.
const ell = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

describe("pointInPolygon", () => {
  it("is true inside and false outside", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.1, y: 0.5 }, square)).toBe(false);
    expect(pointInPolygon({ x: 0.5, y: 0.9 }, square)).toBe(false);
  });

  it("follows a shape that is not convex", () => {
    expect(pointInPolygon({ x: 0.25, y: 0.25 }, ell)).toBe(true);
    expect(pointInPolygon({ x: 0.75, y: 0.25 }, ell)).toBe(false);
    expect(pointInPolygon({ x: 0.75, y: 0.75 }, ell)).toBe(true);
  });

  it("counts the border as inside, so a pin placed on the edge of an area is accepted", () => {
    expect(pointInPolygon({ x: 0.2, y: 0.5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.8, y: 0.8 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0.5, y: 0.2 }, square)).toBe(true);
  });

  it("is false for a shape with fewer than three points", () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe("polygonCenter", () => {
  it("is the middle of the box around the shape, where a label can go", () => {
    expect(polygonCenter(square)).toEqual({ x: 0.5, y: 0.5 });
    expect(polygonCenter(ell)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("is the origin for an empty shape", () => {
    expect(polygonCenter([])).toEqual({ x: 0, y: 0 });
  });
});
