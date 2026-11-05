import { and, eq, isNotNull, sql } from "drizzle-orm";
import { pointInPolygon, type AreaView, type ElementCollection, type ElementView, type MapPoint, type PlaceView, type RegionView, type SceneView, type UpdateElementInput, type WorldTree } from "@phoenix/shared";
import { areas, gameSessions, images, places, regions, scenes, tokens } from "./db/schema";
import type { Database } from "./db/types";
import { isForeignKeyViolation } from "./http";

type Row = { id: string; name: string; description: string; dmNotes: string; revealed: boolean };
/** What a row has on the maps of the atlas, whichever of these its level has. */
type Placement = { mapImageId?: string | null; polygon?: MapPoint[] | null; pin?: MapPoint | null };

function view(row: Row & Placement, dm: boolean): ElementView {
  const base = {
    id: row.id,
    name: row.name,
    description: row.description,
    revealed: row.revealed,
    ...(row.mapImageId === undefined ? {} : { mapImageId: row.mapImageId }),
    ...(row.polygon === undefined ? {} : { polygon: row.polygon }),
    ...(row.pin === undefined ? {} : { pin: row.pin }),
  };
  return dm ? { ...base, dmNotes: row.dmNotes } : base;
}

/**
 * The whole tree of a world. The DM gets everything, notes included. A player gets only the elements that are revealed
 * and whose ancestors are all revealed, and never the notes.
 */
export async function loadTree(db: Database, worldId: string, dm: boolean): Promise<WorldTree> {
  const [regionRows, areaRows, placeRows, sceneRows] = await Promise.all([
    db.select().from(regions).where(eq(regions.worldId, worldId)).orderBy(regions.createdAt, regions.id),
    db.select().from(areas).where(eq(areas.worldId, worldId)).orderBy(areas.createdAt, areas.id),
    db.select().from(places).where(eq(places.worldId, worldId)).orderBy(places.createdAt, places.id),
    db.select().from(scenes).where(eq(scenes.worldId, worldId)).orderBy(scenes.createdAt, scenes.id),
  ]);
  const shown = (row: Row): boolean => dm || row.revealed;
  const sceneViews = (placeId: string): SceneView[] => sceneRows.filter((r) => r.placeId === placeId && shown(r)).map((r) => view(r, dm));
  const placeViews = (areaId: string): PlaceView[] =>
    placeRows.filter((r) => r.areaId === areaId && shown(r)).map((r) => ({ ...view(r, dm), scenes: sceneViews(r.id) }));
  const areaViews = (regionId: string): AreaView[] =>
    areaRows.filter((r) => r.regionId === regionId && shown(r)).map((r) => ({ ...view(r, dm), places: placeViews(r.id) }));
  const regionViews: RegionView[] = regionRows.filter(shown).map((r) => ({ ...view(r, dm), areas: areaViews(r.id) }));
  return { regions: regionViews };
}

/**
 * The line the changes to the structure of a world wait in. A shape, a pin or a map is checked against its neighbours and
 * then written; two changes that each look right against the old state could leave the atlas inconsistent together.
 */
export const atlasQueueKey = (worldId: string): string => `atlas:${worldId}`;

export type CreateResult = { element: ElementView } | "parent-invalid" | "placement-invalid" | "placement-required";

/** Whether this is a map of this world (a picture of the kind "map"). */
async function isMapOf(db: Database, worldId: string, imageId: string): Promise<boolean> {
  const rows = await db.select({ id: images.id }).from(images).where(and(eq(images.id, imageId), eq(images.worldId, worldId), eq(images.kind, "map"))).limit(1);
  return rows.length > 0;
}

/** The area's shape, or null when the area is not on the map (or is not here). */
async function polygonOfArea(db: Database, worldId: string, areaId: string): Promise<MapPoint[] | null> {
  const rows = await db.select({ polygon: areas.polygon }).from(areas).where(and(eq(areas.id, areaId), eq(areas.worldId, worldId))).limit(1);
  return rows[0]?.polygon ?? null;
}

