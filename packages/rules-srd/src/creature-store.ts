import { isRecord, type JsonObject } from "@phoenix/rules-core";
import type { DeathStatus, VitalState } from "./death";
import type { FeatureUses } from "./features";
import type { RuleMeta } from "./meta";

export const creatureStoreMeta: RuleMeta = { automation: "full", source: "original" };

/**
 * Where a creature's rules data lives in the resolution store. Hooks read it with these helpers, never by hand,
 * so a malformed or missing entry is `null` instead of a crash.
 */
export const vitalKey = (actorId: string): string => `vital:${actorId}`;
export const turnKey = (actorId: string): string => `turn:${actorId}`;
export const usesKey = (actorId: string): string => `uses:${actorId}`;
export const classLevelKey = (actorId: string, classId: string): string => `level:${actorId}:${classId}`;
export const conModifierKey = (actorId: string): string => `con-mod:${actorId}`;
export const fightingStylesKey = (actorId: string): string => `styles:${actorId}`;
export const subclassKey = (actorId: string, classId: string): string => `subclass:${actorId}:${classId}`;

const STATUSES: readonly DeathStatus[] = ["alive", "dying", "stable", "dead"];

export function readVital(store: Readonly<JsonObject>, actorId: string): VitalState | null {
  const v = store[vitalKey(actorId)];
  if (!isRecord(v)) return null;
  const { hp, hpMax, status, successes, failures, recoversAt } = v;
  const known = STATUSES.find((s) => s === status);
  if (typeof hp !== "number" || typeof hpMax !== "number" || known === undefined || typeof successes !== "number" || typeof failures !== "number") return null;
  const base = { hp, hpMax, status: known, successes, failures };
  if (isRecord(recoversAt) && typeof recoversAt["minutes"] === "number") return { ...base, recoversAt: { minutes: recoversAt["minutes"] } };
  return base;
}

export function readUses(store: Readonly<JsonObject>, actorId: string): FeatureUses {
  const v = store[usesKey(actorId)];
  if (!isRecord(v)) return {};
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === "number"));
}

export function readClassLevel(store: Readonly<JsonObject>, actorId: string, classId: string): number | null {
  const v = store[classLevelKey(actorId, classId)];
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null;
}

/** The Constitution modifier kept for features that need it (Survivor); the sheet keeps it up to date. */
export function readConModifier(store: Readonly<JsonObject>, actorId: string): number | null {
  const v = store[conModifierKey(actorId)];
  return typeof v === "number" && Number.isSafeInteger(v) ? v : null;
}

/** The fighting styles a creature has chosen (ids), whatever class gave them. */
export function readFightingStyles(store: Readonly<JsonObject>, actorId: string): string[] {
  const v = store[fightingStylesKey(actorId)];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function readSubclass(store: Readonly<JsonObject>, actorId: string, classId: string): string | null {
  const v = store[subclassKey(actorId, classId)];
  return typeof v === "string" ? v : null;
}
