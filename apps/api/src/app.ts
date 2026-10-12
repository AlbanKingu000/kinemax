import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { cookieSettings } from './auth/auth-config.js';
import { createCsrfTokens } from './auth/csrf.js';
import { AUTH_RATE_LIMITS, type AuthRateLimits } from './auth/rate-limit.js';
import type { SessionService } from './auth/sessions.js';
import type { PrismaClient } from './generated/prisma/client.js';
import { csrfProtection, loadSession } from './http/auth-middleware.js';
import { createErrorHandler, notFoundHandler } from './http/errors.js';
import type { Logger } from './logger.js';
import { createAuthRouter } from './routes/auth.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createHealthRouter } from './routes/health.js';
import { createProtectedExamplesRouter } from './routes/protected-examples.js';
import { createShowtimesRouter } from './routes/showtimes.js';

export const JSON_BODY_LIMIT = '100kb';

export interface AuthOptions {
  sessions: SessionService;
  /** Secure cookies with the __Host- prefix (production). */
  cookieSecure: boolean;
  /** HMAC key for CSRF tokens (32+ characters). */
  csrfSecret: string;
  /** Origin the web app is served from; state-changing requests must come from it. */
  appOrigin: string;
  /** Number of trusted reverse proxies (0 = use the socket address as client IP). */
  trustProxy: number;
  rateLimits?: AuthRateLimits;
}

export interface AppDeps {
  prisma: PrismaClient;
  checkDatabase: () => Promise<void>;
  logger: Logger;
  /** Exact extra origins allowed to call the API cross-origin. Empty: same-origin only. */
  corsAllowedOrigins: readonly string[];
  auth: AuthOptions;
  /** Clock for time-dependent public data (tests pin it). Default: the system clock. */
  now?: () => Date;
}

export function createApp({
  prisma,
  checkDatabase,
  logger,
  corsAllowedOrigins,
  auth,
  now = () => new Date(),
}: AppDeps): Express {
  const app = express();
  const cookies = cookieSettings(auth.cookieSecure);
  const csrf = createCsrfTokens(auth.csrfSecret);

  app.disable('x-powered-by');
  app.set('trust proxy', auth.trustProxy === 0 ? false : auth.trustProxy);
  app.use(helmet());
  // The web app talks to the API through the Vite proxy (same origin), so no CORS headers are sent
  // unless an exact origin is allowlisted. Never a wildcard.
  app.use(cors({ origin: [...corsAllowedOrigins], credentials: true }));
  // API responses are personal (sessions); never let a shared cache store them.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', loadSession(auth.sessions, cookies));
  // Before the body is parsed: forged cross-site requests are rejected as early as possible.
  app.use(
    '/api',
    csrfProtection({
      csrf,
      cookies,
      allowedOrigins: [auth.appOrigin, ...corsAllowedOrigins],
      logger,
    }),
  );
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', createHealthRouter({ checkDatabase, logger }));
  app.use(
    '/api/auth',
    createAuthRouter({
      prisma,
      sessions: auth.sessions,
      csrf,
      cookies,
      logger,
      rateLimits: auth.rateLimits ?? AUTH_RATE_LIMITS,
    }),
  );
  app.use('/api', createCatalogRouter(prisma, now));
  app.use('/api', createShowtimesRouter(prisma, now));
  app.use('/api', createProtectedExamplesRouter(prisma));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
