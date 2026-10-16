// GET /api/admin/stats: the dashboard numbers for the caller's cinemas, from five set-based
// queries (no per-row round trips). Days are local days of the cinema's time zone.
import { statsQuerySchema, type StatsRange, type StatsResponse } from '@kinemax/shared';
import type { Request, Response } from 'express';
import { addDays, toLocalDateTime, zonedTimeToUtc } from '../../domain/time-zone.js';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { parseInput } from '../../http/errors.js';
import { locationScope, staffUser } from './common.js';

const RANGE_DAYS: Record<StatsRange, number> = { today: 1, '7d': 7, '30d': 30 };
const DEFAULT_TIME_ZONE = 'Europe/Belgrade';
const HOUR = 3_600_000;
const TOP_MOVIES = 5;
const UPCOMING_LIMIT = 20;

interface SalesRow {
  day: string;
  movieId: string;
  hallTypeId: string;
  ticketsCents: number;
  foodCents: number;
  refundsCents: number;
  tickets: number;
}

interface UpcomingRow {
  showtimeId: string;
  startsAt: Date;
  movieTitleSq: string;
  movieTitleEn: string | null;
  hallName: string;
  locationName: string;
  soldSeats: number;
  capacity: number;
}

/**
 * Sales events in [from, to): +payment when it succeeded, −payment when it was refunded, each
 * split into food (the booking's food lines) and tickets (the rest), grouped by local day, movie
 * and hall type. A suite booking counts the hall's active seats as tickets.
 */
function salesRows(prisma: PrismaClient, scope: string[] | null, from: Date, to: Date, tz: string) {
  return prisma.$queryRaw<SalesRow[]>`
    WITH events AS (
      SELECT p."bookingId", p."succeededAt" AS "at", 1 AS "sign", p."amountCents"
      FROM "DemoPayment" p
      WHERE p."status" IN ('SUCCEEDED', 'REFUNDED')
        AND p."succeededAt" >= ${from} AND p."succeededAt" < ${to}
      UNION ALL
      SELECT p."bookingId", p."refundedAt", -1, p."amountCents"
      FROM "DemoPayment" p
      WHERE p."status" = 'REFUNDED' AND p."refundedAt" >= ${from} AND p."refundedAt" < ${to}
    )
    SELECT
      to_char(e."at" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "day",
      s."movieId",
      h."hallTypeId",
      SUM(e."sign" * (e."amountCents" - COALESCE(f."cents", 0)))::int AS "ticketsCents",
      SUM(e."sign" * COALESCE(f."cents", 0))::int AS "foodCents",
      SUM(CASE WHEN e."sign" < 0 THEN e."amountCents" ELSE 0 END)::int AS "refundsCents",
      SUM(e."sign" * CASE WHEN b."isWholeHall" THEN hs."seats" ELSE t."tickets" END)::int
        AS "tickets"
    FROM events e
    JOIN "Booking" b ON b."id" = e."bookingId"
    JOIN "Showtime" s ON s."id" = b."showtimeId"
    JOIN "Hall" h ON h."id" = s."hallId"
    LEFT JOIN LATERAL (
      SELECT SUM(fi."quantity" * fi."unitPriceCents") AS "cents"
      FROM "BookingFoodItem" fi WHERE fi."bookingId" = b."id"
    ) f ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "tickets" FROM "BookingSeat" bs WHERE bs."bookingId" = b."id"
    ) t ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS "seats" FROM "Seat" st WHERE st."hallId" = h."id" AND st."isActive"
    ) hs ON TRUE
    WHERE (${scope}::uuid[] IS NULL OR h."locationId" = ANY(${scope}::uuid[]))
    GROUP BY 1, 2, 3`;
}

/**
 * Per show "s" of hall "h": its capacity (cap.seats = active seats) and the booked seats
 * (sold.seats = CONFIRMED seat locks; wh.booked = the suite is booked whole, i.e. every seat).
 */
