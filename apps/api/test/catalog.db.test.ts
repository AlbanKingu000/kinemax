import {
  featuredResponseSchema,
  locationsResponseSchema,
  moviesResponseSchema,
} from '@kinemax/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { resetDatabase } from './db/helpers.js';
import { makeTestApp, testPrisma } from './support/app.js';

// Public catalog API against kinemax_test with its own fixture.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const { app } = makeTestApp();
const prisma = testPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

async function createCatalog(db: PrismaClient) {
  const standard = await db.hallType.create({
    data: { code: 'STANDARD', nameSq: 'Standard', descriptionSq: 'S', sortOrder: 1 },
  });
  const vip = await db.hallType.create({
    data: { code: 'VIP', nameSq: 'VIP', nameEn: 'VIP lounge', descriptionSq: 'V', sortOrder: 2 },
  });
  const location = (slug: string, city: string, isActive = true) =>
    db.location.create({
      data: {
        slug,
        name: `Kinemax ${city}`,
        city,
        address: `Rruga ${city} 1`,
        timeZone: 'Europe/Belgrade',
        isActive,
      },
    });
  const alpha = await location('alpha', 'Alfa');
  const beta = await location('beta', 'Beta');
  const closed = await location('closed', 'Closed', false);
  const geometry = { screenWidthM: 10, screenHeightM: 4, screenZ: 3 };
  const hall = (locationId: string, hallTypeId: string, name: string, isActive = true) =>
    db.hall.create({ data: { locationId, hallTypeId, name, isActive, ...geometry } });
  const alpha1 = await hall(alpha.id, standard.id, 'Salla 1');
  const alpha2 = await hall(alpha.id, vip.id, 'VIP 2');
  const alpha3 = await hall(alpha.id, standard.id, 'Salla 3');
  const alphaOff = await hall(alpha.id, vip.id, 'VIP Off', false);
  const beta1 = await hall(beta.id, standard.id, 'Salla 1');
  const closed1 = await hall(closed.id, standard.id, 'Salla 1');

  const movie = (
    slug: string,
    releaseDate: string,
    status: 'NOW_SHOWING' | 'COMING_SOON' | 'ARCHIVED' = 'NOW_SHOWING',
  ) =>
    db.movie.create({
      data: {
        slug,
        titleSq: `Titulli ${slug}`,
        titleEn: slug === 'popular' ? 'Popular' : null,
        synopsisSq: `Përmbledhja ${slug}`,
        durationMinutes: 100,
        ageRating: 'AGE_12',
        genres: ['DRAMA', 'COMEDY'],
        releaseDate: new Date(`${releaseDate}T00:00:00Z`),
        posterPath: `/seed/posters/${slug}.svg`,
        backdropPath: `/seed/backdrops/${slug}.svg`,
        trailerYoutubeId: slug === 'popular' ? 'dQw4w9WgXcQ' : null,
        director: 'D',
        status,
      },
    });
  const popular = await movie('popular', '2026-09-01');
  const betaHit = await movie('beta-hit', '2026-09-20');
  const later = await movie('later', '2026-10-01');
  const past = await movie('past-only', '2026-09-02');
  const inactiveShow = await movie('inactive-show', '2026-09-03');
  const inactiveHall = await movie('inactive-hall', '2026-09-04');
  const far = await movie('far-away', '2026-09-05');
  const closedOnly = await movie('closed-only', '2026-09-06');
  const archived = await movie('archived', '2026-09-07', 'ARCHIVED');
  await movie('coming-b', '2026-12-01', 'COMING_SOON');
  await movie('coming-a', '2026-11-01', 'COMING_SOON');

  const now = Date.now();
  const show = (
    movieId: string,
    hallId: string,
    offsetMs: number,
    extra: {
      format?: 'FORMAT_2D' | 'FORMAT_3D';
      languageVersion?: 'DUBBED_SQ' | 'ORIGINAL_SQ_SUBTITLES' | 'ORIGINAL_NO_SUBTITLES';
      isActive?: boolean;
    } = {},
  ) => ({
    movieId,
    hallId,
    startsAt: new Date(now + offsetMs),
    endsAt: new Date(now + offsetMs + 2 * HOUR),
    format: extra.format ?? ('FORMAT_2D' as const),
    languageVersion: extra.languageVersion ?? ('ORIGINAL_SQ_SUBTITLES' as const),
    isActive: extra.isActive ?? true,
  });
  await db.showtime.createMany({
    data: [
      // popular: 3 shows at alpha within 7 days, 2D + 3D, two language versions.
      show(popular.id, alpha1.id, 1 * DAY),
      show(popular.id, alpha1.id, 2 * DAY, { format: 'FORMAT_3D', languageVersion: 'DUBBED_SQ' }),
      show(popular.id, alpha2.id, 3 * DAY),
      // beta-hit: 3 shows at beta within 7 days (ties with popular across all locations).
      show(betaHit.id, beta1.id, 1 * DAY),
      show(betaHit.id, beta1.id, 2 * DAY),
      show(betaHit.id, beta1.id, 3 * DAY),
      // later: 4 shows at alpha, but only after the 7-day featured window (inside 14 days).
      ...[9, 10, 11, 12].map((d) => show(later.id, alpha3.id, d * DAY)),
      show(past.id, alpha1.id, -3 * HOUR),
      show(inactiveShow.id, alpha3.id, 1 * DAY, { isActive: false }),
      show(inactiveHall.id, alphaOff.id, 1 * DAY),
      show(far.id, alpha1.id, 20 * DAY),
      show(closedOnly.id, closed1.id, 1 * DAY),
      show(archived.id, alpha3.id, 2 * DAY),
    ],
  });
}

