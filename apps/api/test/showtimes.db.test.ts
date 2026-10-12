import {
  movieDetailResponseSchema,
  showtimeDetailResponseSchema,
  showtimesResponseSchema,
  type ShowtimesResponse,
} from '@kinemax/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zonedTimeToUtc } from '../src/domain/time-zone.js';
import { availabilityLevel } from '../src/routes/showtimes.js';
import { holdSeats, holdWholeHall, resetDatabase } from './db/helpers.js';
import { makeTestApp, testPrisma } from './support/app.js';

// Showtimes, movie detail and showtime detail against kinemax_test. The clock is pinned to Friday
// 27 March 2026, 11:00 in Prishtina (10:00 UTC): the 7 browsable days include the switch to summer
// time on Sunday 29 March, when the local day has only 23 hours.
const TZ = 'Europe/Belgrade';
const NOW = new Date('2026-03-27T10:00:00Z');
const { app } = makeTestApp({ now: () => NOW });
const prisma = testPrisma();
const local = (date: string, time: string) => {
  const [h, m] = time.split(':').map(Number);
  return zonedTimeToUtc(date, (h ?? 0) * 60 + (m ?? 0), TZ);
};

afterAll(async () => {
  await prisma.$disconnect();
});

const ids: Record<string, string> = {};
/** The id of a fixture row by key (fails loudly when the fixture misses it). */
const id = (key: string): string => {
  const value = ids[key];
  if (value === undefined) throw new Error(`fixture id ${key} missing`);
  return value;
};

