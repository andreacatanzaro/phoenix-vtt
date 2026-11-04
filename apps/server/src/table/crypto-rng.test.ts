import { describe, expect, it } from "vitest";
import { createCryptoRng } from "./crypto-rng";

describe("createCryptoRng", () => {
  it("stays inside the inclusive range and reaches both ends", () => {
    const rng = createCryptoRng();
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(rng.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("a range of one value always gives that value", () => {
    expect(createCryptoRng().int(7, 7)).toBe(7);
  });

  it("refuses a bad range", () => {
    expect(() => createCryptoRng().int(5, 1)).toThrow();
    expect(() => createCryptoRng().int(1.5, 3)).toThrow();
  });
});
