import { describe, expect, it } from "vitest";
import { ancestors, CHILD_OF, branches, indexTree, placedOnly, sceneOptions, unplaced } from "./tree";

const scene = (id: string, name: string) => ({ id, name, description: "", revealed: true });
const tree = {
  regions: [
    {
      id: "r1", name: "Regno", description: "", revealed: true,
      areas: [
        { id: "a1", name: "Foresta", description: "", revealed: true, places: [{ id: "p1", name: "Locanda", description: "", revealed: true, scenes: [scene("s1", "Sala"), scene("s2", "Cantina")] }] },
        { id: "a2", name: "Monti", description: "", revealed: true, places: [{ id: "p2", name: "Rifugio", description: "", revealed: true, scenes: [scene("s3", "Cima")] }] },
      ],
    },
    { id: "r2", name: "Vuoto", description: "", revealed: true, areas: [] },
  ],
};

describe("sceneOptions", () => {
  it("lists every scene with its full path, in tree order", () => {
    expect(sceneOptions(tree)).toEqual([
      { id: "s1", path: "Regno › Foresta › Locanda › Sala" },
      { id: "s2", path: "Regno › Foresta › Locanda › Cantina" },
      { id: "s3", path: "Regno › Monti › Rifugio › Cima" },
    ]);
  });

  it("is empty for a world without scenes", () => {
    expect(sceneOptions({ regions: [] })).toEqual([]);
  });
});

describe("CHILD_OF", () => {
  it("goes from regions down to scenes, which have no children", () => {
    expect(CHILD_OF.regions).toBe("areas");
    expect(CHILD_OF.areas).toBe("places");
    expect(CHILD_OF.places).toBe("scenes");
    expect(CHILD_OF.scenes).toBeNull();
  });
});

describe("branches", () => {
  it("turns the tree into generic branches, level by level", () => {
    const result = branches(tree);
    expect(result.map((b) => b.node.name)).toEqual(["Regno", "Vuoto"]);
    expect(result[0]?.children.map((b) => b.node.name)).toEqual(["Foresta", "Monti"]);
    expect(result[0]?.children[0]?.children[0]?.children.map((b) => b.node.name)).toEqual(["Sala", "Cantina"]);
    expect(result[0]?.children[0]?.children[0]?.children[0]?.children).toEqual([]);
    expect(result[1]?.children).toEqual([]);
  });
});

describe("indexTree", () => {
  it("finds any element by id with its level, parent, path and children", () => {
    const index = indexTree(tree);
    expect(index.get("r1")).toMatchObject({ collection: "regions", parentId: null, path: ["Regno"] });
    expect(index.get("a1")).toMatchObject({ collection: "areas", parentId: "r1", path: ["Regno", "Foresta"] });
    expect(index.get("s2")).toMatchObject({ collection: "scenes", parentId: "p1", path: ["Regno", "Foresta", "Locanda", "Cantina"] });
    expect(index.get("r1")?.children.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(index.get("s1")?.children).toEqual([]);
    expect(index.size).toBe(9);
  });

  it("is empty for an empty world", () => {
    expect(indexTree({ regions: [] }).size).toBe(0);
  });
});

describe("unplaced", () => {
  const square = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }];
  // A region with a map. Its area "Monti" could be drawn on it but is not; the place "Rifugio" is in an area that is not
  // drawn, so it has no map to be on; the scene "Cantina" could be pinned on the map of its place but is not.
  const placed = {
    regions: [
      {
        id: "r1", name: "Regno", description: "", revealed: true, mapImageId: "m1",
        areas: [
          { id: "a1", name: "Foresta", description: "", revealed: true, polygon: square, places: [{ id: "p1", name: "Locanda", description: "", revealed: true, pin: { x: 0.3, y: 0.3 }, mapImageId: "m2", scenes: [{ ...scene("s1", "Sala"), pin: { x: 0.5, y: 0.5 } }, scene("s2", "Cantina")] }] },
          { id: "a2", name: "Monti", description: "", revealed: true, places: [{ id: "p2", name: "Rifugio", description: "", revealed: true, scenes: [scene("s3", "Cima")] }] },
        ],
      },
    ],
  };

  it("lists what could be on a map that exists and is not, with where it is, level by level", () => {
    expect(unplaced(placed)).toEqual([
      { id: "a2", name: "Monti", collection: "areas", path: "Regno › Monti" },
      { id: "s2", name: "Cantina", collection: "scenes", path: "Regno › Foresta › Locanda › Cantina" },
    ]);
  });

  it("does not list what has no map above it to be on: the place of an area that is not drawn, the scene of a place without a map", () => {
    expect(unplaced(placed).map((x) => x.id)).not.toContain("p2");
    expect(unplaced(placed).map((x) => x.id)).not.toContain("s3");
  });

  it("is empty for a world without maps: nothing waits to be placed where there is nothing to place it on", () => {
    expect(unplaced(tree)).toEqual([]);
  });

  it("is empty when everything is placed, and a region never waits", () => {
    expect(unplaced({ regions: [{ id: "r", name: "R", description: "", revealed: true, areas: [] }] })).toEqual([]);
  });

  it("a place waits when its area is drawn and it is not pinned in it", () => {
    const world = { regions: [{ id: "r", name: "R", description: "", revealed: true, mapImageId: "m", areas: [{ id: "a", name: "A", description: "", revealed: true, polygon: square, places: [{ id: "p", name: "P", description: "", revealed: true, scenes: [] }] }] }] };
    expect(unplaced(world)).toEqual([{ id: "p", name: "P", collection: "places", path: "R › A › P" }]);
  });
});

