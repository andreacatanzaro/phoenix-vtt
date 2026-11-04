import { RateLimiter } from "./rate-limit";

export type Admission = "run" | "refuse" | "close";

/**
 * Decides, when a frame arrives and before it is queued, whether it is worth keeping: a connection may send only so many
 * commands in a while, and may have only so many waiting at once. Whoever keeps pushing past the limit is cut off, so a
 * flood cannot fill the memory with frames that will be refused anyway.
 */
export class FrameGate {
  private readonly limiter: RateLimiter;
  private pending = 0;
  private refused = 0;

  constructor(
    private readonly limit: number,
    windowMs: number,
    private readonly maxPending: number,
  ) {
    this.limiter = new RateLimiter(limit, windowMs);
  }

  /** "run": queue it (and call `finished` when it is done). "refuse": answer with an error. "close": hang up. */
  admit(nowMs: number): Admission {
    if (this.pending >= this.maxPending) return "close";
    if (!this.limiter.allow(nowMs)) {
      this.refused += 1;
      return this.refused > this.limit ? "close" : "refuse";
    }
    this.refused = 0;
    this.pending += 1;
    return "run";
  }

  finished(): void {
    this.pending = Math.max(0, this.pending - 1);
  }
}