beforeAll(async () => {
  await resetDatabase(prisma);
  const types = {
    STANDARD: await prisma.hallType.create({
      data: {
        code: 'STANDARD',
        nameSq: 'Standard',
        nameEn: 'Standard',
        descriptionSq: 'S',
        sortOrder: 1,
      },
    }),
    VIP_RECLINER: await prisma.hallType.create({
      data: { code: 'VIP_RECLINER', nameSq: 'VIP Recliner', descriptionSq: 'V', sortOrder: 2 },
    }),
    PRIVATE_SUITE: await prisma.hallType.create({
      data: {
        code: 'PRIVATE_SUITE',
        nameSq: 'Suitë private',
        nameEn: 'Private suite',
        descriptionSq: 'P',
        sortOrder: 4,
      },
    }),
  };
  const location = await prisma.location.create({
    data: { slug: 'alpha', name: 'Kinemax Alfa', city: 'Alfa', address: 'Rruga 1', timeZone: TZ },
  });
  ids.location = location.id;
  const geometry = { screenWidthM: 10, screenHeightM: 4, screenZ: 3 };
  const hall = (name: string, type: keyof typeof types, wholeHallOnly = false) =>
    prisma.hall.create({
      data: {
        locationId: location.id,
        hallTypeId: types[type].id,
        name,
        wholeHallOnly,
        ...geometry,
      },
    });
  const standard = await hall('Salla 1', 'STANDARD');
  const vip = await hall('VIP 2', 'VIP_RECLINER');
  const suite = await hall('Suita 3', 'PRIVATE_SUITE', true);
  const seats = (hallId: string, count: number, seatType: 'STANDARD' | 'VIP') =>
    Array.from({ length: count }, (_, i) => ({
      hallId,
      rowLabel: 'A',
      number: i + 1,
      seatType,
      x: i,
      y: 5,
      z: 0,
    }));
  await prisma.seat.createMany({
    data: [
      ...seats(standard.id, 20, 'STANDARD'),
      ...seats(vip.id, 10, 'VIP'),
      ...seats(suite.id, 4, 'VIP'),
    ],
  });
  // An inactive seat does not count as a place.
  await prisma.seat.create({
    data: {
      hallId: standard.id,
      rowLabel: 'A',
      number: 21,
      seatType: 'STANDARD',
      x: 21,
      y: 5,
      z: 0,
      isActive: false,
    },
  });

  // Prices: STANDARD 5.00, VIP 8.00 + 2.00 VIP seat, suite 140.00; 20% off before 15:00 local.
  const validFrom = new Date('2026-01-01T00:00:00Z');
  await prisma.hallTypePrice.createMany({
    data: [
      { hallTypeId: types.STANDARD.id, priceCents: 500, validFrom },
      { hallTypeId: types.VIP_RECLINER.id, priceCents: 800, validFrom },
    ],
  });
  await prisma.seatTypeSurcharge.create({ data: { seatType: 'VIP', amountCents: 200, validFrom } });
  await prisma.timePriceAdjustment.create({
    data: {
      nameSq: 'Paradite',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      startMinute: 0,
      endMinute: 15 * 60,
      kind: 'PERCENT',
      value: -20,
      validFrom,
    },
  });
  await prisma.wholeHallPrice.create({ data: { hallId: suite.id, priceCents: 14_000, validFrom } });
  await prisma.ticketCategory.create({ data: { code: 'ADULT', nameSq: 'I rritur' } });
  const student = await prisma.ticketCategory.create({
    data: { code: 'STUDENT', nameSq: 'Student' },
  });
  await prisma.ticketCategoryDiscount.create({
    data: { ticketCategoryId: student.id, kind: 'PERCENT', value: 50, validFrom },
  });

  const movie = (slug: string, status: 'NOW_SHOWING' | 'COMING_SOON' | 'ARCHIVED') =>
    prisma.movie.create({
      data: {
        slug,
        titleSq: `Titulli ${slug}`,
        titleEn: slug === 'alpha-movie' ? 'Alpha' : null,
        synopsisSq: `Përmbledhja ${slug}`,
        durationMinutes: 100,
        ageRating: 'AGE_15',
        genres: ['DRAMA'],
        releaseDate: new Date('2026-03-01T00:00:00Z'),
        posterPath: `/seed/posters/${slug}.svg`,
        backdropPath: `/seed/backdrops/${slug}.svg`,
        trailerYoutubeId: slug === 'alpha-movie' ? 'abcdefghijk' : null,
        director: 'Regjisore',
        cast: ['A', 'B'],
        status,
      },
    });
  const alpha = await movie('alpha-movie', 'NOW_SHOWING');
  const beta = await movie('beta-movie', 'NOW_SHOWING');
  await movie('soon-movie', 'COMING_SOON');
  const archived = await movie('archived-movie', 'ARCHIVED');

  const show = async (
    key: string,
    movieId: string,
    hallId: string,
    date: string,
    time: string,
    extra: {
      format?: 'FORMAT_2D' | 'FORMAT_3D';
      languageVersion?: 'DUBBED_SQ' | 'ORIGINAL_SQ_SUBTITLES';
      isActive?: boolean;
    } = {},
  ) => {
    const startsAt = local(date, time);
    const created = await prisma.showtime.create({
      data: {
        movieId,
        hallId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
        format: extra.format ?? 'FORMAT_2D',
        languageVersion: extra.languageVersion ?? 'ORIGINAL_SQ_SUBTITLES',
        isActive: extra.isActive ?? true,
      },
    });
    ids[key] = created.id;
  };
  // Friday 27 (today, now = 11:00 local)
  await show('started', alpha.id, standard.id, '2026-03-27', '09:00');
  await show('dubbed13', alpha.id, standard.id, '2026-03-27', '13:00', {
    languageVersion: 'DUBBED_SQ',
  });
  await show('vip14', alpha.id, vip.id, '2026-03-27', '14:00');
  await show('suite15', alpha.id, suite.id, '2026-03-27', '15:00');
  await show('threeD17', alpha.id, standard.id, '2026-03-27', '17:00', { format: 'FORMAT_3D' });
  await show('beta20', beta.id, standard.id, '2026-03-27', '20:00');
  await show('inactive', beta.id, vip.id, '2026-03-27', '18:00', { isActive: false });
  await show('archived', archived.id, vip.id, '2026-03-27', '21:00');
  // Saturday 28 late show; Sunday 29 (summer time starts at 02:00) just after midnight and late.
  await show('sat2330', beta.id, standard.id, '2026-03-28', '23:30');
  await show('sun0015', beta.id, vip.id, '2026-03-29', '00:15');
  await show('sun2330', beta.id, standard.id, '2026-03-29', '23:30');
  await show('mon0010', beta.id, vip.id, '2026-03-30', '00:10');
  await show('suiteMon', alpha.id, suite.id, '2026-03-30', '15:00');

  const user = await prisma.user.create({
    data: { email: 'guest@kinemax.test', passwordHash: 'not-a-real-hash', name: 'Guest' },
  });
  const allSeats = await prisma.seat.findMany({
    where: { isActive: true },
    orderBy: { number: 'asc' },
  });
  const of = (hallId: string, count: number) =>
    allSeats
      .filter((s) => s.hallId === hallId)
      .slice(0, count)
      .map((s) => s.id);
  const confirm = (id: string) =>
    prisma.booking.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

  // 13:00: 18 of 20 taken (confirmed) -> 2 free = 10% -> FEW_LEFT.
  await confirm(
    (
      await holdSeats(prisma, {
        userId: user.id,
        showtimeId: id('dubbed13'),
        hallId: standard.id,
        seatIds: of(standard.id, 18),
      })
    ).id,
  );
  // 17:00: 17 taken by a live hold -> 3 free = exactly 15% -> still AVAILABLE.
  await holdSeats(prisma, {
    userId: user.id,
    showtimeId: id('threeD17'),
    hallId: standard.id,
    seatIds: of(standard.id, 17),
  });
  // 20:00: all 20 taken -> SOLD_OUT.
  await confirm(
    (
      await holdSeats(prisma, {
        userId: user.id,
        showtimeId: id('beta20'),
        hallId: standard.id,
        seatIds: of(standard.id, 20),
      })
    ).id,
  );
  // VIP 14:00: every seat held, but the hold expired before "now" -> it does not count.
  const expiredMinutes = -Math.ceil((Date.now() - NOW.getTime()) / 60_000) - 5;
  await holdSeats(prisma, {
    userId: user.id,
    showtimeId: id('vip14'),
    hallId: vip.id,
    seatIds: of(vip.id, 10),
    holdMinutes: expiredMinutes,
  });
  // Suite 15:00 booked as a whole -> SOLD_OUT; the Monday suite stays AVAILABLE.
  await holdWholeHall(prisma, { userId: user.id, showtimeId: id('suite15'), hallId: suite.id });
});

