import { isRecord, parseDice, type ActiveEffect, type GameEvent, type HookDefinition, type HookOutcome, type JsonObject, type JsonValue, type LogLine } from "@phoenix/rules-core";
import { dodgeEffect, dodgeModes, helpEffect, helpEffectIds, type HelpKind } from "./action-effects";
import {
  canOpportunityAttack,
  dash,
  disengage,
  ready,
  releaseReadied,
  useReadied,
  spendAttack,
  spendBonusAttack,
  startActorTurn,
  takeAttackAction,
  takeOtherAction,
  type ActorTurn,
} from "./actor-turn";
import { spend } from "./turn-economy";
import { abilityCheckModes, attackModes, isIncapacitated, speedFactor } from "./condition-rules";
import { conditionsOf } from "./conditions";
import { resolveAttackRoll } from "./attack";
import { resolveD20Test } from "./d20-test";
import { skillTags, SKILLS, type CheckTag, type SkillId } from "./skills";
import { DAMAGE_TYPES, rollDamage, type DamagePart } from "./damage";
import { actorLine as line, HOOK_PRIORITY } from "./hook-support";
import { turnKey } from "./creature-store";
import type { RuleMeta } from "./meta";
import { resolveRollMode } from "./roll-mode";

const SKILL_IDS: SkillId[] = Object.keys(SKILLS).filter((k): k is SkillId => k in SKILLS);

export const turnHooksMeta: RuleMeta = { automation: "full", source: "srd" };

/** Priorities: checks that can refuse an event run first, the rolls after them. */
const GATE = HOOK_PRIORITY.gate;
const RESOLVE = HOOK_PRIORITY.resolve;

export const ACTION_NAMES = ["attack", "dash", "disengage", "dodge", "help", "hide", "search", "use-object", "cast-spell", "ready"] as const;
export type ActionName = (typeof ACTION_NAMES)[number];

/** Actions whose outcome is a roll or a ruling the DM makes; the system spends the action and says so. */
const DM_RESOLVED: readonly ActionName[] = ["hide", "search", "use-object"];

const speedKey = (actorId: string): string => `speed:${actorId}`;
const attacksKey = (actorId: string): string => `attacks:${actorId}`;
const acKey = (actorId: string): string => `ac:${actorId}`;
const meleeKey = (actorId: string): string => `melee:${actorId}`;
const surprisedKey = (actorId: string): string => `surprised:${actorId}`;

/** What the rules need to know about a creature before its turns start. Merge the result into the store. */
export function registerCombatant(input: {
  actorId: string;
  speedMeters: number;
  attacksPerAction?: number;
  /** Needed for the system to resolve this creature's opportunity attacks by itself. */
  armorClass?: number;
  /** Melee attack used for opportunity attacks: attack modifier and damage parts `{dice, bonus, type}`. */
  meleeAttack?: { modifier: number; damage: DamagePart[] };
  /**
   * The store as it is now, when registering a creature that may already be in the fight (a speed change, a late
   * update): its turn state is then left as it is instead of being reset.
   */
  store?: Readonly<JsonObject>;
}): JsonObject {
  if (!Number.isFinite(input.speedMeters) || input.speedMeters < 0) throw new RangeError("Speed must be a finite number, 0 or more");
  const attacks = input.attacksPerAction ?? 1;
  if (!Number.isInteger(attacks) || attacks < 1) throw new RangeError("Attacks per action must be a whole number, 1 or more");
  // The turn state exists from registration, so reactions work before the creature's first turn.
  if (input.armorClass !== undefined && !Number.isFinite(input.armorClass)) throw new RangeError("Armor class must be a finite number");
  if (input.meleeAttack !== undefined && (!Number.isFinite(input.meleeAttack.modifier) || validDamage(input.meleeAttack.damage) === null)) {
    throw new RangeError("The melee attack needs a finite modifier and valid damage parts");
  }
  return {
    [speedKey(input.actorId)]: input.speedMeters,
    [attacksKey(input.actorId)]: attacks,
    ...(input.store !== undefined && turnOf(input.store, input.actorId) !== null ? {} : { [turnKey(input.actorId)]: startActorTurn({ speedMeters: input.speedMeters }) }),
    ...(input.armorClass === undefined ? {} : { [acKey(input.actorId)]: input.armorClass }),
    ...(input.meleeAttack === undefined ? {} : { [meleeKey(input.actorId)]: { modifier: input.meleeAttack.modifier, damage: input.meleeAttack.damage } }),
  };
}

