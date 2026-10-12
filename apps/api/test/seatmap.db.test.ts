import { seatMapResponseSchema } from '@kinemax/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFixture,
  holdSeats,
  holdWholeHall,
  resetDatabase,
  type Fixture,
} from './db/helpers.js';
import { makeTestApp, testPrisma } from './support/app.js';

const { app } = makeTestApp();
const prisma = testPrisma();
let fx: Fixture;

afterAll(async () => {
  await prisma.$disconnect();
});

beforeAll(async () => {
  await resetDatabase(prisma);
  fx = await createFixture(prisma);
  const validFrom = new Date('2026-01-01T00:00:00Z');
  const standard = await prisma.hall.findUniqueOrThrow({ where: { id: fx.hall.id } });
  await prisma.hallTypePrice.create({
    data: { hallTypeId: standard.hallTypeId, priceCents: 500, validFrom },
  });
  await prisma.seatTypeSurcharge.create({
    data: { seatType: 'COUPLE', amountCents: 200, validFrom },
  });
  await prisma.wholeHallPrice.create({
    data: { hallId: fx.suite.id, priceCents: 14_000, validFrom },
  });
});

const seatmap = async (showtimeId: string) => {
  const res = await request(app).get(`/api/showtimes/${showtimeId}/seatmap`).expect(200);
  expect(res.headers['cache-control']).toBe('no-store');
  return seatMapResponseSchema.parse(res.body);
};

describe('GET /api/showtimes/:id/seatmap', () => {
  it('returns the hall, the seats with live status and ADULT prices per seat type', async () => {
    const [first, second] = fx.seats.hall;
    // A live hold takes a seat; an expired hold does not.
    await holdSeats(prisma, {
      userId: fx.user.id,
      showtimeId: fx.showtime.id,
      hallId: fx.hall.id,
      seatIds: [first?.id ?? ''],
    });
    await holdSeats(prisma, {
      userId: fx.user.id,
      showtimeId: fx.showtime.id,
      hallId: fx.hall.id,
      seatIds: [second?.id ?? ''],
      holdMinutes: -5,
    });
    const map = await seatmap(fx.showtime.id);
    expect(map.hall).toMatchObject({
      name: 'Salla 1',
      wholeHallOnly: false,
      hallType: { code: 'STANDARD' },
      screen: { widthM: 10, heightM: 4, z: 3 },
    });
    expect(map.seats).toHaveLength(5);
    const status = Object.fromEntries(map.seats.map((s) => [s.id, s.status]));
    expect(status[first?.id ?? '']).toBe('TAKEN');
    expect(status[second?.id ?? '']).toBe('AVAILABLE');
    expect(map.seats.find((s) => s.type === 'COUPLE')).toMatchObject({ widthUnits: 2, row: 'B' });
    // STANDARD 5.00; a sofa: two ADULT tickets + the sofa surcharge once.
    expect(map.prices).toEqual({ STANDARD: 500, COUPLE: 1200 });
    expect(map.wholeHall).toBeNull();
    // Never who holds a seat.
    const text = JSON.stringify(map);
    expect(text).not.toContain(fx.user.id);
    expect(text).not.toMatch(/booking|userId|email/i);
  });

  it('describes a suite as a whole, with its price and whether it is taken', async () => {
    const before = await seatmap(fx.suiteShowtime.id);
    expect(before.wholeHall).toEqual({ priceCents: 14_000, taken: false });
    expect(before.prices).toEqual({});
    await holdWholeHall(prisma, {
      userId: fx.user.id,
      showtimeId: fx.suiteShowtime.id,
      hallId: fx.suite.id,
    });
    const after = await seatmap(fx.suiteShowtime.id);
    expect(after.wholeHall).toEqual({ priceCents: 14_000, taken: true });
    expect(after.seats.every((s) => s.status === 'TAKEN')).toBe(true);
  });

  it('answers 410 for a show that started, 404 for unknown or inactive ones, 400 for bad ids', async () => {
    const started = await prisma.showtime.create({
      data: {
        movieId: fx.movie.id,
        hallId: fx.otherHall.id,
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 3_600_000),
        languageVersion: 'DUBBED_SQ',
      },
    });
    const gone = await request(app).get(`/api/showtimes/${started.id}/seatmap`).expect(410);
    expect((gone.body as { error: { code: string } }).error.code).toBe('gone');
    await prisma.showtime.update({ where: { id: fx.otherShowtime.id }, data: { isActive: false } });
    await request(app).get(`/api/showtimes/${fx.otherShowtime.id}/seatmap`).expect(404);
    await request(app)
      .get('/api/showtimes/0190f0a0-0000-7000-8000-000000000000/seatmap')
      .expect(404);
    await request(app).get('/api/showtimes/nope/seatmap').expect(400);
  });
});
