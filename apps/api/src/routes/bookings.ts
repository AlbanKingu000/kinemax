import {
  AGE_CONFIRMATION_RATINGS,
  foodRequestSchema,
  holdRequestSchema,
  MAX_TICKETS_PER_BOOKING,
  ticketsRequestSchema,
  type BookingSeat,
} from '@kinemax/shared';
import { Router } from 'express';
import { createRateLimiter, type RateLimiter, type RateLimitRule } from '../auth/rate-limit.js';
import { expireStaleHolds } from '../db/holds.js';
import { loadPricingRules } from '../db/pricing-rules.js';
import { generateBookingCode } from '../domain/booking-code.js';
import { FulfillmentError, isFulfillmentAllowed, serveTimingFor } from '../domain/fulfillment.js';
import {
  PricingError,
  priceSeatTickets,
  priceWholeHall,
  type PricingContext,
  type TicketCategoryRef,
} from '../domain/pricing.js';
import { ticketsPerSeat } from '../domain/seat-tickets.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { requireAuth } from '../http/auth-middleware.js';
import { sqlStateOf } from '../http/db-errors.js';
import { HttpError, parseInput } from '../http/errors.js';
import type { Logger } from '../logger.js';
import {
  idParams,
  loadBooking,
  lockOpenHold,
  notFound,
  storeTotal,
  unprocessable,
  userId,
  type Db,
} from './booking-common.js';
import { availableMenuWhere } from './menu.js';

const MINUTE = 60_000;

/** Seat holds per signed-in user and per IP (in memory, like the auth limits). */
export const BOOKING_RATE_LIMITS = {
  holdPerUser: { windowMs: 10 * MINUTE, max: 30 },
  holdPerIp: { windowMs: 10 * MINUTE, max: 120 },
} satisfies Record<string, RateLimitRule>;
export type BookingRateLimits = Record<keyof typeof BOOKING_RATE_LIMITS, RateLimitRule>;

/** Prices every seat with the server's pricing function; a missing rule means "not bookable". */
function priceSeats(
  context: PricingContext,
  seats: readonly { id: string; seatType: BookingSeat['type'] }[],
  categoriesFor: (seatId: string, count: number) => TicketCategoryRef[],
) {
  try {
    return seats.map((seat) => ({
      seat,
      price: priceSeatTickets({
        ...context,
        seat: { seatType: seat.seatType },
        ticketCategories: categoriesFor(seat.id, ticketsPerSeat(seat.seatType)),
      }),
    }));
  } catch (error) {
    if (error instanceof PricingError) throw unprocessable('These seats cannot be booked now.');
    throw error;
  }
}

/** BookingSeat rows (one per ticket) from priced seats. */
function ticketRows(priced: ReturnType<typeof priceSeats>) {
  return priced.flatMap(({ seat, price }) =>
    price.tickets.map((ticket, index) => ({
      seatId: seat.id,
      occupant: index + 1,
      ticketCategoryCode: ticket.ticketCategoryCode ?? '',
      unitPriceCents: ticket.totalCents,
      seatSurchargeCents: index === 0 ? (price.seatSurcharge?.amountCents ?? 0) : 0,
      priceBreakdown: (index === 0 && price.seatSurcharge
        ? { ...ticket, seatSurcharge: price.seatSurcharge }
        : ticket) as unknown as Prisma.InputJsonValue,
    })),
  );
}

export interface BookingsRouterDeps {
  prisma: PrismaClient;
  logger: Logger;
  now: () => Date;
  rateLimits?: BookingRateLimits;
}

/**
 * Seat holds and their tickets. Every route needs a session; a booking of another user answers
 * 404, never 403, so ids reveal nothing. Prices are calculated here only, never taken from the
 * client.
 */