const ACTIVE_KEY = "activeActor";

/** Whose turn it is now, or null between turns. */
export function activeActor(store: Readonly<JsonObject>): string | null {
  const value = store[ACTIVE_KEY];
  return typeof value === "string" ? value : null;
}

/**
 * Reads a stored turn. The core numbers must be there; fields added in later versions fall back to their starting
 * value, so a state saved earlier still loads. Anything else is treated as damaged (`null`).
 */
function readActorTurn(value: unknown): ActorTurn | null {
  if (!isRecord(value)) return null;
  const core = ["actions", "bonusActions", "reactions", "baseSpeed", "movementTotal", "movementUsed"];
  if (!core.every((k) => typeof value[k] === "number")) return null;
  const count = (key: string): number => (typeof value[key] === "number" ? value[key] : 0);
  const flag = (key: string): boolean => value[key] === true;
  return {
    actions: count("actions"),
    bonusActions: count("bonusActions"),
    reactions: count("reactions"),
    surgesThisTurn: count("surgesThisTurn"),
    baseSpeed: count("baseSpeed"),
    movementTotal: count("movementTotal"),
    movementUsed: count("movementUsed"),
    attacksLeft: count("attacksLeft"),
    attackedThisTurn: flag("attackedThisTurn"),
    lightAttackMade: flag("lightAttackMade"),
    disengaged: flag("disengaged"),
    readied: typeof value["readied"] === "string" ? value["readied"] : null,
    readiedTriggered: flag("readiedTriggered"),
  };
}

/** The turn state of a creature, or null when it is missing or damaged. */
export function turnOf(store: Readonly<JsonObject>, actorId: string): ActorTurn | null {
  return readActorTurn(store[turnKey(actorId)]);
}

/** Level-ups change how many attacks the Attack action allows: merge this into the store. */
export function setAttacksPerAction(actorId: string, attacks: number): JsonObject {
  if (!Number.isInteger(attacks) || attacks < 1) throw new RangeError("Attacks per action must be a whole number, 1 or more");
  return { [attacksKey(actorId)]: attacks };
}

/** The turn state of the creature whose turn it is, if it can still act: not out of turn, not incapacitated. */
export function actingTurn(store: Readonly<JsonObject>, effects: readonly ActiveEffect[], actorId: string): ActorTurn | null {
  if (activeActor(store) !== actorId) return null;
  const turn = turnOf(store, actorId);
  return turn === null || isIncapacitated(conditionsOf(effects, actorId)) ? null : turn;
}

/** The turn state of a creature that may react at any time: only incapacitation stops it. */
export function reactingTurn(store: Readonly<JsonObject>, effects: readonly ActiveEffect[], actorId: string): ActorTurn | null {
  const turn = turnOf(store, actorId);
  return turn === null || isIncapacitated(conditionsOf(effects, actorId)) ? null : turn;
}

function meleeOf(store: Readonly<JsonObject>, actorId: string): { modifier: number; damage: JsonValue[] } | null {
  const v = store[meleeKey(actorId)];
  if (!isRecord(v) || typeof v["modifier"] !== "number" || !Array.isArray(v["damage"])) return null;
  return { modifier: v["modifier"], damage: v["damage"] };
}

function numberAt(store: Readonly<JsonObject>, key: string): number | null {
  const value = store[key];
  return typeof value === "number" ? value : null;
}

