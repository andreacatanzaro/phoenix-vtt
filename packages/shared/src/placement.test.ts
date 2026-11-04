import { describe, expect, it } from "vitest";
import { firstFreeSpot, placeInZone, squaresOf } from "./placement";

const zone = { x: 2, y: 3, w: 3, h: 2 };

describe("placeInZone", () => {
  it("fills the zone left to right, top to bottom", () => {
    const out = placeInZone(zone, [{ id: "a", size: 1 }, { id: "b", size: 1 }, { id: "c", size: 1 }, { id: "d", size: 1 }], new Set());
    expect(out).toEqual([{ id: "a", x: 2, y: 3 }, { id: "b", x: 3, y: 3 }, { id: "c", x: 4, y: 3 }, { id: "d", x: 2, y: 4 }]);
  });

  it("skips squares that are already taken", () => {
    const out = placeInZone(zone, [{ id: "a", size: 1 }, { id: "b", size: 1 }], new Set(["2,3", "3,3"]));
    expect(out).toEqual([{ id: "a", x: 4, y: 3 }, { id: "b", x: 2, y: 4 }]);
  });

  it("a big token needs a free square of its whole size", () => {
    const out = placeInZone({ x: 0, y: 0, w: 4, h: 4 }, [{ id: "big", size: 2 }, { id: "small", size: 1 }], new Set(["0,0"]));
    expect(out[0]).toEqual({ id: "big", x: 1, y: 0 });
    expect(out[1]).toEqual({ id: "small", x: 3, y: 0 });
  });

  it("never puts two tokens on the same square", () => {
    const tokens = Array.from({ length: 20 }, (_, i) => ({ id: String(i), size: i % 3 === 0 ? 2 : 1 }));
    const placed = placeInZone(zone, tokens, new Set());
    const seen = new Set<string>();
    for (const p of placed) {
      const size = tokens.find((t) => t.id === p.id)?.size ?? 1;
      for (const sq of squaresOf({ x: p.x, y: p.y, size })) {
        expect(seen.has(sq), sq).toBe(false);
        seen.add(sq);
      }
    }
    expect(placed).toHaveLength(20);
  });

  it("when the zone is full the others go on the rows below it", () => {
    const out = placeInZone({ x: 0, y: 0, w: 2, h: 1 }, [{ id: "a", size: 1 }, { id: "b", size: 1 }, { id: "c", size: 1 }], new Set());
    expect(out).toEqual([{ id: "a", x: 0, y: 0 }, { id: "b", x: 1, y: 0 }, { id: "c", x: 0, y: 1 }]);
  });

  it("a token wider than the zone still gets a place", () => {
    expect(placeInZone({ x: 5, y: 5, w: 2, h: 2 }, [{ id: "huge", size: 3 }], new Set())).toEqual([{ id: "huge", x: 5, y: 7 }]);
  });

  it("places nothing for no tokens", () => {
    expect(placeInZone(zone, [], new Set())).toEqual([]);
  });
});

describe("placeInZone at the edge of the allowed start zone", () => {
  it("keeps every token inside the coordinates a token may have, even when the zone is full", () => {
    const zoneAtEdge = { x: 500, y: 500, w: 64, h: 64 };
    const tokens = Array.from({ length: 300 }, (_, i) => ({ id: String(i), size: (i % 8) + 1 }));
    const occupied = new Set(Array.from({ length: 64 }, (_, i) => `${String(500 + i)},500`));
    for (const p of placeInZone(zoneAtEdge, tokens, occupied)) {
      expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeLessThanOrEqual(1000);
      expect(p.x).toBeGreaterThanOrEqual(-1000);
    }
  });
});

describe("squaresOf", () => {
  it("lists the squares a token covers", () => {
    expect(squaresOf({ x: 1, y: 1, size: 2 }).sort()).toEqual(["1,1", "1,2", "2,1", "2,2"]);
  });
});

describe("firstFreeSpot", () => {
  it("is the first corner of the zone when nothing is there, and skips what is taken", () => {
    expect(firstFreeSpot(zone, 1, [])).toEqual({ x: 2, y: 3 });
    expect(firstFreeSpot(zone, 1, [{ x: 2, y: 3, size: 1 }, { x: 3, y: 3, size: 2 }])).toEqual({ x: 2, y: 4 });
  });
});
