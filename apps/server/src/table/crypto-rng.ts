import { randomInt } from "node:crypto";
import type { Rng } from "@phoenix/rules-core";

/** The server's source of dice: cryptographically random, never the clients'. */
export function createCryptoRng(): Rng {
  return {
    int(min, max) {
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) throw new RangeError(`Invalid range [${String(min)}, ${String(max)}]`);
      return randomInt(min, max + 1);
    },
  };
}
