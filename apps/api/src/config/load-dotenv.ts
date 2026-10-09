import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

/** The repo-root .env file (same depth from src/ and dist/). */
export const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));

/**
 * Loads a .env file into `target` without overriding variables that are already set, so the
 * process environment always wins (tests and e2e point DATABASE_URL at kinemax_test this way).
 * A missing file is not an error: production sets real environment variables.
 */
export function loadDotEnv(path: string, target: NodeJS.ProcessEnv = process.env): void {
  if (!existsSync(path)) return;
  const parsed = parseEnv(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (target[key] === undefined && typeof value === 'string') target[key] = value;
  }
}
