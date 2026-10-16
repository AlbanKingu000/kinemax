// Ports of the servers Playwright starts (shared by playwright.config.ts and the specs).
export const API_PORT = 3101;
/** The API serving the production web build (what users get). */
export const WEB_URL = `http://localhost:${String(API_PORT)}`;
/** Vite dev server: only for dev-only pages such as /styleguide. */
export const DEV_WEB_PORT = 4175;
export const DEV_WEB_URL = `http://localhost:${String(DEV_WEB_PORT)}`;
