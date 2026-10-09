// CSRF tokens: a stateless synchronizer token bound to the session.
//
// token   = nonce "." HMAC-SHA256(secret, "kinemax-csrf:v1:" + binding + ":" + nonce)
// binding = SHA-256 hash of the session token when logged in, otherwise the value of the random
//           httpOnly anonymous CSRF cookie (so login and register are protected too).
//
// The token is handed out by GET /api/auth/csrf (and login/register responses) and must come back
// in the X-CSRF-Token header. A cross-site attacker can neither read it (no CORS) nor compute it
// (unknown secret and binding), and a token from one session is useless in another.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface CsrfTokens {
  issue(binding: string): string;
  verify(token: string | undefined, binding: string | undefined): boolean;
}

export function createCsrfTokens(secret: string): CsrfTokens {
  const mac = (binding: string, nonce: string) =>
    createHmac('sha256', secret).update(`kinemax-csrf:v1:${binding}:${nonce}`).digest('base64url');

  return {
    issue(binding) {
      const nonce = randomBytes(16).toString('base64url');
      return `${nonce}.${mac(binding, nonce)}`;
    },
    verify(token, binding) {
      if (!token || !binding || token.length > 200) return false;
      const [nonce, signature, ...rest] = token.split('.');
      if (!nonce || !signature || rest.length > 0) return false;
      const expected = Buffer.from(mac(binding, nonce));
      const actual = Buffer.from(signature);
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    },
  };
}
