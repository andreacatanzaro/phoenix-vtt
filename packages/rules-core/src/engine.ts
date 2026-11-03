import { addEffect, advanceRounds, endEffectsOnEvent, removeEffects, type ActiveEffect } from "./effects";
import type { Rng } from "./rng";
import type { DecisionRequest, GameEvent, JsonObject, JsonValue, LogLine } from "./types";

export const DEFAULT_HOOK_PRIORITY = 100;
/** Upper bound on events handled in one run; stops hooks that keep emitting each other. */
export const MAX_EVENTS_PER_RUN = 1000;
/** Ids of the engine's own steps; the DM can cancel them like any hook. Hook ids cannot start with "engine:". */
export const EXPIRE_EFFECTS_STEP = "engine:expire-effects";
export const ADVANCE_ROUNDS_STEP = "engine:advance-rounds";

export type HookContext = {
  event: GameEvent;
  effects: readonly ActiveEffect[];
  /** Game data the rules keep between events (a creature's turn state, for instance), read-only here. */
  store: Readonly<JsonObject>;
  rng: Rng;
  /** Option chosen for the request this hook asked, or null on the first call. A hook that asks must be re-entrant. */
  answer: string | null;
};

export type HookOutcome = {
  /** Replaces the event seen by later hooks. */
  event?: GameEvent;
  addEffects?: ActiveEffect[];
  removeEffectIds?: string[];
  /** Keys to set in the store; each value replaces the old one, and `null` removes the key. */
  setStore?: JsonObject;
  /** Events processed after the current one, in order. */
  emit?: GameEvent[];
  /** Explains the change in readable terms. A hook that changes state without logging gets a generic line. */
  log?: LogLine[];
  /** Pauses the resolution until the request is answered; the same hook then runs again with `answer`. */
  ask?: Omit<DecisionRequest, "id">;
  /** Skips the remaining hooks for this event. */
  stop?: boolean;
};

export type HookDefinition = {
  /** Stable id, so a saved resolution can find its hook again after a restart. */
  id: string;
  /** Event name, or "*" for every event. */
  event: string;
  /** Lower runs first. */
  priority?: number;
  run(context: HookContext): HookOutcome;
};

/** Everything needed to pause and resume a resolution. Plain data, safe to JSON-serialize. */
export type ResolutionState = {
  effects: ActiveEffect[];
  /** Plain data owned by the rules; the engine only carries it and applies hooks' `setStore`. */
  store: JsonObject;
  queue: GameEvent[];
  current: {
    event: GameEvent;
    /** Name the hook chain was built from; a hook may rename `event` without changing which hooks run. */
    chainName: string;
    /** Hooks already finished for this event, so a resume never re-runs them, whatever the hook order. */
    done: string[];
    /** Stable id of the hook that asked a pending decision; resolved again on resume. */
    hookId: string | null;
    /** Hooks the DM cancelled for this event. */
    skipped: string[];
    /** Engine steps planned when the event started; fixed then, so a pause never changes which ones run. */
    systemSteps: string[];
    /** Creature the event concerns (payload `actorId` when the event started), if any. */
    actorId: string | null;
    /** Step mode: the hook the engine stopped in front of, which runs on the next call. */
    armed: string | null;
  } | null;
  pending: { request: DecisionRequest } | null;
  answer: string | null;
  /** Hook the stored `answer` is meant for; nobody else receives it. */
  answerFor: string | null;
  processed: GameEvent[];
  log: LogLine[];
  nextRequestId: number;
  /** Events started in the current resolution; spans pauses and resets once the queue is empty. */
  handled: number;
};

export type StepResult =
  | { status: "done"; state: ResolutionState }
  | { status: "awaiting"; state: ResolutionState; request: DecisionRequest }
  /** Step mode only: stopped right before `next.hookId` runs, so the DM can inspect or override it. */
  | { status: "stepped"; state: ResolutionState; next: { hookId: string; eventName: string } };

export type RunOptions = {
  /** Stop in front of every hook, to give the DM a chance to correct each automatic step. */
  step?: boolean;
};

