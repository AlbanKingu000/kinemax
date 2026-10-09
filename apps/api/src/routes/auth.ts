// /api/auth: CSRF token, register, login, logout, logout-all, me, change-password.
// Security notes live in docs/auth.md.

import {
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  updateMeRequestSchema,
  type AuthSessionResponse,
  type AuthUser,
} from '@kinemax/shared';
import { Router, type Request, type Response } from 'express';
import { SESSION_ABSOLUTE_LIFETIME_MS, type CookieSettings } from '../auth/auth-config.js';
import type { CsrfTokens } from '../auth/csrf.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { checkPasswordPolicy } from '../auth/password-policy.js';
import { createRateLimiter, type AuthRateLimits, type RateLimiter } from '../auth/rate-limit.js';
import type { SessionService } from '../auth/sessions.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import {
  clearSessionCookie,
  csrfBinding,
  requireAuth,
  setSessionCookie,
} from '../http/auth-middleware.js';
import { sqlStateOf } from '../http/db-errors.js';
import { HttpError, parseInput } from '../http/errors.js';
import { maskEmail, type Logger } from '../logger.js';

export interface AuthRouterDeps {
  prisma: PrismaClient;
  sessions: SessionService;
  csrf: CsrfTokens;
  cookies: CookieSettings;
  logger: Logger;
  rateLimits: AuthRateLimits;
}

const INVALID_CREDENTIALS = () =>
  new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');

function policyError(issues: string[]): HttpError {
  return new HttpError(400, 'validation_failed', 'The request data is invalid.', {
    fields: issues.map((code) => ({ path: 'password', code })),
  });
}

