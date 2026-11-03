import { rollDice, type GameEvent, type LogLine, type Rng } from "@phoenix/rules-core";
import { MAX_LEVEL, type Ability } from "./abilities";
import { HIT_DIE_SIZES, type HitDieSize } from "./rest";
import { validateFeature, type FeatureDefinition } from "./features";
import type { RuleMeta } from "./meta";
import type { SkillId } from "./skills";

export const classModelMeta: RuleMeta = { automation: "partial", source: "srd" };

/** Levels that offer an ability score increase or a feat, unless the class says otherwise with `asiLevels`. */
/**
 * Every class picks its subclass at level 3 (author's rule; the SRD has some classes pick earlier). Subclass features
 * the SRD gives before level 3 are decided class by class when the class is imported.
 */
export const SUBCLASS_LEVEL = 3;

export const ASI_LEVELS = [4, 8, 12, 16, 19] as const;

/** A decision the player still owes after a level up. It lives on the character until answered. */
export type PendingChoice =
  | { id: string; kind: "hit-points"; level: number }
  | { id: string; kind: "ability-or-feat"; level: number }
  | { id: string; kind: "class"; level: number; promptKey: string }
  | { id: "subclass"; kind: "subclass"; level: number }
  | { id: "skills"; kind: "skills"; level: 1; count: number; from: readonly SkillId[] };

/** What a class or subclass grants at one level. `features` are ids of the owner's `features` list. */
export type ClassLevel = {
  features: readonly string[];
  /** Choices specific to this class at this level (a fighting style, for instance). */
  choices?: readonly { id: string; promptKey: string }[];
};

export type ArmorGroup = "light" | "medium" | "heavy" | "shields";
export type WeaponGroup = "simple" | "martial";

export type ClassProficiencies = {
  armor: readonly ArmorGroup[];
  weapons: readonly WeaponGroup[];
  /** Specific weapons or tools, as catalog keys, when a group does not say it (a rogue's hand crossbow). */
  extra: readonly string[];
  skills: { count: number; from: readonly SkillId[] };
};

/** Class data as the author writes it; the content package builds these, rules-srd only reads them. */
export type ClassDefinition = {
  id: string;
  nameKey: string;
  hitDie: HitDieSize;
  saveProficiencies: readonly Ability[];
  proficiencies: ClassProficiencies;
  /** Index 0 is level 1. Must hold exactly MAX_LEVEL entries. */
  levels: readonly ClassLevel[];
  features: readonly FeatureDefinition[];
  /** Levels with an ability score increase or feat. Defaults to ASI_LEVELS. */
  asiLevels?: readonly number[];
  source: RuleMeta["source"];
  automation: RuleMeta["automation"];
};

/** A specialisation chosen at `SUBCLASS_LEVEL`. `levels` and `features` work as in the class. */
export type SubclassDefinition = {
  id: string;
  classId: string;
  nameKey: string;
  descriptionKey: string;
  /** Only the levels where the subclass grants something, ordered. */
  levels: readonly (ClassLevel & { level: number })[];
  features: readonly FeatureDefinition[];
  source: RuleMeta["source"];
  automation: RuleMeta["automation"];
};

function checkFeatureIds(owner: string, features: readonly FeatureDefinition[], used: readonly string[]): void {
  const ids = features.map((f) => validateFeature(f).id);
  if (new Set(ids).size !== ids.length) throw new RangeError(`${owner} lists a feature twice`);
  for (const id of used) {
    if (!ids.includes(id)) throw new RangeError(`${owner} grants unknown feature "${id}"`);
  }
}

