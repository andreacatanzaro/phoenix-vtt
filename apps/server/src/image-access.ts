import { and, eq } from "drizzle-orm";
import { areas, places, regions, scenes, tokens } from "./db/schema";
import type { Database } from "./db/types";
import { runningSession } from "./table/store";

/**
 * Whether a player may download a picture right now: the map of a region or of a place they are shown on the atlas
 * (revealed, with everything above it revealed), or, if it is on the table they are sitting at, the map of the scene being
 * played or the face of a token they can see. A hidden token's face, the map of a scene not being played
 * and a picture the DM has uploaded but not used are not for players, even for those who know the id. The DM sees all.
 * Vision, when it arrives, narrows this further, and it changes here and nowhere else.
 */
export async function playerMaySeeImage(db: Database, worldId: string, imageId: string): Promise<boolean> {
  const asRegionMap = await db.select({ id: regions.id }).from(regions).where(and(eq(regions.worldId, worldId), eq(regions.mapImageId, imageId), eq(regions.revealed, true))).limit(1);
  if (asRegionMap.length > 0) return true;
  const asPlaceMap = await db
    .select({ id: places.id })
    .from(places)
    .innerJoin(areas, eq(areas.id, places.areaId))
    .innerJoin(regions, eq(regions.id, areas.regionId))
    .where(and(eq(places.worldId, worldId), eq(places.mapImageId, imageId), eq(places.revealed, true), eq(areas.revealed, true), eq(regions.revealed, true)))
    .limit(1);
  if (asPlaceMap.length > 0) return true;
  const session = await runningSession(db, worldId);
  const sceneId = session?.currentSceneId ?? null;
  if (sceneId === null) return false;
  const asMap = await db.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.id, sceneId), eq(scenes.mapImageId, imageId))).limit(1);
  if (asMap.length > 0) return true;
  const asFace = await db.select({ id: tokens.id }).from(tokens).where(and(eq(tokens.sceneId, sceneId), eq(tokens.imageId, imageId), eq(tokens.hidden, false))).limit(1);
  return asFace.length > 0;
}
