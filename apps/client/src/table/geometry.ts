import type { TableScene, TokenView } from "@phoenix/shared";

/** How the board is shown: `zoom` times the scene, with the scene's origin moved to (panX, panY) on the screen. */
export type View = { zoom: number; panX: number; panY: number };
export type Point = { x: number; y: number };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;
/** Squares shown when a scene has no map yet. */
export const EMPTY_BOARD_CELLS = { w: 30, h: 20 };
export const MAX_CELL = 1000;

export function toScreen(view: View, p: Point): Point {
  return { x: p.x * view.zoom + view.panX, y: p.y * view.zoom + view.panY };
}

export function toScene(view: View, p: Point): Point {
  return { x: (p.x - view.panX) / view.zoom, y: (p.y - view.panY) / view.zoom };
}

/** The size of the board in scene pixels: the map, or a plain grid when there is none. */
export function boardSize(scene: Pick<TableScene, "mapWidth" | "mapHeight" | "gridPx">): { w: number; h: number } {
  if (scene.mapWidth !== null && scene.mapHeight !== null) return { w: scene.mapWidth, h: scene.mapHeight };
  return { w: EMPTY_BOARD_CELLS.w * scene.gridPx, h: EMPTY_BOARD_CELLS.h * scene.gridPx };
}

/** The square a point of the scene falls in. */
export function cellAt(scene: Pick<TableScene, "gridPx" | "gridOffsetX" | "gridOffsetY">, p: Point): Point {
  return { x: Math.floor((p.x - scene.gridOffsetX) / scene.gridPx), y: Math.floor((p.y - scene.gridOffsetY) / scene.gridPx) };
}

export function clampCell(cell: Point): Point {
  const clamp = (n: number): number => Math.max(-MAX_CELL, Math.min(MAX_CELL, n));
  return { x: clamp(cell.x), y: clamp(cell.y) };
}

/** Where a token sits in the scene, in pixels. */
export function tokenRect(scene: Pick<TableScene, "gridPx" | "gridOffsetX" | "gridOffsetY">, token: Pick<TokenView, "x" | "y" | "size">): { x: number; y: number; w: number; h: number } {
  return { x: scene.gridOffsetX + token.x * scene.gridPx, y: scene.gridOffsetY + token.y * scene.gridPx, w: token.size * scene.gridPx, h: token.size * scene.gridPx };
}

/** The token on top at a point of the scene (the last one drawn), if any. */
export function tokenAt(scene: Pick<TableScene, "gridPx" | "gridOffsetX" | "gridOffsetY">, tokens: readonly TokenView[], p: Point): TokenView | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token === undefined) continue;
    const r = tokenRect(scene, token);
    if (p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) return token;
  }
  return null;
}

/** Zooms by `factor` keeping the point under `anchor` (screen pixels) where it is. */
export function zoomAt(view: View, factor: number, anchor: Point): View {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
  const real = zoom / view.zoom;
  return { zoom, panX: anchor.x - (anchor.x - view.panX) * real, panY: anchor.y - (anchor.y - view.panY) * real };
}

/** The view that shows the whole board, centered in a screen of the given size. */
export function fitView(board: { w: number; h: number }, screen: { w: number; h: number }): View {
  if (board.w <= 0 || board.h <= 0 || screen.w <= 0 || screen.h <= 0) return { zoom: 1, panX: 0, panY: 0 };
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(screen.w / board.w, screen.h / board.h)));
  return { zoom, panX: (screen.w - board.w * zoom) / 2, panY: (screen.h - board.h * zoom) / 2 };
}

/** Where a drag that started on `start` and is now at `now` leaves the view. */
export function panBy(view: View, start: Point, now: Point): View {
  return { ...view, panX: view.panX + (now.x - start.x), panY: view.panY + (now.y - start.y) };
}
