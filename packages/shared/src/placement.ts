export type Zone = { x: number; y: number; w: number; h: number };
export type Footprint = { id: string; size: number };
export type Placed = { id: string; x: number; y: number };

const OVERFLOW_ROWS = 64;

/**
 * Puts tokens in the first free squares of a zone, left to right and top to bottom, each one needing a square of its
 * own size. `occupied` holds the squares already taken ("x,y"). If the zone is full the rest go on the rows below it,
 * so nobody is left out and nobody lands on another token.
 */
export function placeInZone(zone: Zone, tokens: readonly Footprint[], occupied: ReadonlySet<string>): Placed[] {
  const taken = new Set(occupied);
  const placed: Placed[] = [];
  const free = (x: number, y: number, size: number): boolean => {
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (taken.has(`${String(x + dx)},${String(y + dy)}`)) return false;
    return true;
  };
  for (const token of tokens) {
    let spot: { x: number; y: number } | null = null;
    for (let row = 0; row < zone.h + OVERFLOW_ROWS && spot === null; row++) {
      for (let col = 0; col < zone.w && spot === null; col++) {
        const x = zone.x + col;
        const y = zone.y + row;
        if (col + token.size <= zone.w && free(x, y, token.size)) spot = { x, y };
      }
    }
    // A token wider than the zone still has to go somewhere: its own row, from the zone's left edge.
    for (let row = zone.h; row < zone.h + OVERFLOW_ROWS * 2 && spot === null; row++) {
      if (free(zone.x, zone.y + row, token.size)) spot = { x: zone.x, y: zone.y + row };
    }
    if (spot === null) throw new Error("No room to place the token");
    for (let dx = 0; dx < token.size; dx++) for (let dy = 0; dy < token.size; dy++) taken.add(`${String(spot.x + dx)},${String(spot.y + dy)}`);
    placed.push({ id: token.id, x: spot.x, y: spot.y });
  }
  return placed;
}

/** The squares a token covers, as "x,y" keys. */
export function squaresOf(token: { x: number; y: number; size: number }): string[] {
  const out: string[] = [];
  for (let dx = 0; dx < token.size; dx++) for (let dy = 0; dy < token.size; dy++) out.push(`${String(token.x + dx)},${String(token.y + dy)}`);
  return out;
}

/** The first free square of a zone for a token of this size, left to right and top to bottom. */
export function firstFreeSpot(zone: Zone, size: number, occupied: readonly { x: number; y: number; size: number }[]): { x: number; y: number } {
  const taken = new Set(occupied.flatMap(squaresOf));
  const [spot] = placeInZone(zone, [{ id: "new", size }], taken);
  if (spot === undefined) throw new Error("No room to place the token");
  return { x: spot.x, y: spot.y };
}
