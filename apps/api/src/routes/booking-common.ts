// Shared by the booking routes (holds, tickets, food, checkout, my tickets): who is asking, the
// booking as its owner sees it, the lock for a change and the stored total.
import {
  AGE_CONFIRMATION_RATINGS,
  type Booking,
  type BookingFood,
  type BookingSeat,
  type Ticket,
} from '@kinemax/shared';
import type { Request } from 'express';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { toLocalDateTime } from '../domain/time-zone.js';
import { HttpError } from '../http/errors.js';

export type Db = PrismaClient | Prisma.TransactionClient;

export const idParams = z.object({ id: z.uuid() });
export const notFound = () => new HttpError(404, 'not_found', 'Not found.');
export const unprocessable = (message: string) => new HttpError(422, 'unprocessable', message);

/** The signed-in user (routes below run after requireAuth). */
export function userId(req: Request): string {
  if (!req.auth) throw new HttpError(401, 'unauthorized', 'Please sign in.');
  return req.auth.user.id;
}

type SeatRow = Prisma.BookingSeatGetPayload<{ include: { seat: true } }>;
type FoodRow = Prisma.BookingFoodItemGetPayload<{
  include: { menuItem: { select: { nameEn: true } } };
}>;

/** One entry per booked seat (front rows first), with its tickets (one per person). */
export function seatsOf(rows: readonly SeatRow[]): BookingSeat[] {
  const bySeat = new Map<string, BookingSeat & { order: [number, string] }>();
  for (const row of rows) {
    const entry = bySeat.get(row.seatId) ?? {
      seatId: row.seatId,
      row: row.seat.rowLabel,
      number: row.seat.number,
      type: row.seat.seatType,
      tickets: [],
      surchargeCents: 0,
      totalCents: 0,
      order: [row.seat.y, row.seat.rowLabel],
    };
    entry.tickets.push({
      occupant: row.occupant,
      category: row.ticketCategoryCode,
      priceCents: row.unitPriceCents,
    });
    entry.surchargeCents += row.seatSurchargeCents;
    entry.totalCents += row.unitPriceCents + row.seatSurchargeCents;
    bySeat.set(row.seatId, entry);
  }
  return [...bySeat.values()]
    .sort(
      (a, b) =>
        a.order[0] - b.order[0] || a.order[1].localeCompare(b.order[1]) || a.number - b.number,
    )
    .map((seat) => ({
      seatId: seat.seatId,
      row: seat.row,
      number: seat.number,
      type: seat.type,
      tickets: seat.tickets.sort((a, b) => a.occupant - b.occupant),
      surchargeCents: seat.surchargeCents,
      totalCents: seat.totalCents,
    }));
}

/** The food lines with their price snapshots. */
export function foodOf(rows: readonly FoodRow[]): BookingFood[] {
  return rows.map((item) => ({
    menuItemId: item.menuItemId,
    nameSq: item.nameSq,
    nameEn: item.menuItem.nameEn,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    totalCents: item.quantity * item.unitPriceCents,
    fulfillment: item.fulfillment,
    serveTiming: item.serveTiming,
  }));
}

const ticketsCentsOf = (
  booking: { isWholeHall: boolean; wholeHallPriceCents: number | null },
  seats: readonly BookingSeat[],
) =>
  booking.isWholeHall
    ? (booking.wholeHallPriceCents ?? 0)
    : seats.reduce((sum, seat) => sum + seat.totalCents, 0);

