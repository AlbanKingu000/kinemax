import { z } from 'zod';
import { databaseNameFromUrl, isTestDatabaseName } from '../db/database-url.js';

const originList = z
  .string()
  .default('')
  .transform((value, ctx) => {
    const origins = value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '');
    for (const origin of origins) {
      if (!isExactOrigin(origin)) {
        ctx.addIssue({
          code: 'custom',
          message: `"${origin}" is not an exact origin like https://example.com (wildcards are not allowed)`,
        });
      }
    }
    return origins;
  });

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Where the web app is served from in development (the Vite dev server). */
export const DEV_APP_ORIGIN = 'http://localhost:5180';
export const CSRF_SECRET_MIN_LENGTH = 32;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().trim().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    DATABASE_URL: z
      .string({ error: 'is required' })
      .refine((url) => databaseNameFromUrl(url) !== undefined, {
        message: 'must be a postgresql:// URL that includes a database name',
      }),
    CORS_ALLOWED_ORIGINS: originList,
    /** The origin the browser loads the web app from; state-changing requests must come from it. */
    APP_ORIGIN: z
      .string()
      .optional()
      .refine((value) => value === undefined || isExactOrigin(value), {
        message: 'must be an exact origin like https://kinemax.example',
      }),
    /** Secure session cookies with the __Host- prefix. Defaults to true in production. */
    COOKIE_SECURE: booleanFlag.optional(),
    /** HMAC key for CSRF tokens. Required in production; otherwise a random per-process key. */
    CSRF_SECRET: z.string().min(CSRF_SECRET_MIN_LENGTH).optional(),
    /** Number of reverse proxies in front of the API whose X-Forwarded-For is trusted. */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    /** Directory for uploaded movie images; default: uploads/ in the repository (git-ignored). */
    UPLOADS_DIR: z.string().trim().min(1).optional(),
    /** The built web app (apps/web/dist) to serve from the API; unset: API only (reverse proxy). */
    WEB_DIST_DIR: z.string().trim().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    const name = databaseNameFromUrl(env.DATABASE_URL);
    if (env.NODE_ENV === 'test' && name !== undefined && !isTestDatabaseName(name)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: `must point at a database ending in "_test" when NODE_ENV=test (got "${name}")`,
      });
    }
    if (env.NODE_ENV === 'production') {
      if (env.APP_ORIGIN === undefined || !env.APP_ORIGIN.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['APP_ORIGIN'],
          message: 'is required and must use https in production',
        });
      }
      if (env.COOKIE_SECURE === false) {
        ctx.addIssue({
          code: 'custom',
          path: ['COOKIE_SECURE'],
          message: 'cannot be false in production',
        });
      }
      if (env.CSRF_SECRET === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['CSRF_SECRET'],
          message: 'is required in production',
        });
      }
      if (env.UPLOADS_DIR === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['UPLOADS_DIR'],
          message: 'is required in production (persistent storage outside the app)',
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    APP_ORIGIN: env.APP_ORIGIN ?? DEV_APP_ORIGIN,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  override name = 'EnvError';
}

/**
 * Validates the environment. Throws an EnvError that lists every problem by variable name.
 * The message never contains the values, so secrets in DATABASE_URL are not printed.
 */
export function readEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join('.') || 'environment';
    return `  - ${key}: ${issue.message}`;
  });
  throw new EnvError(
    `Invalid environment configuration:\n${lines.join('\n')}\nSee .env.example for the expected variables.`,
  );
}

function isExactOrigin(value: string): boolean {
  try {
    // WHATWG URL accepts "*" in host names (e.g. https://*.example.com), so reject it explicitly.
    if (value.includes('*')) return false;
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}
