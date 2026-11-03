import { describe, expect, it } from "vitest";
import { grantExtraAction, spend, startOfTurn } from "./turn-economy";

describe("turn economy", () => {
  it("a turn starts with one action, one bonus action and one reaction", () => {
    expect(startOfTurn()).toEqual({ actions: 1, bonusActions: 1, reactions: 1, surgesThisTurn: 0 });
  });

  it("spending uses one and leaves the others, without changing the old value", () => {
    const start = startOfTurn();
    const after = spend(start, "bonus-action");
    expect(after).toEqual({ ...start, bonusActions: 0 });
    expect(start.bonusActions).toBe(1);
    expect(() => spend(after, "bonus-action")).toThrow();
  });

  it("an extra action can be granted up to the per-turn limit", () => {
    const first = grantExtraAction(startOfTurn(), 1);
    expect(first.actions).toBe(2);
    expect(() => grantExtraAction(first, 1)).toThrow();
    expect(grantExtraAction(first, 2).actions).toBe(3);
  });
});
