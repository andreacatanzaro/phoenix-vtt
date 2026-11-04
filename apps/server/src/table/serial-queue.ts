/**
 * Runs the jobs of one key one after the other, in the order they were asked, whatever connection they come from.
 * A job that fails does not stop the ones behind it. Keys with nothing waiting are forgotten.
 */
export class SerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>();
  private readonly waiting = new Map<string, number>();

  run<T>(key: string, job: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    this.waiting.set(key, (this.waiting.get(key) ?? 0) + 1);
    const result = previous.then(job, job);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    void tail.then(() => {
      const left = (this.waiting.get(key) ?? 1) - 1;
      if (left <= 0) this.waiting.delete(key);
      else this.waiting.set(key, left);
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** How many jobs of this key are running or waiting. */
  depth(key: string): number {
    return this.waiting.get(key) ?? 0;
  }

  /** How many keys still have work queued; for tests. */
  get busy(): number {
    return this.tails.size;
  }
}
