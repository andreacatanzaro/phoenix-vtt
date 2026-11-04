import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createFileImageStore, createMemoryImageStore } from "./image-store";

const dir = mkdtempSync(join(tmpdir(), "phoenix-images-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
const id = "11111111-2222-4333-8444-555555555555";

describe.each([
  ["file store", () => createFileImageStore(join(dir, "nested", "folder"))],
  ["memory store", () => createMemoryImageStore()],
])("%s", (_name, make) => {
  it("keeps what it is given and gives it back unchanged", async () => {
    const store = make();
    await store.put(id, new Uint8Array([1, 2, 3, 250]));
    expect(await store.get(id)).toEqual(new Uint8Array([1, 2, 3, 250]));
  });

  it("answers null for a picture it does not have, and removing a missing one is harmless", async () => {
    const store = make();
    expect(await store.get("99999999-2222-4333-8444-555555555555")).toBeNull();
    await expect(store.remove("99999999-2222-4333-8444-555555555555")).resolves.toBeUndefined();
  });

  it("removes a picture", async () => {
    const store = make();
    await store.put(id, new Uint8Array([9]));
    await store.remove(id);
    expect(await store.get(id)).toBeNull();
  });

  it("accepts only a UUID as a name, so no path can climb out of the folder", async () => {
    const store = make();
    for (const bad of ["../secret", "a/b", "", "not-a-uuid", "11111111-2222-4333-8444-5555555555555", "..%2f"]) {
      await expect(store.put(bad, new Uint8Array([1]))).rejects.toThrow();
      await expect(store.get(bad)).rejects.toThrow();
    }
  });
});
