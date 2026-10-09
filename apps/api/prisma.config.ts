import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env by itself. Load the root .env without overriding variables that are
// already set, so scripts can point Prisma at another database (e.g. tests use kinemax_test).
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(rootEnv, 'utf8')))) {
    process.env[key] ??= value;
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Development demo data (refuses *_test databases). Run with `npm run db:seed`.
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    // Optional for `prisma generate`; required for migrate/studio, which fail with a clear error.
    url: process.env.DATABASE_URL,
  },
});
