import { and, eq, sql } from "drizzle-orm";
import type { AreaView, ElementCollection, ElementView, PlaceView, RegionView, SceneView, UpdateElementInput, WorldTree } from "@phoenix/shared";
import { areas, gameSessions, places, regions, scenes, tokens } from "./db/schema";
import type { Database } from "./db/types";
import { isForeignKeyViolation } from "./http";

type Row = { id: string; name: string; description: string; dmNotes: string; revealed: boolean };

function view(row: Row, dm: boolean): ElementView {
  const base = { id: row.id, name: row.name, description: row.description, revealed: row.revealed };
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

export type CreateResult = { element: ElementView } | "parent-invalid";

/** Creates an element; a child must name a parent of the right level in the same world. */
export async function createElement(
  db: Database,
  worldId: string,
  collection: ElementCollection,
  input: { name: string; description: string; dmNotes: string; parentId?: string | undefined },
): Promise<CreateResult> {
  const values = { worldId, name: input.name, description: input.description, dmNotes: input.dmNotes };
  const done = (row: Row | undefined): CreateResult => {
    if (row === undefined) throw new Error("Insert returned no row");
    return { element: view(row, true) };
  };
  if (collection === "regions") {
    if (input.parentId !== undefined) return "parent-invalid";
    return done((await db.insert(regions).values(values).returning())[0]);
  }
  if (input.parentId === undefined) return "parent-invalid";
  const parentId = input.parentId;
  // The parent may be deleted between the check and the insert: the database then refuses, and that is "no such parent".
  try {
    if (collection === "areas") {
      const parent = await db.select({ id: regions.id }).from(regions).where(and(eq(regions.id, parentId), eq(regions.worldId, worldId))).limit(1);
      if (parent.length === 0) return "parent-invalid";
      return done((await db.insert(areas).values({ ...values, regionId: parentId }).returning())[0]);
    }
    if (collection === "places") {
      const parent = await db.select({ id: areas.id }).from(areas).where(and(eq(areas.id, parentId), eq(areas.worldId, worldId))).limit(1);
      if (parent.length === 0) return "parent-invalid";
      return done((await db.insert(places).values({ ...values, areaId: parentId }).returning())[0]);
    }
    const parent = await db.select({ id: places.id }).from(places).where(and(eq(places.id, parentId), eq(places.worldId, worldId))).limit(1);
    if (parent.length === 0) return "parent-invalid";
    return done((await db.insert(scenes).values({ ...values, placeId: parentId }).returning())[0]);
  } catch (error) {
    if (isForeignKeyViolation(error)) return "parent-invalid";
    throw error;
  }
}

export async function updateElement(db: Database, worldId: string, collection: ElementCollection, id: string, patch: UpdateElementInput): Promise<ElementView | null> {
  const set = patch;
  const row = async (): Promise<Row | undefined> => {
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
  return updated === undefined ? null : view(updated, true);
}

export type DeleteResult = "deleted" | "not-found" | "not-empty" | "in-use";

/** Deletes an element only if it holds nothing; the links of a deleted scene go with it. */
export async function deleteElement(db: Database, worldId: string, collection: ElementCollection, id: string): Promise<DeleteResult> {
  try {
    return await deleteChecked(db, worldId, collection, id);
  } catch (error) {
    // A child was added between the check and the delete: the database refuses, and the element is not empty after all.
    if (isForeignKeyViolation(error)) return "not-empty";
    throw error;
  }
}

async function deleteChecked(db: Database, worldId: string, collection: ElementCollection, id: string): Promise<DeleteResult> {
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
      // A scene with tokens on it is not empty, and the scene being played cannot be taken away from under the table.
      if (await count(db.select({ n: sql<number>`count(*)::int` }).from(tokens).where(eq(tokens.sceneId, id)))) return "not-empty";
      if (await count(db.select({ n: sql<number>`count(*)::int` }).from(gameSessions).where(and(eq(gameSessions.currentSceneId, id), eq(gameSessions.status, "running"))))) return "in-use";
      return (await db.delete(scenes).where(and(eq(scenes.id, id), eq(scenes.worldId, worldId))).returning({ id: scenes.id })).length > 0 ? "deleted" : "not-found";
    }
  }
}