/**
 * Corrections the DM makes while a resolution is paused, on a decision or in front of a step.
 * Steps already completed are not undone here: that is a rollback of the saved state, handled by the server.
 * - cancel-step: skip the hook `target` (by id) for the event in flight;
 * - set-value: set payload field `target` on the event in flight;
 * - force-outcome: answer the pending request `target` with option `value`.
 */
export type DmOverride = { reasonKey?: string } & (
  | { kind: "cancel-step"; target: string }
  | { kind: "set-value"; target: string; value: JsonValue }
  | { kind: "force-outcome"; target: string; value: string }
);

export type Engine = {
  submit(state: ResolutionState, event: GameEvent): ResolutionState;
  run(state: ResolutionState, rng: Rng, options?: RunOptions): StepResult;
  resume(state: ResolutionState, requestId: string, answer: string, rng: Rng, options?: RunOptions): StepResult;
  /** Answers with the request's default option. The server decides when a request has expired. */
  expire(state: ResolutionState, requestId: string, rng: Rng, options?: RunOptions): StepResult;
  dmOverride(state: ResolutionState, override: DmOverride): ResolutionState;
};

export function emptyState(): ResolutionState {
  return { effects: [], store: {}, queue: [], current: null, pending: null, answer: null, answerFor: null, processed: [], log: [], nextRequestId: 1, handled: 0 };
}

/** True for a plain object (not null, not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shallow shape check: the stored state is written only by this engine, so it is not a security boundary. */
function isResolutionState(value: unknown): value is ResolutionState {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value["effects"]) &&
    isRecord(value["store"]) &&
    Array.isArray(value["queue"]) &&
    Array.isArray(value["processed"]) &&
    Array.isArray(value["log"]) &&
    typeof value["nextRequestId"] === "number" &&
    typeof value["handled"] === "number" &&
    "current" in value &&
    "pending" in value &&
    "answer" in value &&
    "answerFor" in value
  );
}

/** Rebuilds a state saved with JSON.stringify. */
export function restoreState(json: string): ResolutionState {
  const parsed: unknown = JSON.parse(json);
  // States saved before the store existed have none: they start with an empty one.
  const upgraded = isRecord(parsed) && !("store" in parsed) ? { ...parsed, store: {} } : parsed;
  if (!isResolutionState(upgraded)) throw new Error("Invalid resolution state");
  return upgraded;
}

function matchingHooks(ordered: readonly HookDefinition[], eventName: string): HookDefinition[] {
  return ordered.filter((h) => h.event === eventName || h.event === "*");
}

