import type { ActiveEffect } from "@phoenix/rules-core";
import { conditionsOf } from "./conditions";
import { isIncapacitated, speedFactor } from "./condition-rules";
import type { RuleMeta } from "./meta";

export const actionEffectsMeta: RuleMeta = { automation: "full", source: "srd" };

const DODGE_KEY = "action:dodge";
const HELP_KEY = "action:help";

/** Dodge lasts until the start of the dodger's next turn. */
export function dodgeEffect(actorId: string, effectId: string): ActiveEffect {
  return {
    id: effectId,
    key: DODGE_KEY,
    nameKey: "actions.dodge.name",
    sourceId: actorId,
    targetId: actorId,
    power: 1,
    duration: { kind: "until-event", event: "turn.start", actorId },
    modifiers: [],
  };
}

/** Dodging gives its benefits only while the creature can act and move. */
export function isDodging(effects: readonly ActiveEffect[], actorId: string): boolean {
  if (!effects.some((e) => e.key === DODGE_KEY && e.targetId === actorId)) return false;
  const conditions = conditionsOf(effects, actorId);
  return !isIncapacitated(conditions) && speedFactor(conditions) > 0;
}

/** What Dodge changes for rolls: attacks against the dodger, if the attacker can be seen, and its Dexterity saves. */
export function dodgeModes(effects: readonly ActiveEffect[], actorId: string): { attacksAgainst: "disadvantage" | null; dexteritySave: "advantage" | null } {
  const on = isDodging(effects, actorId);
  return { attacksAgainst: on ? "disadvantage" : null, dexteritySave: on ? "advantage" : null };
}

/** Help with a task (`task` names it, so the advantage goes to the check made for that task) or with an attack on `enemyId`. */
export type HelpKind = { kind: "check"; task: string } | { kind: "attack"; enemyId: string };

function helpStat(help: HelpKind): string {
  return help.kind === "check" ? `help.check:${help.task}` : `help.attack:${help.enemyId}`;
}

/** Help: the ally gets advantage on its next check, or next attack against `enemyId`, before the helper's next turn. */
export function helpEffect(helperId: string, allyId: string, help: HelpKind, effectId: string): ActiveEffect {
  return {
    id: effectId,
    key: `${HELP_KEY}:${helperId}:${helpStat(help)}`,
    nameKey: "actions.help.name",
    sourceId: helperId,
    targetId: allyId,
    power: 1,
    duration: { kind: "until-event", event: "turn.start", actorId: helperId },
    modifiers: [{ stat: helpStat(help), value: 1 }],
  };
}

/** Ids of the Help effects that give `allyId` advantage on this roll, ready to be consumed when it is made. */
export function helpEffectIds(effects: readonly ActiveEffect[], allyId: string, help: HelpKind): string[] {
  const stat = helpStat(help);
  return effects.filter((e) => e.targetId === allyId && e.key.startsWith(HELP_KEY) && e.modifiers.some((m) => m.stat === stat)).map((e) => e.id);
}
