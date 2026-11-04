export const TOOLS = ["move", "select", "measure", "pointer", "text", "start"] as const;
export type Tool = (typeof TOOLS)[number];
export type SelectMode = "rectangle" | "lasso";
export type MeasureMode = "ruler" | "radius";

/** The key that picks each tool, as on Owlbear Rodeo: W, S, M, Q, T; the start zone, only in the preparation, is Z. */
export const TOOL_KEYS: Record<Tool, string> = { move: "w", select: "s", measure: "m", pointer: "q", text: "t", start: "z" };

/**
 * The tools a person has. The text is the DM's; the start zone belongs to the preparation of a scene, where there is no
 * pointer to show because nobody else is there.
 */
export function toolsFor({ isDm, preparing }: { isDm: boolean; preparing: boolean }): Tool[] {
  return TOOLS.filter((name) => {
    if (name === "text") return isDm;
    if (name === "start") return isDm && preparing;
    if (name === "pointer") return !preparing;
    return true;
  });
}

/** The tool a key picks, if any. Case does not matter. */
export function toolForKey(key: string): Tool | null {
  const lower = key.toLowerCase();
  return TOOLS.find((t) => TOOL_KEYS[t] === lower) ?? null;
}

/** Whether a key press is meant for the board and not for something being typed into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}
