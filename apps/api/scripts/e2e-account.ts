// The fixed customer account of the e2e test database (kinemax_test only; created by
// e2e-catalog.ts behind its _test guard). Test-only values, never a real credential: e2e specs sign
// in with it instead of registering (registering is rate limited to 5 per hour per IP).
export const E2E_ACCOUNT = {
  email: 'e2e-kunde@kinemax.test',
  name: 'Klient E2E',
  password: 'vetem per testet e kinemax',
} as const;
