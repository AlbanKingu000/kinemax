import { describe, expect, it } from 'vitest';
import { EnvError, readEnv } from '../src/config/env.js';

const DEV_URL = 'postgresql://kinemax:secret@127.0.0.1:5432/kinemax?schema=public';
const TEST_URL = 'postgresql://kinemax:secret@127.0.0.1:5432/kinemax_test?schema=public';

function errorOf(fn: () => unknown): EnvError {
  try {
    fn();
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error('expected readEnv to throw');
}

describe('readEnv', () => {
  it('applies defaults', () => {
    expect(readEnv({ DATABASE_URL: DEV_URL })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3001,
      DATABASE_URL: DEV_URL,
      CORS_ALLOWED_ORIGINS: [],
      APP_ORIGIN: 'http://localhost:5180',
      COOKIE_SECURE: false,
      TRUST_PROXY: 0,
    });
  });

  it('parses explicit values', () => {
    const env = readEnv({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '8080',
      DATABASE_URL: DEV_URL,
      CORS_ALLOWED_ORIGINS: 'https://kinemax.example, http://localhost:5173',
      APP_ORIGIN: 'https://kinemax.example',
      CSRF_SECRET: 'c'.repeat(32),
      TRUST_PROXY: '1',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['https://kinemax.example', 'http://localhost:5173']);
    expect(env).toMatchObject({
      APP_ORIGIN: 'https://kinemax.example',
      COOKIE_SECURE: true,
      CSRF_SECRET: 'c'.repeat(32),
      TRUST_PROXY: 1,
    });
  });

  it('requires https APP_ORIGIN, CSRF_SECRET and secure cookies in production', () => {
    const error = errorOf(() =>
      readEnv({
        NODE_ENV: 'production',
        DATABASE_URL: DEV_URL,
        APP_ORIGIN: 'http://kinemax.example',
        COOKIE_SECURE: 'false',
      }),
    );
    expect(error.message).toContain('APP_ORIGIN: is required and must use https in production');
    expect(error.message).toContain('COOKIE_SECURE: cannot be false in production');
    expect(error.message).toContain('CSRF_SECRET: is required in production');
    expect(
      errorOf(() => readEnv({ NODE_ENV: 'production', DATABASE_URL: DEV_URL })).message,
    ).toContain('APP_ORIGIN');
  });

  it('validates APP_ORIGIN, COOKIE_SECURE, CSRF_SECRET and TRUST_PROXY', () => {
    const message = errorOf(() =>
      readEnv({
        DATABASE_URL: DEV_URL,
        APP_ORIGIN: 'http://localhost:5180/path',
        COOKIE_SECURE: 'yes',
        CSRF_SECRET: 'too-short',
        TRUST_PROXY: '-1',
      }),
    ).message;
    for (const key of ['APP_ORIGIN', 'COOKIE_SECURE', 'CSRF_SECRET', 'TRUST_PROXY']) {
      expect(message).toContain(key);
    }
    expect(readEnv({ DATABASE_URL: DEV_URL, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
  });

  it('fails fast with a clear message when DATABASE_URL is missing', () => {
    const error = errorOf(() => readEnv({}));
    expect(error.message).toContain('Invalid environment configuration');
    expect(error.message).toContain('DATABASE_URL: is required');
  });

  it('rejects a non-postgres DATABASE_URL without printing its value', () => {
    const error = errorOf(() => readEnv({ DATABASE_URL: 'mysql://root:hunter2@db/kinemax' }));
    expect(error.message).toContain('DATABASE_URL: must be a postgresql:// URL');
    expect(error.message).not.toContain('hunter2');
  });

  it('requires a _test database when NODE_ENV=test', () => {
    const error = errorOf(() => readEnv({ NODE_ENV: 'test', DATABASE_URL: DEV_URL }));
    expect(error.message).toContain('ending in "_test"');
    expect(readEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_URL }).NODE_ENV).toBe('test');
  });

  it.each(['*', 'https://*.example.com', 'https://kinemax.example/path', 'ftp://kinemax.example'])(
    'rejects the CORS origin %s',
    (origin) => {
      const error = errorOf(() => readEnv({ DATABASE_URL: DEV_URL, CORS_ALLOWED_ORIGINS: origin }));
      expect(error.message).toContain('CORS_ALLOWED_ORIGINS');
    },
  );

  it('rejects invalid ports and node environments', () => {
    expect(errorOf(() => readEnv({ DATABASE_URL: DEV_URL, PORT: '70000' })).message).toContain(
      'PORT',
    );
    expect(
      errorOf(() => readEnv({ DATABASE_URL: DEV_URL, NODE_ENV: 'staging' })).message,
    ).toContain('NODE_ENV');
  });
});