export async function loadAuthUser(prisma: PrismaClient, userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      preferredLocale: true,
      managedLocations: { select: { locationId: true }, orderBy: { locationId: 'asc' } },
    },
  });
  const { managedLocations, ...rest } = user;
  return {
    ...rest,
    managedLocationIds:
      user.role === 'LOCATION_MANAGER' ? managedLocations.map((m) => m.locationId) : [],
  };
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const { prisma, sessions, csrf, cookies, logger } = deps;
  const limiters = {
    loginPerIp: createRateLimiter(deps.rateLimits.loginPerIp),
    loginPerEmailAndIp: createRateLimiter(deps.rateLimits.loginPerEmailAndIp),
    registerPerIp: createRateLimiter(deps.rateLimits.registerPerIp),
    changePasswordPerUser: createRateLimiter(deps.rateLimits.changePasswordPerUser),
  };
  // Verifying against a dummy hash when the account does not exist keeps login timing similar.
  const dummyHash = hashPassword(`kinemax-dummy-${String(Math.random())}`);
  const router = Router();

  function enforceLimit(
    limiter: RateLimiter,
    key: string,
    event: string,
    meta: Record<string, unknown>,
  ): void {
    const result = limiter.hit(key);
    if (result.allowed) return;
    logger.warn('security.rate_limited', { event, ...meta });
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Please try again later.', {
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    });
  }

  /** Starts a new session (rotation: the request's previous session is deleted). */
  async function startSession(req: Request, res: Response, userId: string): Promise<string> {
    if (req.auth) await sessions.revoke(req.auth.sessionId);
    const session = await sessions.create(userId, req.get('user-agent'));
    setSessionCookie(res, cookies, session.token, SESSION_ABSOLUTE_LIFETIME_MS);
    return csrf.issue(session.tokenHash);
  }

  router.get('/csrf', (req, res) => {
    res.json({ csrfToken: csrf.issue(csrfBinding(req, res, cookies)) });
  });

  router.post('/register', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    enforceLimit(limiters.registerPerIp, ip, 'register', { ip });
    const input = parseInput(registerRequestSchema, req.body);
    const issues = checkPasswordPolicy(input.password, input.email);
    if (issues.length > 0) throw policyError(issues);

    // Hash first, also for emails that already exist, so the response time does not reveal them.
    const passwordHash = await hashPassword(input.password);
    let userId: string;
    try {
      const user = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          preferredLocale: input.preferredLocale,
          passwordHash,
          role: 'CUSTOMER', // never taken from the client
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (error) {
      if (sqlStateOf(error) !== '23505') throw error;
      logger.warn('auth.register.rejected', { email: maskEmail(input.email), ip });
      throw new HttpError(409, 'conflict', 'This account could not be created.');
    }
    const csrfToken = await startSession(req, res, userId);
    logger.info('auth.register.success', { userId, email: maskEmail(input.email), ip });
    const body: AuthSessionResponse = { user: await loadAuthUser(prisma, userId), csrfToken };
    res.status(201).json(body);
  });

  router.post('/login', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    enforceLimit(limiters.loginPerIp, ip, 'login_ip', { ip });
    const input = parseInput(loginRequestSchema, req.body);
    const emailKey = `${input.email}|${ip}`;
    enforceLimit(limiters.loginPerEmailAndIp, emailKey, 'login_email', {
      ip,
      email: maskEmail(input.email),
    });

    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, passwordHash: true, isActive: true },
    });
    let valid = false;
    if (user?.isActive) {
      valid = await verifyPassword(user.passwordHash, input.password);
    } else {
      // Unknown or inactive account: do the same expensive work anyway, then fail.
      await verifyPassword(await dummyHash, input.password);
    }
    if (!user || !valid) {
      logger.warn('auth.login.failure', {
        email: maskEmail(input.email),
        ip,
        reason: !user ? 'unknown_email' : user.isActive ? 'wrong_password' : 'inactive_user',
      });
      throw INVALID_CREDENTIALS();
    }

    limiters.loginPerEmailAndIp.reset(emailKey);
    const csrfToken = await startSession(req, res, user.id);
    logger.info('auth.login.success', { userId: user.id, email: maskEmail(input.email), ip });
    const body: AuthSessionResponse = { user: await loadAuthUser(prisma, user.id), csrfToken };
    res.json(body);
  });

  router.post('/logout', async (req, res) => {
    if (req.auth) {
      await sessions.revoke(req.auth.sessionId);
      logger.info('auth.logout', { userId: req.auth.user.id, ip: req.ip });
    }
    clearSessionCookie(res, cookies);
    res.status(204).end();
  });

  router.post('/logout-all', requireAuth, async (req, res) => {
    const auth = req.auth;
    if (!auth) throw new Error('requireAuth did not run');
    const revoked = await sessions.revokeAllForUser(auth.user.id);
    logger.info('auth.logout_all', { userId: auth.user.id, revoked, ip: req.ip });
    clearSessionCookie(res, cookies);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    res.json({ user: await loadAuthUser(prisma, req.auth?.user.id ?? '') });
  });

  router.patch('/me', requireAuth, async (req, res) => {
    const input = parseInput(updateMeRequestSchema, req.body);
    const userId = req.auth?.user.id ?? '';
    // Only name and preferredLocale can change here; the schema rejects every other key.
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.preferredLocale === undefined ? {} : { preferredLocale: input.preferredLocale }),
      },
    });
    res.json({ user: await loadAuthUser(prisma, userId) });
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const auth = req.auth;
    if (!auth) throw new Error('requireAuth did not run');
    enforceLimit(limiters.changePasswordPerUser, auth.user.id, 'change_password', {
      userId: auth.user.id,
    });
    const input = parseInput(changePasswordRequestSchema, req.body);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.user.id },
      select: { passwordHash: true, email: true },
    });
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      logger.warn('auth.change_password.failure', { userId: auth.user.id, ip: req.ip });
      throw new HttpError(400, 'invalid_credentials', 'The current password is incorrect.');
    }
    const issues: string[] = checkPasswordPolicy(input.newPassword, user.email);
    if (input.newPassword === input.currentPassword) issues.push('same_as_current');
    if (issues.length > 0) throw policyError(issues);

    await prisma.user.update({
      where: { id: auth.user.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    // Revoke every other session and rotate this one.
    const revoked = await sessions.revokeAllForUser(auth.user.id, auth.sessionId);
    const csrfToken = await startSession(req, res, auth.user.id);
    logger.info('auth.change_password.success', { userId: auth.user.id, revoked, ip: req.ip });
    const body: AuthSessionResponse = { user: await loadAuthUser(prisma, auth.user.id), csrfToken };
    res.json(body);
  });

  return router;
}