export function defineClass(definition: ClassDefinition): ClassDefinition {
  if (!HIT_DIE_SIZES.some((size) => size === definition.hitDie)) throw new RangeError("A hit die is a d6, d8, d10 or d12");
  if (definition.levels.length !== MAX_LEVEL) throw new RangeError(`A class defines all ${String(MAX_LEVEL)} levels`);
  if (new Set(definition.saveProficiencies).size !== definition.saveProficiencies.length) {
    throw new RangeError("Saving throw proficiencies must not repeat");
  }
  const { skills } = definition.proficiencies;
  if (!Number.isInteger(skills.count) || skills.count < 0 || skills.count > skills.from.length) {
    throw new RangeError("Skill choices must fit the list they come from");
  }
  const asi = definition.asiLevels ?? ASI_LEVELS;
  if (asi.some((level, i) => !Number.isInteger(level) || level < 2 || level > MAX_LEVEL || (i > 0 && level <= (asi[i - 1] ?? 0)))) {
    throw new RangeError("ASI levels must be ordered levels from 2 to 20");
  }
  checkFeatureIds(definition.id, definition.features, definition.levels.flatMap((l) => l.features));
  return definition;
}

export function defineSubclass(subclass: SubclassDefinition, parent: ClassDefinition): SubclassDefinition {
  if (subclass.classId !== parent.id) throw new RangeError(`${subclass.id} does not belong to ${parent.id}`);
  const levels = subclass.levels.map((l) => l.level);
  if (levels.some((level, i) => !Number.isInteger(level) || level < SUBCLASS_LEVEL || level > MAX_LEVEL || (i > 0 && level <= (levels[i - 1] ?? 0)))) {
    throw new RangeError("Subclass levels must be ordered and not before the subclass level");
  }
  checkFeatureIds(subclass.id, subclass.features, subclass.levels.flatMap((l) => l.features));
  return subclass;
}

function levelEntry(definition: ClassDefinition, level: number): ClassLevel {
  const entry = definition.levels[level - 1];
  if (!Number.isInteger(level) || entry === undefined) {
    throw new RangeError(`Level must be a whole number from 1 to ${String(MAX_LEVEL)}`);
  }
  return entry;
}

/** XP needed for each level, index 0 being level 1 (always 0). They come with the author's class data. */
export function levelForXp(xp: number, thresholds: readonly number[]): number {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError("Experience points must be a whole number, 0 or more");
  if (thresholds.length !== MAX_LEVEL || thresholds[0] !== 0) throw new RangeError("Thresholds start at 0 and cover every level");
  if (thresholds.some((value, i) => i > 0 && value <= (thresholds[i - 1] ?? 0))) {
    throw new RangeError("Thresholds must grow with the level");
  }
  let level = 1;
  for (let i = 1; i < thresholds.length; i++) {
    if (xp >= (thresholds[i] ?? Infinity)) level = i + 1;
  }
  return level;
}

export type LevelUp = {
  level: number;
  /** Feature ids granted at the new level, from the class and from the subclass if one was chosen. */
  grantedFeatures: readonly string[];
  /** Choices the character now owes, in the order they should be asked. */
  pendingChoices: readonly PendingChoice[];
  events: GameEvent[];
  log: LogLine[];
};

function subclassEntry(subclass: SubclassDefinition | undefined, level: number): (ClassLevel & { level: number }) | undefined {
  return subclass?.levels.find((l) => l.level === level);
}

/**
 * Moves one class level up. Everything that needs no choice is applied (features, the new hit die); the rest comes
 * back as pending choices, hit points included. Pass the subclass once chosen; reaching the subclass level without one
 * owes the choice. Multiclass will pass the level of the class being raised.
 */
