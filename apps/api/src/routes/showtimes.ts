import {
  SCHEDULE_DAYS,
  showtimesQuerySchema,
  type Availability,
  type FromPrice,
  type LanguageVersion,
  type MovieFormat,
  type ShowtimeDetailResponse,
  type ShowtimeGroup,
  type ShowtimesResponse,
} from '@kinemax/shared';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { loadPricingRules } from '../db/pricing-rules.js';
import { PricingError, priceSeat, priceWholeHall, type SeatTypeCode } from '../domain/pricing.js';
import { ticketsPerSeat } from '../domain/seat-tickets.js';
import { addDays, toLocalDateTime, zonedTimeToUtc } from '../domain/time-zone.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError, parseInput } from '../http/errors.js';

/** Availability changes with every booking: cache only briefly. */
export const SHOWTIMES_MAX_AGE_SECONDS = 30;
/** FEW_LEFT when fewer than this share of the hall's seats is free (and at least one is). */
export const FEW_LEFT_RATIO = 0.15;

const FORMAT: Record<'FORMAT_2D' | 'FORMAT_3D', MovieFormat> = {
  FORMAT_2D: '2D',
  FORMAT_3D: '3D',
};
const FORMAT_CODE: Record<MovieFormat, 'FORMAT_2D' | 'FORMAT_3D'> = {
  '2D': 'FORMAT_2D',
  '3D': 'FORMAT_3D',
};
const LANGUAGE_ORDER: LanguageVersion[] = [
  'ORIGINAL_SQ_SUBTITLES',
  'DUBBED_SQ',
  'ORIGINAL_NO_SUBTITLES',
];

