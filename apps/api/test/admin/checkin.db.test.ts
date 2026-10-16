import { checkinResponseSchema } from '@kinemax/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateBookingCode } from '../../src/domain/booking-code.js';
import { resetDatabase, ticket } from '../db/helpers.js';
import {
  createAdminFixture,
  expectRefused,
  GENEROUS_LIMITS,
  staffClients,
  type AdminFixture,
  type Client,
  type Role,
} from '../support/admin.js';
import { makeTestApp, testPrisma } from '../support/app.js';

// QR check-in at the entrance: who may scan, which tickets pass, and when.

const prisma = testPrisma();
const START = new Date('2030-03-10T18:00:00Z'); // 19:00 in Kosovo
const MINUTE = 60_000;
let clock = START.getTime();
const { app } = makeTestApp({ ...GENEROUS_LIMITS, now: () => new Date(clock) });
let fx: AdminFixture;
let clients: Record<Role, Client>;
let showId: string;

beforeEach(async () => {
  clock = START.getTime();
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
  showId = (await show(START)).id;
});

async function show(startsAt: Date) {
  return prisma.showtime.create({
    data: {
      movieId: fx.movie.id,
      hallId: fx.hall.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 120 * MINUTE),
      languageVersion: 'DUBBED_SQ',
    },
  });
}

/** A booking of one seat; 'paid' = CONFIRMED, plus pickup food. */
async function booking(status: 'paid' | 'held' | 'refunded', showtimeId = showId, seatIndex = 0) {
  const seat = fx.seats.hall[seatIndex];
  return prisma.$transaction(async (tx) => {
    const row = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        userId: fx.user.id,
        showtimeId,
        holdExpiresAt: new Date(Date.now() + 600_000),
        totalCents: 450,
      },
    });
    await tx.seatReservation.create({
      data: { showtimeId, hallId: fx.hall.id, seatId: seat?.id ?? '', bookingId: row.id },
    });
    await tx.bookingSeat.create({ data: ticket(row.id, seat?.id ?? '', fx.adult) });
    if (status !== 'held') {
      const item = await tx.menuItem.create({
        data: { slug: `pop-${row.id}`, nameSq: 'Kokoshka', category: 'POPCORN' },
      });
      await tx.bookingFoodItem.create({
        data: {
          bookingId: row.id,
          menuItemId: item.id,
          nameSq: 'Kokoshka',
          quantity: 1,
          unitPriceCents: 300,
        },
      });
      await tx.booking.update({
        where: { id: row.id },
        data: { status: 'CONFIRMED', confirmedAt: START },
      });
    }
    if (status === 'refunded') {
      await tx.booking.update({
        where: { id: row.id },
        data: { status: 'REFUNDED', cancelledAt: START },
      });
    }
    return row;
  });
}

const scan = async (code: string, client = clients.manager, locationId = fx.location.id) =>
  checkinResponseSchema.parse(
    (await client.post('/api/admin/checkin', { code, locationId }).expect(200)).body,
  );

describe('POST /api/admin/checkin', () => {
  it('checks a paid ticket in once, whatever the QR text looks like, and answers the same again', async () => {
    const paid = await booking('paid');
    clock = START.getTime() - 10 * MINUTE;
    const first = await scan(`KINEMAX:${paid.code.toLowerCase().replace(/(.{4})/g, '$1 ')}`);
    expect(first).toMatchObject({
      result: 'ok',
      already: false,
      ticket: {
        code: paid.code,
        movieTitleSq: 'Filmi i Testit',
        ageRating: 'AGE_12',
        hallName: 'Salla 1',
        seats: ['A1'],
        food: [{ nameSq: 'Kokoshka', quantity: 1 }],
      },
    });
    clock += 5 * MINUTE;
    const again = await scan(paid.code);
    expect(again).toMatchObject({
      result: 'ok',
      already: true,
      checkedInAt: first.result === 'ok' ? first.checkedInAt : '',
    });
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: paid.id } });
    expect(row.checkedInById).toBe(fx.staff.manager.id);
    expect(await prisma.auditLog.count({ where: { action: 'booking.checkin' } })).toBe(1);
  });

  it('opens 90 minutes before the start and closes 30 minutes after it', async () => {
    const cases: [number, string][] = [
      [-90 * MINUTE - 1, 'too_early'],
      [-90 * MINUTE, 'ok'],
      [30 * MINUTE, 'ok'],
      [30 * MINUTE + 1, 'too_late'],
    ];
    for (const [offset, expected] of cases) {
      const paid = await booking(
        'paid',
        showId,
        cases.findIndex(([o]) => o === offset),
      );
      clock = START.getTime() + offset;
      const res = await scan(paid.code);
      expect(res.result === 'ok' ? 'ok' : res.reason, String(offset)).toBe(expected);
    }
  });

  it('names the reason for every rejected ticket', async () => {
    clock = START.getTime();
    const held = await booking('held', showId, 0);
    const refunded = await booking('refunded', showId, 1);
    // A show at 00:30 tomorrow is inside the 90-minute window at 23:30, but not today.
    const tomorrowShow = await show(new Date('2030-03-10T23:30:00Z'));
    const tomorrow = await booking('paid', tomorrowShow.id, 2);
    expect(await scan(held.code)).toMatchObject({ result: 'rejected', reason: 'not_paid' });
    expect(await scan(refunded.code)).toMatchObject({ result: 'rejected', reason: 'cancelled' });
    expect(await scan('ZZZZ')).toMatchObject({ result: 'rejected', reason: 'not_found' });
    expect(await scan('0000000000000000')).toMatchObject({
      result: 'rejected',
      reason: 'not_found',
    });
    clock = new Date('2030-03-10T22:30:00Z').getTime(); // 23:30 local
    expect(await scan(tomorrow.code)).toMatchObject({ result: 'rejected', reason: 'not_today' });
    // Another cinema's staff scanning at their own door: wrong cinema, nothing about the ticket.
    const other = await scan(held.code, clients.otherManager, fx.other.location.id);
    expect(other).toEqual({
      result: 'rejected',
      reason: 'wrong_location',
      startsAt: null,
      timeZone: null,
    });
    expect(await prisma.booking.count({ where: { checkedInAt: { not: null } } })).toBe(0);
  });

  it('only lets staff of the cinema scan for it (IDOR, customers, visitors)', async () => {
    const paid = await booking('paid');
    clock = START.getTime();
    await expectRefused(
      clients,
      ['otherManager', 'customer', 'anonymous'],
      (c) => c.post('/api/admin/checkin', { code: paid.code, locationId: fx.location.id }),
      () => prisma.booking.findMany({ select: { checkedInAt: true } }),
    );
    await clients.manager.post('/api/admin/checkin', { code: paid.code }).expect(400);
    // A super admin may scan at any cinema.
    expect(await scan(paid.code, clients.superAdmin)).toMatchObject({ result: 'ok' });
  });
});