const SHOW_SEATS = Prisma.sql`
    CROSS JOIN LATERAL (
      SELECT COUNT(*) AS "seats" FROM "Seat" st WHERE st."hallId" = h."id" AND st."isActive"
    ) cap
    CROSS JOIN LATERAL (
      SELECT COUNT(*) AS "seats" FROM "SeatReservation" r
      JOIN "Booking" b ON b."id" = r."bookingId"
      WHERE r."showtimeId" = s."id" AND b."status" = 'CONFIRMED'
    ) sold
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM "WholeHallReservation" w JOIN "Booking" b ON b."id" = w."bookingId"
        WHERE w."showtimeId" = s."id" AND b."status" = 'CONFIRMED'
      ) AS "booked"
    ) wh`;

function occupancy(prisma: PrismaClient, scope: string[] | null, from: Date, to: Date) {
  return prisma.$queryRaw<{ soldSeats: number; capacity: number }[]>`
    SELECT
      COALESCE(SUM(CASE WHEN wh."booked" THEN cap."seats" ELSE sold."seats" END), 0)::int
        AS "soldSeats",
      COALESCE(SUM(cap."seats"), 0)::int AS "capacity"
    FROM "Showtime" s
    JOIN "Hall" h ON h."id" = s."hallId"
    ${SHOW_SEATS}
    WHERE s."isActive" AND s."startsAt" >= ${from} AND s."startsAt" < ${to}
      AND (${scope}::uuid[] IS NULL OR h."locationId" = ANY(${scope}::uuid[]))`;
}

function upcoming(prisma: PrismaClient, scope: string[] | null, from: Date, to: Date) {
  return prisma.$queryRaw<UpcomingRow[]>`
    SELECT
      s."id" AS "showtimeId", s."startsAt",
      m."titleSq" AS "movieTitleSq", m."titleEn" AS "movieTitleEn",
      h."name" AS "hallName", l."name" AS "locationName",
      (CASE WHEN wh."booked" THEN cap."seats" ELSE sold."seats" END)::int AS "soldSeats",
      cap."seats"::int AS "capacity"
    FROM "Showtime" s
    JOIN "Movie" m ON m."id" = s."movieId"
    JOIN "Hall" h ON h."id" = s."hallId"
    JOIN "Location" l ON l."id" = h."locationId"
    ${SHOW_SEATS}
    WHERE s."isActive" AND s."startsAt" >= ${from} AND s."startsAt" < ${to}
      AND (${scope}::uuid[] IS NULL OR h."locationId" = ANY(${scope}::uuid[]))
    ORDER BY s."startsAt", l."name", h."name"
    LIMIT ${UPCOMING_LIMIT}`;
}

