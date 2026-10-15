// The fixed customer accounts of the e2e test database (kinemax_test only; created by
// e2e-catalog.ts behind its _test guard). Test-only values, never a real credential: e2e specs sign
// in with them instead of registering (registering is rate limited to 5 per hour per IP).
// One account per Playwright project, and another one per project for the checkout journeys: a
// user has at most one seat hold, so specs running in parallel must not share an account.
const PASSWORD = 'vetem per testet e kinemax';
const account = (email: string, name: string) => ({ email, name, password: PASSWORD });

export const E2E_ACCOUNTS = {
  'desktop-chromium': account('e2e-kunde@kinemax.test', 'Klient E2E'),
  'mobile-chromium': account('e2e-celular@kinemax.test', 'Klient Mobil'),
  'hold-expiry': account('e2e-afati@kinemax.test', 'Klient Afati'),
  'desktop-chromium:checkout': account('e2e-bleresi@kinemax.test', 'Blerës E2E'),
  'mobile-chromium:checkout': account('e2e-bleresi-mobil@kinemax.test', 'Blerës Mobil'),
} as const;

export type E2EProject = keyof typeof E2E_ACCOUNTS;

/** The account of a Playwright project (by its name), or of its checkout journeys. */
export function e2eAccount(project: string, journey?: 'checkout') {
  const key = journey ? `${project}:${journey}` : project;
  const found = (E2E_ACCOUNTS as Record<string, ReturnType<typeof account> | undefined>)[key];
  if (!found) throw new Error(`No e2e account for ${key}`);
  return found;
}
