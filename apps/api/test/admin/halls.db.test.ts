import {
  adminHallsResponseSchema,
  generateSeats,
  hallLayoutResponseSchema,
  HALL_TYPE_SPACING,
  seatMapResponseSchema,
  type HallLayoutInput,
  type HallLayoutResponse,
} from '@kinemax/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateBookingCode } from '../../src/domain/booking-code.js';
import { holdSeats, holdWholeHall, must, resetDatabase, ticket } from '../db/helpers.js';
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

// The hall and seat editor's API: one validated batch, positions from the hall type's rules.

const prisma = testPrisma();
const { app } = makeTestApp(GENEROUS_LIMITS);
let fx: AdminFixture;
let clients: Record<Role, Client>;

beforeEach(async () => {
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
});

const layoutOf = async (hallId: string, client = clients.manager) =>
  hallLayoutResponseSchema.parse(
    (await client.get(`/api/admin/halls/${hallId}/layout`).expect(200)).body,
  );
const put = (hallId: string, body: HallLayoutInput, client = clients.manager) =>
  client.put(`/api/admin/halls/${hallId}/layout`, body);

/** The layout as an editor sends it back (same seats, same order). */
const asInput = (layout: HallLayoutResponse): HallLayoutInput => ({
  rows: layout.rows.map((row) => ({
    label: row.label,
    blocks: row.blocks.map((block) =>
      block.map((seat) => ({ id: seat.id, type: seat.type, isActive: seat.isActive })),
    ),
  })),
});

/** Salla 1 as two proper rows: A = four standard seats in one block, B = the couple sofa. */
async function tidyHall() {
  const layout = await layoutOf(fx.hall.id);
  const [rowA, rowB] = layout.rows;
  const seat = (s: { id: string; type: string }) => ({
    id: s.id,
    type: s.type as 'STANDARD',
    isActive: true,
  });
  const body: HallLayoutInput = {
    rows: [
      { label: 'A', blocks: [(rowA?.blocks.flat() ?? []).map(seat)] },
      { label: 'B', blocks: [(rowB?.blocks.flat() ?? []).map(seat)] },
    ],
  };
  await put(fx.hall.id, body).expect(200);
  return body;
}

/** A paid booking of a past show on a seat: booking history, but nothing blocks it any more. */
async function pastBooking(seatId: string) {
  const startsAt = new Date(Date.now() - 4 * 3_600_000);
  const past = await prisma.showtime.create({
    data: {
      movieId: fx.movie.id,
      hallId: fx.hall.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
      languageVersion: 'DUBBED_SQ',
    },
  });
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.create({
      data: {
        code: generateBookingCode(),
        userId: fx.user.id,
        showtimeId: past.id,
        holdExpiresAt: new Date(Date.now() + 600_000),
        totalCents: 450,
      },
    });
    await tx.seatReservation.create({
      data: { showtimeId: past.id, hallId: fx.hall.id, seatId, bookingId: booking.id },
    });
    await tx.bookingSeat.create({ data: ticket(booking.id, seatId, fx.adult) });
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
  });
}

describe('reading halls', () => {
  it('lists the halls of a cinema with their seat counts', async () => {
    const res = await clients.manager
      .get(`/api/admin/halls?location=${fx.location.id}`)
      .expect(200);
    const { halls } = adminHallsResponseSchema.parse(res.body);
    expect(halls.map((h) => [h.name, h.activeSeats, h.wholeHallOnly])).toEqual([
      ['Salla 1', 5, false],
      ['Salla 2', 1, false],
      ['Suita', 2, true],
    ]);
  });

  it('marks booking history and the future shows that block a seat', async () => {
    const [a1, a2] = fx.seats.hall;
    await holdSeats(prisma, {
      userId: fx.user.id,
      showtimeId: fx.showtime.id,
      hallId: fx.hall.id,
      seatIds: [a1?.id ?? ''],
    });
    await pastBooking(a2?.id ?? '');
    const seats = (await layoutOf(fx.hall.id)).rows.flatMap((r) => r.blocks.flat());
    expect(seats.find((s) => s.id === a1?.id)).toMatchObject({
      hasHistory: false,
      blockedBy: [{ showtimeId: fx.showtime.id, movieTitleSq: 'Filmi i Testit' }],
    });
    expect(seats.find((s) => s.id === a2?.id)).toMatchObject({ hasHistory: true, blockedBy: [] });
  });
});

