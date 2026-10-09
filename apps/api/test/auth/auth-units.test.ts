import { describe, expect, it, vi } from 'vitest';
import { cookieSettings } from '../../src/auth/auth-config.js';
import { createCsrfTokens } from '../../src/auth/csrf.js';
import { checkPasswordPolicy } from '../../src/auth/password-policy.js';
import { AUTH_RATE_LIMITS, createRateLimiter } from '../../src/auth/rate-limit.js';
import { generateSessionToken, hashToken, isWellFormedToken } from '../../src/auth/tokens.js';
import { parseCookieHeader } from '../../src/http/cookies.js';
import { consoleLogger, maskEmail } from '../../src/logger.js';

describe('session tokens', () => {
  it('are 32 random bytes in base64url, stored only as a SHA-256 hash', () => {
    const tokens = new Set(Array.from({ length: 200 }, generateSessionToken));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(isWellFormedToken(token)).toBe(true);
    const token = generateSessionToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toContain(token);
  });

  it('rejects malformed cookie values', () => {
    for (const value of [undefined, '', 'short', 'x'.repeat(44), `${'a'.repeat(42)}=`]) {
      expect(isWellFormedToken(value)).toBe(false);
    }
  });
});

describe('CSRF tokens', () => {
  const csrf = createCsrfTokens('unit-test-secret-unit-test-secret-1234');

  it('verify only for the binding they were issued for', () => {
    const token = csrf.issue('session-a');
    expect(csrf.verify(token, 'session-a')).toBe(true);
    expect(csrf.verify(token, 'session-b')).toBe(false);
    expect(csrf.verify(token, undefined)).toBe(false);
    expect(csrf.issue('session-a')).not.toBe(token); // random nonce per token
  });

  it('reject tampered, malformed and foreign-secret tokens', () => {
    const token = csrf.issue('s');
    const [nonce, mac] = token.split('.');
    expect(csrf.verify(`${nonce ?? ''}x.${mac ?? ''}`, 's')).toBe(false);
    expect(csrf.verify(`${nonce ?? ''}.${mac ?? ''}x`, 's')).toBe(false);
    for (const bad of [undefined, '', 'nodot', '.', 'a.b.c', 'x'.repeat(300)]) {
      expect(csrf.verify(bad, 's')).toBe(false);
    }
    const other = createCsrfTokens('another-secret-another-secret-123456');
    expect(other.verify(token, 's')).toBe(false);
  });
});

describe('rate limiter', () => {
  it('allows max hits per window, then reports Retry-After until the window resets', () => {
    let time = 0;
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 }, () => time);
    expect(limiter.hit('k').allowed).toBe(true);
    expect(limiter.hit('k').allowed).toBe(true);
    time = 15_000;
    expect(limiter.hit('k')).toEqual({ allowed: false, retryAfterSeconds: 45 });
    expect(limiter.hit('other').allowed).toBe(true);
    time = 60_000;
    expect(limiter.hit('k').allowed).toBe(true);
  });

  it('can be reset per key and prunes old buckets', () => {
    let time = 0;
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1 }, () => time);
    limiter.hit('a');
    expect(limiter.hit('a').allowed).toBe(false);
    limiter.reset('a');
    expect(limiter.hit('a').allowed).toBe(true);
    time = 5_000;
    expect(limiter.hit('b').allowed).toBe(true);
    expect(limiter.hit('a').allowed).toBe(true);
  });

  it('documents the configured limits', () => {
    expect(AUTH_RATE_LIMITS.loginPerEmailAndIp).toEqual({ windowMs: 15 * 60_000, max: 5 });
    expect(AUTH_RATE_LIMITS.loginPerIp.max).toBeGreaterThan(
      AUTH_RATE_LIMITS.loginPerEmailAndIp.max,
    );
  });
});

describe('parseCookieHeader', () => {
  it('parses pairs, keeps the first duplicate and skips garbage', () => {
    expect(parseCookieHeader('a=1; b="quoted"; a=2; =x; broken; c=%E2%9C%93; d=%E0%A4%A')).toEqual({
      a: '1',
      b: 'quoted',
      c: '✓',
    });
    expect(parseCookieHeader(undefined)).toEqual({});
  });
});

describe('password policy', () => {
  it('accepts long, uncommon passwords', () => {
    expect(checkPasswordPolicy('a-long-unique-passphrase', 'ana@kinemax.test')).toEqual([]);
  });

  it('rejects short, too long, common and email-like passwords', () => {
    expect(checkPasswordPolicy('short', 'a@b.test')).toEqual(['too_short']);
    expect(checkPasswordPolicy('x'.repeat(129), 'a@b.test')).toEqual(['too_long']);
    expect(checkPasswordPolicy('QwertyUiop', 'a@b.test')).toEqual(['too_common']);
    expect(checkPasswordPolicy('Fjalekalimi123', 'a@b.test')).toEqual(['too_common']);
    expect(checkPasswordPolicy('Ana.Kelmendi@Kinemax.test', 'ana.kelmendi@kinemax.test')).toEqual([
      'same_as_email',
    ]);
    expect(checkPasswordPolicy('ana.kelmendi', 'ana.kelmendi@kinemax.test')).toEqual([
      'same_as_email',
    ]);
  });

  it('counts characters, not bytes', () => {
    expect(checkPasswordPolicy('ëëëëëëëëëë', 'a@b.test')).toEqual([]);
  });
});

describe('logging helpers', () => {
  it('masks emails', () => {
    expect(maskEmail('ana.demo@kinemax.test')).toBe('a***@kinemax.test');
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@x.test')).toBe('***');
  });

  it('consoleLogger.warn writes a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleLogger.warn('careful', { a: 1 });
    consoleLogger.warn('plain');
    expect(warn).toHaveBeenCalledWith('careful', { a: 1 });
    expect(warn).toHaveBeenCalledWith('plain');
    warn.mockRestore();
  });
});

describe('cookie settings', () => {
  it('uses __Host- names only with Secure', () => {
    expect(cookieSettings(true)).toEqual({
      secure: true,
      sessionCookieName: '__Host-kinemax_session',
      csrfCookieName: '__Host-kinemax_csrf',
    });
    expect(cookieSettings(false).sessionCookieName).toBe('kinemax_session');
  });
});
