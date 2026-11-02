import { createScriptedRng } from "@phoenix/rules-core";
import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import { breakTie, orderInitiative, rollInitiative, type InitiativeEntry } from "./initiative";

const entry = (actorId: string, total: number, over: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  actorId,
  total,
  natural: total,
  modifier: 0,
  controller: "player",
  ...over,
});

describe("rollInitiative", () => {
  it("rolls a d20 plus modifier for each actor, in input order", () => {
    const { entries } = rollInitiative(
      [
        { actorId: "hero", modifier: 3, mode: "normal", controller: "player" },
        { actorId: "orc", modifier: 1, mode: "normal", controller: "player" },
      ],
      createScriptedRng([14, 8]),
    );
    expect(entries.map((e) => [e.actorId, e.total])).toEqual([["hero", 17], ["orc", 9]]);
  });

  it("applies advantage and disadvantage to a single actor", () => {
    const { entries } = rollInitiative([{ actorId: "rogue", modifier: 4, mode: "advantage", controller: "player" }], createScriptedRng([5, 16]));
    expect(entries[0]?.total).toBe(20);
    expect(entries[0]?.natural).toBe(16);
  });

  it("gives a natural 20 or 1 no critical effect: the total alone counts", () => {
    const { entries, log } = rollInitiative(
      [
        { actorId: "a", modifier: -5, mode: "normal", controller: "player" },
        { actorId: "b", modifier: 10, mode: "normal", controller: "player" },
        { actorId: "c", modifier: 0, mode: "normal", controller: "player" },
      ],
      createScriptedRng([20, 1, 10]),
    );
    expect(entries.map((e) => e.total)).toEqual([15, 11, 10]);
    expect(entries.every((e) => !("notifyDm" in e))).toBe(true);
    expect(log.some((l) => l.key.includes("natural") || l.key.includes("critical"))).toBe(false);
    expect(orderInitiative(entries).order.map((e) => e.actorId)).toEqual(["a", "b", "c"]);
  });

  it("rejects duplicate actors", () => {
    expect(() =>
      rollInitiative(
        [
          { actorId: "x", modifier: 0, mode: "normal", controller: "player" },
          { actorId: "x", modifier: 0, mode: "normal", controller: "player" },
        ],
        createScriptedRng([1, 2]),
      ),
    ).toThrow();
  });

  it("keeps who controls each actor on the entry", () => {
    const { entries } = rollInitiative([{ actorId: "orc", modifier: 0, mode: "normal", controller: "dm" }], createScriptedRng([10]));
    expect(entries[0]?.controller).toBe("dm");
  });

  it("logs the full roll and the result for each actor, as Italian text", () => {
    const { log } = rollInitiative([{ actorId: "hero", modifier: 3, mode: "normal", controller: "player" }], createScriptedRng([14]));
    expect(log.map((l) => l.key)).toEqual(["log.roll.detail", "log.initiative.result"]);
    for (const line of log) {
      expect(isMessageKey(line.key), line.key).toBe(true);
      expect(renderLogLine(line, (id) => (id === "hero" ? "Aria" : id)).length).toBeGreaterThan(0);
    }
    expect(renderLogLine(log[1] ?? { key: "", params: {} }, () => "Aria")).toBe("Aria tira iniziativa: 17.");
  });
});

describe("orderInitiative", () => {
  it("sorts from highest to lowest total", () => {
    const { order } = orderInitiative([entry("a", 8), entry("b", 19), entry("c", 12)]);
    expect(order.map((e) => e.actorId)).toEqual(["b", "c", "a"]);
  });

  it("reports ties instead of deciding them", () => {
    const { order, tieGroups, log } = orderInitiative([entry("a", 12), entry("b", 12), entry("c", 20), entry("d", 5), entry("e", 5)]);
    expect(order.map((e) => e.actorId)).toEqual(["c", "a", "b", "d", "e"]);
    expect(tieGroups.map((g) => g.actorIds)).toEqual([["a", "b"], ["d", "e"]]);
    expect(log).toHaveLength(4);
  });

  it("lets the players settle a tie between player characters only", () => {
    const { tieGroups, log } = orderInitiative([entry("a", 12), entry("b", 12)]);
    expect(tieGroups).toEqual([{ actorIds: ["a", "b"], decidedBy: "players" }]);
    expect(log.map((l) => l.key)).toEqual(["log.initiative.tie-players", "log.initiative.tie-players"]);
  });

  it("lets the DM settle a tie that involves any creature of the DM", () => {
    const mixed = orderInitiative([entry("hero", 12), entry("orc", 12, { controller: "dm" })]);
    expect(mixed.tieGroups).toEqual([{ actorIds: ["hero", "orc"], decidedBy: "dm" }]);
    const monsters = orderInitiative([entry("orc", 9, { controller: "dm" }), entry("troll", 9, { controller: "dm" })]);
    expect(monsters.tieGroups[0]?.decidedBy).toBe("dm");
    expect(monsters.log.every((l) => l.key === "log.initiative.tie-dm")).toBe(true);
  });

  it("judges each tie group on its own", () => {
    const { tieGroups } = orderInitiative([
      entry("a", 12),
      entry("b", 12),
      entry("orc", 5, { controller: "dm" }),
      entry("c", 5),
    ]);
    expect(tieGroups.map((g) => g.decidedBy)).toEqual(["players", "dm"]);
  });

  it("reports no ties when every total differs", () => {
    expect(orderInitiative([entry("a", 1), entry("b", 2)]).tieGroups).toEqual([]);
  });

  it("does not change the input", () => {
    const input = [entry("a", 1), entry("b", 2)];
    orderInitiative(input);
    expect(input.map((e) => e.actorId)).toEqual(["a", "b"]);
  });
});

describe("breakTie", () => {
  const order = [entry("c", 20), entry("a", 12), entry("b", 12), entry("d", 5)];

  it("reorders a tie group as the DM decided", () => {
    expect(breakTie(order, ["b", "a"]).map((e) => e.actorId)).toEqual(["c", "b", "a", "d"]);
  });

  it("rejects a choice that is not exactly one tie group", () => {
    expect(() => breakTie(order, ["a", "c"])).toThrow();
    expect(() => breakTie(order, ["a"])).toThrow();
    expect(() => breakTie(order, ["a", "b", "d"])).toThrow();
    expect(() => breakTie(order, ["a", "x"])).toThrow();
  });
});
