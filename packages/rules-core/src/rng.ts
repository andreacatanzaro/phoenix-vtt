/** Source of randomness injected by the context. The engine never calls Math.random. */
export interface Rng {
  /** Random integer in the inclusive range [min, max]. */
  int(min: number, max: number): number;
}

function assertRange(min: number, max: number): void {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`Invalid range [${String(min)}, ${String(max)}]`);
  }
}

/** Deterministic generator (mulberry32). For tests and replays, not for production rolls. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int(min, max) {
      assertRange(min, max);
      return min + Math.floor(next() * (max - min + 1));
    },
  };
}

/** Replays fixed values, so a test can force a natural 20 or a natural 1. */
export function createScriptedRng(values: readonly number[]): Rng {
  let index = 0;
  return {
    int(min, max) {
      assertRange(min, max);
      const value = values[index];
      if (value === undefined) throw new Error("Scripted Rng exhausted");
      index += 1;
      if (value < min || value > max) {
        throw new RangeError(`Scripted value ${String(value)} outside [${String(min)}, ${String(max)}]`);
      }
      return value;
    },
  };
}
