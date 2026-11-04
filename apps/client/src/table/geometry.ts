import type { TableScene, TokenView } from "@phoenix/shared";

/** How the board is shown: `zoom` times the scene, with the scene's origin moved to (panX, panY) on the screen. */
export type View = { zoom: number; panX: number; panY: number };
export type Point = { x: number; y: number };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;
/** Squares shown when a scene has no map yet. */
export const EMPTY_BOARD_CELLS = { w: 30, h: 20 };
export const MAX_CELL = 1000;

/** Whether two places (or two absent places) are the same spot, so a report that did not change can be left unsaid. */
export function samePoint(a: Point | null, b: Point | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y;
}

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

/** Characters of a text that fit in one square, at the size the board writes them. */
export const TEXT_CHARS_PER_CELL = 6;
export const TEXT_MAX_CELLS_WIDE = 12;
/** How many lines of text fit in one square. */
export const TEXT_LINES_PER_CELL = 2.5;

/** The squares a text covers, from how long it is: wide first, then taller. */
export function textCells(label: string): { w: number; h: number } {
  const w = Math.min(TEXT_MAX_CELLS_WIDE, Math.max(1, Math.ceil(label.length / TEXT_CHARS_PER_CELL)));
  const lines = Math.ceil(label.length / (w * TEXT_CHARS_PER_CELL));
  return { w, h: Math.max(1, Math.ceil(lines / TEXT_LINES_PER_CELL)) };
}

/** Where a token sits in the scene, in pixels. A text is as wide as it needs to be; a figure is square. */
export function tokenRect(
  scene: Pick<TableScene, "gridPx" | "gridOffsetX" | "gridOffsetY">,
  token: Pick<TokenView, "x" | "y" | "size"> & { kind?: TokenView["kind"]; label?: string },
): { x: number; y: number; w: number; h: number } {
  const cells = token.kind === "text" ? textCells(token.label ?? "") : { w: token.size, h: token.size };
  return { x: scene.gridOffsetX + token.x * scene.gridPx, y: scene.gridOffsetY + token.y * scene.gridPx, w: cells.w * scene.gridPx, h: cells.h * scene.gridPx };
}

/**
 * The view after the screen changed size (the window resized, the device turned): the same point stays in the middle and
 * the zoom stays, so the person does not lose the place they chose.
 */
export function keepCenterOnResize(view: View, before: { w: number; h: number }, after: { w: number; h: number }): View {
  return viewFor(viewCenter(view, before), view.zoom, after);
}

/** Where a copy of something at (x, y) goes: one square down and right, or up and left when that would leave the board. */
export function duplicateSpot(x: number, y: number): Point {
  return { x: x + 1 > MAX_CELL ? x - 1 : x + 1, y: y + 1 > MAX_CELL ? y - 1 : y + 1 };
}

/**
 * Where a group of tokens lands when it is let go after being dragged by `delta` (scene pixels): every token moves by
 * the same whole number of squares, and only the ones whose square changed are listed.
 */
export function groupDrop(scene: Pick<TableScene, "gridPx">, tokens: readonly Pick<TokenView, "id" | "x" | "y">[], delta: Point): { id: string; x: number; y: number }[] {
  const dx = Math.round(delta.x / scene.gridPx);
  const dy = Math.round(delta.y / scene.gridPx);
  return tokens.flatMap((t) => {
    const target = clampCell({ x: t.x + dx, y: t.y + dy });
    return target.x === t.x && target.y === t.y ? [] : [{ id: t.id, x: target.x, y: target.y }];
  });
}

/** The point of the scene at the middle of a screen, for the readout of the view and for syncing it. */
export function viewCenter(view: View, screen: { w: number; h: number }): Point {
  return toScene(view, { x: screen.w / 2, y: screen.h / 2 });
}

/** The view that has `center` (a point of the scene) in the middle of the screen at this zoom. */
export function viewFor(center: Point, zoom: number, screen: { w: number; h: number }): View {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  return { zoom: z, panX: screen.w / 2 - center.x * z, panY: screen.h / 2 - center.y * z };
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
