import { describe, expect, it } from "vitest";
import type { ActiveCondition } from "./conditions";
import { crawlMoveCost, effectiveSpeed, frightenedBlocksApproach, grappleHolds, standUpCost } from "./condition-movement";

const c = (...ids: ActiveCondition["id"][]): ActiveCondition[] => ids.map((id) => ({ id, sourceId: "src" }));

describe("effectiveSpeed", () => {
  it("applies the condition factor to the base speed in meters", () => {
    expect(effectiveSpeed(9, [])).toBe(9);
    expect(effectiveSpeed(9, c("grappled"))).toBe(0);
    expect(effectiveSpeed(9, [{ id: "exhaustion", sourceId: "x", level: 2 }])).toBe(4.5);
  });

  it("rejects negative or non-finite speeds", () => {
    expect(() => effectiveSpeed(-1, [])).toThrow();
    expect(() => effectiveSpeed(Number.NaN, [])).toThrow();
  });
});

describe("crawlMoveCost", () => {
  it("costs double for a prone creature, which can only crawl", () => {
    expect(crawlMoveCost(c("prone"), 3)).toBe(6);
    expect(crawlMoveCost([], 3)).toBe(3);
  });
});

describe("standUpCost", () => {
  it("costs half the speed", () => {
    expect(standUpCost(9, c("prone"))).toBe(4.5);
  });

  it("is half the reduced speed when exhaustion slows the creature", () => {
    expect(standUpCost(9, [...c("prone"), { id: "exhaustion", sourceId: "x", level: 2 }])).toBe(2.25);
  });

  it("is not possible for a creature that cannot move", () => {
    expect(standUpCost(9, c("prone", "restrained"))).toBeNull();
    expect(standUpCost(9, c("prone", "unconscious"))).toBeNull();
  });

  it("is not needed when not prone", () => {
    expect(standUpCost(9, [])).toBe(0);
  });
});

describe("grappleHolds", () => {
  it("holds while the grappler can act and is within reach", () => {
    expect(grappleHolds([], 1.5, 1.5)).toEqual({ holds: true });
  });

  it("ends when the grappler is incapacitated", () => {
    expect(grappleHolds(c("stunned"), 1.5, 1.5)).toEqual({ holds: false, reason: "incapacitated" });
  });

  it("ends when the creatures are farther apart than the reach", () => {
    expect(grappleHolds([], 3, 1.5)).toEqual({ holds: false, reason: "out-of-reach" });
    expect(grappleHolds([], 3, 3)).toEqual({ holds: true });
  });

  it("rejects negative distances", () => {
    expect(() => grappleHolds([], -1, 1.5)).toThrow();
  });
});

describe("frightenedBlocksApproach", () => {
  const afraid: ActiveCondition[] = [{ id: "frightened", sourceId: "dragon" }];
  const see = () => true;

  it("forbids moving closer to the source while it is in sight", () => {
    expect(frightenedBlocksApproach(afraid, { sourceId: "dragon", before: 9, after: 6, sees: see })).toBe(true);
  });

  it("allows staying or moving away", () => {
    expect(frightenedBlocksApproach(afraid, { sourceId: "dragon", before: 9, after: 9, sees: see })).toBe(false);
    expect(frightenedBlocksApproach(afraid, { sourceId: "dragon", before: 9, after: 12, sees: see })).toBe(false);
  });

  it("allows it when the source is out of sight, and for other creatures", () => {
    expect(frightenedBlocksApproach(afraid, { sourceId: "dragon", before: 9, after: 6, sees: () => false })).toBe(false);
    expect(frightenedBlocksApproach(afraid, { sourceId: "orc", before: 9, after: 6, sees: see })).toBe(false);
    expect(frightenedBlocksApproach([], { sourceId: "dragon", before: 9, after: 6, sees: see })).toBe(false);
  });
});
