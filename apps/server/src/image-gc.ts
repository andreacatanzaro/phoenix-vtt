import { and, eq, inArray, lt, notExists, sql } from "drizzle-orm";
import { images, scenes, tokens } from "./db/schema";
import type { Database } from "./db/types";
import type { ImageStore } from "./image-store";

/**
 * A picture is uploaded first and attached afterwards, so a new one is left alone for this long. After that, a picture
 * nothing points to is garbage.
 */
export const IMAGE_GRACE_MS = 60 * 60 * 1000;
export const IMAGE_SWEEP_MS = 60 * 60 * 1000;

export type ReclaimHooks = {
  /** For tests: runs right before a picture is claimed, to simulate something happening at that very moment. */
  beforeClaim?: (imageId: string) => Promise<void>;
  /** Hears every step that failed (`imageId` is null when the store could not even be listed). Nothing is silent. */
  onError?: (imageId: string | null, error: unknown) => void;
};

/**
 * Cleans up in two steps, so that the database and the files can never disagree in a way that loses a picture:
 *
 * 1. A picture nothing uses any more loses its row first (and only if it is still unused: one attached a moment ago is
 *    left alone). Only after that is committed is its file removed.
 * 2. A file that has no row, older than the grace time (the leftover of a crash during an upload, or of a removal that
 *    failed in step 1), is removed.
 *
 * Whoever adds a table that points at `images` must add it to the check below, or its pictures would be removed from
 * under it. Returns how many pictures and stray files were removed.
 */
export async function reclaimImages(db: Database, store: ImageStore, now: Date, hooks: ReclaimHooks = {}): Promise<number> {
  const report = hooks.onError ?? ((): void => undefined);
  const cutoff = new Date(now.getTime() - IMAGE_GRACE_MS);
  const unused = and(
    lt(images.createdAt, cutoff),
    notExists(db.select({ one: sql`1` }).from(scenes).where(eq(scenes.mapImageId, images.id))),
    notExists(db.select({ one: sql`1` }).from(tokens).where(eq(tokens.imageId, images.id))),
  );
  let removed = 0;

  let orphans: { id: string }[] = [];
  try {
    orphans = await db.select({ id: images.id }).from(images).where(unused);
  } catch (error) {
    report(null, error);
  }
  for (const { id } of orphans) {
    try {
      await hooks.beforeClaim?.(id);
      const claimed = await db.delete(images).where(and(eq(images.id, id), unused)).returning({ id: images.id });
      if (claimed.length === 0) continue;
      removed += 1;
    } catch (error) {
      report(id, error);
      continue;
    }
    try {
      await store.remove(id);
    } catch (error) {
      // The row is gone and the file stays: step 2 of a later sweep removes it.
      report(id, error);
    }
  }

  try {
    const old = (await store.list()).filter((f) => f.modifiedAt < cutoff).map((f) => f.id);
    if (old.length === 0) return removed;
    const known = new Set((await db.select({ id: images.id }).from(images).where(inArray(images.id, old))).map((r) => r.id));
    for (const id of old) {
      if (known.has(id)) continue;
      try {
        await store.remove(id);
        removed += 1;
      } catch (error) {
        report(id, error);
      }
    }
  } catch (error) {
    report(null, error);
  }
  return removed;
}

/** Runs `task` now and then every hour for as long as the app runs; a failure is reported and the next run goes on. */
export function startImageSweep(task: () => Promise<unknown>, report: (error: unknown) => void): () => void {
  const sweep = (): void => {
    // The task may also fail before it returns a promise.
    new Promise((resolve) => { resolve(task()); }).catch(report);
  };
  sweep();
  const timer = setInterval(sweep, IMAGE_SWEEP_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
