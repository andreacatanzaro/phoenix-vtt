import { describe, expect, it, vi } from "vitest";
import { pointerAuth } from "./pointer-auth";

function setup(check: () => Promise<boolean>) {
  let now = 1000;
  const onError = vi.fn();
  const auth = pointerAuth({ check, now: () => now, ttlMs: 5000, onError });
  return { allowed: auth, onError, advance: (ms: number) => { now += ms; } };
}

describe("pointerAuth", () => {
  it("trusts the login for a few seconds without asking again", async () => {
    const check = vi.fn(() => Promise.resolve(true));
    const { allowed, advance } = setup(check);
    expect(await allowed()).toBe(true);
    advance(4000);
    expect(await allowed()).toBe(true);
    expect(check).not.toHaveBeenCalled();
  });

  it("asks again after that, and keeps the answer for a few seconds", async () => {
    const check = vi.fn(() => Promise.resolve(false));
    const { allowed, advance } = setup(check);
    advance(5000);
    expect(await allowed()).toBe(false);
    expect(await allowed()).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("asks only once when many pointers arrive while the answer is awaited", async () => {
    let release: (ok: boolean) => void = () => undefined;
    const check = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; }));
    const { allowed, advance } = setup(check);
    advance(5000);
    const answers = [allowed(), allowed(), allowed()];
    release(true);
    expect(await Promise.all(answers)).toEqual([true, true, true]);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("when the check fails the answer is no, the error is reported, and nothing is thrown", async () => {
    const check = vi.fn(() => Promise.reject(new Error("db down")));
    const { allowed, onError, advance } = setup(check);
    advance(5000);
    expect(await allowed()).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("recovers after a failure: the next pointer asks again", async () => {
    const check = vi.fn<() => Promise<boolean>>().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(true);
    const { allowed, advance } = setup(check);
    advance(5000);
    expect(await allowed()).toBe(false);
    expect(await allowed()).toBe(true);
    expect(check).toHaveBeenCalledTimes(2);
  });
});
