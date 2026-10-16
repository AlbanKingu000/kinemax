// Shared by every /api/admin router: who is asking, which locations they may see, the audit log
// entry of a write and the rate limits of admin writes.
import type { Request } from 'express';
import { createRateLimiter, type RateLimitRule } from '../../auth/rate-limit.js';
import type { SessionUser } from '../../auth/sessions.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { canAccessLocation } from '../../http/auth-middleware.js';
import { forbidden, HttpError, unauthorized } from '../../http/errors.js';
import type { Logger } from '../../logger.js';
import type { Db } from '../booking-common.js';

const MINUTE = 60_000;

/** Admin writes per signed-in staff member (in memory, like the other limits; docs/auth.md). */
export const ADMIN_RATE_LIMITS = {
  /** Every admin write (create, edit). */
  writePerUser: { windowMs: 10 * MINUTE, max: 300 },
  /** Sensitive writes: uploads, deactivations that refund bookings, seat layout batches. */
  sensitivePerUser: { windowMs: 10 * MINUTE, max: 30 },
} satisfies Record<string, RateLimitRule>;
export type AdminRateLimits = Record<keyof typeof ADMIN_RATE_LIMITS, RateLimitRule>;

export interface AdminDeps {
  prisma: PrismaClient;
  logger: Logger;
  now: () => Date;
  rateLimits: AdminRateLimits;
}

/** The signed-in staff member (admin routers run after requireRole). */
export function staffUser(req: Request): SessionUser {
  if (!req.auth) throw unauthorized();
  return req.auth.user;
}

/**
 * The locations a list may show: `null` = every location (super admin without a filter), else
 * the ids. A manager without a filter gets their own locations; a location outside the caller's
 * scope is 403 (the same answer for unknown ids).
 */
export async function locationScope(
  prisma: PrismaClient,
  user: SessionUser,
  location: string | undefined,
): Promise<string[] | null> {
  if (location !== undefined) {
    if (!(await canAccessLocation(prisma, user, location))) throw forbidden();
    return [location];
  }
  if (user.role === 'SUPER_ADMIN') return null;
  const rows = await prisma.managerLocation.findMany({
    where: { userId: user.id },
    select: { locationId: true },
  });
  return rows.map((row) => row.locationId);
}

/**
 * For a resource found by its id (a hall, a showtime): 404 unless the caller may manage its
 * location, so ids of other cinemas reveal nothing.
 */
export async function assertResourceScope(
  prisma: PrismaClient,
  user: SessionUser,
  locationId: string | null | undefined,
): Promise<void> {
  if (!locationId || !(await canAccessLocation(prisma, user, locationId))) {
    throw new HttpError(404, 'not_found', 'Not found.');
  }
}

/** One audit row for an admin write, in the write's own transaction. */
export function audit(
  db: Db,
  req: Request,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.InputJsonValue | null;
    after?: Prisma.InputJsonValue | null;
  },
) {
  return db.auditLog.create({
    data: {
      actorId: staffUser(req).id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ...(entry.before != null ? { before: entry.before } : {}),
      ...(entry.after != null ? { after: entry.after } : {}),
    },
  });
}

/** Per-user limiters for admin writes; `enforce` throws 429 with Retry-After when exceeded. */
export function createAdminLimiters(rateLimits: AdminRateLimits, logger: Logger) {
  const write = createRateLimiter(rateLimits.writePerUser);
  const sensitive = createRateLimiter(rateLimits.sensitivePerUser);
  return (req: Request, kind: 'write' | 'sensitive', event: string) => {
    const userId = staffUser(req).id;
    for (const limiter of kind === 'sensitive' ? [write, sensitive] : [write]) {
      const result = limiter.hit(userId);
      if (result.allowed) continue;
      logger.warn('security.rate_limited', { event, userId });
      throw new HttpError(429, 'rate_limited', 'Too many attempts. Please try again later.', {
        headers: { 'Retry-After': String(result.retryAfterSeconds) },
      });
    }
  };
}
