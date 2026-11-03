import type { Automation, RuleMeta, Source } from "./meta";

export const featuresMeta: RuleMeta = { automation: "full", source: "srd" };

/** When a limited-use feature gets its uses back. A long rest always restores everything a short rest does. */
export type Recharge = "short-rest" | "long-rest";

/** `fromLevel` and above give `count` uses, until a later row takes over. Rows are ordered by level. */
export type UsesRow = { fromLevel: number; count: number };

/** A class or subclass feature. Text lives in the i18n catalog under the two keys. */
export type FeatureDefinition = {
  id: string;
  nameKey: string;
  descriptionKey: string;
  source: Source;
  automation: Automation;
  /** Present only for features with limited uses. */
  uses?: { table: readonly UsesRow[]; recharge: Recharge };
  /** When `automation` is not `full`: what the system leaves to the DM, as a catalog key. */
  dmNoteKey?: string;
};

/** Uses spent so far, by feature id. A missing id means none spent. Plain data, so it survives a restart. */
export type FeatureUses = Readonly<Record<string, number>>;

export function maxUses(feature: FeatureDefinition, level: number): number {
  if (feature.uses === undefined) throw new Error(`Feature ${feature.id} has no limited uses`);
  let count = 0;
  for (const row of feature.uses.table) {
    if (level >= row.fromLevel) count = row.count;
  }
  return count;
}

export function usesLeft(feature: FeatureDefinition, level: number, spent: FeatureUses): number {
  return Math.max(0, maxUses(feature, level) - (spent[feature.id] ?? 0));
}

/** Spends one use. Throws when none is left: the caller checks `usesLeft` first or lets the DM decide. */
export function spendUse(feature: FeatureDefinition, level: number, spent: FeatureUses): FeatureUses {
  if (usesLeft(feature, level, spent) < 1) throw new Error(`No uses of ${feature.id} left`);
  return { ...spent, [feature.id]: (spent[feature.id] ?? 0) + 1 };
}

/** What a rest gives back: a short rest only the short-rest features, a long rest all of them. */
export function restoreUses(features: readonly FeatureDefinition[], spent: FeatureUses, rest: "short" | "long"): FeatureUses {
  // Entries for ids this list does not know belong to another source (another class, a magic item): they are left alone.
  const staysSpent = (id: string): boolean => {
    const feature = features.find((f) => f.id === id);
    return feature?.uses === undefined || (rest === "short" && feature.uses.recharge === "long-rest");
  };
  return Object.fromEntries(Object.entries(spent).filter(([id]) => staysSpent(id)));
}

export function validateFeature(feature: FeatureDefinition): FeatureDefinition {
  if (feature.uses !== undefined) {
    const { table } = feature.uses;
    const ordered = table.every((row, i) => Number.isInteger(row.fromLevel) && row.fromLevel >= 1 && row.count >= 1 && (i === 0 || row.fromLevel > (table[i - 1]?.fromLevel ?? 0)));
    if (table.length === 0 || !ordered) throw new RangeError(`Uses table of ${feature.id} must be ordered, with positive levels and counts`);
  }
  if (feature.automation !== "full" && feature.dmNoteKey === undefined) {
    throw new RangeError(`Feature ${feature.id} is not fully automated: say what the DM resolves`);
  }
  return feature;
}
