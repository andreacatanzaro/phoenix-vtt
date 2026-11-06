const key = (accountId: string): string => `phoenix.last-world.${accountId}`;

/** The world this account opened last in this browser, if the browser lets us remember it. A convenience: the page works without it. */
export function lastWorld(accountId: string): string | null {
  try {
    return localStorage.getItem(key(accountId));
  } catch {
    return null;
  }
}

export function rememberWorld(accountId: string, worldId: string): void {
  try {
    localStorage.setItem(key(accountId), worldId);
  } catch {
    // Nothing to do: it is only a shortcut.
  }
}
