import { describe, expect, it, vi } from "vitest";
import { RETRY_MS, TextureCache } from "./texture-cache";

describe("TextureCache", () => {
  it("loads a picture once and keeps it", async () => {
    const cache = new TextureCache<string>(() => 0);
    const load = vi.fn(() => Promise.resolve("pic"));
    expect(await cache.get("a", load)).toBe("pic");
    expect(await cache.get("a", load)).toBe("pic");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares a load that is already under way", async () => {
    const cache = new TextureCache<string>(() => 0);
    let finish: (v: string) => void = () => undefined;
    const load = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const first = cache.get("a", load);
    const second = cache.get("a", load);
    finish("pic");
    expect(await first).toBe("pic");
    expect(await second).toBe("pic");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a failure gives null and is not asked again at once", async () => {
    let t = 0;
    const cache = new TextureCache<string>(() => t);
    const load = vi.fn(() => Promise.reject(new Error("503")));
    expect(await cache.get("a", load)).toBeNull();
    t = RETRY_MS - 1;
    expect(await cache.get("a", load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("a failure is not permanent: after a while it is tried again, and a success is kept", async () => {
    let t = 0;
    const cache = new TextureCache<string>(() => t);
    const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("blip")).mockResolvedValue("pic");
    expect(await cache.get("a", load)).toBeNull();
    t = RETRY_MS;
    expect(await cache.get("a", load)).toBe("pic");
    t = RETRY_MS * 10;
    expect(await cache.get("a", load)).toBe("pic");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps different pictures apart", async () => {
    const cache = new TextureCache<string>(() => 0);
    expect(await cache.get("a", () => Promise.resolve("A"))).toBe("A");
    expect(await cache.get("b", () => Promise.reject(new Error("x")))).toBeNull();
    expect(await cache.get("a", () => Promise.resolve("other"))).toBe("A");
  });
});
