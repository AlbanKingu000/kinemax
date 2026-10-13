import { defineConfig, devices } from '@playwright/test';
import { loadDotEnv, rootEnvPath } from './apps/api/src/config/load-dotenv.ts';
import { assertTestDatabaseUrl } from './apps/api/src/db/database-url.ts';
import { API_PORT, DEV_WEB_PORT, DEV_WEB_URL, WEB_PORT } from './e2e/ports.ts';

// e2e runs the production builds against kinemax_test ONLY; refuse anything else.
loadDotEnv(rootEnvPath);
const testDatabaseUrl = assertTestDatabaseUrl(process.env.DATABASE_URL_TEST);

const isCI = Boolean(process.env.CI);
const EXPIRY_SPEC = /booking-expiry.spec.ts$/;

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
    {
      name: 'desktop-chromium',
      testIgnore: EXPIRY_SPEC,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      testIgnore: EXPIRY_SPEC,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true },
    },
    {
      // Shortens the hold time for the whole test database, so it runs alone after the others.
      name: 'hold-expiry',
      testMatch: EXPIRY_SPEC,
      dependencies: ['desktop-chromium', 'mobile-chromium'],
      use: { ...devices['Desktop Chrome'] },
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
