import { CELL_METERS } from "@phoenix/shared";
import type { TableScene } from "@phoenix/shared";
import { cellAt, type Point } from "./geometry";

type Grid = Pick<TableScene, "gridPx" | "gridOffsetX" | "gridOffsetY">;

/** The middle of the square a point falls in: measuring starts and ends on squares, like the tokens do. */
export function cellCenter(scene: Grid, p: Point): Point {
  const cell = cellAt(scene, p);
  return { x: scene.gridOffsetX + (cell.x + 0.5) * scene.gridPx, y: scene.gridOffsetY + (cell.y + 0.5) * scene.gridPx };
}

/**
 * The distance of a ruler from `a` to `b` the way the 5e board counts it: both ends on the middle of a square, and a
 * diagonal step costs the same as a straight one (a "chessboard" count). The result is in squares and in meters.
 */
export function rulerDistance(scene: Grid, a: Point, b: Point): { cells: number; meters: number; from: Point; to: Point } {
  const from = cellCenter(scene, a);
  const to = cellCenter(scene, b);
  const cells = Math.round(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / scene.gridPx);
  return { cells, meters: cells * CELL_METERS, from, to };
}

/** The radius of a circle drawn from the middle of a square out to a point, in squares (to the nearest half) and meters. */
export function radiusDistance(scene: Grid, center: Point, edge: Point): { cells: number; meters: number; center: Point; px: number } {
  const middle = cellCenter(scene, center);
  const px = Math.hypot(edge.x - middle.x, edge.y - middle.y);
  const cells = Math.round((px / scene.gridPx) * 2) / 2;
  return { cells, meters: cells * CELL_METERS, center: middle, px };
}

const meterFormat = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/** "4,5 m": meters with the Italian comma. */
export function formatMeters(meters: number): string {
  return `${meterFormat.format(meters)} m`;
}
