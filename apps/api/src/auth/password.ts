import argon2 from 'argon2';

// argon2id with the library defaults (m = 64 MiB, t = 3, p = 4), above the OWASP minimum.
const OPTIONS = { type: argon2.argon2id } as const;

/** Hashes a password with argon2id. The hash embeds its own salt and parameters. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

/** Verifies a password against a stored hash. Returns false for malformed hashes. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
