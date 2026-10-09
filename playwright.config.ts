import { defineConfig, devices } from '@playwright/test';
import { loadDotEnv, rootEnvPath } from './apps/api/src/config/load-dotenv.ts';
import { assertTestDatabaseUrl } from './apps/api/src/db/database-url.ts';

// e2e runs the production builds against kinemax_test ONLY; refuse anything else.
loadDotEnv(rootEnvPath);
const testDatabaseUrl = assertTestDatabaseUrl(process.env.DATABASE_URL_TEST);

const API_PORT = 3101;
const WEB_PORT = 4174;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true },
    },
  ],
  webServer: [
    {
      command: 'npm run db:deploy -w @kinemax/api && node apps/api/dist/server.js',
      url: `http://127.0.0.1:${String(API_PORT)}/api/health`,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: testDatabaseUrl,
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
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
  ],
});
