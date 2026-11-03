import type { Rng } from "@phoenix/rules-core";
import type { FeatureDefinition } from "@phoenix/rules-srd";

export const FIGHTING_STYLE_IDS = ["archery", "defense", "dueling", "great-weapon-fighting", "protection", "two-weapon-fighting"] as const;
export type FightingStyleId = (typeof FIGHTING_STYLE_IDS)[number];

export type FightingStyle = Pick<FeatureDefinition, "id" | "nameKey" | "descriptionKey" | "source" | "automation" | "dmNoteKey"> & { id: FightingStyleId };

const style = (id: FightingStyleId, over: Pick<FightingStyle, "automation" | "dmNoteKey"> = { automation: "full" }): FightingStyle => ({
  id,
  nameKey: `classes.fighter.styles.${id}.name`,
  descriptionKey: `classes.fighter.styles.${id}.description`,
  source: "srd",
  ...over,
});

export const FIGHTING_STYLES: readonly FightingStyle[] = [
  style("archery"),
  style("defense"),
  style("dueling"),
  style("great-weapon-fighting"),
  // The reaction needs the attack pipeline and a shield check on the map: for now the DM applies the disadvantage.
  style("protection", { automation: "partial", dmNoteKey: "classes.fighter.notes.protection" }),
  style("two-weapon-fighting"),
];

/** A style cannot be taken twice, even when the class lets the character choose again. */
export function addFightingStyle(chosen: readonly FightingStyleId[], next: FightingStyleId): FightingStyleId[] {
  if (chosen.includes(next)) throw new Error(`Fighting style ${next} is already chosen`);
  return [...chosen, next];
}

export function styleArmorClassBonus(chosen: readonly FightingStyleId[], context: { wearingArmor: boolean }): number {
  return chosen.includes("defense") && context.wearingArmor ? 1 : 0;
}

export function styleAttackBonus(chosen: readonly FightingStyleId[], context: { rangedWeapon: boolean }): number {
  return chosen.includes("archery") && context.rangedWeapon ? 2 : 0;
}

/** Dueling: a melee weapon in one hand and no other weapon. */
export function styleDamageBonus(chosen: readonly FightingStyleId[], context: { meleeWeaponInOneHandOnly: boolean }): number {
  return chosen.includes("dueling") && context.meleeWeaponInOneHandOnly ? 2 : 0;
}

/**
 * Damage modifier of the off-hand attack. The SRD does not add the ability modifier to it unless the modifier is
 * negative; the Two-Weapon Fighting style adds it in every case.
 */
export function offHandDamageModifier(chosen: readonly FightingStyleId[], abilityModifier: number): number {
  if (!Number.isSafeInteger(abilityModifier)) throw new RangeError("Ability modifier must be a whole number");
  if (chosen.includes("two-weapon-fighting")) return abilityModifier;
  return abilityModifier < 0 ? abilityModifier : 0;
}

/**
 * Great weapon fighting: each damage die that shows 1 or 2 is rolled again once, and the new result stands.
 * Only for a melee weapon held in two hands that is two-handed or versatile.
 */
export function rerollLowDamageDice(
  chosen: readonly FightingStyleId[],
  dice: readonly number[],
  sides: number,
  context: { qualifyingWeapon: boolean },
  rng: Rng,
): number[] {
  if (!chosen.includes("great-weapon-fighting") || !context.qualifyingWeapon) return [...dice];
  return dice.map((value) => (value <= 2 ? rng.int(1, sides) : value));
}