function str(payload: JsonObject, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function num(payload: JsonObject, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Why a creature has no usable turn state, when the reason is the data and not the rules. */
function dataProblem(store: Readonly<JsonObject>, actorId: string): "unregistered" | "damaged" | null {
  if (store[turnKey(actorId)] === undefined && store[speedKey(actorId)] === undefined) return "unregistered";
  return turnOf(store, actorId) === null ? "damaged" : null;
}

/**
 * Refuses an event and says why: bad data, a creature not in the fight, not its turn, incapacitated, or nothing left to
 * spend. A reaction can be made on anyone's turn, so `reaction` skips the turn check.
 */
function refuse(
  actorId: string,
  what: string,
  event: GameEvent,
  store: Readonly<JsonObject>,
  effects: readonly ActiveEffect[],
  options: { reaction?: boolean } = {},
): HookOutcome {
  const problem = dataProblem(store, actorId);
  if (problem !== null) return { stop: true, log: [line(problem === "unregistered" ? "log.turn.unregistered" : "log.turn.damaged", actorId)] };
  let reason: "not-your-turn" | "incapacitated" | "none-left" = "none-left";
  if (isIncapacitated(conditionsOf(effects, actorId))) reason = "incapacitated";
  else if (options.reaction !== true && activeActor(store) !== actorId) reason = "not-your-turn";
  const key = reason === "none-left" ? "log.action.refused" : reason === "incapacitated" ? "log.action.incapacitated" : "log.action.not-your-turn";
  return {
    stop: true,
    log: [line(key, actorId, { action: `actions.${what}.name` }, { action: "text-key" })],
    emit: [{ name: "action.refused", payload: { actorId, event: event.name, reason } }],
  };
}

/** The effect is already in place from an earlier use, so nothing is spent. */
function redundant(actorId: string, what: string): HookOutcome {
  return { stop: true, log: [line("log.action.redundant", actorId, { action: `actions.${what}.name` }, { action: "text-key" })] };
}

function helpEffectId(actorId: string, payload: JsonObject): string {
  return `help:${actorId}:${str(payload, "allyId") ?? ""}:${str(payload, "enemyId") ?? `check:${str(payload, "task") ?? ""}`}`;
}

/** The input did not make sense (a missing target, an empty description, an impossible range): nothing is spent. */
function invalid(actorId: string, what: string): HookOutcome {
  return { stop: true, log: [line("log.action.invalid", actorId, { action: `actions.${what}.name` }, { action: "text-key" })] };
}

const turnStart: HookDefinition = {
  id: "srd.turn-start",
  event: "turn.start",
  priority: GATE,
  run({ event, effects, store }) {
    const actorId = str(event.payload, "actorId");
    if (actorId === null) return {};
    const base = numberAt(store, speedKey(actorId));
    if (base === null) return { setStore: { [ACTIVE_KEY]: actorId }, log: [line("log.turn.unregistered", actorId)] };
    const conditions = conditionsOf(effects, actorId);
    const fresh = startActorTurn({ speedMeters: base });
    if (store[surprisedKey(actorId)] === true) {
      // SRD: a surprised creature cannot move or take an action in its first turn, nor react until that turn ends.
      const turn = { ...fresh, actions: 0, reactions: 0, movementTotal: 0 };
      return { setStore: { [turnKey(actorId)]: turn, [ACTIVE_KEY]: actorId }, log: [line("log.turn.surprised", actorId)] };
    }
    // Incapacitation and speed are looked at each time the creature acts or moves, not fixed here.
    return {
      setStore: { [turnKey(actorId)]: fresh, [ACTIVE_KEY]: actorId },
      log: [isIncapacitated(conditions) ? line("log.turn.incapacitated", actorId) : line("log.turn.ready", actorId, { meters: base * speedFactor(conditions) })],
    };
  },
};

/** An interrupted creature picks its turn up again: the state it had is kept. */
const turnResume: HookDefinition = {
  id: "srd.turn-resume",
  event: "turn.resume",
  priority: GATE,
  run({ event }) {
    const actorId = str(event.payload, "actorId");
    return actorId === null ? {} : { setStore: { [ACTIVE_KEY]: actorId }, log: [line("log.turn.resumed", actorId)] };
  },
};

const turnEnd: HookDefinition = {
  id: "srd.turn-end",
  event: "turn.end",
  priority: GATE,
  run({ event, store }) {
    const actorId = str(event.payload, "actorId");
    if (actorId === null || activeActor(store) !== actorId) return {};
    const turn = turnOf(store, actorId);
    if (store[surprisedKey(actorId)] === true && turn !== null) {
      // The first turn is over: the creature is no longer surprised and can react again.
      return { setStore: { [ACTIVE_KEY]: null, [surprisedKey(actorId)]: null, [turnKey(actorId)]: { ...turn, reactions: 1 } }, log: [line("log.turn.ended", actorId), line("log.turn.surprise-over", actorId)] };
    }
    return { setStore: { [ACTIVE_KEY]: null }, log: [line("log.turn.ended", actorId)] };
  },
};

/**
 * `surprise.declared` (actorId) marks a creature as surprised at the start of the encounter, which the DM decides:
 * it cannot react from now until its first turn ends, and in that turn it can neither move nor take an action.
 */
const surpriseDeclared: HookDefinition = {
  id: "srd.surprise",
  event: "surprise.declared",
  priority: GATE,
  run({ event, store }) {
    const actorId = str(event.payload, "actorId");
    const turn = actorId === null ? null : turnOf(store, actorId);
    if (actorId === null || turn === null) return { stop: true, log: [{ key: "log.action.unknown", params: {} }] };
    return { setStore: { [surprisedKey(actorId)]: true, [turnKey(actorId)]: { ...turn, reactions: 0 } }, log: [line("log.turn.surprised-start", actorId)] };
  },
};

function applyAction(actorId: string, action: ActionName, turn: ActorTurn, store: Readonly<JsonObject>, payload: JsonObject): { turn: ActorTurn; hook: HookOutcome } {
  switch (action) {
    case "attack":
      return { turn: takeAttackAction(turn, numberAt(store, attacksKey(actorId)) ?? 1), hook: {} };
    case "dash":
      return { turn: dash(turn), hook: {} };
    case "disengage":
      return { turn: disengage(turn), hook: {} };
    case "dodge":
      return { turn: takeOtherAction(turn), hook: { addEffects: [dodgeEffect(actorId, `dodge:${actorId}`)] } };
    case "help": {
      const allyId = str(payload, "allyId");
      const enemyId = str(payload, "enemyId");
      const task = str(payload, "task");
      if (allyId === null) throw new Error("Help needs the ally to help");
      const help: HelpKind = enemyId === null ? { kind: "check", task: task ?? "" } : { kind: "attack", enemyId };
      return { turn: takeOtherAction(turn), hook: { addEffects: [helpEffect(actorId, allyId, help, helpEffectId(actorId, payload))] } };
    }
    case "ready":
      return { turn: ready(turn, str(payload, "description") ?? ""), hook: {} };
    default:
      return { turn: takeOtherAction(turn), hook: {} };
  }
}

/**
 * The readied action, carried out after `action.ready-released` (`action.declared` with `readied: true`). It happens on
 * anyone's turn and costs nothing more. An attack is declared with `attack.declared` and the same flag; moving at full
 * speed (the other thing the SRD allows) is not handled yet.
 */
function carryOutReadied(actorId: string, action: ActionName, event: GameEvent, effects: readonly ActiveEffect[], store: Readonly<JsonObject>): HookOutcome {
  const turn = reactingTurn(store, effects, actorId);
  if (turn === null) return refuse(actorId, action, event, store, effects, { reaction: true });
  if (!turn.readiedTriggered) return { stop: true, log: [line("log.action.not-readied", actorId)] };
  if (action === "attack" || action === "dash" || action === "ready") return invalid(actorId, action);
  if (action === "help" && (str(event.payload, "allyId") === null || str(event.payload, "allyId") === actorId)) return invalid(actorId, action);
  // The action is worked out with a stand-in action to spend, then the creature's own actions are put back.
  const done = applyAction(actorId, action, { ...turn, actions: 1 }, store, event.payload);
  const next = useReadied({ ...done.turn, actions: turn.actions });
  const log = [line("log.action.used", actorId, { action: `actions.${action}.name` }, { action: "text-key" })];
  if (DM_RESOLVED.includes(action)) log.push(line("log.action.dm-resolves", actorId, { action: `actions.${action}.name` }, { action: "text-key" }));
  return { ...done.hook, setStore: { [turnKey(actorId)]: next }, log, emit: [{ name: "action.taken", payload: { actorId, action, readied: true } }] };
}

const actionDeclared: HookDefinition = {
  id: "srd.action",
  event: "action.declared",
  priority: GATE,
  run({ event, effects, store }) {
    const actorId = str(event.payload, "actorId");
    const name = str(event.payload, "action");
    const action = ACTION_NAMES.find((a) => a === name);
    if (actorId === null || action === undefined) return { stop: true, log: [{ key: "log.action.unknown", params: {} }] };
    if (event.payload["readied"] === true) return carryOutReadied(actorId, action, event, effects, store);
    const turn = actingTurn(store, effects, actorId);
    if (turn === null) return refuse(actorId, action, event, store, effects);
    // Input errors are caught before anything is spent, so they are not mistaken for "no action left".
    if (action === "help" && (str(event.payload, "allyId") === null || str(event.payload, "allyId") === actorId)) return invalid(actorId, action);
    // Helping with a task names the task; helping an attack needs the helper within 1.5 m of the target (the scene tells us).
    if (action === "help" && str(event.payload, "enemyId") === null && (str(event.payload, "task") ?? "").trim() === "") return invalid(actorId, action);
    if (action === "help" && str(event.payload, "enemyId") !== null && event.payload["enemyWithinReach"] !== true) return invalid(actorId, action);
    if (action === "ready" && (str(event.payload, "description") ?? "").trim() === "") return invalid(actorId, action);
    if (turn.actions < 1) return refuse(actorId, action, event, store, effects);
    // Doing it again would spend the action for nothing: the first effect is still on.
    if (action === "dodge" && effects.some((e) => e.key === "action:dodge" && e.targetId === actorId)) return redundant(actorId, action);
    if (action === "help" && effects.some((e) => e.id === helpEffectId(actorId, event.payload))) return redundant(actorId, action);
    const done = applyAction(actorId, action, turn, store, event.payload);
    const log = [line("log.action.used", actorId, { action: `actions.${action}.name` }, { action: "text-key" })];
    if (DM_RESOLVED.includes(action)) log.push(line("log.action.dm-resolves", actorId, { action: `actions.${action}.name` }, { action: "text-key" }));
    return { ...done.hook, setStore: { [turnKey(actorId)]: done.turn }, log, emit: [{ name: "action.taken", payload: { actorId, action } }] };
  },
};

/** Plain "NdM" dice, as `rollDamage` requires; anything else would make it throw once the attack has hit. */
function isPlainDice(dice: string): boolean {
  try {
    const spec = parseDice(dice);
    return spec.modifier === 0 && spec.keep === null;
  } catch {
    return false;
  }
}

/**
 * The damage parts of an attack, or null if any is malformed. No damage at all is valid (an empty list), so an
 * attack can be rolled for its hit alone. Checked before the attack is spent.
 */
function validDamage(value: JsonValue | undefined): DamagePart[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const parts: DamagePart[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { dice, bonus, type } = item;
    const known = DAMAGE_TYPES.find((t) => t === type);
    if (typeof dice !== "string" || !isPlainDice(dice) || typeof bonus !== "number" || !Number.isSafeInteger(bonus) || known === undefined) return null;
    parts.push({ dice, bonus, type: known });
  }
  return parts;
}

/** Checks everything first, then spends the attack and rolls: a refused attack costs nothing. */
const attackRoll: HookDefinition = {
  id: "srd.attack",
  event: "attack.declared",
  priority: RESOLVE,
  run({ event, effects, store, rng }) {
    const attackerId = str(event.payload, "actorId");
    const targetId = str(event.payload, "targetId");
    const modifier = num(event.payload, "modifier");
    const ac = num(event.payload, "ac");
    if (attackerId === null || targetId === null || modifier === null || ac === null) return { stop: true, log: [{ key: "log.action.unknown", params: {} }] };
    const opportunity = event.payload["opportunity"] === true;
    const readied = event.payload["readied"] === true;
    // Whether the target is within reach depends on the scene, so the caller must say: it is never assumed.
    const withinReach = event.payload["withinReach"];
    if (typeof withinReach !== "boolean") return invalid(attackerId, "attack");
    if (validDamage(event.payload["damage"]) === null) return invalid(attackerId, "attack");
    const critFrom = num(event.payload, "criticalFrom");
    if (event.payload["criticalFrom"] !== undefined && (critFrom === null || !Number.isInteger(critFrom) || critFrom < 2 || critFrom > 20)) {
      return invalid(attackerId, "attack");
    }
    // An opportunity attack is a reaction, made on someone else's turn; everything else needs the creature's own turn.
    const turn = opportunity || readied ? reactingTurn(store, effects, attackerId) : actingTurn(store, effects, attackerId);
    if (turn === null) return refuse(attackerId, "attack", event, store, effects, { reaction: opportunity || readied });
    if (readied && (opportunity || !turn.readiedTriggered)) return { stop: true, log: [line("log.action.not-readied", attackerId)] };
    if (opportunity && turnOf(store, targetId)?.disengaged === true) {
      return {
        stop: true,
        log: [line("log.reaction.opportunity-denied", attackerId, { target: targetId }, { target: "actor-id" })],
        emit: [{ name: "action.refused", payload: { actorId: attackerId, event: event.name, reason: "target-disengaged" } }],
      };
    }
    const bonus = event.payload["bonusAction"] === true;
    if (bonus && (event.payload["lightMelee"] !== true || event.payload["offHandLightMelee"] !== true || !turn.lightAttackMade)) {
      return { stop: true, log: [line("log.attack.two-weapon-invalid", attackerId)] };
    }
    const modes = attackModes(conditionsOf(effects, attackerId), conditionsOf(effects, targetId), {
      attackerId,
      targetId,
      targetWithinReach: withinReach,
    });
    if (modes.forbidden) return { stop: true, log: [line("log.attack.forbidden", attackerId, { target: targetId }, { target: "actor-id" })] };
    // Each way of attacking spends something different; say which one is missing.
    let after: ActorTurn;
    if (readied) {
      after = useReadied(turn);
    } else if (opportunity) {
      if (turn.reactions < 1) return { stop: true, log: [line("log.reaction.refused", attackerId)] };
      after = spend(turn, "reaction");
    } else if (bonus) {
      if (turn.bonusActions < 1) return refuse(attackerId, "attack", event, store, effects);
      after = spendBonusAttack(turn);
    } else {
      if (turn.attacksLeft < 1) return { stop: true, log: [line("log.attack.no-attacks", attackerId)] };
      after = spendAttack(turn, { light: event.payload["lightMelee"] === true });
    }
    const sources = [...modes.sources];
    const asked = str(event.payload, "mode");
    if (asked === "advantage" || asked === "disadvantage") sources.push(asked);
    if (dodgeModes(effects, targetId).attacksAgainst !== null && event.payload["attackerUnseen"] !== true) sources.push("disadvantage");
    const helpIds = helpEffectIds(effects, attackerId, { kind: "attack", enemyId: targetId });
    if (helpIds.length > 0) sources.push("advantage");
    const result = resolveAttackRoll({ modifier, ac, mode: resolveRollMode(sources), ...(critFrom === null ? {} : { criticalFrom: critFrom }) }, rng);
    const critical = result.hit && (result.critical || modes.autoCritOnHit);
    const notices: LogLine[] = modes.notices.map((n) => ({ key: `conditionNotices.${n}`, params: {} }));
    return {
      setStore: { [turnKey(attackerId)]: after },
      ...(helpIds.length > 0 ? { removeEffectIds: helpIds } : {}),
      log: [
        line(opportunity ? "log.reaction.opportunity-attack" : "log.attack.declared", attackerId, { target: targetId }, { target: "actor-id" }),
        ...result.log,
        ...notices,
      ],
      emit: [{ name: result.hit ? "attack.hit" : "attack.miss", payload: { ...event.payload, critical, total: result.roll.total } }],
    };
  },
};

const CHECK_TAGS: readonly CheckTag[] = ["sight", "hearing", "social"];

/** Tags the caller gives a check ("sight", "hearing", "social"); null when it gave none, so the DM is told instead. */
function tagsOf(value: JsonValue | undefined): CheckTag[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((v) => CHECK_TAGS.filter((t) => t === v));
}

/**
 * An ability check (`check.declared`: actorId, modifier, dc, and optionally skill, tags or mode). Help and conditions apply.
 * Perception and similar skills depend on the situation, so the caller says what the check needs through `tags`.
 */
const checkRoll: HookDefinition = {
  id: "srd.check",
  event: "check.declared",
  priority: RESOLVE,
  run({ event, effects, rng }) {
    const actorId = str(event.payload, "actorId");
    const modifier = num(event.payload, "modifier");
    const dc = num(event.payload, "dc");
    if (actorId === null || modifier === null || dc === null) return { stop: true, log: [{ key: "log.action.unknown", params: {} }] };
    const skill = str(event.payload, "skill");
    const known = SKILL_IDS.find((k) => k === skill);
    const opponentId = str(event.payload, "opponentId");
    const declared = tagsOf(event.payload["tags"]);
    const tags = known === undefined && declared === null ? null : [...(known === undefined ? [] : skillTags(known)), ...(declared ?? [])];
    const modes = abilityCheckModes(conditionsOf(effects, actorId), {
      rollerId: actorId,
      ...(tags === null ? {} : { tags }),
      ...(opponentId === null ? {} : { opponent: { id: opponentId, conditions: conditionsOf(effects, opponentId) } }),
    });
    const notices: LogLine[] = modes.notices.map((n) => ({ key: `conditionNotices.${n}`, params: {} }));
    if (modes.autoFail) {
      return { log: [line("log.check.auto-fail", actorId), ...notices], emit: [{ name: "check.failed", payload: { actorId, autoFail: true } }] };
    }
    const sources = [...modes.sources];
    const asked = str(event.payload, "mode");
    if (asked === "advantage" || asked === "disadvantage") sources.push(asked);
    // Help only applies to the check made for the task it was given for.
    const task = str(event.payload, "task");
    const helpIds = task === null ? [] : helpEffectIds(effects, actorId, { kind: "check", task });
    if (helpIds.length > 0) sources.push("advantage");
    const result = resolveD20Test({ modifier, mode: resolveRollMode(sources), dc }, rng);
    return {
      ...(helpIds.length > 0 ? { removeEffectIds: helpIds } : {}),
      log: [...result.log, ...notices],
      emit: [{ name: result.success ? "check.passed" : "check.failed", payload: { actorId, total: result.roll.total, autoFail: false } }],
    };
  },
};

const damageRoll: HookDefinition = {
  id: "srd.damage-roll",
  event: "attack.hit",
  priority: RESOLVE,
  run({ event, rng }) {
    const parts = validDamage(event.payload["damage"]) ?? [];
    if (parts.length === 0) return {};
    const rolled = rollDamage(parts, { critical: event.payload["critical"] === true }, rng);
    const byType: JsonObject = {};
    for (const type of DAMAGE_TYPES) {
      const amount = rolled.byType[type];
      if (amount !== undefined) byType[type] = amount;
    }
    // The dice are kept in the event, so features that act on them (rerolling low dice) can do so before damage is applied.
    const detail = rolled.parts.map((part, i) => ({ type: part.type, dice: part.dice, sides: parseDice(parts[i]?.dice ?? "1d1").sides, bonus: part.bonus, amount: part.amount }));
    return {
      log: rolled.log,
      emit: [
        {
          name: "damage.rolled",
          payload: {
            actorId: event.payload["actorId"] ?? null,
            targetId: event.payload["targetId"] ?? null,
            byType,
            parts: detail,
            critical: event.payload["critical"] === true,
            twoHandedMelee: event.payload["twoHandedMelee"] === true,
          },
        },
      ],
    };
  },
};

const movementDeclared: HookDefinition = {
  id: "srd.movement",
  event: "movement.declared",
  priority: GATE,
  run({ event, effects, store }) {
    const actorId = str(event.payload, "actorId");
    const meters = num(event.payload, "meters");
    if (actorId === null || meters === null || meters < 0) return { stop: true, log: [{ key: "log.action.unknown", params: {} }] };
    const problem = dataProblem(store, actorId);
    if (problem !== null) return { stop: true, log: [line(problem === "unregistered" ? "log.turn.unregistered" : "log.turn.damaged", actorId)] };
    const turn = actingTurn(store, effects, actorId);
    const factor = speedFactor(conditionsOf(effects, actorId));
    // The speed the conditions allow right now, so a creature slowed or freed mid-turn is handled.
    const available = turn === null ? 0 : turn.movementTotal * factor - turn.movementUsed;
    if (turn === null || factor === 0 || meters > available + 1e-9) {
      return { stop: true, log: [line("log.movement.refused", actorId, { meters })], emit: [{ name: "movement.refused", payload: { actorId } }] };
    }
    const next = { ...turn, movementUsed: turn.movementUsed + meters };
    return { setStore: { [turnKey(actorId)]: next }, log: [line("log.movement.moved", actorId, { meters, left: Math.max(0, available - meters) })] };
  },
};

const OPPORTUNITY_YES = "yes";
const OPPORTUNITY_NO = "no";

const opportunityAttack: HookDefinition = {
  id: "srd.opportunity-attack",
  event: "movement.left-reach",
  priority: GATE,
  run({ event, effects, store, answer }) {
    const moverId = str(event.payload, "actorId");
    const reactorId = str(event.payload, "reactorId");
    if (moverId === null || reactorId === null) return {};
    const mover = turnOf(store, moverId);
    const reactor = reactingTurn(store, effects, reactorId);
    if (mover === null || reactor === null || !canOpportunityAttack(reactor, mover)) return {};
    if (answer === null) {
      return {
        ask: {
          to: { kind: "actor", actorId: reactorId },
          promptKey: "reactions.opportunity-attack.prompt",
          options: [
            { id: OPPORTUNITY_YES, labelKey: "common.yes" },
            { id: OPPORTUNITY_NO, labelKey: "common.no" },
          ],
          defaultOptionId: OPPORTUNITY_NO,
        },
      };
    }
    if (answer !== OPPORTUNITY_YES) return {};
    const chosen = line("log.reaction.opportunity-chosen", reactorId, { target: moverId }, { target: "actor-id" });
    const ac = numberAt(store, acKey(moverId));
    const melee = meleeOf(store, reactorId);
    if (ac !== null && melee !== null) {
      // The attack is resolved like any other; the attack hook spends the reaction and logs the attack once it is allowed.
      return {
        emit: [{ name: "attack.declared", payload: { actorId: reactorId, targetId: moverId, modifier: melee.modifier, ac, damage: melee.damage, opportunity: true, weaponAttack: true, withinReach: true } }],
        log: [chosen],
      };
    }
    // Without the creature's melee attack or the mover's AC on record, the caller makes the attack: only the reaction is spent here.
    return {
      setStore: { [turnKey(reactorId)]: spend(reactor, "reaction") },
      log: [chosen],
      emit: [{ name: "reaction.opportunity-attack", payload: { actorId: reactorId, targetId: moverId } }],
    };
  },
};

const readyReleased: HookDefinition = {
  id: "srd.ready-release",
  event: "action.ready-released",
  priority: GATE,
  run({ event, effects, store }) {
    const actorId = str(event.payload, "actorId");
    if (actorId === null) return { stop: true, log: [{ key: "log.action.unknown", params: {} }] };
    const turn = reactingTurn(store, effects, actorId);
    if (turn === null) {
      const problem = dataProblem(store, actorId);
      return { stop: true, log: [line(problem === null ? "log.reaction.refused" : problem === "unregistered" ? "log.turn.unregistered" : "log.turn.damaged", actorId)] };
    }
    if (turn.readied === null) return invalid(actorId, "ready");
    if (turn.reactions < 1) return { stop: true, log: [line("log.reaction.refused", actorId)] };
    if (turn.readiedTriggered) return invalid(actorId, "ready");
    const description = turn.readied;
    return {
      setStore: { [turnKey(actorId)]: releaseReadied(turn) },
      log: [line("log.action.ready-released", actorId, { description })],
      emit: [{ name: "action.readied-resolved", payload: { actorId, description } }],
    };
  },
};

/** The SRD hooks for the turn, actions, attacks and movement. Pass them to `createEngine` with the class and content hooks. */
export function srdTurnHooks(): HookDefinition[] {
  return [turnStart, turnResume, turnEnd, surpriseDeclared, actionDeclared, attackRoll, checkRoll, damageRoll, movementDeclared, opportunityAttack, readyReleased];
}