/** Whether the region has a map to draw its areas on. */
async function regionHasMap(db: Database, worldId: string, regionId: string): Promise<boolean> {
  const rows = await db.select({ map: regions.mapImageId }).from(regions).where(and(eq(regions.id, regionId), eq(regions.worldId, worldId))).limit(1);
  return rows[0]?.map != null;
}

/** Whether the place has a map to pin its scenes on. */
async function placeHasMap(db: Database, worldId: string, placeId: string): Promise<boolean> {
  const rows = await db.select({ map: places.mapImageId }).from(places).where(and(eq(places.id, placeId), eq(places.worldId, worldId))).limit(1);
  return rows[0]?.map != null;
}

/**
 * Creates an element; a child must name a parent of the right level in the same world. What it has on the maps is checked
 * with it: an area's shape needs the region to have a map, a place's pin must be inside its area, a scene's pin needs the
 * place to have a map. And where such a map is there, the element must be placed on it: only what has no map above it is
 * made without a position (what was made before the atlas stays as it is, and can still be changed).
 */
export async function createElement(
  db: Database,
  worldId: string,
  collection: ElementCollection,
  input: { name: string; description: string; dmNotes: string; parentId?: string | undefined; polygon?: MapPoint[] | undefined; pin?: MapPoint | undefined },
): Promise<CreateResult> {
  const values = { worldId, name: input.name, description: input.description, dmNotes: input.dmNotes };
  const done = (row: (Row & Placement) | undefined): CreateResult => {
    if (row === undefined) throw new Error("Insert returned no row");
    return { element: view(row, true) };
  };
  if (collection === "regions") {
    if (input.parentId !== undefined) return "parent-invalid";
    if (input.polygon !== undefined || input.pin !== undefined) return "placement-invalid";
    return done((await db.insert(regions).values(values).returning())[0]);
  }
  if (input.parentId === undefined) return "parent-invalid";
  const parentId = input.parentId;
  // The parent may be deleted between the check and the insert: the database then refuses, and that is "no such parent".
  try {
    if (collection === "areas") {
      const parent = await db.select({ id: regions.id }).from(regions).where(and(eq(regions.id, parentId), eq(regions.worldId, worldId))).limit(1);
      if (parent.length === 0) return "parent-invalid";
      if (input.pin !== undefined) return "placement-invalid";
      const regionMap = await regionHasMap(db, worldId, parentId);
      if (input.polygon !== undefined && !regionMap) return "placement-invalid";
      // Where there is a map to draw it on, an area is drawn on it; without a map it is a plain element.
      if (input.polygon === undefined && regionMap) return "placement-required";
      return done((await db.insert(areas).values({ ...values, regionId: parentId, polygon: input.polygon ?? null }).returning())[0]);
    }
    if (collection === "places") {
      const parent = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.id, parentId), eq(areas.worldId, worldId))).limit(1);
      if (parent.length === 0) return "parent-invalid";
      if (input.polygon !== undefined) return "placement-invalid";
      const shape = await polygonOfArea(db, worldId, parentId);
      if (input.pin !== undefined && (shape === null || !pointInPolygon(input.pin, shape))) return "placement-invalid";
      if (input.pin === undefined && shape !== null) return "placement-required";
      return done((await db.insert(places).values({ ...values, areaId: parentId, pin: input.pin ?? null }).returning())[0]);
    }
    const parent = await db.select({ id: places.id }).from(places).where(and(eq(places.id, parentId), eq(places.worldId, worldId))).limit(1);
    if (parent.length === 0) return "parent-invalid";
    if (input.polygon !== undefined) return "placement-invalid";
    const placeMap = await placeHasMap(db, worldId, parentId);
    if (input.pin !== undefined && !placeMap) return "placement-invalid";
    if (input.pin === undefined && placeMap) return "placement-required";
    return done((await db.insert(scenes).values({ ...values, placeId: parentId, pin: input.pin ?? null }).returning())[0]);
  } catch (error) {
    if (isForeignKeyViolation(error)) return "parent-invalid";
    throw error;
  }
}