/** The booking as the owner sees it; null when it does not exist or belongs to someone else. */
export async function loadBooking(
  db: Db,
  id: string,
  owner: string,
  at: Date,
): Promise<Booking | null> {
  const booking = await db.booking.findFirst({
    where: { id, userId: owner },
    include: {
      seats: { include: { seat: true } },
      foodItems: { include: { menuItem: { select: { nameEn: true } } }, orderBy: { id: 'asc' } },
      showtime: { select: { movie: { select: { ageRating: true } } } },
    },
  });
  if (!booking) return null;
  const categories = await db.ticketCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: { code: true, nameSq: true, nameEn: true, descriptionSq: true, descriptionEn: true },
  });

  const seats = seatsOf(booking.seats);
  const food = foodOf(booking.foodItems);
  const { ageRating } = booking.showtime.movie;
  // A hold past its expiry is over, even before the cleanup job marks it EXPIRED.
  const expired =
    booking.status === 'HELD' &&
    booking.holdExpiresAt !== null &&
    booking.holdExpiresAt.getTime() <= at.getTime();
  return {
    id: booking.id,
    status: expired ? 'EXPIRED' : booking.status,
    showtimeId: booking.showtimeId,
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    serverNow: at.toISOString(),
    isWholeHall: booking.isWholeHall,
    ageRating,
    ageConfirmationRequired: AGE_CONFIRMATION_RATINGS.includes(ageRating),
    ageRatingConfirmed: booking.ageRatingConfirmed,
    seats,
    wholeHallPriceCents: booking.wholeHallPriceCents,
    food,
    ticketsCents: ticketsCentsOf(booking, seats),
    foodCents: food.reduce((sum, item) => sum + item.totalCents, 0),
    totalCents: booking.totalCents,
    currency: 'EUR',
    categories,
  };
}

/** Recalculates the stored total from the booking's snapshots: tickets (or the suite) + food. */
export async function storeTotal(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id },
    select: {
      isWholeHall: true,
      wholeHallPriceCents: true,
      seats: { select: { unitPriceCents: true, seatSurchargeCents: true } },
      foodItems: { select: { quantity: true, unitPriceCents: true } },
    },
  });
  const tickets = booking.isWholeHall
    ? (booking.wholeHallPriceCents ?? 0)
    : booking.seats.reduce((sum, t) => sum + t.unitPriceCents + t.seatSurchargeCents, 0);
  const food = booking.foodItems.reduce((sum, f) => sum + f.quantity * f.unitPriceCents, 0);
  await tx.booking.update({ where: { id }, data: { totalCents: tickets + food } });
}

/**
 * Locks the user's booking for a change (serializing changes with each other and with a release)
 * and checks that it is still an open hold: another user's booking 404, not HELD 409, an expired
 * hold or a started show 410.
 */
export async function lockOpenHold(
  tx: Prisma.TransactionClient,
  id: string,
  owner: string,
  at: Date,
) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Booking" WHERE "id" = ${id}::uuid AND "userId" = ${owner}::uuid FOR UPDATE`;
  if (locked.length === 0) throw notFound();
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id },
    include: {
      seats: { select: { seatId: true, seat: { select: { seatType: true } } } },
      showtime: {
        select: {
          startsAt: true,
          movie: { select: { ageRating: true } },
          hall: {
            select: {
              id: true,
              hallTypeId: true,
              wholeHallOnly: true,
              hallType: { select: { code: true, allowsSeatDelivery: true } },
              location: { select: { id: true, timeZone: true } },
            },
          },
        },
      },
    },
  });
  if (booking.status !== 'HELD') {
    throw new HttpError(409, 'conflict', 'This booking can no longer be changed.');
  }
  if (
    (booking.holdExpiresAt?.getTime() ?? 0) <= at.getTime() ||
    booking.showtime.startsAt.getTime() <= at.getTime()
  ) {
    throw new HttpError(410, 'gone', 'This hold has expired.');
  }
  return booking;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MINUTE = 60_000;

