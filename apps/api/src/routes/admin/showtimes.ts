// Showtime management for managers (their cinemas) and super admins. Times are entered in the
// cinema's local time; the end is always computed here (movie + cleaning buffer) and the database
// refuses overlapping active shows in a hall (G2, 23P01 -> 409). A show that started is read-only.
import {
  adminShowtimesQuerySchema,
  bulkShowtimesSchema,
  showtimeInputSchema,
  showtimeUpdateSchema,
  type AdminShowtime,
  type AdminShowtimesResponse,
  type BulkPreviewResponse,
  type DeactivateResponse,
  type MovieFormat,
} from '@kinemax/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { CLEANING_BUFFER_MINUTES, showtimeEnd } from '../../domain/showtime-times.js';
import { addDays, toLocalDateTime, zonedTimeToUtc } from '../../domain/time-zone.js';
import type { ShowtimeFormat } from '../../generated/prisma/client.js';
import { HttpError, parseInput } from '../../http/errors.js';
import { idParams, notFound } from '../booking-common.js';
import { assertResourceScope, audit, locationScope, staffUser, type AdminDeps } from './common.js';

const FORMAT_TO_DB: Record<MovieFormat, ShowtimeFormat> = { '2D': 'FORMAT_2D', '3D': 'FORMAT_3D' };
const FORMAT_FROM_DB: Record<ShowtimeFormat, MovieFormat> = { FORMAT_2D: '2D', FORMAT_3D: '3D' };

const conflict = (message: string, code: string, path = 'startsAt') =>
  new HttpError(409, 'conflict', message, { fields: [{ path, code }] });

/** "HH:MM" → minutes since midnight. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** Local date + "HH:MM" in a time zone → the instant. */
function localToUtc(date: string, time: string, timeZone: string): Date {
  return zonedTimeToUtc(date, minutesOf(time), timeZone);
}

interface StatsRow {
  showtimeId: string;
  activeBookings: number;
  paidBookings: number;
  refundCents: number;
  soldTickets: number;
}

const showtimeSelect = {
  id: true,
  movieId: true,
  hallId: true,
  startsAt: true,
  endsAt: true,
  format: true,
  languageVersion: true,
  isActive: true,
  movie: { select: { titleSq: true, titleEn: true, durationMinutes: true } },
  hall: { select: { name: true, locationId: true, location: { select: { timeZone: true } } } },
} as const;

