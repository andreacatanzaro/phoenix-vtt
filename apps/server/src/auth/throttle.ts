/**
 * Failed logins per username in a sliding window, kept in memory. The service runs as one instance (the live state is in
 * memory too), so this is enough; if that ever changes, this moves to the database.
 */
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    /** Upper bound on distinct names remembered, so a flood of made-up names cannot grow the map without limit. */
    private readonly maxKeys = 10_000,
  ) {}

  /** Drops every name whose failures have all expired, then, if the map is still over its bound, the oldest names. */
  private sweep(now: number): void {
    for (const key of [...this.failures.keys()]) this.recent(key, now);
    const excess = this.failures.size - this.maxKeys;
    if (excess > 0) {
      for (const key of [...this.failures.keys()].slice(0, excess)) this.failures.delete(key);
    }
    this.lastSweep = now;
  }

  /** Number of names currently remembered (for tests and monitoring). */
  get size(): number {
    return this.failures.size;
  }

  private recent(key: string, now: number): number[] {
    const kept = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (kept.length === 0) this.failures.delete(key);
    else this.failures.set(key, kept);
    return kept;
  }

  isBlocked(key: string, now: number): boolean {
    return this.recent(key, now).length >= this.maxFailures;
  }

  recordFailure(key: string, now: number): void {
    // Once per window, or as soon as the bound is passed, so the cost of cleaning stays small.
    if (now - this.lastSweep >= this.windowMs || this.failures.size >= this.maxKeys) this.sweep(now);
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  clear(key: string): void {
    this.failures.delete(key);
  }
}
