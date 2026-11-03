import { isRecord, type HookDefinition, type HookOutcome, type JsonObject, type JsonValue } from "@phoenix/rules-core";
import {
  fightingStylesKey,
  readFightingStyles,
  HOOK_PRIORITY,
  actorLine,
  turnKey,
  classLevelKey,
  conModifierKey,
  setAttacksPerAction,
  subclassKey,
  readConModifier,
  readClassLevel,
  readSubclass,
  readUses,
  readVital,
  restoreUses,
  actingTurn,
  usesKey,
  usesLeft,
  vitalKey,
  type ActorTurn,
} from "@phoenix/rules-srd";
import { championCriticalFrom, survivorHealing } from "./champion";
import { FIGHTING_STYLE_IDS, rerollLowDamageDice, type FightingStyleId } from "./fighting-styles";
import { actionSurge, attacksPerAction, fighter, indomitable, secondWind, useActionSurge, useIndomitable, useSecondWind } from "./fighter";

/**
 * Hooks that connect the fighter and the Champion to the engine. They read the fighter's data from the store
 * (`level:<id>:fighter`, `subclass:<id>:fighter`, `uses:<id>`, `vital:<id>`, `con-mod:<id>`) and the turn state kept by the SRD hooks.
 * `registerFighter` writes the starting data; `level.up` keeps the level and the attacks per action current afterwards.
 * Events they answer: `turn.start`, `rest.short`, `rest.long`, `feature.declared` and `save.failed`.
 */
const GATE = HOOK_PRIORITY.gate;

function actorOf(payload: JsonObject): string | null {
  const id = payload["actorId"];
  return typeof id === "string" ? id : null;
}

function refused(actorId: string, feature: string): HookOutcome {
  return { stop: true, log: [actorLine("log.feature.refused", actorId, { feature: `classes.fighter.features.${feature}.name` }, { feature: "text-key" })] };
}

/** The data the feature needs is not in the store: say so, instead of passing it off as "no uses left". */
function missingData(actorId: string, feature: string): HookOutcome {
  return { stop: true, log: [actorLine("log.feature.missing-data", actorId, { feature: `classes.fighter.features.${feature}.name` }, { feature: "text-key" })] };
}

const survivor: HookDefinition = {
  id: "fighter.survivor",
  event: "turn.start",
  priority: HOOK_PRIORITY.late,
  run({ event, store }) {
    const actorId = actorOf(event.payload);
    if (actorId === null || readSubclass(store, actorId, "fighter") !== "champion") return {};
    const level = readClassLevel(store, actorId, "fighter");
    const vital = readVital(store, actorId);
    const conModifier = readConModifier(store, actorId);
    if (level === null || vital === null) return {};
    if (conModifier === null) {
      // Without the modifier the healing cannot be worked out: say so instead of doing nothing silently.
      return level >= 18 ? { log: [{ key: "log.feature.missing-data", params: { actor: actorId, feature: "classes.fighter.subclasses.champion.features.survivor.name" }, refs: { actor: "actor-id", feature: "text-key" } }] } : {};
    }
    const change = survivorHealing({ fighterLevel: level, actorId, vital, conModifier });
    if (change.state === vital) return {};
    return { setStore: { [vitalKey(actorId)]: change.state }, log: change.log, emit: change.events };
  },
};

function restHook(id: string, event: "rest.short" | "rest.long", rest: "short" | "long"): HookDefinition {
  return {
    id,
    event,
    priority: GATE,
    run({ event: e, store }) {
      const actorId = actorOf(e.payload);
      if (actorId === null || readClassLevel(store, actorId, "fighter") === null) return {};
      const before = readUses(store, actorId);
      const after = restoreUses(fighter.features, before, rest);
      const restored = Object.keys(before).filter((id) => !(id in after));
      if (restored.length === 0) return {};
      return {
        setStore: { [usesKey(actorId)]: after },
        log: [{ key: "log.class.uses-restored", params: { actor: actorId }, refs: { actor: "actor-id" } }],
      };
    },
  };
}

type FeatureArgs = { actorId: string; level: number; turn: ActorTurn; store: Readonly<JsonObject>; rng: Parameters<HookDefinition["run"]>[0]["rng"] };

/** A feature the player declares with `feature.declared`. `use` checks what it needs itself and never relies on exceptions. */
function featureHook(id: string, feature: "action-surge" | "second-wind", use: (args: FeatureArgs) => HookOutcome): HookDefinition {
  return {
    id,
    event: "feature.declared",
    priority: GATE,
    run({ event, effects, store, rng }) {
      if (event.payload["feature"] !== feature) return {};
      const actorId = actorOf(event.payload);
      if (actorId === null) return { stop: true, log: [{ key: "log.action.unknown", params: {} }] };
      const level = readClassLevel(store, actorId, "fighter");
      if (level === null) return {};
      const turn = actingTurn(store, effects, actorId);
      if (turn === null) return refused(actorId, feature);
      return use({ actorId, level, turn, store, rng });
    },
  };
}