/** Why a change was refused, or the element as it is now. */
export type UpdateResult = { element: ElementView } | "not-found" | "invalid" | "map-invalid" | "placement-invalid" | "map-in-use" | "pins-outside";

/** Changes an element. The map, the shape and the pin belong to some levels only, and each is checked against its neighbours. */
export async function updateElement(db: Database, worldId: string, collection: ElementCollection, id: string, patch: UpdateElementInput): Promise<UpdateResult> {
  const { mapImageId, polygon, pin, ...plain } = patch;
  // Each level has its own: asking for another's is a mistake.
  const hasMap = collection === "regions" || collection === "places";
  const hasPin = collection === "places" || collection === "scenes";
  if ((mapImageId !== undefined && !hasMap) || (polygon !== undefined && collection !== "areas") || (pin !== undefined && !hasPin)) return "invalid";

  const found = await findPlacement(db, worldId, collection, id);
  if (found === null) return "not-found";

  const set: Record<string, unknown> = { ...plain };
  if (mapImageId !== undefined) {
    if (mapImageId !== null && !(await isMapOf(db, worldId, mapImageId))) return "map-invalid";
    if (mapImageId === null && (await hasPlacedChildren(db, collection, id))) return "map-in-use";
    set["mapImageId"] = mapImageId;
  }
  if (polygon !== undefined) {
    if (polygon !== null && !(await regionHasMap(db, worldId, found.parentId ?? ""))) return "placement-invalid";
    const pinned = await db.select({ id: places.id, pin: places.pin }).from(places).where(and(eq(places.areaId, id), isNotNull(places.pin)));
    if (pinned.some((place) => place.pin !== null && (polygon === null || !pointInPolygon(place.pin, polygon)))) return "pins-outside";
    set["polygon"] = polygon;
  }
  if (pin !== undefined) {
    if (pin !== null && collection === "places") {
      const shape = await polygonOfArea(db, worldId, found.parentId ?? "");
      if (shape === null || !pointInPolygon(pin, shape)) return "placement-invalid";
    }
    if (pin !== null && collection === "scenes" && !(await placeHasMap(db, worldId, found.parentId ?? ""))) return "placement-invalid";
    set["pin"] = pin;
  }
  if (Object.keys(set).length === 0) return { element: found.element };

  const row = async (): Promise<(Row & Placement) | undefined> => {
    switch (collection) {
      case "regions":
        return (await db.update(regions).set(set).where(and(eq(regions.id, id), eq(regions.worldId, worldId))).returning())[0];
      case "areas":
        return (await db.update(areas).set(set).where(and(eq(areas.id, id), eq(areas.worldId, worldId))).returning())[0];
      case "places":
        return (await db.update(places).set(set).where(and(eq(places.id, id), eq(places.worldId, worldId))).returning())[0];
      case "scenes":
        return (await db.update(scenes).set(set).where(and(eq(scenes.id, id), eq(scenes.worldId, worldId))).returning())[0];
    }
  };
  const updated = await row();
  return updated === undefined ? "not-found" : { element: view(updated, true) };
}