const ticketInclude = {
  seats: { include: { seat: true } },
  foodItems: { include: { menuItem: { select: { nameEn: true } } }, orderBy: { id: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' }, take: 1 },
  showtime: {
    select: {
      startsAt: true,
      endsAt: true,
      movie: {
        select: {
          slug: true,
          titleSq: true,
          titleEn: true,
          posterPath: true,
          ageRating: true,
          durationMinutes: true,
        },
      },
      hall: {
        select: {
          name: true,
          hallType: { select: { code: true, nameSq: true, nameEn: true } },
          location: { select: { slug: true, name: true, address: true, timeZone: true } },
        },
      },
    },
  },
} satisfies Prisma.BookingInclude;
type TicketRow = Prisma.BookingGetPayload<{ include: typeof ticketInclude }>;

/**
 * When a confirmed booking can be cancelled: until the start minus the cutoff
 * (AppSettings.cancellationCutoffMinutes), inclusive. Exactly at the cutoff it is still allowed.
 */
export function cancellationOf(
  booking: { status: string; totalCents: number },
  show: { startsAt: Date; endsAt: Date },
  at: Date,
  cutoffMinutes: number,
): Ticket['cancellation'] {
  if (booking.status !== 'CONFIRMED' || show.endsAt.getTime() <= at.getTime()) return null;
  const until = new Date(show.startsAt.getTime() - cutoffMinutes * MINUTE);
  return {
    allowed: at.getTime() <= until.getTime(),
    until: until.toISOString(),
    refundCents: booking.totalCents,
  };
}

function toTicket(
  booking: TicketRow,
  categories: Ticket['categories'],
  at: Date,
  cutoffMinutes: number,
): Ticket {
  const { showtime } = booking;
  const { hall } = showtime;
  const seats = seatsOf(booking.seats);
  const food = foodOf(booking.foodItems);
  const local = toLocalDateTime(showtime.startsAt, hall.location.timeZone);
  const payment = booking.payments[0];
  const codes = new Set(booking.seats.map((row) => row.ticketCategoryCode));
  return {
    id: booking.id,
    code: booking.code,
    status: booking.status,
    movie: showtime.movie,
    location: hall.location,
    hall: {
      name: hall.name,
      hallTypeCode: hall.hallType.code,
      hallTypeNameSq: hall.hallType.nameSq,
      hallTypeNameEn: hall.hallType.nameEn,
    },
    startsAt: showtime.startsAt.toISOString(),
    endsAt: showtime.endsAt.toISOString(),
    localDate: local.date,
    localTime: `${pad(Math.floor(local.minuteOfDay / 60))}:${pad(local.minuteOfDay % 60)}`,
    isWholeHall: booking.isWholeHall,
    seats,
    food,
    ticketsCents: ticketsCentsOf(booking, seats),
    foodCents: food.reduce((sum, item) => sum + item.totalCents, 0),
    totalCents: booking.totalCents,
    currency: 'EUR',
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    categories: categories.filter((c) => codes.has(c.code)),
    payment: payment
      ? { status: payment.status, amountCents: payment.amountCents, reference: payment.reference }
      : null,
    cancellation: cancellationOf(booking, showtime, at, cutoffMinutes),
  };
}

/**
 * Bookings as tickets (confirmation page, "Biletat e mia"), soonest show first. Callers always
 * include the owner in `where`.
 */
export async function loadTickets(
  db: Db,
  where: Prisma.BookingWhereInput,
  at: Date,
): Promise<Ticket[]> {
  const [rows, settings, categories] = await Promise.all([
    db.booking.findMany({
      where,
      include: ticketInclude,
      orderBy: [{ showtime: { startsAt: 'asc' } }, { id: 'asc' }],
    }),
    db.appSettings.findUniqueOrThrow({ where: { id: 1 } }),
    db.ticketCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { code: true, nameSq: true, nameEn: true, descriptionSq: true, descriptionEn: true },
    }),
  ]);
  return rows.map((row) => toTicket(row, categories, at, settings.cancellationCutoffMinutes));
}

/** One booking as a ticket; null when nothing matches (the owner is part of `where`). */
export async function loadTicket(
  db: Db,
  where: Prisma.BookingWhereInput,
  at: Date,
): Promise<Ticket | null> {
  return (await loadTickets(db, where, at))[0] ?? null;
}
