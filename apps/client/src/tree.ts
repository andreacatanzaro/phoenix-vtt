import type { ElementCollection, WorldTree } from "@phoenix/shared";

/** The level below each one, and the name of the field that points up. */
export const CHILD_OF: Record<ElementCollection, ElementCollection | null> = { regions: "areas", areas: "places", places: "scenes", scenes: null };

export type SceneOption = { id: string; path: string };

/** Every scene with its full path ("Regione › Area › Luogo › Scena"), in tree order, for the pickers. */
export function sceneOptions(tree: WorldTree): SceneOption[] {
  return tree.regions.flatMap((region) =>
    region.areas.flatMap((area) =>
      area.places.flatMap((place) => place.scenes.map((scene) => ({ id: scene.id, path: [region.name, area.name, place.name, scene.name].join(" › ") }))),
    ),
  );
}

export type TreeNode = { id: string; name: string; description: string; revealed: boolean; dmNotes?: string | undefined };
export type Branch = { node: TreeNode; children: Branch[] };

/** The tree as generic branches, so one component can draw every level. */
export function branches(tree: WorldTree): Branch[] {
  return tree.regions.map((region) => ({
    node: region,
    children: region.areas.map((area) => ({
      node: area,
      children: area.places.map((place) => ({ node: place, children: place.scenes.map((scene) => ({ node: scene, children: [] })) })),
    })),
  }));
}

export type Entry = { collection: ElementCollection; node: TreeNode; parentId: string | null; path: string[]; children: { id: string; name: string; revealed: boolean }[] };

const NEXT: Record<ElementCollection, ElementCollection | null> = CHILD_OF;
const FIRST: ElementCollection = "regions";

/** Every element by id, with its level, its parent, the names above it and its direct children. */
export function indexTree(tree: WorldTree): Map<string, Entry> {
  const index = new Map<string, Entry>();
  const visit = (branch: Branch, collection: ElementCollection, parentId: string | null, above: string[]): void => {
    const path = [...above, branch.node.name];
    index.set(branch.node.id, {
      collection,
      node: branch.node,
      parentId,
      path,
      children: branch.children.map((c) => ({ id: c.node.id, name: c.node.name, revealed: c.node.revealed })),
    });
    const next = NEXT[collection];
    if (next !== null) for (const child of branch.children) visit(child, next, branch.node.id, path);
  };
  for (const branch of branches(tree)) visit(branch, FIRST, null, []);
  return index;
}
