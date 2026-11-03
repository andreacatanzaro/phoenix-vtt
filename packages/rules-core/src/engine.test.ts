import { describe, expect, it } from "vitest";
import type { ActiveEffect } from "./effects";
import { createEngine, emptyState, MAX_EVENTS_PER_RUN, restoreState, type HookDefinition, type ResolutionState } from "./engine";
import { createSeededRng } from "./rng";
import type { GameEvent } from "./types";

const rng = createSeededRng(1);
const ev = (name: string, payload: GameEvent["payload"] = {}): GameEvent => ({ name, payload });
const logKeys = (state: ResolutionState): string[] => state.log.map((l) => l.key);

function run(hooks: HookDefinition[], event: GameEvent, state: ResolutionState = emptyState()): ResolutionState {
  const engine = createEngine(hooks);
  const result = engine.run(engine.submit(state, event), rng);
  if (result.status !== "done") throw new Error("expected a finished resolution");
  return result.state;
}

const logHook = (id: string, event: string, priority?: number): HookDefinition => ({
  id,
  event,
  ...(priority === undefined ? {} : { priority }),
  run: () => ({ log: [{ key: id, params: {} }] }),
});

describe("hook ordering", () => {
  it("runs lower priority numbers first, default 100", () => {
    const state = run([logHook("late", "attack.hit", 200), logHook("default", "attack.hit"), logHook("early", "attack.hit", 10)], ev("attack.hit"));
    expect(logKeys(state)).toEqual(["early", "default", "late"]);
  });

  it("breaks ties by registration order", () => {
    const state = run([logHook("a", "x", 50), logHook("b", "x", 50), logHook("c", "x", 50)], ev("x"));
    expect(logKeys(state)).toEqual(["a", "b", "c"]);
  });

  it("ignores hooks for other events and honors the wildcard", () => {
    const state = run([logHook("other", "damage.applied"), logHook("any", "*")], ev("attack.hit"));
    expect(logKeys(state)).toEqual(["any"]);
  });

  it("rejects duplicate hook ids", () => {
    expect(() => createEngine([logHook("a", "x"), logHook("a", "y")])).toThrow();
  });
});

