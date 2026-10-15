import {
  AGE_CONFIRMATION_RATINGS,
  simulatePaymentRequestSchema,
  type CheckoutResponse,
} from '@kinemax/shared';
import { Router } from 'express';
import { createRateLimiter, type RateLimiter, type RateLimitRule } from '../auth/rate-limit.js';
import { DOMAIN_SQLSTATE } from '../db/domain-error-codes.js';
import { generateBookingCode } from '../domain/booking-code.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../http/auth-middleware.js';
import { sqlStateOf } from '../http/db-errors.js';
import { HttpError, parseInput } from '../http/errors.js';
import type { Logger } from '../logger.js';
import {
  idParams,
  loadBooking,
  loadTicket,
  lockOpenHold,
  notFound,
  unprocessable,
  userId,
} from './booking-common.js';

const MINUTE = 60_000;

/** Simulated payments per signed-in user and per IP (in memory, like the other limits). */
export const CHECKOUT_RATE_LIMITS = {
  paymentPerUser: { windowMs: 10 * MINUTE, max: 30 },
  paymentPerIp: { windowMs: 10 * MINUTE, max: 120 },
} satisfies Record<string, RateLimitRule>;
export type CheckoutRateLimits = Record<keyof typeof CHECKOUT_RATE_LIMITS, RateLimitRule>;

const gone = () => new HttpError(410, 'gone', 'This hold has expired.');
const paymentView = (p: {
  id: string;
  status: CheckoutResponse['payment']['status'];
  amountCents: number;
}) => ({ id: p.id, status: p.status, amountCents: p.amountCents, currency: 'EUR' }) as const;

export interface CheckoutRouterDeps {
  prisma: PrismaClient;
  logger: Logger;
  now: () => Date;
  rateLimits?: CheckoutRateLimits;
}

/**
 * Demo checkout. The amount is always the booking's server total; the "provider" is a button
 * that answers success or decline. A success confirms the booking in the same transaction, once.
 * Another user's booking or payment answers 404.
 */
