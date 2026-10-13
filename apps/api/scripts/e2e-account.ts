// The fixed customer accounts of the e2e test database (kinemax_test only; created by
// e2e-catalog.ts behind its _test guard). Test-only values, never a real credential: e2e specs sign
// in with them instead of registering (registering is rate limited to 5 per hour per IP).
// One account per Playwright project: a user has at most one seat hold, so projects running in
// parallel must not share an account.
const PASSWORD = 'vetem per testet e kinemax';

export const E2E_ACCOUNTS = {
  'desktop-chromium': { email: 'e2e-kunde@kinemax.test', name: 'Klient E2E', password: PASSWORD },
  'mobile-chromium': {
    email: 'e2e-celular@kinemax.test',
    name: 'Klient Mobil',
    password: PASSWORD,
  },
  'hold-expiry': { email: 'e2e-afati@kinemax.test', name: 'Klient Afati', password: PASSWORD },
} as const;

export type E2EProject = keyof typeof E2E_ACCOUNTS;

/** The account of a Playwright project (by its name). */
export function e2eAccount(project: string) {
  const account = (E2E_ACCOUNTS as Record<string, (typeof E2E_ACCOUNTS)[E2EProject] | undefined>)[
    project
  ];
  if (!account) throw new Error(`No e2e account for project ${project}`);
  return account;
}