const actionSurgeHook = featureHook("fighter.action-surge", "action-surge", ({ actorId, level, turn, store }) => {
  const spent = readUses(store, actorId);
  // One extra action per turn, and only while a use is left (none before level 2).
  if (usesLeft(actionSurge, level, spent) < 1 || turn.surgesThisTurn >= 1) return refused(actorId, "action-surge");
  const result = useActionSurge({ actorId, level, spent, economy: turn });
  return { setStore: { [usesKey(actorId)]: result.spent, [turnKey(actorId)]: result.economy }, log: result.log, emit: result.events };
});

const secondWindHook = featureHook("fighter.second-wind", "second-wind", ({ actorId, level, turn, store, rng }) => {
  const vital = readVital(store, actorId);
  if (vital === null) return missingData(actorId, "second-wind");
  const spent = readUses(store, actorId);
  if (vital.status !== "alive" || turn.bonusActions < 1 || usesLeft(secondWind, level, spent) < 1) return refused(actorId, "second-wind");
  const result = useSecondWind({ actorId, level, vital, spent, economy: turn }, rng);
  return {
    setStore: { [vitalKey(actorId)]: result.vital, [usesKey(actorId)]: result.spent, [turnKey(actorId)]: result.economy },
    log: result.log,
    emit: result.events,
  };
});

const YES = "yes";
const NO = "no";

/**
 * A failed saving throw (`save.failed` with `modifier`, `mode`, `dc`) offers the fighter an Indomitable reroll.
 * Whoever applies the consequences of a failed save listens to `save.failed` and `save.passed`, and so sees only the final result.
 */
const indomitableHook: HookDefinition = {
  id: "fighter.indomitable",
  event: "save.failed",
  priority: GATE,
  run({ event, store, rng, answer }) {
    // A save that was already rerolled stands: Indomitable is not offered twice for the same save.
    if (event.payload["rerolled"] === true) return {};
    const actorId = actorOf(event.payload);
    const level = actorId === null ? null : readClassLevel(store, actorId, "fighter");
    const { modifier, mode, dc } = event.payload;
    if (actorId === null || level === null || typeof modifier !== "number" || typeof dc !== "number") return {};
    if (level < 9 || usesLeft(indomitable, level, readUses(store, actorId)) < 1) return {};
    if (answer === null) {
      return {
        ask: {
          to: { kind: "actor", actorId },
          promptKey: "classes.fighter.prompts.indomitable",
          options: [
            { id: YES, labelKey: "common.yes" },
            { id: NO, labelKey: "common.no" },
          ],
          defaultOptionId: NO,
        },
      };
    }
    if (answer !== YES) return {};
    const rollMode = mode === "advantage" || mode === "disadvantage" ? mode : "normal";
    const result = useIndomitable({ actorId, level, spent: readUses(store, actorId), save: { modifier, mode: rollMode, dc } }, rng);
    // The reroll replaces the outcome: the original `save.failed` stops here, so nothing downstream treats it as failed,
    // and the real result is announced as `save.passed`, or as a `save.failed` marked `rerolled`.
    const final = result.result.success
      ? { name: "save.passed", payload: { ...event.payload, total: result.result.roll.total, rerolled: true } }
      : { name: "save.failed", payload: { ...event.payload, total: result.result.roll.total, rerolled: true } };
    return { stop: true, setStore: { [usesKey(actorId)]: result.spent }, log: result.log, emit: [...result.events, final] };
  },
};

/**
 * The Champion's wider critical range, set on weapon attacks before they are rolled. It applies only when the attack
 * says `weaponAttack: true`: the feature covers weapon attacks, so an event that does not say so (a spell) is left alone.
 */
const championCritical: HookDefinition = {
  id: "fighter.champion-critical",
  event: "attack.declared",
  priority: HOOK_PRIORITY.early,
  run({ event, store }) {
    const actorId = actorOf(event.payload);
    if (actorId === null || event.payload["weaponAttack"] !== true || readSubclass(store, actorId, "fighter") !== "champion") return {};
    const level = readClassLevel(store, actorId, "fighter");
    if (level === null) return {};
    const from = championCriticalFrom(level);
    // Another source may already widen the range further: the lowest threshold wins.
    const existing = event.payload["criticalFrom"];
    if (from >= 20 || (typeof existing === "number" && existing <= from)) return {};
    return {
      event: { ...event, payload: { ...event.payload, criticalFrom: from } },
      log: [{ key: "log.class.critical-range", params: { actor: actorId, from }, refs: { actor: "actor-id" } }],
    };
  },
};

type DamageDetail = { type: string; dice: number[]; sides: number; bonus: number; amount: number };

function damageDetail(value: JsonValue | undefined): DamageDetail[] | null {
  if (!Array.isArray(value)) return null;
  const parts: DamageDetail[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const { type, dice, sides, bonus, amount } = item;
    if (typeof type !== "string" || !Array.isArray(dice) || !dice.every((d) => typeof d === "number")) return null;
    if (typeof sides !== "number" || typeof bonus !== "number" || typeof amount !== "number") return null;
    parts.push({ type, dice: dice.filter((d): d is number => typeof d === "number"), sides, bonus, amount });
  }
  return parts;
}

