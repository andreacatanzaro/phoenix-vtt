/** How long to wait before asking again for a picture that failed to load. */
export const RETRY_MS = 5000;

/**
 * Keeps the pictures already loaded and shares a load that is under way. A failure is remembered only for a few seconds:
 * a network blip or a server hiccup must not leave a map or a face missing until the screen is closed.
 */
export class TextureCache<T> {
  private readonly loaded = new Map<string, T>();
  private readonly failedAt = new Map<string, number>();
  private readonly loading = new Map<string, Promise<T | null>>();

  constructor(
    private readonly now: () => number,
    private readonly retryMs = RETRY_MS,
  ) {}

  /** The picture, or null while it cannot be had (loading failed less than `retryMs` ago, or fails now). */
  get(id: string, load: () => Promise<T>): Promise<T | null> {
    const have = this.loaded.get(id);
    if (have !== undefined) return Promise.resolve(have);
    const failed = this.failedAt.get(id);
    if (failed !== undefined && this.now() - failed < this.retryMs) return Promise.resolve(null);
    const running = this.loading.get(id);
    if (running !== undefined) return running;
    const started = load().then(
      (texture) => {
        this.loaded.set(id, texture);
        this.failedAt.delete(id);
        this.loading.delete(id);
        return texture;
      },
      () => {
        this.failedAt.set(id, this.now());
        this.loading.delete(id);
        return null;
      },
    );
    this.loading.set(id, started);
    return started;
  }
}
