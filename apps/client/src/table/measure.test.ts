import { describe, expect, it } from "vitest";
import { cellCenter, formatMeters, radiusDistance, rulerDistance } from "./measure";

const scene = { gridPx: 70, gridOffsetX: 10, gridOffsetY: 20 };

describe("cellCenter", () => {
  it("is the middle of the square the point is in", () => {
    expect(cellCenter(scene, { x: 11, y: 21 })).toEqual({ x: 45, y: 55 });
    expect(cellCenter(scene, { x: 79, y: 89 })).toEqual({ x: 45, y: 55 });
    expect(cellCenter(scene, { x: 80, y: 90 })).toEqual({ x: 115, y: 125 });
  });
});

describe("rulerDistance", () => {
  it("counts straight steps one square each, in squares and in meters", () => {
    const r = rulerDistance(scene, { x: 11, y: 21 }, { x: 11 + 70 * 3, y: 21 });
    expect(r.cells).toBe(3);
    expect(r.meters).toBe(4.5);
  });

  it("counts a diagonal step like a straight one, the way 5e does", () => {
    expect(rulerDistance(scene, { x: 11, y: 21 }, { x: 11 + 70 * 4, y: 21 + 70 * 4 }).cells).toBe(4);
    expect(rulerDistance(scene, { x: 11, y: 21 }, { x: 11 + 70 * 4, y: 21 + 70 * 2 }).cells).toBe(4);
  });

  it("is zero inside one square, and the same both ways", () => {
    expect(rulerDistance(scene, { x: 12, y: 22 }, { x: 60, y: 60 }).meters).toBe(0);
    const ab = rulerDistance(scene, { x: 0, y: 0 }, { x: 500, y: 300 });
    const ba = rulerDistance(scene, { x: 500, y: 300 }, { x: 0, y: 0 });
    expect(ab.cells).toBe(ba.cells);
  });

  it("ends the line on the middle of the squares", () => {
    const r = rulerDistance(scene, { x: 11, y: 21 }, { x: 200, y: 21 });
    expect(r.from).toEqual({ x: 45, y: 55 });
    expect(r.to).toEqual({ x: 185, y: 55 });
  });
});

describe("radiusDistance", () => {
  it("measures from the middle of a square out to the point, to the nearest half square", () => {
    const r = radiusDistance(scene, { x: 11, y: 21 }, { x: 45 + 70 * 2, y: 55 });
    expect(r.center).toEqual({ x: 45, y: 55 });
    expect(r.cells).toBe(2);
    expect(r.meters).toBe(3);
    expect(radiusDistance(scene, { x: 11, y: 21 }, { x: 45 + 105, y: 55 }).cells).toBe(1.5);
  });
});

describe("formatMeters", () => {
  it("writes meters with the Italian comma and no useless zeros", () => {
    expect(formatMeters(4.5)).toBe("4,5 m");
    expect(formatMeters(6)).toBe("6 m");
    expect(formatMeters(0)).toBe("0 m");
  });
});