/** The element as it is, and the id of the one above it (the region of an area, the area of a place, the place of a scene). */
async function findPlacement(db: Database, worldId: string, collection: ElementCollection, id: string): Promise<{ element: ElementView; parentId: string | null } | null> {
  switch (collection) {
    case "regions": {
      const r = (await db.select().from(regions).where(and(eq(regions.id, id), eq(regions.worldId, worldId))).limit(1))[0];
      return r === undefined ? null : { element: view(r, true), parentId: null };
    }
    case "areas": {
      const r = (await db.select().from(areas).where(and(eq(areas.id, id), eq(areas.worldId, worldId))).limit(1))[0];
      return r === undefined ? null : { element: view(r, true), parentId: r.regionId };
    }
    case "places": {
      const r = (await db.select().from(places).where(and(eq(places.id, id), eq(places.worldId, worldId))).limit(1))[0];
      return r === undefined ? null : { element: view(r, true), parentId: r.areaId };
    }
    case "scenes": {
      const r = (await db.select().from(scenes).where(and(eq(scenes.id, id), eq(scenes.worldId, worldId))).limit(1))[0];
      return r === undefined ? null : { element: view(r, true), parentId: r.placeId };
    }
  }
}

/** Whether something is placed on the map of this region or place (areas on a region's map, scenes on a place's). */
async function hasPlacedChildren(db: Database, collection: ElementCollection, id: string): Promise<boolean> {
  if (collection === "regions") return (await db.select({ id: areas.id }).from(areas).where(and(eq(areas.regionId, id), isNotNull(areas.polygon))).limit(1)).length > 0;
  if (collection === "places") return (await db.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.placeId, id), isNotNull(scenes.pin))).limit(1)).length > 0;
  return false;
}

/** "has-tokens": a scene with tokens on it, which is deleted only when the request says its tokens may go with it. */
export type DeleteResult = "deleted" | "not-found" | "not-empty" | "in-use" | "has-tokens";

/** Deletes an element only if it holds nothing; the links of a deleted scene go with it. */
export async function deleteElement(db: Database, worldId: string, collection: ElementCollection, id: string, withTokens = false): Promise<DeleteResult> {
  try {
    return await deleteChecked(db, worldId, collection, id, withTokens);
  } catch (error) {
    // A child was added between the check and the delete: the database refuses, and the element is not empty after all.
    if (isForeignKeyViolation(error)) return "not-empty";
    throw error;
  }
}

async function deleteChecked(db: Database, worldId: string, collection: ElementCollection, id: string, withTokens: boolean): Promise<DeleteResult> {
  const count = async (query: Promise<{ n: number }[]>): Promise<number> => (await query)[0]?.n ?? 0;
  switch (collection) {
    case "regions": {
      if (await count(db.select({ n: sql<number>`count(*)::int` }).from(areas).where(eq(areas.regionId, id)))) return "not-empty";
      return (await db.delete(regions).where(and(eq(regions.id, id), eq(regions.worldId, worldId))).returning({ id: regions.id })).length > 0 ? "deleted" : "not-found";
    }
    case "areas": {
      if (await count(db.select({ n: sql<number>`count(*)::int` }).from(places).where(eq(places.areaId, id)))) return "not-empty";
      return (await db.delete(areas).where(and(eq(areas.id, id), eq(areas.worldId, worldId))).returning({ id: areas.id })).length > 0 ? "deleted" : "not-found";
    }
    case "places": {
      if (await count(db.select({ n: sql<number>`count(*)::int` }).from(scenes).where(eq(scenes.placeId, id)))) return "not-empty";
      return (await db.delete(places).where(and(eq(places.id, id), eq(places.worldId, worldId))).returning({ id: places.id })).length > 0 ? "deleted" : "not-found";
    }
    case "scenes": {
      // A scene with tokens goes only if the request says so (its tokens go with it), and the scene being played cannot be
      // taken away from under the table, whatever the request says.
      if (!withTokens && (await count(db.select({ n: sql<number>`count(*)::int` }).from(tokens).where(eq(tokens.sceneId, id))))) return "has-tokens";
      if (await count(db.select({ n: sql<number>`count(*)::int` }).from(gameSessions).where(and(eq(gameSessions.currentSceneId, id), eq(gameSessions.status, "running"))))) return "in-use";
      return (await db.delete(scenes).where(and(eq(scenes.id, id), eq(scenes.worldId, worldId))).returning({ id: scenes.id })).length > 0 ? "deleted" : "not-found";
    }
  }
}
