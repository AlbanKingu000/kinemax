import { join } from 'node:path';
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
import { createBookingsRouter, type BookingRateLimits } from './routes/bookings.js';
import { createCatalogRouter } from './routes/catalog.js';
import { createCheckoutRouter, type CheckoutRateLimits } from './routes/checkout.js';
import { createHealthRouter } from './routes/health.js';
import { createMediaRouter } from './routes/media.js';
import { createMenuRouter } from './routes/menu.js';
import { createMyBookingsRouter, type CancelRateLimits } from './routes/my-bookings.js';
import { ADMIN_RATE_LIMITS, type AdminRateLimits } from './routes/admin/common.js';
import { createAdminRouter } from './routes/admin/index.js';
import { createSeatMapRouter } from './routes/seatmap.js';
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
  /** Clock for time-dependent data (tests pin it). Default: the system clock. */
  now?: () => Date;
  /** Seat hold rate limits (default BOOKING_RATE_LIMITS). */
  bookingRateLimits?: BookingRateLimits;
  /** Demo payment rate limits (default CHECKOUT_RATE_LIMITS). */
  checkoutRateLimits?: CheckoutRateLimits;
  /** Cancellation rate limits (default CANCEL_RATE_LIMITS). */
  cancelRateLimits?: CancelRateLimits;
  /** Directory of uploaded movie images (outside the web build). */
  uploadsDir: string;
  /** Admin write rate limits (default ADMIN_RATE_LIMITS). */
  adminRateLimits?: AdminRateLimits;
  /** The built web app (apps/web/dist) to serve next to the API; unset: API only. */
  webDistDir?: string;
}

/**
 * Security headers for the API and the web app. Scripts, styles and fonts are self-hosted (Vite
 * bundles three.js and the fonts; React sets inline styles through the CSSOM, which CSP allows),
 * so no 'unsafe-inline' or 'unsafe-eval'. Only trailer iframes from youtube-nocookie.com may load.
 * HSTS and upgrade-insecure-requests only over HTTPS (secure cookies = production).
 */
export function securityHeaders(https: boolean) {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'", 'blob:'],
        frameSrc: ['https://www.youtube-nocookie.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(https ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    // YouTube embeds refuse to play without a Referer; the origin alone leaks no path or query.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: https ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    xFrameOptions: { action: 'deny' },
  });
}

export function createApp({
  prisma,
  checkDatabase,
  logger,
  corsAllowedOrigins,
  auth,
  now = () => new Date(),
  bookingRateLimits,
  checkoutRateLimits,
  cancelRateLimits,
  adminRateLimits = ADMIN_RATE_LIMITS,
  uploadsDir,
  webDistDir,
}: AppDeps): Express {
  const app = express();
  const cookies = cookieSettings(auth.cookieSecure);
  const csrf = createCsrfTokens(auth.csrfSecret);

  app.disable('x-powered-by');
  app.set('trust proxy', auth.trustProxy === 0 ? false : auth.trustProxy);
  app.use(securityHeaders(auth.cookieSecure));
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
  app.use('/api', createSeatMapRouter(prisma, now));
  app.use('/api', createMenuRouter(prisma));
  app.use('/api', createShowtimesRouter(prisma, now));
  app.use(
    '/api',
    createBookingsRouter({
      prisma,
      logger,
      now,
      ...(bookingRateLimits ? { rateLimits: bookingRateLimits } : {}),
    }),
  );
  app.use(
    '/api',
    createCheckoutRouter({
      prisma,
      logger,
      now,
      ...(checkoutRateLimits ? { rateLimits: checkoutRateLimits } : {}),
    }),
  );
  app.use(
    '/api',
    createMyBookingsRouter({
      prisma,
      logger,
      now,
      ...(cancelRateLimits ? { rateLimits: cancelRateLimits } : {}),
    }),
  );
  app.use('/api', createMediaRouter(uploadsDir));
  app.use(
    '/api/admin',
    createAdminRouter({ prisma, logger, now, rateLimits: adminRateLimits, uploadsDir }),
  );

  if (webDistDir !== undefined) {
    // Hashed assets never change; index.html must always be fresh (it names the current assets).
    app.use(
      express.static(webDistDir, {
        index: false,
        setHeaders: (res, path) => {
          res.set(
            'Cache-Control',
            /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      }),
    );
    // Client-side routes: every other GET outside /api gets the app shell.
    app.get(/^(?!\/api(\/|$))/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(join(webDistDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