export function createBookingsRouter({
  prisma,
  logger,
  now,
  rateLimits = BOOKING_RATE_LIMITS,
}: BookingsRouterDeps): Router {
  const router = Router();
  const limiters = {
    holdPerUser: createRateLimiter(rateLimits.holdPerUser),
    holdPerIp: createRateLimiter(rateLimits.holdPerIp),
  };
  const enforce = (limiter: RateLimiter, key: string, event: string) => {
    const result = limiter.hit(key);
    if (result.allowed) return;
    logger.warn('security.rate_limited', { event });
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Please try again later.', {
      headers: { 'Retry-After': String(result.retryAfterSeconds) },
    });
  };

  /** Seats of the request that are locked by a live booking right now. */
  const takenSeats = async (db: Db, showtimeId: string, seatIds: readonly string[]) =>
    (
      await db.seatReservation.findMany({
        where: { showtimeId, seatId: { in: [...seatIds] } },
        select: { seatId: true },
      })
    ).map((r) => r.seatId);

  router.post('/bookings/hold', requireAuth, async (req, res) => {
    const owner = userId(req);
    enforce(limiters.holdPerIp, req.ip ?? 'unknown', 'booking_hold_ip');
    enforce(limiters.holdPerUser, owner, 'booking_hold_user');
    const input = parseInput(holdRequestSchema, req.body);
    const at = now();

    const show = await prisma.showtime.findFirst({
      where: {
        id: input.showtimeId,
        isActive: true,
        movie: { status: 'NOW_SHOWING' },
        hall: { isActive: true, location: { isActive: true } },
      },
      select: {
        id: true,
        startsAt: true,
        hall: {
          select: {
            id: true,
            hallTypeId: true,
            wholeHallOnly: true,
            location: { select: { id: true, timeZone: true } },
          },
        },
      },
    });
    if (!show) throw notFound();
    if (show.startsAt.getTime() <= at.getTime()) {
      throw new HttpError(410, 'gone', 'This show has already started.');
    }
    const { hall } = show;
    const wholeHall = input.wholeHall === true;
    if (hall.wholeHallOnly !== wholeHall) {
      throw unprocessable(
        hall.wholeHallOnly ? 'This hall is booked as a whole.' : 'This hall is booked per seat.',
      );
    }
    const seatIds = input.seatIds ?? [];
    const seats = await prisma.seat.findMany({
      where: { id: { in: seatIds }, hallId: hall.id, isActive: true },
      select: { id: true, seatType: true },
    });
    if (seats.length !== seatIds.length) {
      throw unprocessable('A seat does not belong to this show.');
    }
    if (seats.reduce((n, s) => n + ticketsPerSeat(s.seatType), 0) > MAX_TICKETS_PER_BOOKING) {
      throw unprocessable(`At most ${String(MAX_TICKETS_PER_BOOKING)} tickets per booking.`);
    }

    const [adult, settings] = await Promise.all([
      prisma.ticketCategory.findFirst({
        where: { code: 'ADULT', isActive: true },
        select: { id: true, code: true },
      }),
      prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } }),
    ]);
    if (!adult) throw new Error('The ADULT ticket category is missing.');
    const context: PricingContext = {
      pricedAt: at,
      showtime: { startsAt: show.startsAt },
      location: hall.location,
      hall: { id: hall.id, hallTypeId: hall.hallTypeId, wholeHallOnly: hall.wholeHallOnly },
      rules: await loadPricingRules(prisma, {
        locationId: hall.location.id,
        hallIds: [hall.id],
        ticketCategoryIds: [adult.id],
      }),
    };
    // New holds start with ADULT tickets; the buyer picks the categories in the next step.
    const priced = priceSeats(context, seats, (_id, count) =>
      Array.from({ length: count }, () => adult),
    );
    let whole: ReturnType<typeof priceWholeHall> | null = null;
    if (wholeHall) {
      try {
        whole = priceWholeHall(context);
      } catch (error) {
        if (error instanceof PricingError) throw unprocessable('This suite cannot be booked now.');
        throw error;
      }
    }
    const tickets = ticketRows(priced);
    const ticketCategoryId = adult.id;

    let bookingId: string;
    try {
      bookingId = await prisma.$transaction(async (tx) => {
        // One hold at a time per user: concurrent holds of the same user wait here.
        await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${owner}::uuid FOR UPDATE`;
        // Waits for an admin deactivating this show (it locks the row FOR UPDATE) and sees the
        // result; locked before any booking row, so the two never deadlock.
        const active = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Showtime" WHERE "id" = ${show.id}::uuid AND "isActive" FOR SHARE`;
        if (active.length === 0) throw notFound();
        await expireStaleHolds(tx, at, { showtimeId: show.id });
        await tx.booking.updateMany({
          where: { userId: owner, status: 'HELD' },
          data: { status: 'CANCELLED', cancelledAt: at },
        });
        if (wholeHall) {
          const taken = await tx.wholeHallReservation.count({ where: { showtimeId: show.id } });
          if (taken > 0) throw new HttpError(409, 'conflict', 'This suite is already booked.');
        } else {
          const taken = await takenSeats(tx, show.id, seatIds);
          if (taken.length > 0) {
            throw new HttpError(409, 'conflict', 'Some seats were just taken.', {
              takenSeatIds: taken,
            });
          }
        }
        const booking = await tx.booking.create({
          data: {
            code: generateBookingCode(),
            userId: owner,
            showtimeId: show.id,
            status: 'HELD',
            holdExpiresAt: new Date(at.getTime() + settings.seatHoldMinutes * MINUTE),
            totalCents: whole
              ? whole.totalCents
              : priced.reduce((sum, p) => sum + p.price.totalCents, 0),
            isWholeHall: wholeHall,
            wholeHallPriceCents: whole?.totalCents ?? null,
            ...(whole ? { wholeHallBreakdown: whole as unknown as Prisma.InputJsonValue } : {}),
            seats: { create: tickets.map((t) => ({ ...t, ticketCategoryId })) },
          },
          select: { id: true },
        });
        // The primary keys of the lock tables decide races between parallel holds.
        if (wholeHall) {
          await tx.wholeHallReservation.create({
            data: { showtimeId: show.id, hallId: hall.id, bookingId: booking.id },
          });
        } else {
          await tx.seatReservation.createMany({
            data: seatIds.map((seatId) => ({
              showtimeId: show.id,
              seatId,
              hallId: hall.id,
              bookingId: booking.id,
            })),
          });
        }
        return booking.id;
      });
    } catch (error) {
      if (sqlStateOf(error) !== '23505') throw error;
      // Lost a race: another hold locked a seat between our check and our insert.
      const taken = wholeHall ? [] : await takenSeats(prisma, show.id, seatIds);
      throw new HttpError(409, 'conflict', 'Some seats were just taken.', {
        ...(taken.length > 0 ? { takenSeatIds: taken } : {}),
      });
    }
    logger.info('booking.hold', { bookingId, showtimeId: show.id, seats: seatIds.length });
    res.status(201).json({ booking: await loadBooking(prisma, bookingId, owner, at) });
  });

  router.get('/bookings/current', requireAuth, async (req, res) => {
    const owner = userId(req);
    const at = now();
    const hold = await prisma.booking.findFirst({
      where: { userId: owner, status: 'HELD', holdExpiresAt: { gt: at } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    res.json({ booking: hold ? await loadBooking(prisma, hold.id, owner, at) : null });
  });

  router.get('/bookings/:id', requireAuth, async (req, res) => {
    const { id } = parseInput(idParams, req.params);
    const booking = await loadBooking(prisma, id, userId(req), now());
    if (!booking) throw notFound();
    res.json({ booking });
  });

  router.put('/bookings/:id/tickets', requireAuth, async (req, res) => {
    const owner = userId(req);
    const { id } = parseInput(idParams, req.params);
    const input = parseInput(ticketsRequestSchema, req.body);
    const at = now();

    await prisma.$transaction(async (tx) => {
      const booking = await lockOpenHold(tx, id, owner, at);

      // Exactly one ticket per person: occupant 1 on every seat, occupant 2 on sofas.
      const seatTypes = new Map(booking.seats.map((s) => [s.seatId, s.seat.seatType]));
      const expected = new Set(
        [...seatTypes].flatMap(([seatId, type]) =>
          Array.from({ length: ticketsPerSeat(type) }, (_, i) => `${seatId}:${String(i + 1)}`),
        ),
      );
      const given = new Set(input.tickets.map((t) => `${t.seatId}:${String(t.occupant)}`));
      if (
        given.size !== input.tickets.length ||
        given.size !== expected.size ||
        [...given].some((key) => !expected.has(key))
      ) {
        throw unprocessable('Every seat of the booking needs exactly its tickets.');
      }

      const codes = [...new Set(input.tickets.map((t) => t.category))];
      const categories = await tx.ticketCategory.findMany({
        where: { code: { in: codes }, isActive: true },
        select: { id: true, code: true },
      });
      if (categories.length !== codes.length) throw unprocessable('Unknown ticket category.');
      const byCode = new Map(categories.map((c) => [c.code, c]));

      const required = AGE_CONFIRMATION_RATINGS.includes(booking.showtime.movie.ageRating);
      const ageRatingConfirmed = required && input.ageRatingConfirmed;
      if (booking.isWholeHall) {
        await tx.booking.update({ where: { id }, data: { ageRatingConfirmed } });
        return;
      }

      const { hall } = booking.showtime;
      const context: PricingContext = {
        pricedAt: at,
        showtime: { startsAt: booking.showtime.startsAt },
        location: hall.location,
        hall: { id: hall.id, hallTypeId: hall.hallTypeId, wholeHallOnly: hall.wholeHallOnly },
        rules: await loadPricingRules(tx, {
          locationId: hall.location.id,
          hallIds: [hall.id],
          ticketCategoryIds: categories.map((c) => c.id),
        }),
      };
      const categoryOf = (seatId: string, occupant: number) => {
        const code = input.tickets.find(
          (t) => t.seatId === seatId && t.occupant === occupant,
        )?.category;
        const category = code ? byCode.get(code) : undefined;
        if (!category) throw unprocessable('Unknown ticket category.');
        return category;
      };
      const priced = priceSeats(
        context,
        [...seatTypes].map(([seatId, seatType]) => ({ id: seatId, seatType })),
        (seatId, count) => Array.from({ length: count }, (_, i) => categoryOf(seatId, i + 1)),
      );
      await tx.bookingSeat.deleteMany({ where: { bookingId: id } });
      await tx.bookingSeat.createMany({
        data: ticketRows(priced).map((row) => ({
          ...row,
          bookingId: id,
          ticketCategoryId: categoryOf(row.seatId, row.occupant).id,
        })),
      });
      await tx.booking.update({ where: { id }, data: { ageRatingConfirmed } });
      await storeTotal(tx, id);
    });
    res.json({ booking: await loadBooking(prisma, id, owner, at) });
  });

  router.put('/bookings/:id/food', requireAuth, async (req, res) => {
    const owner = userId(req);
    const { id } = parseInput(idParams, req.params);
    const input = parseInput(foodRequestSchema, req.body);
    const at = now();

    await prisma.$transaction(async (tx) => {
      const booking = await lockOpenHold(tx, id, owner, at);
      const { hall } = booking.showtime;
      const menuItemIds = [...new Set(input.items.map((line) => line.menuItemId))];
      // The cinema's own offer and price: never anything sent by the client.
      const offers = await tx.locationMenuItem.findMany({
        where: { ...availableMenuWhere(hall.location.id), menuItemId: { in: menuItemIds } },
        select: { menuItemId: true, priceCents: true, menuItem: { select: { nameSq: true } } },
      });
      const offerOf = new Map(offers.map((o) => [o.menuItemId, o]));
      const rows = input.items.map((line) => {
        const offer = offerOf.get(line.menuItemId);
        if (!offer) throw unprocessable('An item is not available at this cinema.');
        if (!isFulfillmentAllowed(hall.hallType, line.fulfillment)) {
          throw unprocessable('This hall does not bring food to the seat.');
        }
        let serveTiming;
        try {
          serveTiming = serveTimingFor(line.fulfillment, line.serveTiming);
        } catch (error) {
          if (error instanceof FulfillmentError) throw unprocessable(error.message);
          throw error;
        }
        return {
          bookingId: id,
          menuItemId: line.menuItemId,
          nameSq: offer.menuItem.nameSq,
          quantity: line.quantity,
          unitPriceCents: offer.priceCents,
          fulfillment: line.fulfillment,
          serveTiming,
        };
      });
      await tx.bookingFoodItem.deleteMany({ where: { bookingId: id } });
      if (rows.length > 0) await tx.bookingFoodItem.createMany({ data: rows });
      await storeTotal(tx, id);
    });
    logger.info('booking.food', { bookingId: id, lines: input.items.length });
    res.json({ booking: await loadBooking(prisma, id, owner, at) });
  });

  router.delete('/bookings/:id/hold', requireAuth, async (req, res) => {
    const owner = userId(req);
    const { id } = parseInput(idParams, req.params);
    const released = await prisma.booking.updateMany({
      where: { id, userId: owner, status: 'HELD' },
      data: { status: 'CANCELLED', cancelledAt: now() },
    });
    if (released.count === 0) {
      const exists = await prisma.booking.count({ where: { id, userId: owner } });
      if (exists === 0) throw notFound();
      throw new HttpError(409, 'conflict', 'This booking is not on hold.');
    }
    res.status(204).end();
  });

  return router;
}