const get = async (query: string) => {
  const res = await request(app).get(`/api/showtimes?${query}`).expect(200);
  return showtimesResponseSchema.parse(res.body);
};
const allShowtimeIds = (body: ShowtimesResponse) =>
  body.movies.flatMap((m) => m.groups.flatMap((g) => g.showtimes.map((s) => s.id)));

describe('GET /api/showtimes', () => {
  it('defaults to today in the cinema time zone and lists the 7 browsable days', async () => {
    const body = await get('location=alpha');
    expect(body.date).toBe('2026-03-27');
    expect(body.days).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
    ]);
    expect(body.location).toEqual({
      slug: 'alpha',
      name: 'Kinemax Alfa',
      city: 'Alfa',
      timeZone: TZ,
    });
  });

  it('groups by movie, then hall type + format + language, hiding started, inactive and archived shows', async () => {
    const body = await get('location=alpha&date=2026-03-27');
    // Movies in the order of their first show of the day.
    expect(body.movies.map((m) => m.movie.slug)).toEqual(['alpha-movie', 'beta-movie']);
    const alpha = body.movies[0];
    expect(alpha?.movie).toEqual({
      slug: 'alpha-movie',
      titleSq: 'Titulli alpha-movie',
      titleEn: 'Alpha',
      ageRating: 'AGE_15',
      durationMinutes: 100,
      genres: ['DRAMA'],
      posterPath: '/seed/posters/alpha-movie.svg',
    });
    expect(
      alpha?.groups.map((g) => [
        g.hallType.code,
        g.format,
        g.languageVersion,
        g.showtimes.map((s) => s.startTime),
      ]),
    ).toEqual([
      ['STANDARD', '2D', 'DUBBED_SQ', ['13:00']],
      ['STANDARD', '3D', 'ORIGINAL_SQ_SUBTITLES', ['17:00']],
      ['VIP_RECLINER', '2D', 'ORIGINAL_SQ_SUBTITLES', ['14:00']],
      ['PRIVATE_SUITE', '2D', 'ORIGINAL_SQ_SUBTITLES', ['15:00']],
    ]);
    expect(alpha?.groups[0]?.showtimes[0]).toMatchObject({
      id: ids.dubbed13,
      startsAt: '2026-03-27T12:00:00.000Z',
      startTime: '13:00',
      endTime: '15:00',
      hallName: 'Salla 1',
    });
    const listed = allShowtimeIds(body);
    for (const hidden of ['started', 'inactive', 'archived'])
      expect(listed).not.toContain(ids[hidden]);
    // The only uuids in the answer are showtime ids (needed for booking links).
    const uuids =
      JSON.stringify(body).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ??
      [];
    expect(new Set(uuids)).toEqual(new Set(listed));
  });

  it('computes availability from live seat and suite locks', async () => {
    const body = await get('location=alpha&date=2026-03-27');
    const level = Object.fromEntries(
      body.movies.flatMap((m) =>
        m.groups.flatMap((g) => g.showtimes.map((s) => [s.id, s.availability])),
      ),
    );
    expect(level[id('dubbed13')]).toBe('FEW_LEFT');
    expect(level[id('threeD17')]).toBe('AVAILABLE');
    expect(level[id('beta20')]).toBe('SOLD_OUT');
    expect(level[id('vip14')]).toBe('AVAILABLE');
    expect(level[id('suite15')]).toBe('SOLD_OUT');
    const monday = await get('location=alpha&date=2026-03-30');
    const suite = monday.movies
      .flatMap((m) => m.groups)
      .find((g) => g.hallType.code === 'PRIVATE_SUITE');
    expect(suite?.showtimes[0]?.availability).toBe('AVAILABLE');
  });

  it('applies the 15% rule exactly', () => {
    expect(availabilityLevel(20, 0)).toBe('AVAILABLE');
    expect(availabilityLevel(20, 17)).toBe('AVAILABLE'); // 3 free = 15%
    expect(availabilityLevel(20, 18)).toBe('FEW_LEFT'); // 2 free = 10%
    expect(availabilityLevel(20, 19)).toBe('FEW_LEFT');
    expect(availabilityLevel(20, 20)).toBe('SOLD_OUT');
    expect(availabilityLevel(0, 0)).toBe('SOLD_OUT');
    expect(availabilityLevel(5, 4)).toBe('AVAILABLE'); // 1 of 5 free = 20%
  });

  it('shows a "from" price: the cheapest ADULT ticket, or the whole suite', async () => {
    const body = await get('location=alpha&date=2026-03-27&movie=alpha-movie');
    const prices = body.movies[0]?.groups.map((g) => [g.hallType.code, g.format, g.fromPrice]);
    expect(prices).toEqual([
      ['STANDARD', '2D', { kind: 'TICKET', amountCents: 400 }], // 13:00: 5.00 - 20%
      ['STANDARD', '3D', { kind: 'TICKET', amountCents: 500 }], // 17:00: no adjustment
      ['VIP_RECLINER', '2D', { kind: 'TICKET', amountCents: 800 }], // (8.00 + 2.00) - 20%
      ['PRIVATE_SUITE', '2D', { kind: 'WHOLE_HALL', amountCents: 14_000 }], // 15:00 is outside the window
    ]);
  });

  it('assigns shows to calendar days in the cinema time zone, across midnight and the DST switch', async () => {
    const times = (body: ShowtimesResponse) =>
      body.movies.flatMap((m) =>
        m.groups.flatMap((g) => g.showtimes.map((s) => [s.id, s.startTime])),
      );
    expect(times(await get('location=alpha&date=2026-03-28'))).toEqual([[ids.sat2330, '23:30']]);
    // Sunday 29: 00:15 is still winter time (UTC+1), 23:30 already summer time (UTC+2).
    const sunday = await get('location=alpha&date=2026-03-29');
    // (Groups are ordered by hall type, so compare by time.)
    expect(times(sunday).sort((x, y) => String(x[1]).localeCompare(String(y[1])))).toEqual([
      [ids.sun0015, '00:15'],
      [ids.sun2330, '23:30'],
    ]);
    const startsAt = sunday.movies[0]?.groups.flatMap((g) => g.showtimes.map((s) => s.startsAt));
    expect(startsAt?.sort()).toEqual(['2026-03-28T23:15:00.000Z', '2026-03-29T21:30:00.000Z']);
    // 00:10 on Monday belongs to Monday, although it is still Sunday in UTC.
    const monday = await get('location=alpha&date=2026-03-30&movie=beta-movie');
    expect(times(monday)).toEqual([[ids.mon0010, '00:10']]);
  });

  it('filters by movie, hall types, formats and languages (comma-separated, combined)', async () => {
    const codes = (body: ShowtimesResponse) =>
      body.movies.flatMap((m) =>
        m.groups.map((g) => `${m.movie.slug}:${g.hallType.code}:${g.format}:${g.languageVersion}`),
      );
    expect(codes(await get('location=alpha&date=2026-03-27&movie=beta-movie'))).toEqual([
      'beta-movie:STANDARD:2D:ORIGINAL_SQ_SUBTITLES',
    ]);
    expect(
      codes(await get('location=alpha&date=2026-03-27&hallType=VIP_RECLINER,PRIVATE_SUITE')),
    ).toEqual([
      'alpha-movie:VIP_RECLINER:2D:ORIGINAL_SQ_SUBTITLES',
      'alpha-movie:PRIVATE_SUITE:2D:ORIGINAL_SQ_SUBTITLES',
    ]);
    expect(codes(await get('location=alpha&date=2026-03-27&format=3D'))).toEqual([
      'alpha-movie:STANDARD:3D:ORIGINAL_SQ_SUBTITLES',
    ]);
    expect(codes(await get('location=alpha&date=2026-03-27&language=DUBBED_SQ,DUBBED_SQ'))).toEqual(
      ['alpha-movie:STANDARD:2D:DUBBED_SQ'],
    );
    expect(
      codes(
        await get(
          'location=alpha&date=2026-03-27&hallType=STANDARD&format=2D&language=ORIGINAL_SQ_SUBTITLES',
        ),
      ),
    ).toEqual(['beta-movie:STANDARD:2D:ORIGINAL_SQ_SUBTITLES']);
    expect((await get('location=alpha&date=2026-03-27&hallType=IMAX')).movies).toEqual([]);
  });

  it('rejects days outside today..today+6 and malformed filters with 400; unknown cinemas are 404', async () => {
    for (const query of [
      'location=alpha&date=2026-03-26',
      'location=alpha&date=2026-04-03',
      'location=alpha&date=2026-02-30',
      'location=alpha&date=27-03-2026',
      'location=alpha&format=4D',
      'location=alpha&language=KLINGON',
      'location=alpha&hallType=vip',
      'location=alpha&hallType=',
      'location=alpha&sort=time',
      'date=2026-03-27',
    ]) {
      const res = await request(app).get(`/api/showtimes?${query}`);
      expect(res.status, query).toBe(400);
      expect(res.headers['cache-control'], query).toBe('no-store');
    }
    await request(app).get('/api/showtimes?location=nowhere').expect(404);
  });

  it('is cached only briefly', async () => {
    const res = await request(app).get('/api/showtimes?location=alpha').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=30');
  });
});