describe('saving a layout', () => {
  it('numbers the seats and computes every coordinate from the hall type', async () => {
    const tidy = await tidyHall();
    const body: HallLayoutInput = {
      rows: [
        ...tidy.rows,
        {
          label: 'C',
          blocks: [
            [
              { type: 'WHEELCHAIR', isActive: true },
              { type: 'COMPANION', isActive: true },
            ],
            [
              { type: 'VIP', isActive: true },
              { type: 'VIP', isActive: true },
            ],
          ],
        },
      ],
    };
    const layout = hallLayoutResponseSchema.parse((await put(fx.hall.id, body).expect(200)).body);
    expect(layout.rows.map((r) => [r.label, r.blocks.map((b) => b.length)])).toEqual([
      ['A', [4]],
      ['B', [1]],
      ['C', [2, 2]],
    ]);
    const stored = await prisma.seat.findMany({
      where: { hallId: fx.hall.id },
      orderBy: [{ y: 'asc' }, { x: 'asc' }],
    });
    const expected = generateSeats({
      ...(HALL_TYPE_SPACING.STANDARD ?? must(HALL_TYPE_SPACING.VIP_RECLINER)),
      rows: body.rows.map((r) => ({
        label: r.label,
        blocks: r.blocks.map((b) => b.map((s) => ({ type: s.type }))),
      })),
    });
    expect(
      stored.map((s) => [s.rowLabel, s.number, s.seatType, s.x, s.y, s.z, s.widthUnits]),
    ).toEqual(expected.map((s) => [s.rowLabel, s.number, s.seatType, s.x, s.y, s.z, s.widthUnits]));
    // Sane geometry: rows step back from the screen, centred, the sofa two units wide.
    expect(new Set(stored.map((s) => `${s.rowLabel}${String(s.number)}`)).size).toBe(stored.length);
    expect(stored.find((s) => s.seatType === 'COUPLE')?.widthUnits).toBe(2);
    const rowY = (label: string) => stored.find((s) => s.rowLabel === label)?.y ?? 0;
    expect(rowY('B') - rowY('A')).toBeCloseTo(0.95);
    const a = stored.filter((s) => s.rowLabel === 'A');
    expect((a[0]?.x ?? 0) + (a[3]?.x ?? 0)).toBeCloseTo(0);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'hall.layout' },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).toMatchObject({ actorId: fx.staff.manager.id, entityId: fx.hall.id });
    expect(log.after).toMatchObject({ created: 4, rows: 3 });
  });

  it('shows the change in the public seat map (and the 3D hall built from it)', async () => {
    const tidy = await tidyHall();
    const a = tidy.rows[0]?.blocks[0] ?? [];
    tidy.rows[0] = {
      label: 'A',
      blocks: [
        [...a.slice(0, 3), { ...must(a[3]), isActive: false }, { type: 'VIP', isActive: true }],
      ],
    };
    await put(fx.hall.id, tidy).expect(200);
    const map = seatMapResponseSchema.parse(
      (await clients.anonymous.get(`/api/showtimes/${fx.showtime.id}/seatmap`).expect(200)).body,
    );
    const rowA = map.seats.filter((s) => s.row === 'A').sort((x, y) => x.number - y.number);
    // The deactivated seat is gone from the map; the new VIP seat is number 5, right of it.
    expect(rowA.map((s) => [s.number, s.type])).toEqual([
      [1, 'STANDARD'],
      [2, 'STANDARD'],
      [3, 'STANDARD'],
      [5, 'VIP'],
    ]);
    expect(rowA[3]?.x).toBeGreaterThan(rowA[2]?.x ?? 0);
  });

  it('deletes a seat that was never booked, but only deactivates one with history', async () => {
    const tidy = await tidyHall();
    const [a1, a2, a3, a4] = tidy.rows[0]?.blocks[0] ?? [];
    await pastBooking(a2?.id ?? '');
    // Leaving out the booked seat is refused: it can only be deactivated.
    const refused = await put(fx.hall.id, {
      rows: [{ label: 'A', blocks: [[must(a1), must(a3), must(a4)]] }, must(tidy.rows[1])],
    });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error: { fields: [{ path: `seats.${a2?.id ?? ''}`, code: 'has_history' }] },
    });

    await put(fx.hall.id, {
      rows: [
        { label: 'A', blocks: [[must(a1), { ...must(a2), isActive: false }, must(a3)]] },
        must(tidy.rows[1]),
      ],
    }).expect(200);
    expect(await prisma.seat.findUnique({ where: { id: a4?.id ?? '' } })).toBeNull();
    expect(await prisma.seat.findUniqueOrThrow({ where: { id: a2?.id ?? '' } })).toMatchObject({
      isActive: false,
      rowLabel: 'A',
      number: 2,
    });
    // An inactive seat can no longer be held.
    await clients.customer
      .post('/api/bookings/hold', { showtimeId: fx.otherShowtime.id, seatIds: [a2?.id] })
      .expect(422);
  });

  it('keeps a seat with a booking for a future show exactly as it is', async () => {
    const tidy = await tidyHall();
    const [a1, a2, a3, a4] = tidy.rows[0]?.blocks[0] ?? [];
    await holdSeats(prisma, {
      userId: fx.user.id,
      showtimeId: fx.showtime.id,
      hallId: fx.hall.id,
      seatIds: [a2?.id ?? ''],
    });
    const attempts: HallLayoutInput['rows'][number][] = [
      // deactivate it
      { label: 'A', blocks: [[must(a1), { ...must(a2), isActive: false }, must(a3), must(a4)]] },
      // a new seat on its left changes its number
      {
        label: 'A',
        blocks: [[{ type: 'STANDARD', isActive: true }, must(a1), must(a2), must(a3), must(a4)]],
      },
      // a sofa sells two tickets instead of one
      { label: 'A', blocks: [[must(a1), { ...must(a2), type: 'COUPLE' }, must(a3), must(a4)]] },
      // renaming the row changes its label
      { label: 'C', blocks: [[must(a1), must(a2), must(a3), must(a4)]] },
    ];
    for (const row of attempts) {
      const res = await put(fx.hall.id, { rows: [row, must(tidy.rows[1])] });
      expect(res.status, JSON.stringify(row.label)).toBe(409);
      expect(res.body).toMatchObject({
        error: {
          fields: expect.arrayContaining([
            { path: `seats.${a2?.id ?? ''}`, code: 'blocked' },
          ]) as unknown,
        },
      });
    }
    // Same ticket count and label: a VIP upgrade and a new seat on the right are fine.
    await put(fx.hall.id, {
      rows: [
        {
          label: 'A',
          blocks: [
            [
              must(a1),
              { ...must(a2), type: 'VIP' },
              must(a3),
              must(a4),
              { type: 'STANDARD', isActive: true },
            ],
          ],
        },
        must(tidy.rows[1]),
      ],
    }).expect(200);
  });

  it('never changes the ticket count of a seat with history (deactivate and add a new one)', async () => {
    const tidy = await tidyHall();
    const [a1, a2, a3, a4] = tidy.rows[0]?.blocks[0] ?? [];
    await pastBooking(a1?.id ?? '');
    const res = await put(fx.hall.id, {
      rows: [
        { label: 'A', blocks: [[{ ...must(a1), type: 'COUPLE' }, must(a2), must(a3), must(a4)]] },
        must(tidy.rows[1]),
      ],
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { fields: [{ code: 'capacity_history' }] } });
  });

  it('keeps a booked suite unchanged as a whole', async () => {
    await holdWholeHall(prisma, {
      userId: fx.user.id,
      showtimeId: fx.suiteShowtime.id,
      hallId: fx.suite.id,
    });
    const layout = await layoutOf(fx.suite.id);
    expect(layout.rows.flatMap((r) => r.blocks.flat()).every((s) => s.blockedBy.length === 1)).toBe(
      true,
    );
    const res = await put(fx.suite.id, asInput(layout));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { fields: [{ code: 'suite_booked' }] } });
  });

  it('validates the batch', async () => {
    const tidy = await tidyHall();
    const before = await prisma.seat.findMany({ orderBy: { id: 'asc' } });
    const cases: [unknown, number][] = [
      [{ rows: [tidy.rows[0], { ...tidy.rows[1], label: 'A' }] }, 422],
      [{ rows: [tidy.rows[0], { label: 'B', blocks: [tidy.rows[0]?.blocks[0]] }] }, 422],
      [
        {
          rows: [
            ...tidy.rows,
            {
              label: 'C',
              blocks: [[{ id: fx.seats.otherHall[0]?.id, type: 'STANDARD', isActive: true }]],
            },
          ],
        },
        422,
      ],
      [{ rows: [{ ...tidy.rows[0], label: 'a1' }] }, 400],
      [{ rows: [{ label: 'C', blocks: [[]] }] }, 400],
      [{ rows: [] }, 400],
      [{ rows: tidy.rows, extra: true }, 400],
    ];
    for (const [body, status] of cases) {
      const res = await clients.manager.put(
        `/api/admin/halls/${fx.hall.id}/layout`,
        body as object,
      );
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(status);
    }
    expect(await prisma.seat.findMany({ orderBy: { id: 'asc' } })).toEqual(before);
  });
});

describe('scope', () => {
  it('keeps every hall endpoint inside the manager’s cinemas (IDOR) and away from customers', async () => {
    const otherLayout = await layoutOf(fx.other.hall.id, clients.superAdmin);
    const unchanged = () => prisma.seat.findMany({ orderBy: { id: 'asc' } });
    await expectRefused(clients, ['manager', 'customer', 'anonymous'], (c) =>
      c.get(`/api/admin/halls/${fx.other.hall.id}/layout`),
    );
    await expectRefused(
      clients,
      ['manager', 'customer', 'anonymous'],
      (c) => c.put(`/api/admin/halls/${fx.other.hall.id}/layout`, asInput(otherLayout)),
      unchanged,
    );
    await expectRefused(clients, ['manager', 'customer'], (c) =>
      c.get(`/api/admin/halls?location=${fx.other.location.id}`),
    );
    // Seats of another cinema smuggled into one's own hall are refused too.
    const own = asInput(await layoutOf(fx.hall.id));
    own.rows[0]?.blocks.push([{ id: fx.other.hall.id, type: 'STANDARD', isActive: true }]);
    expect((await put(fx.hall.id, own)).status).toBe(422);
  });
});
