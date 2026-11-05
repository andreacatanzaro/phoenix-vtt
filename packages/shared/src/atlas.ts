/** A place on a map, as a fraction of its width and height (0 to 1), so it holds whatever size the picture has. */
export type MapPoint = { x: number; y: number };

const EDGE = 1e-9;

/** Whether a point is inside a polygon (the border counts as inside). Fewer than three points enclose nothing. */
export function pointInPolygon(p: MapPoint, polygon: readonly MapPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    if (onSegment(p, a, b)) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function onSegment(p: MapPoint, a: MapPoint, b: MapPoint): boolean {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > EDGE) return false;
  return p.x >= Math.min(a.x, b.x) - EDGE && p.x <= Math.max(a.x, b.x) + EDGE && p.y >= Math.min(a.y, b.y) - EDGE && p.y <= Math.max(a.y, b.y) + EDGE;
}

/** The middle of the box around a polygon: a simple place for its label. */
export function polygonCenter(polygon: readonly MapPoint[]): MapPoint {
  if (polygon.length === 0) return { x: 0, y: 0 };
  const xs = polygon.map((q) => q.x);
  const ys = polygon.map((q) => q.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
