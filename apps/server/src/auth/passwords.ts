import argon2 from "argon2";

/** Argon2id with the library's current defaults. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // A malformed stored hash must not crash the login: it simply does not match.
    return false;
  }
}

/** Verified against when the username does not exist, so a missing user takes as long as a wrong password. */
export const DUMMY_HASH_PROMISE: Promise<string> = hashPassword("not-a-real-password-for-timing");
