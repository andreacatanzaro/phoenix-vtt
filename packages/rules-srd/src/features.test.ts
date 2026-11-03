import { describe, expect, it } from "vitest";
import { maxUses, restoreUses, spendUse, usesLeft, validateFeature, type FeatureDefinition } from "./features";

const base = { nameKey: "n", descriptionKey: "d", source: "original", automation: "full" } as const;
const surge: FeatureDefinition = { ...base, id: "surge", uses: { table: [{ fromLevel: 2, count: 1 }, { fromLevel: 17, count: 2 }], recharge: "short-rest" } };
const resolve: FeatureDefinition = { ...base, id: "resolve", uses: { table: [{ fromLevel: 9, count: 1 }], recharge: "long-rest" } };
const passive: FeatureDefinition = { ...base, id: "passive" };

describe("uses", () => {
  it("follows the table by level", () => {
    expect(maxUses(surge, 1)).toBe(0);
    expect(maxUses(surge, 2)).toBe(1);
    expect(maxUses(surge, 16)).toBe(1);
    expect(maxUses(surge, 17)).toBe(2);
  });

  it("spends one use at a time and refuses when none is left", () => {
    const once = spendUse(surge, 2, {});
    expect(usesLeft(surge, 2, once)).toBe(0);
    expect(() => spendUse(surge, 2, once)).toThrow();
    expect(usesLeft(surge, 17, spendUse(surge, 17, {}))).toBe(1);
  });

  it("does not mutate the previous record", () => {
    const before = {};
    spendUse(surge, 2, before);
    expect(before).toEqual({});
  });

  it("a feature without limited uses has no maximum", () => {
    expect(() => maxUses(passive, 5)).toThrow();
  });
});

describe("restoreUses", () => {
  const spent = { surge: 1, resolve: 1, other: 1 };

  it("a short rest restores only short-rest features", () => {
    expect(restoreUses([surge, resolve], spent, "short")).toEqual({ resolve: 1, other: 1 });
  });

  it("a long rest restores every feature it knows", () => {
    expect(restoreUses([surge, resolve], spent, "long")).toEqual({ other: 1 });
  });

  it("keeps entries for features it does not know: they belong to another source", () => {
    expect(restoreUses([], spent, "long")).toEqual(spent);
    expect(restoreUses([surge], { surge: 1, elsewhere: 2 }, "long")).toEqual({ elsewhere: 2 });
  });
});

describe("validateFeature", () => {
  it("rejects an unordered or empty table", () => {
    expect(() => validateFeature({ ...surge, uses: { table: [], recharge: "long-rest" } })).toThrow();
    expect(() => validateFeature({ ...surge, uses: { table: [{ fromLevel: 5, count: 1 }, { fromLevel: 2, count: 2 }], recharge: "long-rest" } })).toThrow();
    expect(() => validateFeature({ ...surge, uses: { table: [{ fromLevel: 2, count: 0 }], recharge: "long-rest" } })).toThrow();
  });

  it("a feature that is not fully automated must say what the DM resolves", () => {
    expect(() => validateFeature({ ...passive, automation: "partial" })).toThrow();
    expect(validateFeature({ ...passive, automation: "partial", dmNoteKey: "k" }).id).toBe("passive");
  });
});
