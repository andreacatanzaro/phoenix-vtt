/** At most `limit` actions in any `windowMs`, counted per connection. For a table of friends this only stops a stuck loop. */
export class RateLimiter {
  private hits: number[] = [];

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** True when the action is allowed (and counted), false when the limit is reached. */
  allow(nowMs: number): boolean {
    this.hits = this.hits.filter((t) => nowMs - t < this.windowMs);
    if (this.hits.length >= this.limit) return false;
    this.hits.push(nowMs);
    return true;
  }
}
