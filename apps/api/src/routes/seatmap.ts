import type { SeatMapResponse, SeatType } from '@kinemax/shared';
import { Router } from 'express';
import { z } from 'zod';
import { loadPricingRules } from '../db/pricing-rules.js';
import { PricingError, priceSeatTickets, priceWholeHall } from '../domain/pricing.js';
import { ticketsPerSeat } from '../domain/seat-tickets.js';
import { toLocalDateTime } from '../domain/time-zone.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError, parseInput } from '../http/errors.js';

const FORMAT = { FORMAT_2D: '2D', FORMAT_3D: '3D' } as const;
const pad = (n: number) => String(n).padStart(2, '0');

/** Bookings whose locks still count at `now` (expired holds do not). */
export const liveBooking = (now: Date): Prisma.BookingWhereInput => ({
  OR: [{ status: 'CONFIRMED' }, { status: 'HELD', holdExpiresAt: { gt: now } }],
});

/**
 * GET /api/showtimes/:id/seatmap: the hall, every active seat with its live status (never who holds
 * it), estimated ADULT prices per seat type and, for suites, the whole-suite price. Availability
 * changes every second, so nothing here may be cached.
 */
export function createSeatMapRouter(prisma: PrismaClient, now: () => Date): Router {
  const router = Router();

  router.get('/showtimes/:id/seatmap', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { id } = parseInput(z.object({ id: z.uuid() }), req.params);
    const at = now();
    const show = await prisma.showtime.findFirst({
      where: {
        id,
        isActive: true,
        movie: { status: 'NOW_SHOWING' },
        hall: { isActive: true, location: { isActive: true } },
      },
      select: {
        id: true,
        startsAt: true,
        format: true,
        languageVersion: true,
        movie: {
          select: {
            slug: true,
            titleSq: true,
            titleEn: true,
            ageRating: true,
            durationMinutes: true,
            genres: true,
            posterPath: true,
            backdropPath: true,
          },
        },
        hall: {
          select: {
            id: true,
            name: true,
            hallTypeId: true,
            wholeHallOnly: true,
            screenWidthM: true,
            screenHeightM: true,
            screenX: true,
            screenY: true,
            screenZ: true,
            hallType: { select: { code: true, nameSq: true, nameEn: true } },
            location: { select: { id: true, slug: true, name: true, city: true, timeZone: true } },
          },
        },
      },
    });
    if (!show) throw new HttpError(404, 'not_found', 'Not found.');
    if (show.startsAt.getTime() <= at.getTime()) {
      throw new HttpError(410, 'gone', 'This show has already started.');
    }
    const { hall } = show;
    const { location } = hall;

    const [seats, taken, wholeTaken, adult] = await Promise.all([
      prisma.seat.findMany({
        where: { hallId: hall.id, isActive: true },
        orderBy: [{ y: 'asc' }, { rowLabel: 'asc' }, { number: 'asc' }],
      }),
      prisma.seatReservation.findMany({
        where: { showtimeId: show.id, booking: liveBooking(at) },
        select: { seatId: true },
      }),
      prisma.wholeHallReservation.count({
        where: { showtimeId: show.id, booking: liveBooking(at) },
      }),
      prisma.ticketCategory.findUnique({
        where: { code: 'ADULT' },
        select: { id: true, code: true },
      }),
    ]);
    const takenIds = new Set(taken.map((r) => r.seatId));
    const rules = await loadPricingRules(prisma, {
      locationId: location.id,
      hallIds: [hall.id],
      ticketCategoryIds: adult ? [adult.id] : [],
    });
    const context = {
      pricedAt: at,
      showtime: { startsAt: show.startsAt },
      location: { id: location.id, timeZone: location.timeZone },
      hall: { id: hall.id, hallTypeId: hall.hallTypeId, wholeHallOnly: hall.wholeHallOnly },
      rules,
    };

    const prices: Partial<Record<SeatType, number>> = {};
    if (!hall.wholeHallOnly && adult) {
      for (const type of new Set(seats.map((s) => s.seatType))) {
        try {
          prices[type] = priceSeatTickets({
            ...context,
            seat: { seatType: type },
            ticketCategories: Array.from({ length: ticketsPerSeat(type) }, () => adult),
          }).totalCents;
        } catch (error) {
          if (!(error instanceof PricingError)) throw error;
        }
      }
    }
    let wholeHall: SeatMapResponse['wholeHall'] = null;
    if (hall.wholeHallOnly) {
      let priceCents: number | null = null;
      try {
        priceCents = priceWholeHall(context).totalCents;
      } catch (error) {
        if (!(error instanceof PricingError)) throw error;
      }
      wholeHall = { priceCents, taken: wholeTaken > 0 };
    }

    const local = toLocalDateTime(show.startsAt, location.timeZone);
    const body: SeatMapResponse = {
      showtime: {
        id: show.id,
        startsAt: show.startsAt.toISOString(),
        date: local.date,
        startTime: `${pad(Math.floor(local.minuteOfDay / 60))}:${pad(local.minuteOfDay % 60)}`,
        format: FORMAT[show.format],
        languageVersion: show.languageVersion,
      },
      movie: show.movie,
      location: {
        slug: location.slug,
        name: location.name,
        city: location.city,
        timeZone: location.timeZone,
      },
      hall: {
        name: hall.name,
        hallType: hall.hallType,
        wholeHallOnly: hall.wholeHallOnly,
        screen: {
          widthM: hall.screenWidthM,
          heightM: hall.screenHeightM,
          x: hall.screenX,
          y: hall.screenY,
          z: hall.screenZ,
        },
      },
      seats: seats.map((seat) => ({
        id: seat.id,
        row: seat.rowLabel,
        number: seat.number,
        type: seat.seatType,
        x: seat.x,
        y: seat.y,
        z: seat.z,
        rotationDeg: seat.rotationDeg,
        widthUnits: seat.widthUnits,
        // A sold suite makes every place taken too.
        status: takenIds.has(seat.id) || wholeTaken > 0 ? 'TAKEN' : 'AVAILABLE',
      })),
      prices,
      wholeHall,
    };
    res.json(body);
  });

  return router;
}
