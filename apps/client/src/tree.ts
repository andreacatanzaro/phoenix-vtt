import type { ElementCollection, MapPoint, WorldTree } from "@phoenix/shared";

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

/** What every level has: the placement is the map of a region or place, the shape of an area, the pin of a place or scene. */
export type TreeNode = {
  id: string;
  name: string;
  description: string;
  revealed: boolean;
  dmNotes?: string | undefined;
  mapImageId?: string | null | undefined;
  polygon?: MapPoint[] | null | undefined;
  pin?: MapPoint | null | undefined;
  /** Where the element is on the graph of the structure; the layout puts it somewhere while it is not set. */
  graphX?: number | null | undefined;
  graphY?: number | null | undefined;
};
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

export type Unplaced = { id: string; name: string; collection: ElementCollection; path: string };

// An element can be placed only on a map that exists: an area on the map of its region, a place inside its area (drawn),
// a scene on the map of its place. Without that map it is a plain element of the list, not one waiting for a position.
const areaCanBePlaced = (region: { mapImageId?: string | null | undefined }): boolean => region.mapImageId != null;
const placeCanBePlaced = (area: { polygon?: MapPoint[] | null | undefined }): boolean => area.polygon != null;
const sceneCanBePlaced = (place: { mapImageId?: string | null | undefined }): boolean => place.mapImageId != null;

/**
 * What waits to be placed: areas, places and scenes that have a map to be on and are not on it. Everything made before the
 * atlas, on a region or a place that has since got a map, is here until the DM places it or deletes it. Without a map
 * above, an element waits for nothing; a region is never here, it is the top.
 */
export function unplaced(tree: WorldTree): Unplaced[] {
  const found: Unplaced[] = [];
  for (const region of tree.regions) {
    for (const area of region.areas) {
      const areaPath = [region.name, area.name];
      if (area.polygon == null && areaCanBePlaced(region)) found.push({ id: area.id, name: area.name, collection: "areas", path: areaPath.join(" › ") });
      for (const place of area.places) {
        const placePath = [...areaPath, place.name];
        if (place.pin == null && placeCanBePlaced(area)) found.push({ id: place.id, name: place.name, collection: "places", path: placePath.join(" › ") });
        for (const scene of place.scenes) {
          if (scene.pin == null && sceneCanBePlaced(place)) found.push({ id: scene.id, name: scene.name, collection: "scenes", path: [...placePath, scene.name].join(" › ") });
        }
      }
    }
  }
  const order: Record<ElementCollection, number> = { regions: 0, areas: 1, places: 2, scenes: 3 };
  // Level by level, each in tree order.
  return found.map((item, position) => ({ item, position })).sort((a, b) => order[a.item.collection] - order[b.item.collection] || a.position - b.position).map((x) => x.item);
}

/**
 * The tree without what waits to be placed on a map: what a player is shown, since the atlas is walked on its maps. What has
 * no map above it to be on stays, so a world without maps is shown whole. A region always stays.
 */
export function placedOnly(tree: WorldTree): WorldTree {
  return {
    regions: tree.regions.map((region) => ({
      ...region,
      areas: region.areas
        .filter((area) => area.polygon != null || !areaCanBePlaced(region))
        .map((area) => ({
          ...area,
          places: area.places
            .filter((place) => place.pin != null || !placeCanBePlaced(area))
            .map((place) => ({ ...place, scenes: place.scenes.filter((scene) => scene.pin != null || !sceneCanBePlaced(place)) })),
        })),
    })),
  };
}

/** The elements above one, from the region down to its parent, for a path that can be walked back. */
export function ancestors(index: ReadonlyMap<string, Entry>, id: string): { id: string; name: string }[] {
  const trail: { id: string; name: string }[] = [];
  let at = index.get(id)?.parentId ?? null;
  while (at !== null) {
    const entry = index.get(at);
    if (entry === undefined) break;
    trail.unshift({ id: at, name: entry.node.name });
    at = entry.parentId;
  }
  return trail;
}
