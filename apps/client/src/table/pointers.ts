import { TOKEN_COLORS, type TokenColor } from "@phoenix/shared";

/** A pointer that has not moved for this long is taken off the board. */
export const POINTER_LIFETIME_MS = 4000;

export type RemotePointer = { accountId: string; username: string; x: number; y: number; at: number };

/** The colors a person's pointer and presence may take, in order; not the black or white of the tokens. */
const PLAYER_COLORS: readonly TokenColor[] = TOKEN_COLORS.filter((c) => c !== "black" && c !== "white" && c !== "grey");

/** The same person always gets the same color, whoever looks. */
export function colorOf(accountId: string): TokenColor {
  let hash = 0;
  for (const ch of accountId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PLAYER_COLORS[hash % PLAYER_COLORS.length] ?? "gold";
}

/** The pointers by person: a new position replaces the old, `null` puts it away. */
export function movePointer(book: ReadonlyMap<string, RemotePointer>, who: { accountId: string; username: string }, x: number | null, y: number | null, now: number): Map<string, RemotePointer> {
  const next = new Map(book);
  if (x === null || y === null) next.delete(who.accountId);
  else next.set(who.accountId, { accountId: who.accountId, username: who.username, x, y, at: now });
  return next;
}

/** The pointers still worth showing at this moment. */
export function livePointers(book: ReadonlyMap<string, RemotePointer>, now: number): RemotePointer[] {
  return [...book.values()].filter((p) => now - p.at < POINTER_LIFETIME_MS);
}
