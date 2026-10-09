// Helpers that decide which database a connection URL points at.
// They never return or print the password part of the URL.

const POSTGRES_PROTOCOLS = new Set(['postgresql:', 'postgres:']);

/** Returns the database name of a postgresql:// URL, or undefined if the URL is not usable. */
export function databaseNameFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) return undefined;
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  return name === '' ? undefined : name;
}

export function isTestDatabaseName(name: string): boolean {
  return name.endsWith('_test');
}

/** Guard for tests: refuses any database whose name does not end in "_test". */
export function assertTestDatabaseUrl(url: string | undefined): string {
  const name = databaseNameFromUrl(url);
  if (url === undefined || name === undefined || !isTestDatabaseName(name)) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL_TEST must point at a database whose name ends in "_test" (got "${name ?? 'none'}").`,
    );
  }
  return url;
}

/** Guard for destructive dev tools (db:reset): refuses test databases and unusable URLs. */
export function assertDevelopmentDatabaseUrl(url: string | undefined): {
  url: string;
  name: string;
} {
  const name = databaseNameFromUrl(url);
  if (url === undefined || name === undefined) {
    throw new Error('DATABASE_URL is missing or is not a postgresql:// URL with a database name.');
  }
  if (isTestDatabaseName(name)) {
    throw new Error(
      `Refusing to touch "${name}": this command only works on the development database.`,
    );
  }
  return { url, name };
}
