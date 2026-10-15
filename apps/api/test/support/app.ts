// Builds the real app for tests (against kinemax_test) plus small helpers for authenticated and
// CSRF-protected requests with Supertest.
import { randomBytes } from 'node:crypto';
import { CSRF_HEADER } from '@kinemax/shared';
import request from 'supertest';
import { inject, vi, type Mock } from 'vitest';
import { createApp, type AppDeps } from '../../src/app.js';
import type { AuthRateLimits } from '../../src/auth/rate-limit.js';
import type { BookingRateLimits } from '../../src/routes/bookings.js';
import type { CheckoutRateLimits } from '../../src/routes/checkout.js';
import type { CancelRateLimits } from '../../src/routes/my-bookings.js';
import { createSessionService } from '../../src/auth/sessions.js';
import { createPrismaClient } from '../../src/db/prisma.js';
import type { Logger } from '../../src/logger.js';

export const APP_ORIGIN = 'http://localhost:5180';
/** Random per test run, so no secret-looking literal lives in the repo. */
const testCsrfKey = randomBytes(32).toString('base64url');

let sharedPrisma: ReturnType<typeof createPrismaClient> | undefined;

/** One Prisma client per test file, connected to kinemax_test. */
export function testPrisma() {
  sharedPrisma ??= createPrismaClient(inject('testDatabaseUrl'));
  return sharedPrisma;
}

export type TestLogger = {
  info: Mock<Logger['info']>;
  warn: Mock<Logger['warn']>;
  error: Mock<Logger['error']>;
};

export function testLogger(): TestLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

export function makeTestApp(
  options: {
    checkDatabase?: () => Promise<void>;
    corsAllowedOrigins?: string[];
    cookieSecure?: boolean;
    rateLimits?: AuthRateLimits;
    bookingRateLimits?: BookingRateLimits;
    checkoutRateLimits?: CheckoutRateLimits;
    cancelRateLimits?: CancelRateLimits;
    now?: () => Date;
  } = {},
) {
  const prisma = testPrisma();
  const logger = testLogger();
  const deps: AppDeps = {
    prisma,
    checkDatabase: options.checkDatabase ?? (() => Promise.resolve()),
    logger,
    corsAllowedOrigins: options.corsAllowedOrigins ?? [],
    auth: {
      sessions: createSessionService(prisma, options.now),
      cookieSecure: options.cookieSecure ?? false,
      csrfSecret: testCsrfKey,
      appOrigin: APP_ORIGIN,
      trustProxy: 0,
      ...(options.rateLimits ? { rateLimits: options.rateLimits } : {}),
    },
    ...(options.now ? { now: options.now } : {}),
    ...(options.bookingRateLimits ? { bookingRateLimits: options.bookingRateLimits } : {}),
    ...(options.checkoutRateLimits ? { checkoutRateLimits: options.checkoutRateLimits } : {}),
    ...(options.cancelRateLimits ? { cancelRateLimits: options.cancelRateLimits } : {}),
  };
  return { app: createApp(deps), logger, prisma };
}

/** A cookie-keeping client with the CSRF token of its current session. */
export async function browserClient(app: ReturnType<typeof makeTestApp>['app']) {
  const agent = request.agent(app);
  const csrf = await agent.get('/api/auth/csrf').expect(200);
  let token = (csrf.body as { csrfToken: string }).csrfToken;

  const withHeaders = (req: request.Test) => req.set('Origin', APP_ORIGIN).set(CSRF_HEADER, token);
  return {
    agent,
    get token() {
      return token;
    },
    set token(value: string) {
      token = value;
    },
    get: (path: string) => agent.get(path),
    post: (path: string, body?: object) => withHeaders(agent.post(path)).send(body ?? {}),
    patch: (path: string, body?: object) => withHeaders(agent.patch(path)).send(body ?? {}),
    put: (path: string, body?: object) => withHeaders(agent.put(path)).send(body ?? {}),
    delete: (path: string) => withHeaders(agent.delete(path)),
    /** Refreshes the CSRF token for the agent's current session. */
    async refreshToken() {
      const res = await agent.get('/api/auth/csrf').expect(200);
      token = (res.body as { csrfToken: string }).csrfToken;
      return token;
    },
  };
}

/** The value of a Set-Cookie header for `name`, if any. */
export function setCookie(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  return list.find((c) => c.startsWith(`${name}=`));
}

/** The raw cookie value from a Set-Cookie header line. */
export function cookieValue(header: string | undefined): string | undefined {
  return header?.split(';')[0]?.split('=').slice(1).join('=');
}
