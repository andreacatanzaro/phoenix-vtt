import { isMessageKey, renderLogLine } from "@phoenix/shared";
import { describe, expect, it } from "vitest";
import type { InitiativeEntry } from "./initiative";
import { addCombatant, currentActor, nextTurn, removeCombatant, startCombat } from "./turns";

const entry = (actorId: string, total: number): InitiativeEntry => ({ actorId, total, natural: total, modifier: 0, controller: "player" });
const order = [entry("hero", 18), entry("orc", 12), entry("mage", 7)];

describe("startCombat", () => {
  it("starts round 1 with the first actor", () => {
    const { state, events } = startCombat(order);
    expect(state.round).toBe(1);
    expect(currentActor(state)).toBe("hero");
    expect(events).toEqual([
      { name: "round.start", payload: { round: 1 } },
      { name: "turn.start", payload: { actorId: "hero", round: 1 } },
    ]);
  });

  it("rejects an empty order", () => {
    expect(() => startCombat([])).toThrow();
  });
});

describe("nextTurn", () => {
  it("ends one turn and starts the next in the same round", () => {
    const { state, events } = nextTurn(startCombat(order).state);
    expect(currentActor(state)).toBe("orc");
    expect(events).toEqual([
      { name: "turn.end", payload: { actorId: "hero", round: 1 } },
      { name: "turn.start", payload: { actorId: "orc", round: 1 } },
    ]);
  });

  it("closes the round after the last actor and opens the next one", () => {
    let state = startCombat(order).state;
    state = nextTurn(nextTurn(state).state).state;
    const { state: after, events } = nextTurn(state);
    expect(after.round).toBe(2);
    expect(currentActor(after)).toBe("hero");
    expect(events.map((e) => e.name)).toEqual(["turn.end", "round.end", "round.start", "turn.start"]);
    expect(events[1]?.payload).toEqual({ round: 1 });
    expect(events[2]?.payload).toEqual({ round: 2 });
  });

  it("logs each turn start as Italian text", () => {
    const { log } = nextTurn(startCombat(order).state);
    expect(log.map((l) => l.key)).toEqual(["log.turn.start"]);
    expect(isMessageKey("log.turn.start")).toBe(true);
    expect(renderLogLine(log[0] ?? { key: "", params: {} }, () => "Orco")).toBe("Inizia il turno di Orco (round 1).");
  });

  it("keeps a one-actor combat going round after round", () => {
    const solo = startCombat([entry("hero", 10)]).state;
    const { state } = nextTurn(solo);
    expect(state.round).toBe(2);
    expect(currentActor(state)).toBe("hero");
  });

  it("is JSON serializable and does not change its input", () => {
    const start = startCombat(order).state;
    const snapshot = JSON.stringify(start);
    nextTurn(start);
    expect(JSON.stringify(start)).toBe(snapshot);
    expect(JSON.parse(JSON.stringify(start))).toEqual(start);
  });
});

describe("removeCombatant", () => {
  it("removes someone whose turn is later and keeps the current turn", () => {
    const state = removeCombatant(startCombat(order).state, "mage");
    expect(state.order.map((c) => c.actorId)).toEqual(["hero", "orc"]);
    expect(currentActor(state)).toBe("hero");
  });

  it("removes someone whose turn already passed and keeps the current turn", () => {
    const state = removeCombatant(nextTurn(nextTurn(startCombat(order).state).state).state, "hero");
    expect(currentActor(state)).toBe("mage");
  });

  it("refuses to remove the actor whose turn it is, and unknown actors", () => {
    const state = startCombat(order).state;
    expect(() => removeCombatant(state, "hero")).toThrow();
    expect(() => removeCombatant(state, "nobody")).toThrow();
  });

  it("refuses to empty the combat", () => {
    const solo = startCombat([entry("hero", 10)]).state;
    expect(() => removeCombatant(solo, "hero")).toThrow();
  });
});