describe("placedOnly", () => {
  const square = [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }];
  const names = (t: ReturnType<typeof placedOnly>): string[] => t.regions.flatMap((r) => [r.name, ...r.areas.flatMap((a) => [a.name, ...a.places.flatMap((p) => [p.name, ...p.scenes.map((s) => s.name)])])]);
  const mixed = {
    regions: [
      {
        id: "r1", name: "Regno", description: "", revealed: true, mapImageId: "m1",
        areas: [
          { id: "a1", name: "Foresta", description: "", revealed: true, polygon: square, places: [{ id: "p1", name: "Locanda", description: "", revealed: true, pin: { x: 0.3, y: 0.3 }, mapImageId: "m2", scenes: [{ ...scene("s1", "Sala"), pin: { x: 0.5, y: 0.5 } }, scene("s2", "Cantina")] }, { id: "p2", name: "Rifugio", description: "", revealed: true, scenes: [{ ...scene("s3", "Cima"), pin: { x: 0.1, y: 0.1 } }] }] },
          { id: "a2", name: "Monti", description: "", revealed: true, places: [{ id: "p3", name: "Torre", description: "", revealed: true, pin: { x: 0.2, y: 0.2 }, scenes: [] }] },
        ],
      },
    ],
  };

  it("drops what waits to be placed on a map that exists, with what is inside it", () => {
    expect(names(placedOnly(mixed))).toEqual(["Regno", "Foresta", "Locanda", "Sala"]);
  });

  it("keeps what has no map above it to be on, so a world without maps is shown whole", () => {
    expect(names(placedOnly(tree))).toEqual(names(tree));
  });

  it("keeps the places of an area that is not on a map, and the scenes of a place without a map", () => {
    const world = { regions: [{ id: "r", name: "R", description: "", revealed: true, mapImageId: "m", areas: [{ id: "a", name: "A", description: "", revealed: true, polygon: square, places: [{ id: "p", name: "P", description: "", revealed: true, pin: { x: 0.2, y: 0.2 }, scenes: [scene("s", "S")] }] }] }] };
    expect(names(placedOnly(world))).toEqual(["R", "A", "P", "S"]);
  });

  it("never drops a region", () => {
    expect(placedOnly({ regions: [{ id: "r", name: "R", description: "", revealed: true, areas: [] }] }).regions).toHaveLength(1);
  });
});

describe("ancestors", () => {
  it("is the path above an element, from the region down to its parent, each with its id", () => {
    const index = indexTree(tree);
    expect(ancestors(index, "s2")).toEqual([{ id: "r1", name: "Regno" }, { id: "a1", name: "Foresta" }, { id: "p1", name: "Locanda" }]);
    expect(ancestors(index, "a2")).toEqual([{ id: "r1", name: "Regno" }]);
  });

  it("is empty for a region and for an id that is not there", () => {
    const index = indexTree(tree);
    expect(ancestors(index, "r1")).toEqual([]);
    expect(ancestors(index, "nessuno")).toEqual([]);
  });
});
