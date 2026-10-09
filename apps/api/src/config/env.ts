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
  });

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