describe('GET /api/showtimes/:id', () => {
  it('returns the booking summary in the cinema time zone', async () => {
    const res = await request(app)
      .get(`/api/showtimes/${id('sun0015')}`)
      .expect(200);
    expect(showtimeDetailResponseSchema.parse(res.body).showtime).toEqual({
      id: ids.sun0015,
      startsAt: '2026-03-28T23:15:00.000Z',
      endsAt: '2026-03-29T01:15:00.000Z',
      date: '2026-03-29',
      startTime: '00:15',
      endTime: '03:15', // two hours later, after the clocks went forward
      format: '2D',
      languageVersion: 'ORIGINAL_SQ_SUBTITLES',
      hasStarted: false,
      movie: expect.objectContaining({ slug: 'beta-movie' }) as unknown,
      location: {
        slug: 'alpha',
        name: 'Kinemax Alfa',
        city: 'Alfa',
        address: 'Rruga 1',
        timeZone: TZ,
      },
      hall: {
        name: 'VIP 2',
        wholeHallOnly: false,
        hallType: { code: 'VIP_RECLINER', nameSq: 'VIP Recliner', nameEn: null },
      },
    });
  });

  it('marks started shows and hides unknown, inactive and malformed ones', async () => {
    const started = await request(app)
      .get(`/api/showtimes/${id('started')}`)
      .expect(200);
    expect(showtimeDetailResponseSchema.parse(started.body).showtime.hasStarted).toBe(true);
    await request(app)
      .get(`/api/showtimes/${id('inactive')}`)
      .expect(404);
    await request(app)
      .get(`/api/showtimes/${id('archived')}`)
      .expect(404);
    await request(app).get('/api/showtimes/0190f0a0-0000-7000-8000-000000000000').expect(404);
    await request(app).get('/api/showtimes/not-a-uuid').expect(400);
  });
});

