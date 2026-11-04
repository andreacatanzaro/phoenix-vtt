import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Where picture bytes are kept. Today a folder on disk (a volume in production); tomorrow an S3-compatible bucket, by
 * writing another implementation of this interface.
 */
export interface ImageStore {
  put(id: string, bytes: Uint8Array): Promise<void>;
  get(id: string): Promise<Uint8Array | null>;
  remove(id: string): Promise<void>;
  /** Every stored picture with when it was written, to find files that have no row in the database. */
  list(): Promise<{ id: string; modifiedAt: Date }[]>;
}

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function assertId(id: string): void {
  // The id becomes a file name: only a UUID is accepted, so nothing can climb out of the folder.
  if (!ID_PATTERN.test(id)) throw new Error("Invalid image id");
}

export function createFileImageStore(directory: string): ImageStore {
  return {
    async put(id, bytes) {
      assertId(id);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, id), bytes);
    },
    async get(id) {
      assertId(id);
      try {
        return new Uint8Array(await readFile(join(directory, id)));
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    },
    async remove(id) {
      assertId(id);
      await rm(join(directory, id), { force: true });
    },
    async list() {
      let names: string[];
      try {
        names = await readdir(directory);
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
        throw error;
      }
      const found: { id: string; modifiedAt: Date }[] = [];
      for (const name of names) {
        // Anything that is not a picture of ours (a stray file, a temporary one) is not ours to list.
        if (!ID_PATTERN.test(name)) continue;
        try {
          found.push({ id: name, modifiedAt: (await stat(join(directory, name))).mtime });
        } catch {
          // It went away between the listing and now.
        }
      }
      return found;
    },
  };
}

/** Runs `work` once the id has been checked; a bad id is a rejected promise, like in the file store. */
function checked<T>(id: string, work: () => T): Promise<T> {
  return new Promise((resolve) => {
    assertId(id);
    resolve(work());
  });
}

export function createMemoryImageStore(now: () => Date = () => new Date()): ImageStore & { size(): number } {
  const files = new Map<string, { bytes: Uint8Array; modifiedAt: Date }>();
  return {
    put: (id, bytes) => checked(id, () => void files.set(id, { bytes: new Uint8Array(bytes), modifiedAt: now() })),
    get: (id) => checked(id, () => files.get(id)?.bytes ?? null),
    remove: (id) => checked(id, () => void files.delete(id)),
    list: () => Promise.resolve([...files].map(([id, f]) => ({ id, modifiedAt: f.modifiedAt }))),
    size: () => files.size,
  };
}
