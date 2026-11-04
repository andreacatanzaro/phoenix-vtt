import type { Point } from "./geometry";

/** The width the text editor may take on a wide screen, the height of its row, and the margin kept from the edge. */
const EDITOR_WIDTH = "28rem";
const EDITOR_HEIGHT = "4.5rem";
const MARGIN = "0.5rem";

/**
 * Where the text editor goes: at the place that was clicked, kept inside the screen. On a screen narrower than the editor
 * the right-hand limit would be negative, so the outer `max` keeps the left edge in view (the editor itself shrinks, see
 * `.text-draft` in the style sheet).
 */
export function draftStyle(at: Point): { left: string; top: string } {
  return {
    left: `max(${MARGIN}, min(${String(at.x)}px, calc(100% - ${EDITOR_WIDTH})))`,
    top: `max(${MARGIN}, min(${String(at.y)}px, calc(100% - ${EDITOR_HEIGHT})))`,
  };
}