describe('GET /api/movies/:slug', () => {
  it('returns the full detail of a movie that is showing or coming soon', async () => {
    const res = await request(app).get('/api/movies/alpha-movie').expect(200);
    expect(movieDetailResponseSchema.parse(res.body).movie).toEqual({
      slug: 'alpha-movie',
      titleSq: 'Titulli alpha-movie',
      titleEn: 'Alpha',
      synopsisSq: 'Përmbledhja alpha-movie',
      synopsisEn: null,
      ageRating: 'AGE_15',
      durationMinutes: 100,
      genres: ['DRAMA'],
      releaseDate: '2026-03-01',
      posterPath: '/seed/posters/alpha-movie.svg',
      backdropPath: '/seed/backdrops/alpha-movie.svg',
      trailerYoutubeId: 'abcdefghijk',
      director: 'Regjisore',
      cast: ['A', 'B'],
      status: 'NOW_SHOWING',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const soon = await request(app).get('/api/movies/soon-movie').expect(200);
    expect(movieDetailResponseSchema.parse(soon.body).movie.status).toBe('COMING_SOON');
  });

  it('answers 404 for unknown and archived movies, 400 for malformed slugs', async () => {
    await request(app).get('/api/movies/archived-movie').expect(404);
    await request(app).get('/api/movies/no-such-movie').expect(404);
    await request(app).get('/api/movies/Not_A_Slug').expect(400);
  });
});
