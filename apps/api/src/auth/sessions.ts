// Server-side sessions. The cookie carries a random 256-bit token; the database stores only its
// SHA-256 hash, so a leaked database (or log) never contains a usable session token.

import type { PrismaClient } from '../generated/prisma/client.js';
import type { Logger } from '../logger.js';
import {
  SESSION_ABSOLUTE_LIFETIME_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from './auth-config.js';
import { generateSessionToken, hashToken, isWellFormedToken } from './tokens.js';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'CUSTOMER' | 'LOCATION_MANAGER' | 'SUPER_ADMIN';
  preferredLocale: 'sq' | 'en';
}

/** Attached to authenticated requests as req.auth. */
export interface AuthContext {
  sessionId: string;
  /** SHA-256 of the session token; CSRF tokens are bound to it. */
  tokenHash: string;
  user: SessionUser;
}

export interface CreatedSession {
  /** Raw token: goes into the cookie and nowhere else. */
  token: string;
  tokenHash: string;
  sessionId: string;
}

const USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  preferredLocale: true,
  isActive: true,
} as const;

export interface SessionService {
  create(userId: string, userAgent: string | undefined): Promise<CreatedSession>;
  /** The valid session for a cookie value, or null. Expired or orphaned sessions are deleted. */
  resolve(token: string | undefined): Promise<AuthContext | null>;
  revoke(sessionId: string): Promise<void>;
  /** Deletes every session of a user (optionally keeping one). Returns how many were deleted. */
  revokeAllForUser(userId: string, exceptSessionId?: string): Promise<number>;
  /** Deletes sessions past their idle timeout or absolute lifetime. Idempotent. */
  cleanupExpired(): Promise<number>;
}

export function createSessionService(
  prisma: PrismaClient,
  now: () => Date = () => new Date(),
): SessionService {
  return {
    async create(userId, userAgent) {
      const token = generateSessionToken();
      const tokenHash = hashToken(token);
      const createdAt = now();
      const session = await prisma.session.create({
        data: {
          userId,
          tokenHash,
          createdAt,
          lastSeenAt: createdAt,
          expiresAt: new Date(createdAt.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
          userAgent: userAgent?.slice(0, 256) ?? null,
        },
        select: { id: true },
      });
      return { token, tokenHash, sessionId: session.id };
    },

    async resolve(token) {
      if (!isWellFormedToken(token)) return null;
      const tokenHash = hashToken(token);
      const session = await prisma.session.findUnique({
        where: { tokenHash },
        include: { user: { select: USER_FIELDS } },
      });
      if (!session) return null;
      const time = now().getTime();
      const idle = time - session.lastSeenAt.getTime() >= SESSION_IDLE_TIMEOUT_MS;
      const expired = time >= session.expiresAt.getTime();
      if (idle || expired || !session.user.isActive) {
        await prisma.session.deleteMany({ where: { id: session.id } });
        return null;
      }
      if (time - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
        await prisma.session.updateMany({
          where: { id: session.id },
          data: { lastSeenAt: new Date(time) },
        });
      }
      const { id, email, name, role, preferredLocale } = session.user;
      return { sessionId: session.id, tokenHash, user: { id, email, name, role, preferredLocale } };
    },

    async revoke(sessionId) {
      await prisma.session.deleteMany({ where: { id: sessionId } });
    },

    async revokeAllForUser(userId, exceptSessionId) {
      const result = await prisma.session.deleteMany({
        where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      });
      return result.count;
    },

    async cleanupExpired() {
      const time = now();
      const result = await prisma.session.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: time } },
            { lastSeenAt: { lte: new Date(time.getTime() - SESSION_IDLE_TIMEOUT_MS) } },
          ],
        },
      });
      return result.count;
    },
  };
}

/**
 * Runs cleanupExpired now and then every `intervalMs` inside the API process. Safe with several
 * processes (a DELETE of expired rows is idempotent). Returns a function that stops the job.
 */
export function startSessionCleanup(
  sessions: SessionService,
  logger: Logger,
  intervalMs: number,
): () => void {
  const run = () => {
    sessions.cleanupExpired().then(
      (deleted) => {
        if (deleted > 0) logger.info('auth.sessions.cleanup', { deleted });
      },
      (error: unknown) => {
        logger.error('auth.sessions.cleanup_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
