/**
 * Whether the login of a connection is still good, for the pointer. The pointer arrives many times a second, so the
 * answer is kept for `ttlMs`; while it is being asked, every pointer waits for the same answer. When the check fails the
 * answer is "no" (the caller closes the connection), the error is reported, and the next pointer asks again.
 */
export function pointerAuth(options: { check: () => Promise<boolean>; now: () => number; ttlMs: number; onError: (error: unknown) => void }): () => Promise<boolean> {
  const { check, now, ttlMs, onError } = options;
  let known = { at: now(), ok: true };
  let asking: Promise<boolean> | null = null;
  return () => {
    if (now() - known.at < ttlMs) return Promise.resolve(known.ok);
    asking ??= check()
      .then((ok) => {
        known = { at: now(), ok };
        return ok;
      })
      .catch((error: unknown) => {
        onError(error);
        return false;
      })
      .finally(() => {
        asking = null;
      });
    return asking;
  };
}
