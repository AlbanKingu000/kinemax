import type { MyBookingsResponse, TicketResponse } from '@kinemax/shared';
import { Router } from 'express';
import { z } from 'zod';
import { createRateLimiter, type RateLimiter, type RateLimitRule } from '../auth/rate-limit.js';
import { BOOKING_CODE_PATTERN } from '../domain/booking-code.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../http/auth-middleware.js';
import { HttpError, parseInput } from '../http/errors.js';
import type { Logger } from '../logger.js';
import {
  cancellationOf,
  idParams,
  loadTicket,
  loadTickets,
  notFound,
  userId,
} from './booking-common.js';

const MINUTE = 60_000;

/** Cancellations per signed-in user and per IP (in memory, like the other limits). */
export const CANCEL_RATE_LIMITS = {
  cancelPerUser: { windowMs: 10 * MINUTE, max: 10 },
  cancelPerIp: { windowMs: 10 * MINUTE, max: 60 },
} satisfies Record<string, RateLimitRule>;
export type CancelRateLimits = Record<keyof typeof CANCEL_RATE_LIMITS, RateLimitRule>;

const codeParams = z.object({ code: z.string().regex(BOOKING_CODE_PATTERN) });

export interface MyBookingsRouterDeps {
  prisma: PrismaClient;
  logger: Logger;
  now: () => Date;
  rateLimits?: CancelRateLimits;
}

/**
 * "Biletat e mia": the signed-in user's paid bookings, one ticket by its public code, and the
 * cancellation (refund) of a confirmed booking until the cutoff before the show. Other users'
 * bookings answer 404.
 */
export function createMyBookingsRouter({
  prisma,
  logger,
  now,
  rateLimits = CANCEL_RATE_LIMITS,
}: MyBookingsRouterDeps): Router {
  const router = Router();
  const limiters = {
    perUser: createRateLimiter(rateLimits.cancelPerUser),
    perIp: createRateLimiter(rateLimits.cancelPerIp),
  };
  const enforce = (limiter: RateLimiter, key: string, event: string) => {
    const result = limiter.hit(key);
    if (result.allowed) return;
    logger.warn('security.rate_limited', { event });
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Please try again later.', {
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    });
  };

  router.get('/me/bookings', requireAuth, async (req, res) => {
    const at = now();
    // Paid bookings only (a released hold was never a ticket).
    const tickets = await loadTickets(
      prisma,
      { userId: userId(req), confirmedAt: { not: null } },
      at,
    );
    const over = (endsAt: string) => Date.parse(endsAt) <= at.getTime();
    const body: MyBookingsResponse = {
      upcoming: tickets.filter((t) => t.status === 'CONFIRMED' && !over(t.endsAt)),
      past: tickets.filter((t) => t.status === 'CONFIRMED' && over(t.endsAt)).reverse(),
      cancelled: tickets
        .filter((t) => t.status !== 'CONFIRMED')
        .sort((a, b) => Date.parse(b.cancelledAt ?? '') - Date.parse(a.cancelledAt ?? '')),
    };
    res.set('Cache-Control', 'no-store');
    res.json(body);
  });

  router.get('/me/bookings/:code', requireAuth, async (req, res) => {
    const parsed = codeParams.safeParse(req.params);
    // A malformed code is just not one of the user's tickets.
    if (!parsed.success) throw notFound();
    const ticket = await loadTicket(
      prisma,
      { code: parsed.data.code, userId: userId(req), confirmedAt: { not: null } },
      now(),
    );
    if (!ticket) throw notFound();
    res.set('Cache-Control', 'no-store');
    const body: TicketResponse = { ticket };
    res.json(body);
  });

  router.post('/bookings/:id/cancel', requireAuth, async (req, res) => {
    const owner = userId(req);
    enforce(limiters.perIp, req.ip ?? 'unknown', 'cancel_ip');
    enforce(limiters.perUser, owner, 'cancel_user');
    const { id } = parseInput(idParams, req.params);
    const at = now();
    const refunded = await prisma.$transaction(async (tx) => {
      // Serializes cancellations with each other (double clicks) and with a payment.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Booking" WHERE "id" = ${id}::uuid AND "userId" = ${owner}::uuid FOR UPDATE`;
      if (locked.length === 0) throw notFound();
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          totalCents: true,
          showtime: { select: { startsAt: true, endsAt: true } },
        },
      });
      if (booking.status === 'REFUNDED') return null; // Already done: the same answer again.
      if (booking.status !== 'CONFIRMED') {
        throw new HttpError(409, 'conflict', 'Only a paid booking can be cancelled.');
      }
      const settings = await tx.appSettings.findUniqueOrThrow({ where: { id: 1 } });
      const cancellation = cancellationOf(
        booking,
        booking.showtime,
        at,
        settings.cancellationCutoffMinutes,
      );
      if (!cancellation?.allowed) {
        throw new HttpError(409, 'conflict', 'This booking can no longer be cancelled.');
      }
      const payment = await tx.demoPayment.findFirst({
        where: { bookingId: id, status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
      });
      if (payment) {
        await tx.demoPayment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED', refundedAt: at },
        });
      }
      // CONFIRMED -> REFUNDED (G9); the trigger releases the seats in this transaction (G11).
      await tx.booking.update({ where: { id }, data: { status: 'REFUNDED', cancelledAt: at } });
      await tx.auditLog.create({
        data: {
          actorId: owner,
          action: 'booking.refund',
          entityType: 'Booking',
          entityId: id,
          before: { status: 'CONFIRMED', totalCents: booking.totalCents },
          after: {
            status: 'REFUNDED',
            refundCents: cancellation.refundCents,
            paymentId: payment?.id ?? null,
          },
        },
      });
      return cancellation.refundCents;
    });
    if (refunded !== null) logger.info('booking.refund', { bookingId: id, refundCents: refunded });
    const ticket = await loadTicket(prisma, { id, userId: owner }, at);
    if (!ticket) throw notFound();
    const body: TicketResponse = { ticket };
    res.json(body);
  });

  return router;
}
