import { MAX_GRID_PX, MIN_GRID_PX } from "@phoenix/shared";
import type { Point } from "./geometry";

/**
 * Aligning a map to the grid, in the three steps of Owlbear Rodeo. The state is one crossing of the grid (the anchor,
 * in pixels of the map) and the size of a square; every other crossing follows from them.
 */
export type AlignState = { anchor: Point; size: number };
/** A crossing of the grid, counted in squares from the anchor. */
export type Crossing = { i: number; j: number };
export type AlignStep = "offset" | "size" | "refine";
export type AlignHandle = { kind: "anchor" } | { kind: "corner" } | { kind: "crossing"; crossing: Crossing };
export type GridValues = { gridPx: number; gridOffsetX: number; gridOffsetY: number };

const clampSize = (size: number): number => Math.max(MIN_GRID_PX, Math.min(MAX_GRID_PX, size));
const twoDecimals = (n: number): number => Math.round(n * 100) / 100;

/** The start: the anchor in the middle of the map and the square the scene already has. */
export function startAlign(map: { w: number; h: number }, size: number): AlignState {
  return { anchor: { x: map.w / 2, y: map.h / 2 }, size: clampSize(size) };
}

/** Step "Size": the square runs from the anchor to the corner, so it is as wide as the corner is far, on the longer side. */
export function resizeFromCorner(state: AlignState, corner: Point): AlignState {
  const side = Math.max(Math.abs(corner.x - state.anchor.x), Math.abs(corner.y - state.anchor.y));
  return { anchor: state.anchor, size: clampSize(Math.round(side)) };
}

/** What goes into the scene: the size, and the offset that makes the anchor fall on a crossing (between 0 and the size). */
export function gridOf(state: AlignState): GridValues {
  const wrap = (n: number): number => twoDecimals(((n % state.size) + state.size) % state.size);
  return { gridPx: twoDecimals(state.size), gridOffsetX: wrap(state.anchor.x), gridOffsetY: wrap(state.anchor.y) };
}

/** The crossing closest to a point of the map. */
export function nearestIntersection(state: AlignState, p: Point): Crossing {
  return { i: Math.round((p.x - state.anchor.x) / state.size) + 0, j: Math.round((p.y - state.anchor.y) / state.size) + 0 };
}

/** Where a crossing is, in pixels of the map. */
export function crossingPoint(state: AlignState, crossing: Crossing): Point {
  return { x: state.anchor.x + crossing.i * state.size, y: state.anchor.y + crossing.j * state.size };
}

/**
 * Step "Refine": a crossing is moved to `to`. The anchor stays, and the size changes so that the crossing lands there:
 * the change is spread over all the squares between, which is what corrects a drift far from the anchor.
 */
export function refine(state: AlignState, crossing: Crossing, to: Point): AlignState {
  const sizes: number[] = [];
  if (crossing.i !== 0) sizes.push((to.x - state.anchor.x) / crossing.i);
  if (crossing.j !== 0) sizes.push((to.y - state.anchor.y) / crossing.j);
  if (sizes.length === 0) return state;
  const size = sizes.reduce((sum, s) => sum + s, 0) / sizes.length;
  return { anchor: state.anchor, size: clampSize(size) };
}

/** How close to a handle, in pixels of the screen, a pointer has to be to take it. */
export const HANDLE_PX = 16;

/** The handle a pointer at `p` (pixels of the map) would take in this step, if any. `zoom` keeps the reach the same on the screen. */
export function handleAt(step: AlignStep, state: AlignState, p: Point, zoom: number): AlignHandle | null {
  const reach = HANDLE_PX / zoom;
  const near = (q: Point): boolean => Math.hypot(p.x - q.x, p.y - q.y) <= reach;
  if (step === "offset") return near(state.anchor) ? { kind: "anchor" } : null;
  if (step === "size") return near({ x: state.anchor.x + state.size, y: state.anchor.y + state.size }) ? { kind: "corner" } : null;
  const crossing = nearestIntersection(state, p);
  if (crossing.i === 0 && crossing.j === 0) return null;
  return near(crossingPoint(state, crossing)) ? { kind: "crossing", crossing } : null;
}

/** What the state becomes when a handle is dragged to `p`. `base` is the state when the drag began, so the drag does not add up. */
export function dragTo(handle: AlignHandle, base: AlignState, p: Point): AlignState {
  if (handle.kind === "anchor") return { anchor: p, size: base.size };
  if (handle.kind === "corner") return resizeFromCorner(base, p);
  return refine(base, handle.crossing, p);
}
