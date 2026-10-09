import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes (256 bits), base64url: the raw session token that only the cookie carries. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 of a token, hex. Only this hash is stored in the database. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Rejects cookie values that cannot be one of our tokens before touching the database. */
export function isWellFormedToken(value: string | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