describe("addCombatant", () => {
  // hero 18, orc 12, mage 7
  const atTurn = (turns: number) => {
    let state = startCombat(order).state;
    for (let i = 0; i < turns; i++) state = nextTurn(state).state;
    return state;
  };

  it("lets a newcomer with a higher total than the current actor play first, then the interrupted actor resumes", () => {
    const joined = addCombatant(atTurn(1), entry("wolf", 15)); // orc is up
    expect(joined.state.order.map((c) => c.actorId)).toEqual(["hero", "wolf", "orc", "mage"]);
    expect(currentActor(joined.state)).toBe("wolf");
    expect(joined.events).toEqual([{ name: "turn.start", payload: { actorId: "wolf", round: 1, interrupts: "orc" } }]);
    expect(joined.log.map((l) => l.key)).toEqual(["log.turn.join-now"]);

    const after = nextTurn(joined.state);
    expect(currentActor(after.state)).toBe("orc");
    expect(after.state.round).toBe(1);
    expect(after.events.map((e) => e.name)).toEqual(["turn.end", "turn.resume"]);
    expect(after.log.map((l) => l.key)).toEqual(["log.turn.resume"]);
  });

  it("goes on with the normal order once the interrupted actor finishes", () => {
    const joined = addCombatant(atTurn(1), entry("wolf", 15)).state;
    const afterWolf = nextTurn(joined).state; // orc resumes
    const afterOrc = nextTurn(afterWolf);
    expect(currentActor(afterOrc.state)).toBe("mage");
    expect(afterOrc.events.map((e) => e.name)).toEqual(["turn.end", "turn.start"]);
  });

  it("does not replay actors who already acted this round, even with a much higher total", () => {
    const joined = addCombatant(atTurn(2), entry("ghost", 30)).state; // mage is up, hero and orc already played
    expect(currentActor(joined)).toBe("ghost");
    const resumed = nextTurn(joined).state;
    expect(currentActor(resumed)).toBe("mage");
    const next = nextTurn(resumed);
    expect(next.state.round).toBe(2);
    expect(currentActor(next.state)).toBe("ghost");
  });

  it("makes a newcomer with a lower or equal total wait for their place in the round", () => {
    const lower = addCombatant(atTurn(0), entry("rat", 3));
    expect(lower.state.order.map((c) => c.actorId)).toEqual(["hero", "orc", "mage", "rat"]);
    expect(currentActor(lower.state)).toBe("hero");
    expect(lower.events).toEqual([]);
    expect(lower.log.map((l) => l.key)).toEqual(["log.turn.join-later"]);

    const equal = addCombatant(atTurn(0), entry("twin", 18));
    expect(equal.state.order.map((c) => c.actorId)).toEqual(["hero", "twin", "orc", "mage"]);
    expect(currentActor(equal.state)).toBe("hero");
    let state = nextTurn(equal.state).state;
    expect(currentActor(state)).toBe("twin");
    state = nextTurn(state).state;
    expect(currentActor(state)).toBe("orc");
  });

  it("places a newcomer after everyone who has the same total", () => {
    const state = addCombatant(atTurn(0), entry("twin", 12)).state;
    expect(state.order.map((c) => c.actorId)).toEqual(["hero", "orc", "twin", "mage"]);
  });

  it("stacks interruptions: the last newcomer to interrupt finishes first", () => {
    let state = addCombatant(atTurn(1), entry("wolf", 15)).state; // wolf interrupts orc
    state = addCombatant(state, entry("ghost", 20)).state; // ghost interrupts wolf
    expect(currentActor(state)).toBe("ghost");
    state = nextTurn(state).state;
    expect(currentActor(state)).toBe("wolf");
    state = nextTurn(state).state;
    expect(currentActor(state)).toBe("orc");
    state = nextTurn(state).state;
    expect(currentActor(state)).toBe("mage");
  });

  it("keeps waiting actors right when someone joins before them", () => {
    let state = addCombatant(atTurn(1), entry("wolf", 15)).state; // wolf playing, orc waiting
    state = addCombatant(state, entry("bat", 13)).state; // lower than wolf, higher than orc
    expect(currentActor(state)).toBe("wolf");
    state = nextTurn(state).state;
    expect(currentActor(state)).toBe("bat"); // acts before the interrupted orc picks up again
    state = nextTurn(state).state;
    expect(currentActor(state)).toBe("orc");
    state = nextTurn(state).state;
    expect(currentActor(state)).toBe("mage");
  });

  it("plays several late newcomers in initiative order, never skipping or repeating anyone", () => {
    let state = addCombatant(atTurn(1), entry("wolf", 15)).state; // wolf up, orc waiting
    state = addCombatant(state, entry("dog", 13)).state; // between wolf and the interrupted orc
    state = addCombatant(state, entry("bat", 14)).state;
    const played: string[] = [currentActor(state)];
    for (let i = 0; i < 4; i++) {
      state = nextTurn(state).state;
      played.push(currentActor(state));
    }
    expect(played).toEqual(["wolf", "bat", "dog", "orc", "mage"]);
    expect(state.round).toBe(1);
  });

  it("uses turn.start for a queued newcomer's first turn and turn.resume for the interrupted actor", () => {
    let state = addCombatant(atTurn(1), entry("wolf", 15)).state;
    state = addCombatant(state, entry("bat", 13)).state;
    const first = nextTurn(state);
    expect(first.events.map((e) => e.name)).toEqual(["turn.end", "turn.start"]);
    expect(nextTurn(first.state).events.map((e) => e.name)).toEqual(["turn.end", "turn.resume"]);
  });

  it("rejects an actor already in combat and does not change its input", () => {
    const state = atTurn(1);
    const snapshot = JSON.stringify(state);
    expect(() => addCombatant(state, entry("hero", 3))).toThrow();
    addCombatant(state, entry("wolf", 15));
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it("stays JSON serializable with an interruption pending", () => {
    const { state } = addCombatant(atTurn(1), entry("wolf", 15));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("refuses to remove an actor whose interrupted turn is waiting to resume", () => {
    const { state } = addCombatant(atTurn(1), entry("wolf", 15));
    expect(() => removeCombatant(state, "orc")).toThrow();
    expect(currentActor(removeCombatant(state, "mage"))).toBe("wolf");
  });
});
