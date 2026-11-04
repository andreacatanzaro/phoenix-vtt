import { describe, expect, it } from "vitest";
import { CHILD_OF, branches, indexTree, sceneOptions } from "./tree";

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
