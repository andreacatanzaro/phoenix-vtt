import type { MapPoint } from "@phoenix/shared";

/** The rectangle a map picture takes on the screen. */
export type MapBox = { left: number; top: number; width: number; height: number };

/** How close, in pixels, the pointer must be to the first point of a shape being drawn to close it. */
export const CLOSE_PX = 14;

/** A place on the screen as a place on the picture: a fraction of its width and height, kept on the picture. */
export function toMapPoint(box: MapBox, screen: { x: number; y: number }): MapPoint {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  const fraction = (value: number): number => Math.max(0, Math.min(1, value));
  return { x: fraction((screen.x - box.left) / box.width), y: fraction((screen.y - box.top) / box.height) };
}

/** Whether a click at `screen` closes the shape being drawn: it needs three points, and the click near the first one. */
export function closesPolygon(box: MapBox, points: readonly MapPoint[], first: MapPoint, screen: { x: number; y: number }): boolean {
  if (points.length < 3) return false;
  const dx = box.left + first.x * box.width - screen.x;
  const dy = box.top + first.y * box.height - screen.y;
  return Math.hypot(dx, dy) <= CLOSE_PX;
}

/**
 * The `points` attribute of a polygon drawn in a box one unit high and `width` units wide (the shape of the picture, so
 * what is drawn on it is not stretched): the x of a point is a fraction of that width.
 */
export function polygonAttribute(points: readonly MapPoint[], width = 1): string {
  return points.map((p) => `${String(p.x * width)},${String(p.y)}`).join(" ");
}

/** The drawing of an exit: the line, and the head at its end as the `points` of a triangle, in the units of the box. */
export type Arrow = { line: { x1: number; y1: number; x2: number; y2: number }; head: string };

/** How far an arrow stays from the pin at each end, and the size of its head, in the units of the box (one unit high). */
export const ARROW_INSET = 0.03;
export const ARROW_HEAD = 0.025;
/** How far an arrow is moved to the side when the exit goes both ways, so the two do not lie on the same line. */
export const ARROW_SIDE = 0.015;

/**
 * The arrow that goes from one pin to another on a picture `width` units wide and one high. It stops short of both pins and
 * has a head at the end; where the pins are too close for that to be seen it is nothing. `side` moves it to the right of its
 * way by that much (the other way of a reciprocal exit then goes on the other side).
 */
export function arrowShape(from: MapPoint, to: MapPoint, width: number, side = 0): Arrow | null {
  const ax = from.x * width;
  const bx = to.x * width;
  const dx = bx - ax;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= ARROW_INSET * 2 + ARROW_HEAD) return null;
  const ux = dx / length;
  const uy = dy / length;
  // To the right of the way it goes: at right angles to it, turned clockwise (the picture's y grows downwards).
  const sx = -uy * side;
  const sy = ux * side;
  const x2 = bx - ux * ARROW_INSET + sx;
  const y2 = to.y - uy * ARROW_INSET + sy;
  const baseX = x2 - ux * ARROW_HEAD;
  const baseY = y2 - uy * ARROW_HEAD;
  // The head is a triangle: the tip, and two corners either side of the base, at right angles to the line.
  const wing = ARROW_HEAD / 2;
  const head = [`${String(x2)},${String(y2)}`, `${String(baseX - uy * wing)},${String(baseY + ux * wing)}`, `${String(baseX + uy * wing)},${String(baseY - ux * wing)}`].join(" ");
  return { line: { x1: ax + ux * ARROW_INSET + sx, y1: from.y + uy * ARROW_INSET + sy, x2, y2 }, head };
}
