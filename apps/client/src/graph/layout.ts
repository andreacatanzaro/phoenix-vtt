import type { Point, View } from "../table/geometry";

/** Nodes of the graph are circles; a group is a bit bigger than a scene. */
export const GROUP_RADIUS = 78;
export const SCENE_RADIUS = 56;
/** The least distance between the middles of two nodes that are placed by the layout. */
export const NODE_GAP = 220;

/**
 * The least zoom of the graph: low enough to show the farthest places a node may have (a hundred thousand units either way)
 * on a screen of a few hundred pixels, so "show everything" always can.
 */
export const MIN_GRAPH_ZOOM = 0.002;
const MAX_ZOOM = 6;
const MAX_FIT_ZOOM = 1;
const FIT_MARGIN = 160;

/** The nth spot of a spiral that begins in the middle: every next one is on a ring a step further out. */
function spiral(n: number): Point {
  if (n === 0) return { x: 0, y: 0 };
  // Each ring takes as many spots as fit along it at the least distance between nodes.
  let ring = 1;
  let left = n - 1;
  for (;;) {
    const spots = Math.max(6, Math.floor((2 * Math.PI * ring * NODE_GAP) / NODE_GAP));
    if (left < spots) {
      const angle = -Math.PI / 2 + (left * 2 * Math.PI) / spots + (ring % 2) * (Math.PI / spots);
      return { x: Math.cos(angle) * ring * NODE_GAP, y: Math.sin(angle) * ring * NODE_GAP };
    }
    left -= spots;
    ring += 1;
  }
}

/**
 * Where each node is: where it was put if it was, and otherwise the next free spot of a spiral around the middle, kept at
 * the least distance from every other node. The same nodes always get the same spots, and a node added later takes a spot
 * that is free without moving the others.
 */
export function placeNodes(items: readonly { id: string; at: Point | null }[]): Map<string, Point> {
  const placed = new Map<string, Point>();
  const taken: Point[] = [];
  for (const item of items) {
    if (item.at !== null) {
      placed.set(item.id, item.at);
      taken.push(item.at);
    }
  }
  let next = 0;
  for (const item of items) {
    if (item.at !== null) continue;
    let spot = spiral(next);
    while (taken.some((p) => Math.hypot(p.x - spot.x, p.y - spot.y) < NODE_GAP - 1e-6)) {
      next += 1;
      spot = spiral(next);
    }
    next += 1;
    placed.set(item.id, spot);
    taken.push(spot);
  }
  return placed;
}

/** The view that shows all the points on a screen of this size: their middle in the middle, with room around. */
export function fitPoints(points: readonly Point[], screen: { w: number; h: number }): View {
  if (points.length === 0) return { zoom: 1, panX: screen.w / 2, panY: screen.h / 2 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const zoom = Math.max(MIN_GRAPH_ZOOM, Math.min(MAX_FIT_ZOOM, screen.w / (maxX - minX + FIT_MARGIN * 2), screen.h / (maxY - minY + FIT_MARGIN * 2)));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { zoom, panX: screen.w / 2 - cx * zoom, panY: screen.h / 2 - cy * zoom };
}

/** The line between two nodes, from the edge of the first to the edge of the second; nothing when they touch or overlap. */
export function edgeLine(from: Point, to: Point, fromRadius: number, toRadius: number): { x1: number; y1: number; x2: number; y2: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= fromRadius + toRadius) return null;
  const ux = dx / length;
  const uy = dy / length;
  return { x1: from.x + ux * fromRadius, y1: from.y + uy * fromRadius, x2: to.x - ux * toRadius, y2: to.y - uy * toRadius };
}

/** Zooms by `factor` keeping the point under `anchor` (screen pixels) where it is, between the limits of the graph. */
export function zoomAround(view: View, factor: number, anchor: Point): View {
  const zoom = Math.max(MIN_GRAPH_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
  const real = zoom / view.zoom;
  return { zoom, panX: anchor.x - (anchor.x - view.panX) * real, panY: anchor.y - (anchor.y - view.panY) * real };
}