describe("event flow", () => {
  it("passes a modified event to later hooks", () => {
    const double: HookDefinition = {
      id: "double",
      event: "damage.applied",
      priority: 1,
      run: ({ event }) => ({
        event: { ...event, payload: { ...event.payload, amount: Number(event.payload["amount"]) * 2 } },
        log: [{ key: "doubled", params: {} }],
      }),
    };
    const read: HookDefinition = {
      id: "read",
      event: "damage.applied",
      priority: 2,
      run: ({ event }) => ({ log: [{ key: "seen", params: { amount: Number(event.payload["amount"]) } }] }),
    };
    const state = run([double, read], ev("damage.applied", { amount: 4 }));
    expect(state.log.find((l) => l.key === "seen")?.params["amount"]).toBe(8);
    expect(state.processed[0]?.payload["amount"]).toBe(8);
  });

  it("processes emitted events after the current one", () => {
    const emitter: HookDefinition = { id: "e", event: "attack.hit", run: () => ({ emit: [ev("damage.applied")], log: [{ key: "emitted", params: {} }] }) };
    const state = run([emitter, logHook("l", "damage.applied")], ev("attack.hit"));
    expect(state.processed.map((e) => e.name)).toEqual(["attack.hit", "damage.applied"]);
    expect(logKeys(state)).toEqual(["emitted", "l"]);
  });

  it("stops later hooks when a hook asks to stop", () => {
    const stopper: HookDefinition = { id: "stop", event: "x", priority: 1, run: () => ({ stop: true }) };
    const state = run([stopper, logHook("after", "x", 2)], ev("x"));
    expect(logKeys(state)).toEqual([]);
    expect(state.processed.map((e) => e.name)).toEqual(["x"]);
  });

  it("guards against runaway event loops", () => {
    const loop: HookDefinition = { id: "loop", event: "x", run: () => ({ emit: [ev("x")] }) };
    expect(() => run([loop], ev("x"))).toThrow();
  });

  it("does not mutate the state it was given", () => {
    const engine = createEngine([logHook("l", "x")]);
    const before = emptyState();
    const snapshot = JSON.stringify(before);
    engine.run(engine.submit(before, ev("x")), rng);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("effects", () => {
  const shield: ActiveEffect = {
    id: "fx1",
    key: "shield",
    nameKey: "test.effect.shield",
    sourceId: "wizard",
    targetId: "hero",
    power: 5,
    duration: { kind: "until-event", event: "turn.start" },
    modifiers: [{ stat: "ac", value: 5 }],
  };

  it("adds effects from hooks and ends them on their event", () => {
    const cast: HookDefinition = { id: "cast", event: "spell.shield", run: () => ({ addEffects: [shield] }) };
    const afterCast = run([cast], ev("spell.shield"));
    expect(afterCast.effects).toHaveLength(1);
    const afterTurn = run([cast], ev("turn.start"), afterCast);
    expect(afterTurn.effects).toHaveLength(0);
  });

  it("does not stack the same effect from the same source", () => {
    const cast: HookDefinition = { id: "cast", event: "spell.shield", run: () => ({ addEffects: [shield] }) };
    const once = run([cast], ev("spell.shield"));
    const twice = run([cast], ev("spell.shield"), once);
    expect(twice.effects).toHaveLength(1);
  });

  it("ends a creature-bound effect only when that creature's turn starts", () => {
    const bound: ActiveEffect = { ...shield, duration: { kind: "until-event", event: "turn.start", actorId: "hero" } };
    const start = { ...emptyState(), effects: [bound] };
    const villainTurn = run([], ev("turn.start", { actorId: "villain" }), start);
    expect(villainTurn.effects).toHaveLength(1);
    const heroTurn = run([], ev("turn.start", { actorId: "hero" }), villainTurn);
    expect(heroTurn.effects).toEqual([]);
  });

  it("expires event-bound effects before the event's own hooks run", () => {
    const bound: ActiveEffect = { ...shield, duration: { kind: "until-event", event: "turn.start", actorId: "hero" } };
    const seen: HookDefinition = {
      id: "seen",
      event: "turn.start",
      run: ({ effects }) => ({ log: [{ key: "seen", params: { count: effects.length } }] }),
    };
    const start = { ...emptyState(), effects: [bound] };
    const seenCount = (actor: string): unknown =>
      run([seen], ev("turn.start", { actorId: actor }), start).log.find((l) => l.key === "seen")?.params["count"];
    expect(seenCount("villain")).toBe(1);
    expect(seenCount("hero")).toBe(0);
  });

  it("removes effects by id", () => {
    const strip: HookDefinition = { id: "strip", event: "dispel", run: () => ({ removeEffectIds: ["fx1"] }) };
    const state = run([strip], ev("dispel"), { ...emptyState(), effects: [shield] });
    expect(state.effects).toEqual([]);
  });

  it("advances round-based effects on round.end", () => {
    const timed: ActiveEffect = { ...shield, id: "fx2", key: "bless", duration: { kind: "rounds", remaining: 2 } };
    const start = { ...emptyState(), effects: [timed] };
    const one = run([], ev("round.end"), start);
    expect(one.effects[0]?.duration).toEqual({ kind: "rounds", remaining: 1 });
    expect(run([], ev("round.end"), one).effects).toEqual([]);
  });
});

describe("decision requests", () => {
  const reactionHook: HookDefinition = {
    id: "shield-reaction",
    event: "attack.hit",
    run: ({ answer }) => {
      if (answer === null) {
        return {
          ask: {
            to: { kind: "actor", actorId: "hero" },
            promptKey: "spells.shield.prompt",
            options: [
              { id: "cast", labelKey: "common.yes" },
              { id: "pass", labelKey: "common.no" },
            ],
            defaultOptionId: "pass",
          },
        };
      }
      return { log: [{ key: answer === "cast" ? "reaction.cast" : "reaction.pass", params: {} }] };
    },
  };
  const after = logHook("after", "attack.hit", 200);

  function pause() {
    const engine = createEngine([reactionHook, after]);
    const result = engine.run(engine.submit(emptyState(), ev("attack.hit")), rng);
    if (result.status !== "awaiting") throw new Error("expected awaiting");
    return { engine, result };
  }

  it("pauses and returns a serializable request", () => {
    const { result } = pause();
    expect(result.request.id).toBe("req-1");
    expect(result.request.to).toEqual({ kind: "actor", actorId: "hero" });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it("resumes with the answer and finishes the remaining hooks", () => {
    const { engine, result } = pause();
    const done = engine.resume(result.state, result.request.id, "cast", rng);
    if (done.status !== "done") throw new Error("expected done");
    expect(logKeys(done.state)).toEqual(["reaction.cast", "after"]);
    expect(done.state.pending).toBeNull();
  });

  it("resumes in a new engine instance from JSON state", () => {
    const { result } = pause();
    const revived = restoreState(JSON.stringify(result.state));
    const fresh = createEngine([reactionHook, after]);
    const done = fresh.resume(revived, "req-1", "pass", rng);
    if (done.status !== "done") throw new Error("expected done");
    expect(logKeys(done.state)).toEqual(["reaction.pass", "after"]);
  });

  it("applies the default option when the request expires", () => {
    const { engine, result } = pause();
    const done = engine.expire(result.state, result.request.id, rng);
    if (done.status !== "done") throw new Error("expected done");
    expect(logKeys(done.state)).toEqual(["reaction.pass", "after"]);
  });

  it("rejects wrong ids, unknown options and replays", () => {
    const { engine, result } = pause();
    expect(() => engine.resume(result.state, "req-99", "cast", rng)).toThrow();
    expect(() => engine.resume(result.state, result.request.id, "fly", rng)).toThrow();
    const done = engine.resume(result.state, result.request.id, "cast", rng);
    if (done.status !== "done") throw new Error("expected done");
    expect(() => engine.resume(done.state, result.request.id, "cast", rng)).toThrow();
  });

  it("rejects requests whose default option does not exist", () => {
    const bad: HookDefinition = {
      id: "bad",
      event: "x",
      run: () => ({ ask: { to: { kind: "dm" }, promptKey: "p", options: [{ id: "a", labelKey: "k" }], defaultOptionId: "z" } }),
    };
    expect(() => run([bad], ev("x"))).toThrow();
  });

  it("refuses to run while a decision is pending", () => {
    const { engine, result } = pause();
    expect(() => engine.run(result.state, rng)).toThrow();
  });
});

describe("resuming the right hook", () => {
  const asker = (id: string, priority: number, rename = false): HookDefinition => ({
    id,
    event: "attack.hit",
    priority,
    run: ({ answer }) =>
      answer === null
        ? {
            ...(rename ? { event: ev("attack.renamed"), log: [{ key: "renamed", params: {} }] } : {}),
            ask: { to: { kind: "dm" }, promptKey: "p", options: [{ id: "ok", labelKey: "k" }], defaultOptionId: "ok" },
          }
        : { log: [{ key: `${id}:${answer}`, params: {} }] },
  });

  it("still finds the asking hook when it renamed the event", () => {
    const hooks = [asker("a", 1, true), logHook("b", "attack.hit", 2)];
    const engine = createEngine(hooks);
    const paused = engine.run(engine.submit(emptyState(), ev("attack.hit")), rng);
    if (paused.status !== "awaiting") throw new Error("expected awaiting");
    const done = engine.resume(paused.state, paused.request.id, "ok", rng);
    if (done.status !== "done") throw new Error("expected done");
    expect(logKeys(done.state)).toEqual(["renamed", "a:ok", "b"]);
  });

  it("finds the asking hook by id when the hook order changed across a restart", () => {
    const before = createEngine([logHook("x", "attack.hit", 1), asker("a", 2)]);
    const paused = before.run(before.submit(emptyState(), ev("attack.hit")), rng);
    if (paused.status !== "awaiting") throw new Error("expected awaiting");
    const saved = restoreState(JSON.stringify(paused.state));
    const after = createEngine([asker("a", 1), logHook("x", "attack.hit", 2)]);
    const done = after.resume(saved, paused.request.id, "ok", rng);
    if (done.status !== "done") throw new Error("expected done");
    expect(logKeys(done.state)).toEqual(["x", "a:ok"]);
  });

  it("delivers the answer to the asking hook even when a new hook now runs before it", () => {
    const before = createEngine([asker("a", 10)]);
    const paused = before.run(before.submit(emptyState(), ev("attack.hit")), rng);
    if (paused.status !== "awaiting") throw new Error("expected awaiting");
    const after = createEngine([logHook("newcomer", "attack.hit", 1), asker("a", 10)]);
    const done = after.resume(restoreState(JSON.stringify(paused.state)), paused.request.id, "ok", rng);
    if (done.status !== "done") throw new Error("expected done");
    expect(logKeys(done.state)).toEqual(["a:ok", "newcomer"]);
  });

  it("fails loudly when the asking hook is gone", () => {
    const before = createEngine([asker("a", 1)]);
    const paused = before.run(before.submit(emptyState(), ev("attack.hit")), rng);
    if (paused.status !== "awaiting") throw new Error("expected awaiting");
    const after = createEngine([logHook("other", "attack.hit")]);
    expect(() => after.resume(paused.state, paused.request.id, "ok", rng)).toThrow();
  });
});

describe("dm override", () => {
  const ask: HookDefinition = {
    id: "ask",
    event: "attack.hit",
    priority: 1,
    run: ({ answer, event }) =>
      answer === null
        ? { ask: { to: { kind: "dm" }, promptKey: "p", options: [{ id: "yes", labelKey: "k" }, { id: "no", labelKey: "k" }], defaultOptionId: "no" } }
        : { log: [{ key: `ask:${answer}`, params: { roll: Number(event.payload["roll"]) } }] },
  };
  const after = logHook("after", "attack.hit", 2);
  const engine = createEngine([ask, after]);

  function paused(): ResolutionState {
    const result = engine.run(engine.submit(emptyState(), ev("attack.hit", { roll: 7 })), rng);
    if (result.status !== "awaiting") throw new Error("expected awaiting");
    return result.state;
  }

  function finish(state: ResolutionState, id: string, answer: string): ResolutionState {
    const result = engine.resume(state, id, answer, rng);
    if (result.status !== "done") throw new Error("expected done");
    return result.state;
  }

  it("set-value changes the event the asking hook sees", () => {
    const fixed = engine.dmOverride(paused(), { kind: "set-value", target: "roll", value: 18 });
    const done = finish(fixed, "req-1", "yes");
    expect(done.log.find((l) => l.key === "ask:yes")?.params["roll"]).toBe(18);
  });

  it("cancel-step skips the asking hook and continues with the rest", () => {
    const cancelled = engine.dmOverride(paused(), { kind: "cancel-step", target: "ask" });
    expect(cancelled.pending).toBeNull();
    const result = engine.run(cancelled, rng);
    if (result.status !== "done") throw new Error("expected done");
    expect(logKeys(result.state)).toEqual(["log.dm.override", "after"]);
  });

  it("force-outcome answers the pending request as the DM", () => {
    const forced = engine.dmOverride(paused(), { kind: "force-outcome", target: "req-1", value: "yes" });
    const result = engine.run(forced, rng);
    if (result.status !== "done") throw new Error("expected done");
    expect(logKeys(result.state)).toEqual(["log.dm.override", "ask:yes", "after"]);
  });

  it("records every override in the audit trail", () => {
    const state = engine.dmOverride(paused(), { kind: "set-value", target: "roll", value: 18, reasonKey: "dm.reason.fudge" });
    expect(state.processed.at(-1)).toEqual({
      name: "dm.override",
      payload: { kind: "set-value", target: "roll", value: 18, reasonKey: "dm.reason.fudge" },
    });
    expect(state.log.at(-1)).toEqual({ key: "log.dm.override", params: { kind: "set-value", target: "roll" } });
  });

  it("rejects overrides with nothing pending, wrong ids or unknown options", () => {
    expect(() => engine.dmOverride(emptyState(), { kind: "set-value", target: "roll", value: 1 })).toThrow();
    expect(() => engine.dmOverride(paused(), { kind: "force-outcome", target: "req-9", value: "yes" })).toThrow();
    expect(() => engine.dmOverride(paused(), { kind: "force-outcome", target: "req-1", value: "maybe" })).toThrow();
  });
});

describe("step mode", () => {
  const first = logHook("first", "attack.hit", 1);
  const second: HookDefinition = {
    id: "second",
    event: "attack.hit",
    priority: 2,
    run: ({ event }) => ({ log: [{ key: "second", params: { roll: Number(event.payload["roll"]) } }] }),
  };
  const engine = createEngine([first, second]);

  function start(): ReturnType<typeof engine.run> {
    return engine.run(engine.submit(emptyState(), ev("attack.hit", { roll: 7 })), rng, { step: true });
  }

  it("stops in front of every hook and reports which one is next", () => {
    const one = start();
    if (one.status !== "stepped") throw new Error("expected stepped");
    expect(one.next).toEqual({ hookId: "first", eventName: "attack.hit" });
    expect(one.state.log).toEqual([]);
    const two = engine.run(one.state, rng, { step: true });
    if (two.status !== "stepped") throw new Error("expected stepped");
    expect(two.next.hookId).toBe("second");
    expect(logKeys(two.state)).toEqual(["first"]);
    const end = engine.run(two.state, rng, { step: true });
    expect(end.status).toBe("done");
    expect(logKeys(end.state)).toEqual(["first", "second"]);
  });

  it("lets the DM cancel the next step", () => {
    const one = start();
    const cancelled = engine.dmOverride(one.state, { kind: "cancel-step", target: "first" });
    const end = engine.run(cancelled, rng, { step: true });
    if (end.status !== "stepped") throw new Error("expected stepped");
    expect(end.next.hookId).toBe("second");
    const done = engine.run(end.state, rng);
    expect(logKeys(done.state)).toEqual(["log.dm.override", "second"]);
  });

  it("lets the DM correct a value before the next step uses it", () => {
    const one = start();
    const fixed = engine.dmOverride(one.state, { kind: "set-value", target: "roll", value: 19 });
    const done = engine.run(fixed, rng);
    expect(done.state.log.find((l) => l.key === "second")?.params["roll"]).toBe(19);
  });

  it("does not stop when step mode is off", () => {
    expect(engine.run(engine.submit(emptyState(), ev("attack.hit", { roll: 7 })), rng).status).toBe("done");
  });
});

describe("cancel-step validation", () => {
  const engine = createEngine([logHook("real", "x", 1), logHook("other", "x", 2)]);

  function stepped(): ResolutionState {
    const result = engine.run(engine.submit(emptyState(), ev("x")), rng, { step: true });
    return result.state;
  }

  it("rejects targets that are not steps of the event in flight", () => {
    expect(() => engine.dmOverride(stepped(), { kind: "cancel-step", target: "typo" })).toThrow();
  });

  it("rejects steps already finished or already cancelled, without auditing", () => {
    const mid = engine.run(stepped(), rng, { step: true }).state;
    expect(() => engine.dmOverride(mid, { kind: "cancel-step", target: "real" })).toThrow();
    const once = engine.dmOverride(mid, { kind: "cancel-step", target: "other" });
    expect(() => engine.dmOverride(once, { kind: "cancel-step", target: "other" })).toThrow();
    expect(once.processed.filter((e) => e.name === "dm.override")).toHaveLength(1);
  });
});

describe("automatic effect steps", () => {
  const timed = (remaining: number): ActiveEffect => ({
    id: "fx-timed",
    key: "bless",
    nameKey: "test.effect.bless",
    sourceId: "cleric",
    targetId: "hero",
    power: 1,
    duration: { kind: "rounds", remaining },
    modifiers: [],
  });
  const bound: ActiveEffect = {
    id: "fx-bound",
    key: "shield",
    nameKey: "test.effect.shield",
    sourceId: "wizard",
    targetId: "hero",
    power: 5,
    duration: { kind: "until-event", event: "turn.start", actorId: "hero" },
    modifiers: [{ stat: "ac", value: 5 }],
  };

  it("does not advance an effect that a round.end hook just added", () => {
    const adder: HookDefinition = { id: "adder", event: "round.end", run: () => ({ addEffects: [timed(1)] }) };
    const state = run([adder], ev("round.end"));
    expect(state.effects).toHaveLength(1);
    expect(state.effects[0]?.duration).toEqual({ kind: "rounds", remaining: 1 });
  });

  it("logs every effect that expires", () => {
    const afterRound = run([], ev("round.end"), { ...emptyState(), effects: [timed(1)] });
    expect(afterRound.log).toEqual([
      {
        key: "log.effect.expired",
        params: { effect: "test.effect.bless", target: "hero" },
        refs: { effect: "text-key", target: "actor-id" },
      },
    ]);
    const afterTurn = run([], ev("turn.start", { actorId: "hero" }), { ...emptyState(), effects: [bound] });
    expect(afterTurn.log).toEqual([
      {
        key: "log.effect.expired",
        params: { effect: "test.effect.shield", target: "hero" },
        refs: { effect: "text-key", target: "actor-id" },
      },
    ]);
  });

  it("exposes expiry as a step the DM can inspect and cancel", () => {
    const engine = createEngine([logHook("after", "turn.start")]);
    const queued = engine.submit({ ...emptyState(), effects: [bound] }, ev("turn.start", { actorId: "hero" }));
    const first = engine.run(queued, rng, { step: true });
    if (first.status !== "stepped") throw new Error("expected stepped");
    expect(first.next.hookId).toBe("engine:expire-effects");
    expect(first.state.effects).toHaveLength(1);
    const cancelled = engine.dmOverride(first.state, { kind: "cancel-step", target: "engine:expire-effects" });
    const done = engine.run(cancelled, rng);
    expect(done.state.effects).toHaveLength(1);
  });

  it("adds no step when nothing expires", () => {
    const engine = createEngine([logHook("only", "turn.start")]);
    const queued = engine.submit(emptyState(), ev("turn.start", { actorId: "hero" }));
    const first = engine.run(queued, rng, { step: true });
    if (first.status !== "stepped") throw new Error("expected stepped");
    expect(first.next.hookId).toBe("only");
  });

  it("reserves the engine: prefix for its own steps", () => {
    expect(() => createEngine([logHook("engine:custom", "x")])).toThrow();
  });
});

describe("explained state changes", () => {
  it("adds a generic log line when a hook changes state without explaining it", () => {
    const silent: HookDefinition = { id: "silent", event: "x", run: () => ({ emit: [ev("y")] }) };
    const state = run([silent], ev("x"));
    expect(state.log).toEqual([{ key: "log.step.unexplained", params: { step: "silent" } }]);
  });

  it("keeps the hook's own log and adds nothing", () => {
    const explained: HookDefinition = {
      id: "explained",
      event: "x",
      run: () => ({ emit: [ev("y")], log: [{ key: "mine", params: {} }] }),
    };
    expect(logKeys(run([explained], ev("x")))).toEqual(["mine"]);
  });

  it("does not log hooks that change nothing", () => {
    const quiet: HookDefinition = { id: "quiet", event: "x", run: () => ({}) };
    expect(run([quiet], ev("x")).log).toEqual([]);
  });
});

describe("event budget across pauses", () => {
  it("keeps counting events when a resolution is resumed again and again", () => {
    const grow: HookDefinition = {
      id: "grow",
      event: "x",
      run: ({ answer }) =>
        answer === null
          ? { ask: { to: { kind: "dm" }, promptKey: "p", options: [{ id: "ok", labelKey: "k" }], defaultOptionId: "ok" } }
          : { emit: [ev("x")], log: [{ key: "grew", params: {} }] },
    };
    const engine = createEngine([grow]);
    let result = engine.run(engine.submit(emptyState(), ev("x")), rng);
    expect(() => {
      for (let i = 0; i < MAX_EVENTS_PER_RUN + 5; i++) {
        if (result.status !== "awaiting") throw new Error("finished early");
        result = engine.resume(result.state, result.request.id, "ok", rng);
      }
    }).toThrow(/Too many events/);
  });

  it("starts the count again once a resolution has finished", () => {
    const engine = createEngine([logHook("l", "x")]);
    let state = emptyState();
    for (let i = 0; i < 3; i++) {
      const result = engine.run(engine.submit(state, ev("x")), rng);
      state = result.state;
      expect(state.handled).toBe(0);
    }
  });
});

describe("automatic steps are planned once per event", () => {
  const asks = (event: string, priority: number): HookDefinition => ({
    id: "asker",
    event,
    priority,
    run: ({ answer }) =>
      answer === null
        ? { ask: { to: { kind: "dm" }, promptKey: "p", options: [{ id: "ok", labelKey: "k" }], defaultOptionId: "ok" } }
        : { log: [{ key: "answered", params: {} }] },
  });
  const effect = (over: Partial<ActiveEffect>): ActiveEffect => ({
    id: "fx",
    key: "bless",
    nameKey: "test.effect.bless",
    sourceId: "cleric",
    targetId: "hero",
    power: 1,
    duration: { kind: "rounds", remaining: 2 },
    modifiers: [],
    ...over,
  });

  function resolveWithPause(hooks: HookDefinition[], event: GameEvent): ResolutionState {
    const engine = createEngine(hooks);
    const paused = engine.run(engine.submit(emptyState(), event), rng);
    if (paused.status !== "awaiting") throw new Error("expected awaiting");
    const done = engine.resume(restoreState(JSON.stringify(paused.state)), paused.request.id, "ok", rng);
    if (done.status !== "done") throw new Error("expected done");
    return done.state;
  }

  it("does not advance a round effect added before a pause", () => {
    const adder: HookDefinition = {
      id: "adder",
      event: "round.end",
      priority: 1,
      run: () => ({ addEffects: [effect({})], log: [{ key: "added", params: {} }] }),
    };
    const withPause = resolveWithPause([adder, asks("round.end", 2)], ev("round.end"));
    const withoutPause = run([adder], ev("round.end"));
    expect(withPause.effects).toEqual(withoutPause.effects);
    expect(withPause.effects[0]?.duration).toEqual({ kind: "rounds", remaining: 2 });
  });

  it("does not expire an event-bound effect added before a pause", () => {
    const shielder: HookDefinition = {
      id: "shielder",
      event: "turn.start",
      priority: 1,
      run: () => ({
        addEffects: [effect({ id: "sh", key: "shield", duration: { kind: "until-event", event: "turn.start", actorId: "hero" } })],
        log: [{ key: "shielded", params: {} }],
      }),
    };
    const state = resolveWithPause([shielder, asks("turn.start", 2)], ev("turn.start", { actorId: "hero" }));
    expect(state.effects).toHaveLength(1);
  });

  it("logs a round that passes without ending the effect", () => {
    const state = run([], ev("round.end"), { ...emptyState(), effects: [effect({ duration: { kind: "rounds", remaining: 3 } })] });
    expect(state.effects[0]?.duration).toEqual({ kind: "rounds", remaining: 2 });
    expect(state.log).toEqual([
      {
        key: "log.effect.round-passed",
        params: { effect: "test.effect.bless", target: "hero", remaining: 2 },
        refs: { effect: "text-key", target: "actor-id" },
      },
    ]);
  });
});

describe("store", () => {
  const writer: HookDefinition = { id: "writer", event: "a", run: () => ({ setStore: { counter: 1, gone: null }, log: [{ key: "w", params: {} }] }) };
  const reader: HookDefinition = {
    id: "reader",
    event: "a",
    priority: 200,
    run: ({ store }) => ({ log: [{ key: "r", params: { seen: typeof store["counter"] === "number" ? store["counter"] : -1 } }] }),
  };

  it("a hook's setStore is visible to later hooks and kept in the state", () => {
    const state = run([writer, reader], ev("a"));
    expect(state.store).toEqual({ counter: 1 });
    expect(state.log.find((l) => l.key === "r")?.params).toEqual({ seen: 1 });
  });

  it("keeps keys it was not told about and replaces the ones it was", () => {
    const start = { ...emptyState(), store: { keep: "yes", counter: 9 } };
    expect(run([writer], ev("a"), start).store).toEqual({ keep: "yes", counter: 1 });
  });

  it("null removes a key that was there", () => {
    const start = { ...emptyState(), store: { gone: "x", stays: 1 } };
    expect(run([writer], ev("a"), start).store).toEqual({ stays: 1, counter: 1 });
  });

  it("changing the store without a log line is reported as unexplained", () => {
    const quiet: HookDefinition = { id: "quiet", event: "a", run: () => ({ setStore: { x: 1 } }) };
    expect(logKeys(run([quiet], ev("a")))).toEqual(["log.step.unexplained"]);
  });

  it("survives a save and restore", () => {
    const state = run([writer], ev("a"));
    expect(restoreState(JSON.stringify(state)).store).toEqual(state.store);
  });

  it("a state saved before the store existed loads with an empty one", () => {
    const old: Record<string, unknown> = { ...emptyState() };
    old["store"] = undefined;
    expect(restoreState(JSON.stringify(old)).store).toEqual({});
  });

  it("a damaged store is rejected", () => {
    expect(() => restoreState(JSON.stringify({ ...emptyState(), store: null }))).toThrow();
    expect(() => restoreState(JSON.stringify({ ...emptyState(), store: [1] }))).toThrow();
  });
});