export function createEngine(hooks: readonly HookDefinition[]): Engine {
  const ids = new Set<string>();
  for (const hook of hooks) {
    if (hook.id.startsWith("engine:")) throw new Error(`Hook id ${hook.id} uses the reserved "engine:" prefix`);
    if (ids.has(hook.id)) throw new Error(`Duplicate hook id: ${hook.id}`);
    ids.add(hook.id);
  }
  const ordered = hooks
    .map((hook, index) => ({ hook, index }))
    .sort((a, b) => (a.hook.priority ?? DEFAULT_HOOK_PRIORITY) - (b.hook.priority ?? DEFAULT_HOOK_PRIORITY) || a.index - b.index)
    .map((entry) => entry.hook);

  function finishEvent(work: ResolutionState, event: GameEvent): void {
    work.processed.push(event);
    work.current = null;
  }

  type Step = { id: string; hook: HookDefinition | null; apply: ((work: ResolutionState) => void) | null };

  function expiredLog(removed: readonly ActiveEffect[]): LogLine[] {
    return removed.map((e) => ({
      key: "log.effect.expired",
      params: { effect: e.nameKey, target: e.targetId },
      refs: { effect: "text-key", target: "actor-id" },
    }));
  }

  function logRoundPassed(effect: ActiveEffect, remaining: number): LogLine {
    return {
      key: "log.effect.round-passed",
      params: { effect: effect.nameKey, target: effect.targetId, remaining },
      refs: { effect: "text-key", target: "actor-id" },
    };
  }

  /** Which automatic effect steps this event needs. Decided once, when the event starts. */
  function planSystemSteps(effects: readonly ActiveEffect[], chainName: string, actorId: string | null): string[] {
    const planned: string[] = [];
    if (endEffectsOnEvent(effects, chainName, actorId).length !== effects.length) planned.push(EXPIRE_EFFECTS_STEP);
    if (chainName === "round.end" && effects.some((e) => e.duration.kind === "rounds")) planned.push(ADVANCE_ROUNDS_STEP);
    return planned;
  }

  /** Automatic changes to the effect stack run as named steps, so step mode and the log can reach them. */
  function systemStep(id: string, chainName: string, actorId: string | null): Step {
    if (id === EXPIRE_EFFECTS_STEP) {
      return {
        id,
        hook: null,
        apply(w) {
          const remaining = endEffectsOnEvent(w.effects, chainName, actorId);
          w.log.push(...expiredLog(w.effects.filter((e) => !remaining.includes(e))));
          w.effects = remaining;
        },
      };
    }
    return {
      id,
      hook: null,
      apply(w) {
        const remaining = advanceRounds(w.effects);
        for (const before of w.effects) {
          const after = remaining.find((r) => r.id === before.id);
          if (after === undefined) w.log.push(...expiredLog([before]));
          else if (after.duration.kind === "rounds") w.log.push(logRoundPassed(after, after.duration.remaining));
        }
        w.effects = remaining;
      },
    };
  }

  function loop(work: ResolutionState, rng: Rng, step: boolean): StepResult {
    for (;;) {
      if (work.current === null) {
        const next = work.queue.shift();
        if (next === undefined) {
          work.handled = 0;
          return { status: "done", state: work };
        }
        work.handled += 1;
        if (work.handled > MAX_EVENTS_PER_RUN) throw new Error("Too many events in one resolution");
        const actorId = typeof next.payload["actorId"] === "string" ? next.payload["actorId"] : null;
        work.current = {
          event: next,
          chainName: next.name,
          done: [],
          hookId: null,
          skipped: [],
          armed: null,
          systemSteps: planSystemSteps(work.effects, next.name, actorId),
          actorId,
        };
      }
      const current = work.current;
      const chain = matchingHooks(ordered, current.chainName);
      let hookOrder = chain;
      if (current.hookId !== null) {
        const resumeId = current.hookId;
        const asker = chain.find((h) => h.id === resumeId);
        if (asker === undefined) throw new Error(`Hook ${resumeId} is no longer registered for ${current.chainName}`);
        // The asker runs first so the answer reaches it even if hooks were added or reordered since the pause.
        hookOrder = [asker, ...chain.filter((h) => h.id !== resumeId)];
        current.hookId = null;
      }
      const steps: Step[] = [
        ...current.systemSteps.map((id) => systemStep(id, current.chainName, current.actorId)),
        ...hookOrder.map((hook) => ({ id: hook.id, hook, apply: null })),
      ];
      for (const entry of steps) {
        if (current.done.includes(entry.id)) continue;
        if (current.skipped.includes(entry.id)) {
          if (work.answerFor === entry.id) {
            work.answer = null;
            work.answerFor = null;
          }
          continue;
        }
        if (step && current.armed !== entry.id) {
          current.armed = entry.id;
          return { status: "stepped", state: work, next: { hookId: entry.id, eventName: current.chainName } };
        }
        current.armed = null;
        const hook = entry.hook;
        if (hook === null) {
          entry.apply?.(work);
          current.done.push(entry.id);
          continue;
        }
        let answer: string | null = null;
        if (work.answerFor === hook.id) {
          answer = work.answer;
          work.answer = null;
          work.answerFor = null;
        }
        const outcome = hook.run({ event: current.event, effects: work.effects, store: work.store, rng, answer });
        if (outcome.event !== undefined) current.event = outcome.event;
        if (outcome.ask === undefined) current.done.push(hook.id);
        for (const effect of outcome.addEffects ?? []) work.effects = addEffect(work.effects, effect).effects;
        if (outcome.removeEffectIds !== undefined) work.effects = removeEffects(work.effects, outcome.removeEffectIds);
        if (outcome.setStore !== undefined) {
          const changes = Object.entries(outcome.setStore);
          const touched = new Set(changes.map(([key]) => key));
          const kept = Object.entries(work.store).filter(([key]) => !touched.has(key));
          work.store = Object.fromEntries([...kept, ...changes.filter(([, value]) => value !== null)]);
        }
        if (outcome.log !== undefined) work.log.push(...outcome.log);
        const changedState =
          outcome.event !== undefined ||
          (outcome.addEffects?.length ?? 0) > 0 ||
          (outcome.removeEffectIds?.length ?? 0) > 0 ||
          outcome.setStore !== undefined ||
          (outcome.emit?.length ?? 0) > 0;
        if (changedState && (outcome.log?.length ?? 0) === 0) {
          work.log.push({ key: "log.step.unexplained", params: { step: hook.id } });
        }
        if (outcome.emit !== undefined) work.queue.push(...outcome.emit);
        if (outcome.ask !== undefined) {
          const ask = outcome.ask;
          if (ask.options.length === 0 || !ask.options.some((o) => o.id === ask.defaultOptionId)) {
            throw new Error(`Hook ${hook.id} asked with an invalid default option`);
          }
          const request: DecisionRequest = { ...ask, id: `req-${String(work.nextRequestId)}` };
          work.nextRequestId += 1;
          work.pending = { request };
          current.hookId = hook.id;
          return { status: "awaiting", state: work, request };
        }
        if (outcome.stop === true) break;
      }
      finishEvent(work, current.event);
    }
  }

  function answerPending(
    state: ResolutionState,
    requestId: string,
    answer: string | null,
    rng: Rng,
    options: RunOptions,
  ): StepResult {
    const pending = state.pending;
    if (pending === null || pending.request.id !== requestId) throw new Error(`No pending request ${requestId}`);
    const chosen = answer ?? pending.request.defaultOptionId;
    if (!pending.request.options.some((o) => o.id === chosen)) throw new Error(`Unknown option ${chosen}`);
    const work = structuredClone(state);
    work.pending = null;
    work.answer = chosen;
    work.answerFor = work.current?.hookId ?? null;
    return loop(work, rng, options.step === true);
  }

  return {
    submit(state, event) {
      const work = structuredClone(state);
      work.queue.push(event);
      return work;
    },
    run(state, rng, options = {}) {
      if (state.pending !== null) throw new Error("A decision is pending: resume or expire it first");
      return loop(structuredClone(state), rng, options.step === true);
    },
    resume(state, requestId, answer, rng, options = {}) {
      return answerPending(state, requestId, answer, rng, options);
    },
    expire(state, requestId, rng, options = {}) {
      return answerPending(state, requestId, null, rng, options);
    },
    dmOverride(state, override) {
      const work = structuredClone(state);
      const current = work.current;
      if (current === null) throw new Error("Nothing to override: no step is in flight");
      switch (override.kind) {
        case "cancel-step": {
          const applicable =
            matchingHooks(ordered, current.chainName).some((h) => h.id === override.target) ||
            current.systemSteps.includes(override.target);
          if (!applicable || current.done.includes(override.target) || current.skipped.includes(override.target)) {
            throw new Error(`Cannot cancel ${override.target}: not an unfinished step of ${current.chainName}`);
          }
          current.skipped.push(override.target);
          if (current.hookId === override.target) {
            work.pending = null;
            work.answer = null;
            work.answerFor = null;
          }
          break;
        }
        case "set-value":
          current.event = { ...current.event, payload: { ...current.event.payload, [override.target]: override.value } };
          break;
        case "force-outcome": {
          if (work.pending === null) throw new Error("No decision is pending");
          const request = work.pending.request;
          if (request.id !== override.target) throw new Error(`No pending request ${override.target}`);
          if (!request.options.some((o) => o.id === override.value)) throw new Error(`Unknown option ${override.value}`);
          work.pending = null;
          work.answer = override.value;
          work.answerFor = current.hookId;
          break;
        }
      }
      work.processed.push({
        name: "dm.override",
        payload: {
          kind: override.kind,
          target: override.target,
          ...("value" in override ? { value: override.value } : {}),
          ...(override.reasonKey === undefined ? {} : { reasonKey: override.reasonKey }),
        },
      });
      work.log.push({ key: "log.dm.override", params: { kind: override.kind, target: override.target } });
      return work;
    },
  };
}