export function createCheckoutRouter({
  prisma,
  logger,
  now,
  rateLimits = CHECKOUT_RATE_LIMITS,
}: CheckoutRouterDeps): Router {
  const router = Router();
  const limiters = {
    perUser: createRateLimiter(rateLimits.paymentPerUser),
    perIp: createRateLimiter(rateLimits.paymentPerIp),
  };
  const enforce = (limiter: RateLimiter, key: string, event: string) => {
    const result = limiter.hit(key);
    if (result.allowed) return;
    logger.warn('security.rate_limited', { event });
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Please try again later.', {
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    });
  };

  router.post('/bookings/:id/checkout', requireAuth, async (req, res) => {
    const owner = userId(req);
    const { id } = parseInput(idParams, req.params);
    const at = now();
    const payment = await prisma.$transaction(async (tx) => {
      const booking = await lockOpenHold(tx, id, owner, at);
      if (!booking.isWholeHall && booking.seats.length === 0) {
        throw unprocessable('The booking has no tickets.');
      }
      // The open point of task 7: 15+/18+ films need the buyer's confirmation, on the server.
      if (
        AGE_CONFIRMATION_RATINGS.includes(booking.showtime.movie.ageRating) &&
        !booking.ageRatingConfirmed
      ) {
        throw unprocessable('Confirm the age rating first.');
      }
      // Idempotent: the open payment is reused, its amount kept equal to the current total.
      const open = await tx.demoPayment.findFirst({
        where: { bookingId: id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (open) {
        return open.amountCents === booking.totalCents
          ? open
          : tx.demoPayment.update({
              where: { id: open.id },
              data: { amountCents: booking.totalCents },
            });
      }
      return tx.demoPayment.create({
        data: {
          bookingId: id,
          amountCents: booking.totalCents,
          reference: `DEMO-${generateBookingCode()}`,
        },
      });
    });
    logger.info('payment.checkout', { bookingId: id, paymentId: payment.id });
    const booking = await loadBooking(prisma, id, owner, at);
    if (!booking) throw notFound();
    const body: CheckoutResponse = { payment: paymentView(payment), booking };
    res.json(body);
  });

  router.post('/payments/:id/simulate', requireAuth, async (req, res) => {
    const owner = userId(req);
    enforce(limiters.perIp, req.ip ?? 'unknown', 'payment_ip');
    enforce(limiters.perUser, owner, 'payment_user');
    const { id } = parseInput(idParams, req.params);
    const { outcome } = parseInput(simulatePaymentRequestSchema, req.body);
    const at = now();

    let result: { paymentId: string; bookingId: string; expired: boolean };
    try {
      result = await prisma.$transaction(async (tx) => {
        // Locks the payment and its booking: parallel calls run one after the other.
        const locked = await tx.$queryRaw<{ bookingId: string }[]>`
          SELECT p."bookingId" FROM "DemoPayment" p JOIN "Booking" b ON b."id" = p."bookingId"
          WHERE p."id" = ${id}::uuid AND b."userId" = ${owner}::uuid
          FOR UPDATE OF p, b`;
        const bookingId = locked[0]?.bookingId;
        if (!bookingId) throw notFound();
        const payment = await tx.demoPayment.findUniqueOrThrow({ where: { id } });
        const booking = await tx.booking.findUniqueOrThrow({
          where: { id: bookingId },
          select: {
            status: true,
            holdExpiresAt: true,
            totalCents: true,
            ageRatingConfirmed: true,
            showtime: { select: { startsAt: true, movie: { select: { ageRating: true } } } },
          },
        });
        const done = { paymentId: id, bookingId, expired: false };

        if (outcome === 'decline') {
          if (payment.status === 'FAILED') return done;
          if (payment.status !== 'PENDING') {
            throw new HttpError(409, 'conflict', 'This payment is already closed.');
          }
          await tx.demoPayment.update({ where: { id }, data: { status: 'FAILED' } });
          return done;
        }

        // Double clicks and parallel calls: the first one confirms, the others see it done.
        if (payment.status === 'SUCCEEDED') return done;
        if (payment.status !== 'PENDING') {
          throw new HttpError(409, 'conflict', 'This payment is already closed.');
        }
        const expired =
          booking.status === 'EXPIRED' ||
          (booking.status === 'HELD' &&
            ((booking.holdExpiresAt?.getTime() ?? 0) <= at.getTime() ||
              booking.showtime.startsAt.getTime() <= at.getTime()));
        if (expired) {
          // Nothing is confirmed; the payment is closed (committed, then 410).
          await tx.demoPayment.update({ where: { id }, data: { status: 'FAILED' } });
          return { ...done, expired: true };
        }
        if (booking.status !== 'HELD') {
          throw new HttpError(409, 'conflict', 'This booking can no longer be paid.');
        }
        if (payment.amountCents !== booking.totalCents) {
          throw new HttpError(
            409,
            'conflict',
            'The total changed. Please start the payment again.',
          );
        }
        if (
          AGE_CONFIRMATION_RATINGS.includes(booking.showtime.movie.ageRating) &&
          !booking.ageRatingConfirmed
        ) {
          throw unprocessable('Confirm the age rating first.');
        }
        await tx.demoPayment.update({
          where: { id },
          data: { status: 'SUCCEEDED', succeededAt: at },
        });
        // The status trigger (G9) still refuses a hold that has expired by the database clock.
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: 'CONFIRMED', confirmedAt: at },
        });
        return done;
      });
    } catch (error) {
      if (sqlStateOf(error) === DOMAIN_SQLSTATE.holdExpired) throw gone();
      throw error;
    }
    if (result.expired) throw gone();
    logger.info('payment.simulate', { paymentId: id, bookingId: result.bookingId, outcome });
    const [payment, booking] = await Promise.all([
      prisma.demoPayment.findUniqueOrThrow({ where: { id } }),
      loadBooking(prisma, result.bookingId, owner, at),
    ]);
    if (!booking) throw notFound();
    const body: CheckoutResponse = { payment: paymentView(payment), booking };
    res.json(body);
  });

  /** The ticket of a booking that was paid (confirmed, later maybe refunded). */
  router.get('/bookings/:id/ticket', requireAuth, async (req, res) => {
    const { id } = parseInput(idParams, req.params);
    const ticket = await loadTicket(
      prisma,
      { id, userId: userId(req), confirmedAt: { not: null } },
      now(),
    );
    if (!ticket) throw notFound();
    res.set('Cache-Control', 'no-store');
    res.json({ ticket });
  });

  return router;
}