export function levelUp(definition: ClassDefinition, actorId: string, currentLevel: number, subclass?: SubclassDefinition): LevelUp {
  levelEntry(definition, currentLevel);
  if (subclass !== undefined && subclass.classId !== definition.id) throw new RangeError(`${subclass.id} does not belong to ${definition.id}`);
  const level = currentLevel + 1;
  const entry = levelEntry(definition, level);
  const extra = subclassEntry(subclass, level);
  const pendingChoices: PendingChoice[] = [{ id: `hp:${String(level)}`, kind: "hit-points", level }];
  if ((definition.asiLevels ?? ASI_LEVELS).some((asi) => asi === level)) {
    pendingChoices.push({ id: `asi:${String(level)}`, kind: "ability-or-feat", level });
  }
  if (level === SUBCLASS_LEVEL && subclass === undefined) pendingChoices.push({ id: "subclass", kind: "subclass", level });
  for (const choice of [...(entry.choices ?? []), ...(extra?.choices ?? [])]) {
    pendingChoices.push({ id: choice.id, kind: "class", level, promptKey: choice.promptKey });
  }
  return {
    level,
    grantedFeatures: [...entry.features, ...(extra?.features ?? [])],
    pendingChoices,
    events: [{ name: "level.up", payload: { actorId, level, classId: definition.id } }],
    log: [{ key: "log.level.up", params: { actor: actorId, level }, refs: { actor: "actor-id" } }],
  };
}

/** What a new character owes at level 1: the skill picks and any class choice of the first level. */
export function startingChoices(definition: ClassDefinition): PendingChoice[] {
  const { skills } = definition.proficiencies;
  const choices: PendingChoice[] = [];
  if (skills.count > 0) choices.push({ id: "skills", kind: "skills", level: 1, count: skills.count, from: skills.from });
  for (const choice of levelEntry(definition, 1).choices ?? []) {
    choices.push({ id: choice.id, kind: "class", level: 1, promptKey: choice.promptKey });
  }
  return choices;
}

export type SubclassChoice = { grantedFeatures: readonly string[]; pendingChoices: readonly PendingChoice[] };

/** Picking the subclass at `level` (the class level reached, or later if it was postponed): everything it grants up to that level. */
export function chooseSubclass(definition: ClassDefinition, subclass: SubclassDefinition, level: number): SubclassChoice {
  if (subclass.classId !== definition.id) throw new RangeError(`${subclass.id} does not belong to ${definition.id}`);
  if (!Number.isInteger(level) || level < SUBCLASS_LEVEL || level > MAX_LEVEL) {
    throw new RangeError("The subclass is chosen at the subclass level or later");
  }
  const reached = subclass.levels.filter((l) => l.level <= level);
  return {
    grantedFeatures: reached.flatMap((l) => l.features),
    pendingChoices: reached.flatMap((l) => (l.choices ?? []).map((c): PendingChoice => ({ id: c.id, kind: "class", level: l.level, promptKey: c.promptKey }))),
  };
}

export type HitPointMethod = "roll" | "average";

export type HitPointGain = { gained: number; hpMax: number; log: LogLine[] };

function checkModifier(conModifier: number): void {
  if (!Number.isSafeInteger(conModifier)) throw new RangeError("Constitution modifier must be a whole number");
}

/** Level 1: the highest value of the hit die plus the Constitution modifier, as the SRD says. */
export function startingHitPoints(definition: ClassDefinition, conModifier: number): number {
  checkModifier(conModifier);
  return definition.hitDie + conModifier;
}

/**
 * Hit points from a level above the first: the player picks a roll (made by the server) or the fixed average,
 * rounded up, plus the Constitution modifier. The SRD sets no minimum per level, so a negative result lowers the
 * maximum; only the author's rule that a hit point maximum is never below 1 applies.
 */
export function gainHitPoints(
  definition: ClassDefinition,
  actorId: string,
  hpMax: number,
  conModifier: number,
  method: HitPointMethod,
  rng: Rng,
): HitPointGain {
  checkModifier(conModifier);
  if (!Number.isInteger(hpMax) || hpMax < 1) throw new RangeError("Hit point maximum must be a whole number, 1 or more");
  const base = method === "roll" ? rollDice(`1d${String(definition.hitDie)}`, rng).total : Math.floor(definition.hitDie / 2) + 1;
  const newMax = Math.max(1, hpMax + base + conModifier);
  const gained = newMax - hpMax;
  return {
    gained,
    hpMax: newMax,
    log: [{ key: "log.level.hit-points", params: { actor: actorId, gained, hpMax: newMax }, refs: { actor: "actor-id" } }],
  };
}