/** Paid bookings with seat delivery for shows that start in [from, to). */
async function seatDeliveries(prisma: PrismaClient, scope: string[] | null, from: Date, to: Date) {
  const [row] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS "count"
    FROM "Booking" b
    JOIN "Showtime" s ON s."id" = b."showtimeId"
    JOIN "Hall" h ON h."id" = s."hallId"
    WHERE b."status" = 'CONFIRMED' AND s."startsAt" >= ${from} AND s."startsAt" < ${to}
      AND (${scope}::uuid[] IS NULL OR h."locationId" = ANY(${scope}::uuid[]))
      AND EXISTS (
        SELECT 1 FROM "BookingFoodItem" f
        WHERE f."bookingId" = b."id" AND f."fulfillment" = 'DELIVER_TO_SEAT'
      )`;
  return row?.count ?? 0;
}

/** Adds the values of `row` into the entry for `key` (created from `init`). */
function addInto<T extends { ticketsSold: number; revenueCents: number }>(
  map: Map<string, T>,
  key: string,
  init: () => T,
  row: SalesRow,
) {
  const entry = map.get(key) ?? init();
  entry.ticketsSold += row.tickets;
  entry.revenueCents += row.ticketsCents;
  map.set(key, entry);
}

export function createStatsHandler(prisma: PrismaClient, now: () => Date) {
  return async (req: Request, res: Response) => {
    const query = parseInput(statsQuerySchema, req.query);
    const scope = await locationScope(prisma, staffUser(req), query.location);
    const first = await prisma.location.findFirst({
      where: scope === null ? {} : { id: { in: scope } },
      select: { timeZone: true },
      orderBy: { name: 'asc' },
    });
    // shortcut: "all cinemas" uses the first cinema's time zone (every seeded cinema is in
    // Europe/Belgrade); cinemas in several time zones would need per-cinema day buckets.
    const tz = first?.timeZone ?? DEFAULT_TIME_ZONE;
    const at = now();
    const today = toLocalDateTime(at, tz).date;
    const days = RANGE_DAYS[query.range];
    const fromDate = addDays(today, -(days - 1));
    const from = zonedTimeToUtc(fromDate, 0, tz);
    const to = zonedTimeToUtc(addDays(today, 1), 0, tz);
    const todayStart = zonedTimeToUtc(today, 0, tz);

    const [sales, [seats], next, deliveries] = await Promise.all([
      salesRows(prisma, scope, from, to, tz),
      occupancy(prisma, scope, from, to),
      upcoming(prisma, scope, at, new Date(at.getTime() + 24 * HOUR)),
      seatDeliveries(prisma, scope, todayStart, to),
    ]);

    const movies = new Map<string, StatsResponse['topMovies'][number]>();
    const types = new Map<string, StatsResponse['hallTypes'][number]>();
    const daily = new Map(
      Array.from({ length: days }, (_, i) => {
        const date = addDays(fromDate, i);
        return [date, { date, ticketsCents: 0, foodCents: 0, totalCents: 0 }];
      }),
    );
    const revenue = { ticketsCents: 0, foodCents: 0, totalCents: 0, refundsCents: 0 };
    let ticketsSold = 0;
    for (const row of sales) {
      revenue.ticketsCents += row.ticketsCents;
      revenue.foodCents += row.foodCents;
      revenue.refundsCents += row.refundsCents;
      ticketsSold += row.tickets;
      const day = daily.get(row.day);
      if (day) {
        day.ticketsCents += row.ticketsCents;
        day.foodCents += row.foodCents;
        day.totalCents += row.ticketsCents + row.foodCents;
      }
      addInto(
        movies,
        row.movieId,
        () => ({
          movieId: row.movieId,
          titleSq: '',
          titleEn: null,
          ticketsSold: 0,
          revenueCents: 0,
        }),
        row,
      );
      addInto(
        types,
        row.hallTypeId,
        () => ({ code: row.hallTypeId, nameSq: '', nameEn: null, ticketsSold: 0, revenueCents: 0 }),
        row,
      );
    }
    revenue.totalCents = revenue.ticketsCents + revenue.foodCents;

    const top = [...movies.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents || b.ticketsSold - a.ticketsSold)
      .slice(0, TOP_MOVIES);
    const [movieRows, typeRows] = await Promise.all([
      prisma.movie.findMany({
        where: { id: { in: top.map((m) => m.movieId) } },
        select: { id: true, titleSq: true, titleEn: true },
      }),
      prisma.hallType.findMany({
        select: { id: true, code: true, nameSq: true, nameEn: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const titles = new Map(movieRows.map((m) => [m.id, m]));

    const body: StatsResponse = {
      range: query.range,
      timeZone: tz,
      from: fromDate,
      to: today,
      revenue,
      ticketsSold,
      occupancy: seats ?? { soldSeats: 0, capacity: 0 },
      daily: [...daily.values()],
      topMovies: top.map((m) => ({
        ...m,
        titleSq: titles.get(m.movieId)?.titleSq ?? '',
        titleEn: titles.get(m.movieId)?.titleEn ?? null,
      })),
      // Every hall type, also those without sales, in their display order.
      hallTypes: typeRows.map((type) => ({
        code: type.code,
        nameSq: type.nameSq,
        nameEn: type.nameEn,
        ticketsSold: types.get(type.id)?.ticketsSold ?? 0,
        revenueCents: types.get(type.id)?.revenueCents ?? 0,
      })),
      upcoming: next.map((row) => ({ ...row, startsAt: row.startsAt.toISOString() })),
      seatDeliveryOrdersToday: deliveries,
    };
    res.json(body);
  };
}