const notFound = () => new HttpError(404, 'not_found', 'Not found.');
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (minuteOfDay: number) =>
  `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;

/**
 * Seat counts are lock units: a COUPLE sofa or a wheelchair space is one bookable place. A place
 * counts as taken while its booking is CONFIRMED, or HELD with a hold that has not expired yet.
 *   free = active places - taken places
 *   SOLD_OUT  when free <= 0
 *   FEW_LEFT  when free < 15% of the active places
 *   AVAILABLE otherwise
 */
export function availabilityLevel(totalPlaces: number, takenPlaces: number): Availability {
  const free = totalPlaces - takenPlaces;
  if (free <= 0) return 'SOLD_OUT';
  return free < totalPlaces * FEW_LEFT_RATIO ? 'FEW_LEFT' : 'AVAILABLE';
}

/** Bookings whose locks still count at `now`. */
const liveBooking = (now: Date): Prisma.BookingWhereInput => ({
  OR: [{ status: 'CONFIRMED' }, { status: 'HELD', holdExpiresAt: { gt: now } }],
});

function cacheBriefly(res: Response): void {
  if (res.getHeader('Set-Cookie') === undefined) {
    res.set('Cache-Control', `public, max-age=${String(SHOWTIMES_MAX_AGE_SECONDS)}`);
  }
}

const movieSelect = {
  slug: true,
  titleSq: true,
  titleEn: true,
  ageRating: true,
  durationMinutes: true,
  genres: true,
  posterPath: true,
} satisfies Prisma.MovieSelect;

const idParamsSchema = z.object({ id: z.uuid() });

export function createShowtimesRouter(prisma: PrismaClient, now: () => Date): Router {
  const router = Router();

  router.get('/showtimes', async (req, res) => {
    const query = parseInput(showtimesQuerySchema, req.query);
    const at = now();
    const location = await prisma.location.findFirst({
      where: { slug: query.location, isActive: true },
      select: { id: true, slug: true, name: true, city: true, timeZone: true },
    });
    if (!location) throw notFound();

    // Days are calendar days in the cinema's time zone, never the client's or the server's.
    const today = toLocalDateTime(at, location.timeZone).date;
    const days = Array.from({ length: SCHEDULE_DAYS }, (_, i) => addDays(today, i));
    const date = query.date ?? today;
    if (!days.includes(date)) {
      throw new HttpError(400, 'validation_failed', 'The request data is invalid.', {
        fields: [{ path: 'date', code: 'out_of_range' }],
      });
    }
    const dayStart = zonedTimeToUtc(date, 0, location.timeZone);
    const dayEnd = zonedTimeToUtc(addDays(date, 1), 0, location.timeZone);

    const showtimes = await prisma.showtime.findMany({
      where: {
        isActive: true,
        // Shows that already started are hidden (today).
        startsAt: { gte: dayStart > at ? dayStart : at, lt: dayEnd },
        movie: {
          status: 'NOW_SHOWING',
          ...(query.movie ? { slug: query.movie } : {}),
        },
        ...(query.format ? { format: { in: query.format.map((f) => FORMAT_CODE[f]) } } : {}),
        ...(query.language ? { languageVersion: { in: query.language } } : {}),
        hall: {
          isActive: true,
          locationId: location.id,
          ...(query.hallType ? { hallType: { code: { in: query.hallType } } } : {}),
        },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        format: true,
        languageVersion: true,
        movie: { select: movieSelect },
        hall: {
          select: {
            id: true,
            name: true,
            hallTypeId: true,
            wholeHallOnly: true,
            hallType: { select: { code: true, nameSq: true, nameEn: true, sortOrder: true } },
          },
        },
      },
    });

    const showtimeIds = showtimes.map((s) => s.id);
    const hallIds = [...new Set(showtimes.map((s) => s.hall.id))];
    const [seatTypes, takenSeats, takenHalls, adult] = await Promise.all([
      prisma.seat.groupBy({
        by: ['hallId', 'seatType'],
        where: { hallId: { in: hallIds }, isActive: true },
        _count: { _all: true },
      }),
      prisma.seatReservation.groupBy({
        by: ['showtimeId'],
        where: {
          showtimeId: { in: showtimeIds },
          booking: liveBooking(at),
          seat: { isActive: true },
        },
        _count: { _all: true },
      }),
      prisma.wholeHallReservation.findMany({
        where: { showtimeId: { in: showtimeIds }, booking: liveBooking(at) },
        select: { showtimeId: true },
      }),
      prisma.ticketCategory.findUnique({
        where: { code: 'ADULT' },
        select: { id: true, code: true },
      }),
    ]);
    const rules = await loadPricingRules(prisma, {
      locationId: location.id,
      hallIds,
      ticketCategoryIds: adult ? [adult.id] : [],
    });

    const placesByHall = new Map<string, number>();
    const priceableTypesByHall = new Map<string, SeatTypeCode[]>();
    for (const row of seatTypes) {
      placesByHall.set(row.hallId, (placesByHall.get(row.hallId) ?? 0) + row._count._all);
      if (ticketsPerSeat(row.seatType) === 1) {
        priceableTypesByHall.set(row.hallId, [
          ...(priceableTypesByHall.get(row.hallId) ?? []),
          row.seatType,
        ]);
      }
    }
    const takenByShowtime = new Map(takenSeats.map((r) => [r.showtimeId, r._count._all]));
    const soldWhole = new Set(takenHalls.map((r) => r.showtimeId));

    const fromPrice = (show: (typeof showtimes)[number]): FromPrice | null => {
      const context = {
        pricedAt: at,
        showtime: { startsAt: show.startsAt },
        location: { id: location.id, timeZone: location.timeZone },
        hall: show.hall,
        rules,
      };
      try {
        if (show.hall.wholeHallOnly) {
          return { kind: 'WHOLE_HALL', amountCents: priceWholeHall(context).totalCents };
        }
        if (!adult) return null;
        const prices = (priceableTypesByHall.get(show.hall.id) ?? []).map(
          (seatType) =>
            priceSeat({ ...context, seat: { seatType }, ticketCategory: adult }).totalCents,
        );
        return prices.length > 0 ? { kind: 'TICKET', amountCents: Math.min(...prices) } : null;
      } catch (error) {
        // No price rule for this hall type: show the times without a price.
        if (error instanceof PricingError) return null;
        throw error;
      }
    };

    const movies = new Map<
      string,
      ShowtimesResponse['movies'][number] & { sort: Map<string, number> }
    >();
    for (const show of showtimes) {
      const entry = movies.get(show.movie.slug) ?? {
        movie: show.movie,
        groups: [],
        sort: new Map<string, number>(),
      };
      movies.set(show.movie.slug, entry);
      const format = FORMAT[show.format];
      const key = `${show.hall.hallType.code}|${format}|${show.languageVersion}`;
      let group: ShowtimeGroup | undefined = entry.groups.find(
        (g) => `${g.hallType.code}|${g.format}|${g.languageVersion}` === key,
      );
      if (!group) {
        group = {
          hallType: {
            code: show.hall.hallType.code,
            nameSq: show.hall.hallType.nameSq,
            nameEn: show.hall.hallType.nameEn,
          },
          format,
          languageVersion: show.languageVersion,
          fromPrice: null,
          showtimes: [],
        };
        entry.groups.push(group);
        entry.sort.set(key, show.hall.hallType.sortOrder);
      }
      const start = toLocalDateTime(show.startsAt, location.timeZone);
      const end = toLocalDateTime(show.endsAt, location.timeZone);
      const availability: Availability = show.hall.wholeHallOnly
        ? soldWhole.has(show.id)
          ? 'SOLD_OUT'
          : 'AVAILABLE'
        : availabilityLevel(placesByHall.get(show.hall.id) ?? 0, takenByShowtime.get(show.id) ?? 0);
      group.showtimes.push({
        id: show.id,
        startsAt: show.startsAt.toISOString(),
        endsAt: show.endsAt.toISOString(),
        startTime: hhmm(start.minuteOfDay),
        endTime: hhmm(end.minuteOfDay),
        hallName: show.hall.name,
        availability,
      });
      const price = fromPrice(show);
      if (price && (!group.fromPrice || price.amountCents < group.fromPrice.amountCents)) {
        group.fromPrice = price;
      }
    }

    const body: ShowtimesResponse = {
      location: {
        slug: location.slug,
        name: location.name,
        city: location.city,
        timeZone: location.timeZone,
      },
      date,
      days,
      // Movies in the order of their first show of the day; groups by hall type, format, language.
      movies: [...movies.values()].map(({ movie, groups, sort }) => ({
        movie,
        groups: groups.sort(
          (a, b) =>
            (sort.get(`${a.hallType.code}|${a.format}|${a.languageVersion}`) ?? 0) -
              (sort.get(`${b.hallType.code}|${b.format}|${b.languageVersion}`) ?? 0) ||
            a.hallType.code.localeCompare(b.hallType.code) ||
            a.format.localeCompare(b.format) ||
            LANGUAGE_ORDER.indexOf(a.languageVersion) - LANGUAGE_ORDER.indexOf(b.languageVersion),
        ),
      })),
    };
    cacheBriefly(res);
    res.json(body);
  });

  /** One showtime for the booking page. Inactive showtimes, halls and cinemas are not found. */
  router.get('/showtimes/:id', async (req, res) => {
    const { id } = parseInput(idParamsSchema, req.params);
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
        endsAt: true,
        format: true,
        languageVersion: true,
        movie: { select: movieSelect },
        hall: {
          select: {
            name: true,
            wholeHallOnly: true,
            hallType: { select: { code: true, nameSq: true, nameEn: true } },
            location: {
              select: { slug: true, name: true, city: true, address: true, timeZone: true },
            },
          },
        },
      },
    });
    if (!show) throw notFound();
    const { location, ...hall } = show.hall;
    const start = toLocalDateTime(show.startsAt, location.timeZone);
    const body: ShowtimeDetailResponse = {
      showtime: {
        id: show.id,
        startsAt: show.startsAt.toISOString(),
        endsAt: show.endsAt.toISOString(),
        date: start.date,
        startTime: hhmm(start.minuteOfDay),
        endTime: hhmm(toLocalDateTime(show.endsAt, location.timeZone).minuteOfDay),
        format: FORMAT[show.format],
        languageVersion: show.languageVersion,
        hasStarted: show.startsAt.getTime() <= now().getTime(),
        movie: show.movie,
        location,
        hall,
      },
    };
    cacheBriefly(res);
    res.json(body);
  });

  return router;
}
