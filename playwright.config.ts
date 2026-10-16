import { defineConfig, devices } from '@playwright/test';
import { loadDotEnv, rootEnvPath } from './apps/api/src/config/load-dotenv.ts';
import { assertTestDatabaseUrl } from './apps/api/src/db/database-url.ts';
import { API_PORT, DEV_WEB_PORT, DEV_WEB_URL, WEB_PORT } from './e2e/ports.ts';

// e2e runs the production builds against kinemax_test ONLY; refuse anything else.
loadDotEnv(rootEnvPath);
const testDatabaseUrl = assertTestDatabaseUrl(process.env.DATABASE_URL_TEST);

const isCI = Boolean(process.env.CI);
const EXPIRY_SPEC = /booking-expiry.spec.ts$/;
// The 3D hall journeys render WebGL in software for ~40 s each: they run after the main projects
// and one after the other, so they never starve the argon2 logins of the other specs (or the
// database connections the seat-map polling opens) of CPU.
const HALL_SPEC = /hall-3d.spec.ts$/;
const desktop = { ...devices['Desktop Chrome'] };
const phone = {
  ...devices['Desktop Chrome'],
  viewport: { width: 390, height: 844 },
  isMobile: true,
};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  // Production builds, software WebGL and argon2 logins run in parallel workers: under that load
  // a UI step can take longer than the default 5 s.
  expect: { timeout: 10_000 },
  retries: isCI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [
    // Signs the e2e staff in once for the whole run (e2e/admin-helpers.ts).
    { name: 'admin-setup', testMatch: /admin\.setup\.ts$/, use: desktop },
    {
      name: 'desktop-chromium',
      testIgnore: [EXPIRY_SPEC, HALL_SPEC],
      dependencies: ['admin-setup'],
      use: desktop,
    },
    {
      name: 'mobile-chromium',
      testIgnore: [EXPIRY_SPEC, HALL_SPEC],
      dependencies: ['admin-setup'],
      use: phone,
    },
    {
      name: 'hall-3d-desktop',
      testMatch: HALL_SPEC,
      dependencies: ['desktop-chromium', 'mobile-chromium'],
      use: desktop,
    },
    {
      name: 'hall-3d-mobile',
      testMatch: HALL_SPEC,
      dependencies: ['hall-3d-desktop'],
      use: phone,
    },
    {
      // Shortens the hold time for the whole test database, so it runs alone after the others.
      name: 'hold-expiry',
      testMatch: EXPIRY_SPEC,
      dependencies: ['hall-3d-mobile'],
      use: desktop,
    },
  ],
  webServer: [
    {
      // Migrations, then a fresh demo catalog in kinemax_test (scripts/e2e-catalog.ts).
      command:
        'npm run db:deploy -w @kinemax/api && npm run e2e:catalog -w @kinemax/api && node apps/api/dist/server.js',
      url: `http://127.0.0.1:${String(API_PORT)}/api/health`,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: testDatabaseUrl,
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        // State-changing requests must come from the web origin (the preview server).
        APP_ORIGIN: `http://localhost:${String(WEB_PORT)}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run preview -w @kinemax/web -- --port ${String(WEB_PORT)} --strictPort`,
      url: `http://localhost:${String(WEB_PORT)}`,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${String(API_PORT)}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Vite dev server, only for development-only pages (/styleguide).
      command: `npm run dev -w @kinemax/web -- --port ${String(DEV_WEB_PORT)} --strictPort`,
      url: DEV_WEB_URL,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${String(API_PORT)}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