/**
 * Great Weapon Fighting. When the damage of a melee weapon held in two hands (`twoHandedMelee: true` on the attack,
 * for a weapon that is two-handed or versatile) shows a 1 or a 2, the player is asked whether to roll those dice again;
 * the new result stands. The player decides: nothing is rerolled on its own, and an unanswered question means no.
 */
const greatWeaponFighting: HookDefinition = {
  id: "fighter.great-weapon-fighting",
  event: "damage.rolled",
  priority: HOOK_PRIORITY.early,
  run({ event, store, rng, answer }) {
    if (event.payload["twoHandedMelee"] !== true || event.payload["rerolledLow"] === true) return {};
    const actorId = actorOf(event.payload);
    if (actorId === null || !readFightingStyles(store, actorId).includes("great-weapon-fighting")) return {};
    const parts = damageDetail(event.payload["parts"]);
    if (parts === null || !parts.some((p) => p.dice.some((d) => d <= 2))) return {};
    if (answer === null) {
      return {
        ask: {
          to: { kind: "actor", actorId },
          promptKey: "classes.fighter.prompts.great-weapon-fighting",
          options: [
            { id: YES, labelKey: "common.yes" },
            { id: NO, labelKey: "common.no" },
          ],
          defaultOptionId: NO,
        },
      };
    }
    if (answer !== YES) return {};
    const rerolled = parts.map((p) => {
      const dice = rerollLowDamageDice(["great-weapon-fighting"], p.dice, p.sides, { qualifyingWeapon: true }, rng);
      return { ...p, dice, amount: Math.max(0, dice.reduce((a, b) => a + b, 0) + p.bonus) };
    });
    const sums = new Map<string, number>();
    for (const p of rerolled) sums.set(p.type, (sums.get(p.type) ?? 0) + p.amount);
    const byType: JsonObject = Object.fromEntries(sums);
    const total = rerolled.reduce((a, p) => a + p.amount, 0);
    return {
      event: { ...event, payload: { ...event.payload, parts: rerolled, byType, rerolledLow: true } },
      log: [{ key: "log.class.great-weapon-reroll", params: { actor: actorId, total }, refs: { actor: "actor-id" } }],
    };
  },
};

/** A new fighter level changes the level on record and how many attacks the Attack action allows. */
const levelUpHook: HookDefinition = {
  id: "fighter.level-up",
  event: "level.up",
  priority: GATE,
  run({ event }) {
    const actorId = actorOf(event.payload);
    const level = event.payload["level"];
    if (actorId === null || event.payload["classId"] !== "fighter" || typeof level !== "number") return {};
    if (!Number.isInteger(level) || level < 1 || level > 20) return { stop: true, log: [actorLine("log.class.level-invalid", actorId)] };
    const attacks = attacksPerAction(level);
    return {
      setStore: { [classLevelKey(actorId, "fighter")]: level, ...setAttacksPerAction(actorId, attacks) },
      log: [{ key: "log.class.attacks-per-action", params: { actor: actorId, attacks }, refs: { actor: "actor-id" } }],
    };
  },
};

/**
 * The starting data a fighter needs in the store, for a character who is already past level 1 or comes from a saved sheet.
 * Merge the result into the store together with `registerCombatant`; `level.up` keeps it current afterwards.
 */
export function registerFighter(input: {
  actorId: string;
  level: number;
  conModifier: number;
  subclass?: "champion";
  spent?: Record<string, number>;
  /** Fighting styles already chosen; a style cannot be taken twice. */
  fightingStyles?: readonly FightingStyleId[];
}): JsonObject {
  if (!Number.isInteger(input.level) || input.level < 1 || input.level > 20) throw new RangeError("Level must be a whole number from 1 to 20");
  if (!Number.isSafeInteger(input.conModifier)) throw new RangeError("Constitution modifier must be a whole number");
  const styles = input.fightingStyles ?? [];
  if (new Set(styles).size !== styles.length || styles.some((s) => !FIGHTING_STYLE_IDS.includes(s))) {
    throw new RangeError("Fighting styles must be known and not repeated");
  }
  return {
    [fightingStylesKey(input.actorId)]: [...styles],
    [classLevelKey(input.actorId, "fighter")]: input.level,
    [conModifierKey(input.actorId)]: input.conModifier,
    ...setAttacksPerAction(input.actorId, attacksPerAction(input.level)),
    ...(input.subclass === undefined ? {} : { [subclassKey(input.actorId, "fighter")]: input.subclass }),
    ...(input.spent === undefined ? {} : { [usesKey(input.actorId)]: input.spent }),
  };
}

export function fighterHooks(): HookDefinition[] {
  return [levelUpHook, championCritical, greatWeaponFighting, survivor, restHook("fighter.rest-short", "rest.short", "short"), restHook("fighter.rest-long", "rest.long", "long"), actionSurgeHook, secondWindHook, indomitableHook];
}