beforeAll(async () => {
  await resetDatabase(prisma);
  await createCatalog(prisma);
});

const slugs = (body: unknown) => moviesResponseSchema.parse(body).movies.map((m) => m.slug);

describe('GET /api/locations', () => {
  it('lists active locations with a hall summary per type, without internal ids', async () => {
    const res = await request(app).get('/api/locations').expect(200);
    const { locations } = locationsResponseSchema.parse(res.body);
    expect(locations).toEqual([
      {
        slug: 'alpha',
        name: 'Kinemax Alfa',
        city: 'Alfa',
        address: 'Rruga Alfa 1',
        timeZone: 'Europe/Belgrade',
        hallTypes: [
          { code: 'STANDARD', nameSq: 'Standard', nameEn: null, hallCount: 2 },
          { code: 'VIP', nameSq: 'VIP', nameEn: 'VIP lounge', hallCount: 1 },
        ],
      },
      {
        slug: 'beta',
        name: 'Kinemax Beta',
        city: 'Beta',
        address: 'Rruga Beta 1',
        timeZone: 'Europe/Belgrade',
        hallTypes: [{ code: 'STANDARD', nameSq: 'Standard', nameEn: null, hallCount: 1 }],
      },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(UUID);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });
});

describe('GET /api/movies', () => {
  it('NOW_SHOWING across all locations: active upcoming showtimes in the next 14 days only', async () => {
    const res = await request(app).get('/api/movies?status=NOW_SHOWING').expect(200);
    // Newest release first.
    expect(slugs(res.body)).toEqual(['later', 'beta-hit', 'popular']);
    expect(JSON.stringify(res.body)).not.toMatch(UUID);
    expect(Object.keys(moviesResponseSchema.parse(res.body).movies[0] ?? {})).not.toContain('id');
  });

  it('NOW_SHOWING scoped to a location, with that location’s formats and language versions', async () => {
    const res = await request(app).get('/api/movies?status=NOW_SHOWING&location=alpha').expect(200);
    const { movies } = moviesResponseSchema.parse(res.body);
    expect(movies.map((m) => m.slug)).toEqual(['later', 'popular']);
    expect(movies[1]).toEqual({
      slug: 'popular',
      titleSq: 'Titulli popular',
      titleEn: 'Popular',
      synopsisSq: 'Përmbledhja popular',
      synopsisEn: null,
      ageRating: 'AGE_12',
      durationMinutes: 100,
      genres: ['DRAMA', 'COMEDY'],
      releaseDate: '2026-09-01',
      posterPath: '/seed/posters/popular.svg',
      formats: ['2D', '3D'],
      languageVersions: ['ORIGINAL_SQ_SUBTITLES', 'DUBBED_SQ'],
    });
    const beta = await request(app).get('/api/movies?status=NOW_SHOWING&location=beta').expect(200);
    expect(slugs(beta.body)).toEqual(['beta-hit']);
  });

  it('COMING_SOON by release date, chain-wide, without showtime versions', async () => {
    const res = await request(app).get('/api/movies?status=COMING_SOON').expect(200);
    const { movies } = moviesResponseSchema.parse(res.body);
    expect(movies.map((m) => m.slug)).toEqual(['coming-a', 'coming-b']);
    expect(movies[0]).toMatchObject({
      releaseDate: '2026-11-01',
      formats: [],
      languageVersions: [],
    });
    const scoped = await request(app)
      .get('/api/movies?status=COMING_SOON&location=beta')
      .expect(200);
    expect(slugs(scoped.body)).toEqual(['coming-a', 'coming-b']);
  });

  it('rejects invalid parameters with 400 and never caches errors', async () => {
    for (const query of [
      '',
      '?status=ARCHIVED',
      '?status=NOW_SHOWING&location=Not%20A%20Slug',
      '?status=NOW_SHOWING&sort=title',
      '?status=NOW_SHOWING&status=COMING_SOON',
    ]) {
      const res = await request(app).get(`/api/movies${query}`).expect(400);
      expect((res.body as { error: { code: string } }).error.code, query).toBe('validation_failed');
      expect(res.headers['cache-control'], query).toBe('no-store');
    }
  });

  it('answers 404 for an unknown or inactive location', async () => {
    for (const slug of ['nowhere', 'closed']) {
      const res = await request(app).get(`/api/movies?status=NOW_SHOWING&location=${slug}`);
      expect(res.status, slug).toBe(404);
      expect(res.body).toEqual({ error: { code: 'not_found', message: 'Not found.' } });
    }
  });

  it('is not publicly cacheable when the response clears a stale session cookie', async () => {
    const res = await request(app)
      .get('/api/movies?status=COMING_SOON')
      .set('Cookie', 'kinemax_session=stale-token')
      .expect(200);
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /api/featured', () => {
  it('picks the movie with the most showtimes in the next 7 days at the location', async () => {
    // "later" has more showtimes, but all of them after the 7-day window.
    const res = await request(app).get('/api/featured?location=alpha').expect(200);
    const { movie } = featuredResponseSchema.parse(res.body);
    expect(movie).toMatchObject({
      slug: 'popular',
      backdropPath: '/seed/backdrops/popular.svg',
      trailerYoutubeId: 'dQw4w9WgXcQ',
      formats: ['2D', '3D'],
    });
    expect(JSON.stringify(res.body)).not.toMatch(UUID);
    expect(res.headers['cache-control']).toBe('public, max-age=60');

    const beta = await request(app).get('/api/featured?location=beta').expect(200);
    expect(featuredResponseSchema.parse(beta.body).movie?.slug).toBe('beta-hit');
  });

  it('breaks ties by the newest release across all locations', async () => {
    const res = await request(app).get('/api/featured').expect(200);
    expect(featuredResponseSchema.parse(res.body).movie?.slug).toBe('beta-hit');
  });

  it('returns null when nothing is scheduled, 400 for bad input and 404 for unknown places', async () => {
    await prisma.location.create({
      data: {
        slug: 'empty',
        name: 'Kinemax Empty',
        city: 'Empty',
        address: 'Rruga 1',
        timeZone: 'Europe/Belgrade',
      },
    });
    const empty = await request(app).get('/api/featured?location=empty').expect(200);
    expect(empty.body).toEqual({ movie: null });
    await request(app).get('/api/featured?location=EMPTY').expect(400);
    await request(app).get('/api/featured?movie=popular').expect(400);
    await request(app).get('/api/featured?location=nowhere').expect(404);
  });
});