export function createShowtimesRouter({
  prisma,
  now,
  limit,
}: Pick<AdminDeps, 'prisma' | 'now'> & {
  limit: (req: Request, kind: 'write' | 'sensitive', event: string) => void;
}): Router {
  const router = Router();

  /** Sold tickets, active/paid bookings and the refundable total per show, in one query. */
  async function statsOf(ids: string[]): Promise<Map<string, StatsRow>> {
    if (ids.length === 0) return new Map();
    const rows = await prisma.$queryRaw<StatsRow[]>`
      SELECT
        b."showtimeId",
        COUNT(*)::int AS "activeBookings",
        COUNT(*) FILTER (WHERE b."status" = 'CONFIRMED')::int AS "paidBookings",
        COALESCE(SUM(b."totalCents") FILTER (WHERE b."status" = 'CONFIRMED'), 0)::int
          AS "refundCents",
        COALESCE(SUM(
          CASE WHEN b."status" <> 'CONFIRMED' THEN 0
               WHEN b."isWholeHall" THEN (
                 SELECT COUNT(*) FROM "Seat" st JOIN "Showtime" s ON s."hallId" = st."hallId"
                 WHERE s."id" = b."showtimeId" AND st."isActive")
               ELSE (SELECT COUNT(*) FROM "BookingSeat" bs WHERE bs."bookingId" = b."id")
          END), 0)::int AS "soldTickets"
      FROM "Booking" b
      WHERE b."showtimeId" = ANY(${ids}::uuid[]) AND b."status" IN ('HELD', 'CONFIRMED')
      GROUP BY b."showtimeId"`;
    return new Map(rows.map((row) => [row.showtimeId, row]));
  }

  type Row = NonNullable<Awaited<ReturnType<typeof findShowtime>>>;
  function findShowtime(id: string) {
    return prisma.showtime.findUnique({ where: { id }, select: showtimeSelect });
  }

  async function toAdmin(rows: Row[]): Promise<AdminShowtime[]> {
    const stats = await statsOf(rows.map((row) => row.id));
    const at = now().getTime();
    return rows.map((row) => {
      const s = stats.get(row.id);
      return {
        id: row.id,
        movieId: row.movieId,
        movieTitleSq: row.movie.titleSq,
        movieTitleEn: row.movie.titleEn,
        hallId: row.hallId,
        hallName: row.hall.name,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        format: FORMAT_FROM_DB[row.format],
        languageVersion: row.languageVersion,
        isActive: row.isActive,
        isPast: row.startsAt.getTime() <= at,
        soldTickets: s?.soldTickets ?? 0,
        activeBookings: s?.activeBookings ?? 0,
        paidBookings: s?.paidBookings ?? 0,
        refundCents: s?.refundCents ?? 0,
      };
    });
  }

  /** The show, if the caller manages its cinema (404 otherwise, also for unknown ids). */
  async function scopedShowtime(req: Request, id: string): Promise<Row> {
    const row = await findShowtime(id);
    await assertResourceScope(prisma, staffUser(req), row?.hall.locationId);
    if (!row) throw notFound();
    return row;
  }

  /** A hall of a cinema the caller manages (404 otherwise), with its time zone. */
  async function scopedHall(req: Request, hallId: string) {
    const hall = await prisma.hall.findUnique({
      where: { id: hallId },
      select: {
        id: true,
        isActive: true,
        locationId: true,
        location: { select: { timeZone: true } },
      },
    });
    await assertResourceScope(prisma, staffUser(req), hall?.locationId);
    if (!hall) throw notFound();
    if (!hall.isActive) {
      throw new HttpError(422, 'unprocessable', 'This hall is not active.', {
        fields: [{ path: 'hallId', code: 'inactive' }],
      });
    }
    return hall;
  }

  async function schedulableMovie(movieId: string) {
    const movie = await prisma.movie.findUnique({
      where: { id: movieId },
      select: { id: true, durationMinutes: true, status: true },
    });
    if (!movie || movie.status === 'ARCHIVED') {
      throw new HttpError(422, 'unprocessable', 'This movie cannot be scheduled.', {
        fields: [{ path: 'movieId', code: 'unavailable' }],
      });
    }
    return movie;
  }

  router.get('/showtimes', async (req, res) => {
    const query = parseInput(adminShowtimesQuerySchema, req.query);
    await locationScope(prisma, staffUser(req), query.location);
    const location = await prisma.location.findUnique({
      where: { id: query.location },
      select: { timeZone: true },
    });
    if (!location) throw notFound();
    const from = zonedTimeToUtc(query.date, 0, location.timeZone);
    const to = zonedTimeToUtc(addDays(query.date, 1), 0, location.timeZone);
    const [halls, movies, rows] = await Promise.all([
      prisma.hall.findMany({
        where: { locationId: query.location, isActive: true },
        select: {
          id: true,
          name: true,
          wholeHallOnly: true,
          hallType: { select: { nameSq: true, nameEn: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.movie.findMany({
        where: { status: { not: 'ARCHIVED' } },
        select: { id: true, titleSq: true, titleEn: true, durationMinutes: true },
        orderBy: { titleSq: 'asc' },
      }),
      prisma.showtime.findMany({
        where: { hall: { locationId: query.location }, startsAt: { gte: from, lt: to } },
        select: showtimeSelect,
        orderBy: [{ startsAt: 'asc' }],
      }),
    ]);
    const body: AdminShowtimesResponse = {
      timeZone: location.timeZone,
      date: query.date,
      cleaningBufferMinutes: CLEANING_BUFFER_MINUTES,
      halls: halls.map((hall) => ({
        id: hall.id,
        name: hall.name,
        wholeHallOnly: hall.wholeHallOnly,
        hallTypeNameSq: hall.hallType.nameSq,
        hallTypeNameEn: hall.hallType.nameEn,
      })),
      movies,
      showtimes: await toAdmin(rows),
    };
    res.json(body);
  });

  router.get('/showtimes/:id', async (req, res) => {
    const { id } = parseInput(idParams, req.params);
    const [showtime] = await toAdmin([await scopedShowtime(req, id)]);
    res.json({ showtime });
  });

  router.post('/showtimes', async (req, res) => {
    limit(req, 'write', 'admin_showtime_write');
    const input = parseInput(showtimeInputSchema, req.body);
    const hall = await scopedHall(req, input.hallId);
    const movie = await schedulableMovie(input.movieId);
    const startsAt = localToUtc(input.date, input.time, hall.location.timeZone);
    if (startsAt.getTime() <= now().getTime()) {
      throw new HttpError(422, 'unprocessable', 'A new show must start in the future.', {
        fields: [{ path: 'time', code: 'past' }],
      });
    }
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.showtime.create({
        data: {
          movieId: movie.id,
          hallId: hall.id,
          startsAt,
          endsAt: showtimeEnd(startsAt, movie.durationMinutes),
          format: FORMAT_TO_DB[input.format],
          languageVersion: input.languageVersion,
        },
        select: { id: true, startsAt: true, endsAt: true },
      });
      await audit(tx, req, {
        action: 'showtime.create',
        entityType: 'Showtime',
        entityId: row.id,
        after: { ...input, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() },
      });
      return row;
    });
    const [showtime] = await toAdmin([await scopedShowtime(req, created.id)]);
    res.status(201).json({ showtime });
  });

  /** Every slot with its instants and whether it can be created (overlaps, past, duplicates). */
  async function previewSlots(req: Request): Promise<{
    input: z.infer<typeof bulkShowtimesSchema>;
    hallId: string;
    movieDuration: number;
    slots: BulkPreviewResponse['slots'];
  }> {
    const input = parseInput(bulkShowtimesSchema, req.body);
    const hall = await scopedHall(req, input.hallId);
    const movie = await schedulableMovie(input.movieId);
    const at = now().getTime();
    const planned = input.slots.map((slot) => {
      const startsAt = localToUtc(slot.date, slot.time, hall.location.timeZone);
      return { ...slot, startsAt, endsAt: showtimeEnd(startsAt, movie.durationMinutes) };
    });
    const min = Math.min(...planned.map((p) => p.startsAt.getTime()));
    const max = Math.max(...planned.map((p) => p.endsAt.getTime()));
    const existing = await prisma.showtime.findMany({
      where: {
        hallId: hall.id,
        isActive: true,
        startsAt: { lt: new Date(max) },
        endsAt: { gt: new Date(min) },
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        movie: { select: { titleSq: true, titleEn: true } },
      },
    });
    const overlaps = (a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) =>
      a.startsAt < b.endsAt && b.startsAt < a.endsAt;
    const slots = planned.map((slot, index) => {
      const conflicts = existing.filter((show) => overlaps(slot, show));
      const duplicate = planned.slice(0, index).some((other) => overlaps(slot, other));
      const status =
        slot.startsAt.getTime() <= at
          ? ('past' as const)
          : conflicts.length > 0
            ? ('conflict' as const)
            : duplicate
              ? ('duplicate' as const)
              : ('ok' as const);
      return {
        date: slot.date,
        time: slot.time,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        status,
        conflicts: conflicts.map((show) => ({
          showtimeId: show.id,
          movieTitleSq: show.movie.titleSq,
          movieTitleEn: show.movie.titleEn,
          startsAt: show.startsAt.toISOString(),
          endsAt: show.endsAt.toISOString(),
        })),
      };
    });
    return { input, hallId: hall.id, movieDuration: movie.durationMinutes, slots };
  }

  router.post('/showtimes/bulk/preview', async (req, res) => {
    const { slots } = await previewSlots(req);
    const body: BulkPreviewResponse = { slots };
    res.json(body);
  });

  /** All or nothing: a slot that is not "ok" refuses the whole batch (409). */
  router.post('/showtimes/bulk', async (req, res) => {
    limit(req, 'sensitive', 'admin_showtime_bulk');
    const { input, hallId, slots } = await previewSlots(req);
    const bad = slots.findIndex((slot) => slot.status !== 'ok');
    if (bad >= 0) {
      throw conflict(
        'Some shows cannot be created.',
        slots[bad]?.status ?? 'conflict',
        `slots.${String(bad)}`,
      );
    }
    await prisma.$transaction(async (tx) => {
      const rows = await tx.showtime.createManyAndReturn({
        data: slots.map((slot) => ({
          movieId: input.movieId,
          hallId,
          startsAt: new Date(slot.startsAt),
          endsAt: new Date(slot.endsAt),
          format: FORMAT_TO_DB[input.format],
          languageVersion: input.languageVersion,
        })),
        select: { id: true },
      });
      await audit(tx, req, {
        action: 'showtime.bulk_create',
        entityType: 'Hall',
        entityId: hallId,
        after: { ...input, showtimeIds: rows.map((row) => row.id) },
      });
    });
    res.status(201).json({ created: slots.length });
  });

  router.patch('/showtimes/:id', async (req, res) => {
    limit(req, 'write', 'admin_showtime_write');
    const { id } = parseInput(idParams, req.params);
    const input = parseInput(showtimeUpdateSchema, req.body);
    const current = await scopedShowtime(req, id);
    if (current.startsAt.getTime() <= now().getTime()) {
      throw conflict('A show that started can no longer be changed.', 'past');
    }
    const hall = input.hallId ? await scopedHall(req, input.hallId) : null;
    const movie = input.movieId ? await schedulableMovie(input.movieId) : null;
    // Missing date or time: keep the current local one.
    const local = toLocalDateTime(current.startsAt, current.hall.location.timeZone);
    const startsAt = zonedTimeToUtc(
      input.date ?? local.date,
      input.time ? minutesOf(input.time) : local.minuteOfDay,
      (hall ?? current.hall).location.timeZone,
    );
    const timing =
      (movie !== null && movie.id !== current.movieId) ||
      (hall !== null && hall.id !== current.hallId) ||
      startsAt.getTime() !== current.startsAt.getTime();
    if (timing && startsAt.getTime() <= now().getTime()) {
      throw new HttpError(422, 'unprocessable', 'A show must start in the future.', {
        fields: [{ path: 'time', code: 'past' }],
      });
    }

    await prisma.$transaction(async (tx) => {
      // Serializes with holds (they lock the show FOR SHARE) and deactivations.
      await tx.$queryRaw`SELECT 1 FROM "Showtime" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (timing) {
        const active = await tx.booking.count({
          where: { showtimeId: id, status: { in: ['HELD', 'CONFIRMED'] } },
        });
        if (active > 0) {
          throw conflict('Tickets were sold: only format and language can change.', 'tickets_sold');
        }
      }
      const after = await tx.showtime.update({
        where: { id },
        data: {
          ...(movie ? { movieId: movie.id } : {}),
          ...(hall ? { hallId: hall.id } : {}),
          startsAt,
          endsAt: showtimeEnd(startsAt, movie?.durationMinutes ?? current.movie.durationMinutes),
          ...(input.format ? { format: FORMAT_TO_DB[input.format] } : {}),
          ...(input.languageVersion ? { languageVersion: input.languageVersion } : {}),
        },
        select: {
          movieId: true,
          hallId: true,
          startsAt: true,
          endsAt: true,
          format: true,
          languageVersion: true,
        },
      });
      await audit(tx, req, {
        action: 'showtime.update',
        entityType: 'Showtime',
        entityId: id,
        before: {
          movieId: current.movieId,
          hallId: current.hallId,
          startsAt: current.startsAt.toISOString(),
          endsAt: current.endsAt.toISOString(),
          format: current.format,
          languageVersion: current.languageVersion,
        },
        after: {
          ...after,
          startsAt: after.startsAt.toISOString(),
          endsAt: after.endsAt.toISOString(),
        },
      });
    });
    const [showtime] = await toAdmin([await scopedShowtime(req, id)]);
    res.json({ showtime });
  });

  /**
   * Deactivates a show and, in the same transaction, cancels every open hold and refunds (demo)
   * every paid booking; the seat locks are released by the status trigger (G11). Idempotent.
   */
  router.post('/showtimes/:id/deactivate', async (req, res) => {
    limit(req, 'sensitive', 'admin_showtime_deactivate');
    const { id } = parseInput(idParams, req.params);
    const current = await scopedShowtime(req, id);
    const at = now();
    if (current.startsAt.getTime() <= at.getTime()) {
      throw conflict('A show that started can no longer be changed.', 'past');
    }
    const result = await prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ isActive: boolean }[]>`
        SELECT "isActive" FROM "Showtime" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (!locked?.isActive) return { cancelled: 0, refunded: 0, refundedCents: 0 };
      await tx.showtime.update({ where: { id }, data: { isActive: false } });
      const bookings = await tx.$queryRaw<{ id: string; status: string; totalCents: number }[]>`
        SELECT "id", "status"::text AS "status", "totalCents" FROM "Booking"
        WHERE "showtimeId" = ${id}::uuid AND "status" IN ('HELD', 'CONFIRMED')
        ORDER BY "id" FOR UPDATE`;
      let refundedCents = 0;
      const refundedIds: string[] = [];
      const cancelledIds: string[] = [];
      for (const booking of bookings) {
        if (booking.status === 'HELD') {
          await tx.demoPayment.updateMany({
            where: { bookingId: booking.id, status: 'PENDING' },
            data: { status: 'FAILED' },
          });
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: 'CANCELLED', cancelledAt: at },
          });
          cancelledIds.push(booking.id);
          continue;
        }
        const payment = await tx.demoPayment.findFirst({
          where: { bookingId: booking.id, status: 'SUCCEEDED' },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (payment) {
          await tx.demoPayment.update({
            where: { id: payment.id },
            data: { status: 'REFUNDED', refundedAt: at },
          });
        }
        // CONFIRMED -> REFUNDED (G9); the trigger frees the seats in this transaction (G11).
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'REFUNDED', cancelledAt: at },
        });
        await audit(tx, req, {
          action: 'booking.refund',
          entityType: 'Booking',
          entityId: booking.id,
          before: { status: 'CONFIRMED', totalCents: booking.totalCents },
          after: {
            status: 'REFUNDED',
            refundCents: booking.totalCents,
            paymentId: payment?.id ?? null,
            reason: 'showtime.deactivated',
            showtimeId: id,
          },
        });
        refundedCents += booking.totalCents;
        refundedIds.push(booking.id);
      }
      await audit(tx, req, {
        action: 'showtime.deactivate',
        entityType: 'Showtime',
        entityId: id,
        before: { isActive: true },
        after: {
          isActive: false,
          cancelledBookingIds: cancelledIds,
          refundedBookingIds: refundedIds,
          refundedCents,
        },
      });
      return { cancelled: cancelledIds.length, refunded: refundedIds.length, refundedCents };
    });
    const [showtime] = await toAdmin([await scopedShowtime(req, id)]);
    if (!showtime) throw notFound();
    const body: DeactivateResponse = {
      showtime,
      cancelledBookings: result.cancelled,
      refundedBookings: result.refunded,
      refundedCents: result.refundedCents,
    };
    res.json(body);
  });

  /** Puts a future show back on sale (409 when the hall is taken by now). */
  router.post('/showtimes/:id/activate', async (req, res) => {
    limit(req, 'write', 'admin_showtime_write');
    const { id } = parseInput(idParams, req.params);
    const current = await scopedShowtime(req, id);
    if (current.startsAt.getTime() <= now().getTime()) {
      throw conflict('A show that started can no longer be changed.', 'past');
    }
    if (!current.isActive) {
      await prisma.$transaction(async (tx) => {
        await tx.showtime.update({ where: { id }, data: { isActive: true } });
        await audit(tx, req, {
          action: 'showtime.activate',
          entityType: 'Showtime',
          entityId: id,
          before: { isActive: false },
          after: { isActive: true },
        });
      });
    }
    const [showtime] = await toAdmin([await scopedShowtime(req, id)]);
    res.json({ showtime });
  });

  return router;
}
