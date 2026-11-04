import type { TableScene, TokenView } from "@phoenix/shared";
import { tokenRect, type Point } from "./geometry";

type Grid = Pick<TableScene, "gridPx" | "gridOffsetX" | "gridOffsetY">;
export type Rect = { x: number; y: number; w: number; h: number };

/** The rectangle between two corners, whichever way it was dragged. */
export function rectBetween(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/**
 * What is selected after a rectangle or a lasso has been drawn. Without Shift the shape replaces the selection. With
 * Shift it works on it: the tokens inside the shape that were not selected are added, and the ones that already were are
 * taken away, like Shift-click does for a single token.
 */
export function combineSelection(before: ReadonlySet<string>, inside: readonly string[], additive: boolean): string[] {
  if (!additive) return [...inside];
  const result = new Set(before);
  for (const id of inside) {
    if (before.has(id)) result.delete(id);
    else result.add(id);
  }
  return [...result];
}

/** Every token the rectangle touches. */
export function tokensInRect(scene: Grid, tokens: readonly TokenView[], rect: Rect): TokenView[] {
  return tokens.filter((t) => {
    const r = tokenRect(scene, t);
    return r.x < rect.x + rect.w && r.x + r.w > rect.x && r.y < rect.y + rect.h && r.y + r.h > rect.y;
  });
}

/** Whether a point is inside a polygon (ray casting); a polygon needs at least three corners. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Every token whose middle is inside the loop drawn with the lasso. */
export function tokensInLasso(scene: Grid, tokens: readonly TokenView[], loop: readonly Point[]): TokenView[] {
  return tokens.filter((t) => {
    const r = tokenRect(scene, t);
    return pointInPolygon({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, loop);
  });
}
