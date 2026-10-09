import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { loadDotEnv, rootEnvPath } from '../src/config/load-dotenv.js';
import { assertTestDatabaseUrl } from '../src/db/database-url.js';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const apiDir = fileURLToPath(new URL('..', import.meta.url));

/** Refuses to run unless DATABASE_URL_TEST ends in "_test", then applies migrations to it. */
export default function setup(project: TestProject): void {
  loadDotEnv(rootEnvPath);
  const testDatabaseUrl = assertTestDatabaseUrl(process.env.DATABASE_URL_TEST);
  execSync('npx prisma migrate deploy', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'pipe',
  });
  project.provide('testDatabaseUrl', testDatabaseUrl);
}
