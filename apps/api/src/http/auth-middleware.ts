// Authentication, CSRF and authorization middleware. Reuse these in every router:
//
//   router.get('/x', requireAuth, handler)                          -> 401 when not signed in
//   router.post('/y', requireRole('SUPER_ADMIN'), handler)          -> 401 / 403
//   router.get('/locations/:locationId/z',
//     requireRole('LOCATION_MANAGER', 'SUPER_ADMIN'),
//     requireLocationAccess(prisma, (req) => req.params.locationId), handler)
//
// CSRF protection runs globally for every state-changing request under /api (see app.ts).

import { randomBytes } from 'node:crypto';
import { CSRF_HEADER } from '@kinemax/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { CookieSettings } from '../auth/auth-config.js';
import type { CsrfTokens } from '../auth/csrf.js';
import type { AuthContext, SessionService, SessionUser } from '../auth/sessions.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { Logger } from '../logger.js';
import { parseCookieHeader } from './cookies.js';
import { forbidden, HttpError, unauthorized } from './errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Parsed Cookie header (named apart from Express's untyped req.cookies). */
      parsedCookies: Record<string, string>;
      /** Set when the request carries a valid session cookie. */
      auth?: AuthContext;
    }
  }
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Parses cookies and attaches req.auth for a valid session cookie; clears invalid ones. */
export function loadSession(sessions: SessionService, cookies: CookieSettings): RequestHandler {
  return async (req, res, next) => {
    req.parsedCookies = parseCookieHeader(req.get('cookie'));
    const token = req.parsedCookies[cookies.sessionCookieName];
    if (token !== undefined) {
      const auth = await sessions.resolve(token);
      if (auth) req.auth = auth;
      else clearSessionCookie(res, cookies);
    }
    next();
  };
}

export function setSessionCookie(
  res: Response,
  cookies: CookieSettings,
  token: string,
  maxAgeMs: number,
): void {
  res.cookie(cookies.sessionCookieName, token, {
    httpOnly: true,
    secure: cookies.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearSessionCookie(res: Response, cookies: CookieSettings): void {
  res.clearCookie(cookies.sessionCookieName, {
    httpOnly: true,
    secure: cookies.secure,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * The value CSRF tokens are bound to: the session token hash when signed in, otherwise a random
 * anonymous id kept in an httpOnly cookie (created here if missing).
 */
export function csrfBinding(req: Request, res: Response, cookies: CookieSettings): string {
  if (req.auth) return req.auth.tokenHash;
  const existing = req.parsedCookies[cookies.csrfCookieName];
  if (existing && /^[A-Za-z0-9_-]{43}$/.test(existing)) return existing;
  const value = randomBytes(32).toString('base64url');
  res.cookie(cookies.csrfCookieName, value, {
    httpOnly: true,
    secure: cookies.secure,
    sameSite: 'lax',
    path: '/',
  });
  req.parsedCookies[cookies.csrfCookieName] = value;
  return value;
}

function requestOrigin(req: Request): string | undefined {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Blocks state-changing requests that do not come from an allowed origin (Origin header, or
 * Referer when Origin is missing) or that lack a valid CSRF token for the current session.
 */
export function csrfProtection(options: {
  csrf: CsrfTokens;
  cookies: CookieSettings;
  allowedOrigins: readonly string[];
  logger: Logger;
}): RequestHandler {
  const { csrf, cookies, allowedOrigins, logger } = options;
  return (req, _res, next) => {
    if (!STATE_CHANGING.has(req.method)) {
      next();
      return;
    }
    const origin = requestOrigin(req);
    const binding = req.auth ? req.auth.tokenHash : req.parsedCookies[cookies.csrfCookieName];
    let reason: string | undefined;
    if (!origin || !allowedOrigins.includes(origin)) reason = 'origin';
    else if (!csrf.verify(req.get(CSRF_HEADER), binding)) reason = 'token';
    if (reason) {
      logger.warn('security.csrf.blocked', {
        reason,
        method: req.method,
        path: req.path,
        ip: req.ip,
        ...(req.auth ? { userId: req.auth.user.id } : {}),
      });
      next(new HttpError(403, 'forbidden', 'The request was blocked.'));
      return;
    }
    next();
  };
}

/** 401 unless the request has a valid session. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.auth ? undefined : unauthorized());
};

/** 401 when not signed in, 403 unless the user has one of the roles. */
export function requireRole(...roles: SessionUser['role'][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    next(roles.includes(req.auth.user.role) ? undefined : forbidden());
  };
}

const uuid = z.uuid();

/**
 * Location-scoped access: SUPER_ADMIN may access every location, a LOCATION_MANAGER only the
 * locations assigned in ManagerLocation, a CUSTOMER never. 401 when not signed in, 403 otherwise
 * (also for malformed or unknown location ids, so nothing is revealed).
 */
export function requireLocationAccess(
  prisma: PrismaClient,
  locationIdFrom: (req: Request) => string | undefined,
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) {
      next(unauthorized());
      return;
    }
    if (auth.user.role === 'SUPER_ADMIN') {
      next();
      return;
    }
    const locationId = locationIdFrom(req);
    if (auth.user.role !== 'LOCATION_MANAGER' || !uuid.safeParse(locationId).success) {
      next(forbidden());
      return;
    }
    const assignment = await prisma.managerLocation.findUnique({
      where: { userId_locationId: { userId: auth.user.id, locationId: locationId ?? '' } },
      select: { userId: true },
    });
    next(assignment ? undefined : forbidden());
  };
}
