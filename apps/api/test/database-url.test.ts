import { describe, expect, it } from 'vitest';
import {
  assertDevelopmentDatabaseUrl,
  assertTestDatabaseUrl,
  databaseNameFromUrl,
} from '../src/db/database-url.js';

const url = (db: string) => `postgresql://kinemax:secret@127.0.0.1:5432/${db}?schema=public`;

describe('databaseNameFromUrl', () => {
  it('reads the database name from postgresql:// and postgres:// URLs', () => {
    expect(databaseNameFromUrl(url('kinemax'))).toBe('kinemax');
    expect(databaseNameFromUrl('postgres://u:p@localhost/kinemax_test')).toBe('kinemax_test');
  });

  it('returns undefined for missing, malformed, non-postgres or nameless URLs', () => {
    expect(databaseNameFromUrl(undefined)).toBeUndefined();
    expect(databaseNameFromUrl('')).toBeUndefined();
    expect(databaseNameFromUrl('not a url')).toBeUndefined();
    expect(databaseNameFromUrl('mysql://u:p@localhost/kinemax')).toBeUndefined();
    expect(databaseNameFromUrl('postgresql://u:p@localhost/')).toBeUndefined();
  });
});

describe('assertTestDatabaseUrl', () => {
  it('accepts a database ending in _test', () => {
    expect(assertTestDatabaseUrl(url('kinemax_test'))).toBe(url('kinemax_test'));
  });

  it.each([url('kinemax'), url('kinemax_testing'), undefined, 'not a url'])(
    'refuses %s',
    (value) => {
      expect(() => assertTestDatabaseUrl(value)).toThrow(/Refusing to run tests/);
    },
  );

  it('never puts the password in the error message', () => {
    expect(() => assertTestDatabaseUrl(url('kinemax'))).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('secret') as unknown }),
    );
  });
});

describe('assertDevelopmentDatabaseUrl', () => {
  it('accepts the development database', () => {
    expect(assertDevelopmentDatabaseUrl(url('kinemax'))).toEqual({
      url: url('kinemax'),
      name: 'kinemax',
    });
  });

  it('refuses test databases', () => {
    expect(() => assertDevelopmentDatabaseUrl(url('kinemax_test'))).toThrow(/Refusing to touch/);
  });

  it('refuses a missing or unusable URL', () => {
    expect(() => assertDevelopmentDatabaseUrl(undefined)).toThrow(/DATABASE_URL is missing/);
    expect(() => assertDevelopmentDatabaseUrl('https://example.com/db')).toThrow(
      /DATABASE_URL is missing/,
    );
  });
});
