import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDotEnv, rootEnvPath } from '../src/config/load-dotenv.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function envFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'kinemax-env-'));
  dirs.push(dir);
  const file = join(dir, '.env');
  writeFileSync(file, content);
  return file;
}

describe('loadDotEnv', () => {
  it('fills in variables that are not set yet', () => {
    const target: NodeJS.ProcessEnv = {};
    loadDotEnv(envFile('FOO=bar\n# comment\nBAZ="quoted value"\n'), target);
    expect(target).toEqual({ FOO: 'bar', BAZ: 'quoted value' });
  });

  it('never overrides variables that are already set', () => {
    const target: NodeJS.ProcessEnv = { DATABASE_URL: 'from-process' };
    loadDotEnv(envFile('DATABASE_URL=from-file\nPORT=1234\n'), target);
    expect(target).toEqual({ DATABASE_URL: 'from-process', PORT: '1234' });
  });

  it('does nothing when the file does not exist', () => {
    const target: NodeJS.ProcessEnv = {};
    loadDotEnv(join(tmpdir(), 'kinemax-does-not-exist', '.env'), target);
    expect(target).toEqual({});
  });

  it('points at the repo-root .env', () => {
    expect(rootEnvPath.replaceAll('\\', '/')).toMatch(/\/kinemax\/\.env$/);
  });
});
