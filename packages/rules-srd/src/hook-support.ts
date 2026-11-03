import type { LogLine } from "@phoenix/rules-core";

/**
 * Priorities shared by every hook: lower runs first. Gates that can refuse an event come before the rolls,
 * and class features that adjust an event before it is resolved come before the gates.
 */
export const HOOK_PRIORITY = { early: 5, gate: 10, late: 20, resolve: 50 } as const;

/** A log line about one creature: `{actor}` is replaced by its name when shown. Extra params and refs are added. */
export function actorLine(
  key: string,
  actorId: string,
  extra: Record<string, number | string> = {},
  refs: Record<string, "text-key" | "actor-id"> = {},
): LogLine {
  return { key, params: { actor: actorId, ...extra }, refs: { actor: "actor-id", ...refs } };
}
