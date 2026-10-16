import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { adminMovieResponseSchema, adminMoviesResponseSchema, CSRF_HEADER } from '@kinemax/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../db/helpers.js';
import {
  createAdminFixture,
  expectRefused,
  GENEROUS_LIMITS,
  staffClients,
  type AdminFixture,
  type Client,
  type Role,
} from '../support/admin.js';
import { APP_ORIGIN, makeTestApp, testPrisma } from '../support/app.js';
import sharp from 'sharp';
import { makeJpeg, makePng } from '../support/images.js';

// Movie management and the secure poster/backdrop upload (super admin only).

const prisma = testPrisma();
const { app, uploadsDir } = makeTestApp(GENEROUS_LIMITS);
let fx: AdminFixture;
let clients: Record<Role, Client>;

const input = {
  slug: 'drita-e-veriut',
  titleSq: 'Drita e Veriut',
  titleEn: 'Northern Light',
  synopsisSq: 'Një udhëtim drejt veriut.',
  synopsisEn: '',
  durationMinutes: 118,
  ageRating: 'AGE_12',
  genres: ['DRAMA', 'ADVENTURE'],
  releaseDate: '2026-11-20',
  director: 'Regjisore Demo',
  cast: ['Aktore Një', 'Aktor Dy'],
  status: 'COMING_SOON',
  trailerYoutubeId: 'dQw4w9WgXcQ',
};

beforeEach(async () => {
  await resetDatabase(prisma);
  fx = await createAdminFixture(prisma);
  clients = await staffClients(app, fx);
});

const create = async () => {
  const res = await clients.superAdmin.post('/api/admin/movies', input).expect(201);
  return adminMovieResponseSchema.parse(res.body).movie;
};

/** Sends raw bytes like the panel does (any Content-Type: the server ignores it). */
const upload = (client: Client, id: string, kind: string, bytes: Buffer, type = 'image/png') =>
  client.agent
    .post(`/api/admin/movies/${id}/images/${kind}`)
    .set('Origin', APP_ORIGIN)
    .set(CSRF_HEADER, client.token)
    .set('Content-Type', type)
    .send(bytes);

const auditOf = (entityId: string) =>
  prisma.auditLog.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } });

describe('movies CRUD', () => {
  it('creates, lists, searches and edits a movie with an audit trail', async () => {
    const movie = await create();
    expect(movie).toMatchObject({
      slug: 'drita-e-veriut',
      synopsisEn: null,
      showtimeCount: 0,
      posterPath: null,
    });
    const list = adminMoviesResponseSchema.parse(
      (await clients.superAdmin.get('/api/admin/movies?q=northern').expect(200)).body,
    );
    expect(list.movies.map((m) => m.id)).toEqual([movie.id]);
    const filtered = adminMoviesResponseSchema.parse(
      (await clients.superAdmin.get('/api/admin/movies?status=NOW_SHOWING').expect(200)).body,
    );
    expect(filtered.movies.map((m) => m.slug)).toEqual(['test-movie']);

    const res = await clients.superAdmin
      .patch(`/api/admin/movies/${movie.id}`, { status: 'NOW_SHOWING', titleEn: 'Aurora' })
      .expect(200);
    expect(adminMovieResponseSchema.parse(res.body).movie).toMatchObject({
      status: 'NOW_SHOWING',
      titleEn: 'Aurora',
    });
    const log = await auditOf(movie.id);
    expect(log.map((row) => row.action)).toEqual(['movie.create', 'movie.update']);
    expect(log[1]).toMatchObject({
      actorId: fx.staff.superAdmin.id,
      before: expect.objectContaining({ titleEn: 'Northern Light' }) as unknown,
      after: expect.objectContaining({ titleEn: 'Aurora' }) as unknown,
    });
  });

  it('validates every field, including the 11-character trailer id', async () => {
    for (const bad of [
      { trailerYoutubeId: 'abc' },
      { trailerYoutubeId: 'https://youtu.be/dQw4w9WgXcQ' },
      { durationMinutes: 0 },
      { genres: [] },
      { genres: ['DRAMA', 'DRAMA'] },
      { slug: 'Not A Slug' },
      { releaseDate: '20-11-2026' },
      { titleSq: '   ' },
    ]) {
      const res = await clients.superAdmin.post('/api/admin/movies', { ...input, ...bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    // Unknown keys (e.g. an id or a poster path) are rejected, not ignored.
    await clients.superAdmin
      .post('/api/admin/movies', { ...input, posterPath: '/evil.svg' })
      .expect(400);
    await clients.superAdmin.patch(`/api/admin/movies/${fx.movie.id}`, {}).expect(400);
    // A duplicate slug is a conflict.
    await create();
    expect((await clients.superAdmin.post('/api/admin/movies', input)).status).toBe(409);
  });

  it('deletes a movie without showtimes but only archives one with showtimes', async () => {
    const fresh = await create();
    await clients.superAdmin.delete(`/api/admin/movies/${fresh.id}`).expect(204);
    expect(await prisma.movie.findUnique({ where: { id: fresh.id } })).toBeNull();

    const res = await clients.superAdmin.delete(`/api/admin/movies/${fx.movie.id}`);
    expect(res.status).toBe(409);
    expect(await prisma.movie.findUnique({ where: { id: fx.movie.id } })).not.toBeNull();
    const detail = adminMovieResponseSchema.parse(
      (await clients.superAdmin.get(`/api/admin/movies/${fx.movie.id}`).expect(200)).body,
    ).movie;
    expect(detail.showtimeCount).toBeGreaterThan(0);
    expect(detail.upcomingShowtimeCount).toBeGreaterThan(0);

    await clients.superAdmin
      .patch(`/api/admin/movies/${fx.movie.id}`, { status: 'ARCHIVED' })
      .expect(200);
    expect((await auditOf(fx.movie.id)).map((row) => row.action)).toEqual(['movie.archive']);
    // Archived movies leave the public catalog.
    await clients.anonymous.get(`/api/movies/${fx.movie.slug}`).expect(404);
  });

  it('is the super admin’s only: managers of any cinema and customers are refused', async () => {
    const movie = await create();
    const unchanged = () => prisma.movie.findMany({ orderBy: { id: 'asc' } });
    const refused: Role[] = ['anonymous', 'customer', 'manager', 'otherManager'];
    await expectRefused(clients, refused, (c) => c.get('/api/admin/movies'));
    await expectRefused(clients, refused, (c) => c.get(`/api/admin/movies/${movie.id}`));
    await expectRefused(
      clients,
      refused,
      (c) => c.post('/api/admin/movies', { ...input, slug: 'tjeter' }),
      unchanged,
    );
    await expectRefused(
      clients,
      refused,
      (c) => c.patch(`/api/admin/movies/${movie.id}`, { titleSq: 'Hack' }),
      unchanged,
    );
    await expectRefused(
      clients,
      refused,
      (c) => c.delete(`/api/admin/movies/${movie.id}`),
      unchanged,
    );
    await expectRefused(
      clients,
      refused,
      (c) => upload(c, movie.id, 'poster', makePng(300, 450)),
      unchanged,
    );
  });

  it('answers 404 for unknown movies and 400 for malformed ids', async () => {
    const unknown = '0190f0a0-0000-7000-8000-000000000000';
    await clients.superAdmin.get(`/api/admin/movies/${unknown}`).expect(404);
    await clients.superAdmin.patch(`/api/admin/movies/${unknown}`, { titleSq: 'X' }).expect(404);
    await clients.superAdmin.get('/api/admin/movies/nope').expect(400);
  });
});

describe('poster and backdrop upload', () => {
  it('re-encodes a valid poster to WebP without metadata and serves it safely', async () => {
    const movie = await create();
    const res = await upload(
      clients.superAdmin,
      movie.id,
      'poster',
      makePng(300, 450, { text: 'GPS 42.6 21.1' }),
      'application/octet-stream',
    ).expect(200);
    const { posterPath } = adminMovieResponseSchema.parse(res.body).movie;
    expect(posterPath).toMatch(/^\/api\/media\/[0-9a-f-]{36}\.webp$/);

    const media = await clients.anonymous.get(posterPath ?? '').expect(200);
    expect(media.headers['content-type']).toBe('image/webp');
    expect((await sharp(media.body as Buffer).metadata()).format).toBe('webp');
    expect(media.headers['x-content-type-options']).toBe('nosniff');
    expect(media.headers['content-security-policy']).toContain("default-src 'none'");
    expect(media.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((media.body as Buffer).toString('latin1')).not.toContain('GPS');
    expect((await auditOf(movie.id)).map((row) => row.action)).toContain('movie.poster');
  });

  it('decides the type from the bytes and strips the EXIF of a real JPEG', async () => {
    const movie = await create();
    const color = { width: 1920, height: 1080, channels: 3 as const, background: '#b3132f' };
    const jpeg = await sharp({ create: color })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Camera 42.6 21.1' } })
      .toBuffer();
    expect(jpeg.toString('latin1')).toContain('Camera 42.6');
    const res = await upload(clients.superAdmin, movie.id, 'backdrop', jpeg, 'image/png').expect(
      200,
    );
    const path = adminMovieResponseSchema.parse(res.body).movie.backdropPath ?? '';
    expect(path).toMatch(/\.webp$/);
    const stored = (await clients.anonymous.get(path).expect(200)).body as Buffer;
    expect(stored.toString('latin1')).not.toContain('Camera 42.6');
    expect(await sharp(stored).metadata()).toMatchObject({ width: 1920, height: 1080 });
    expect((await sharp(stored).metadata()).exif).toBeUndefined();
    const webp = await sharp({ create: { ...color, width: 600, height: 900 } })
      .webp()
      .toBuffer();
    await upload(clients.superAdmin, movie.id, 'poster', webp).expect(200);
    // A file that passes the structure checks but whose pixels cannot be decoded is refused.
    const broken = await upload(clients.superAdmin, movie.id, 'poster', makeJpeg(600, 900));
    expect(broken.status).toBe(422);
    expect(broken.body).toMatchObject({ error: { fields: [{ code: 'structure' }] } });
  });

  it('rejects SVG, fake extensions, polyglots, wrong sizes and oversized files', async () => {
    const movie = await create();
    const filesBefore = readdirSync(uploadsDir);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const cases: [Buffer, string, number, string?][] = [
      [svg, 'image/svg+xml', 422, 'type'],
      // An SVG renamed and labelled as a PNG.
      [svg, 'image/png', 422, 'type'],
      [Buffer.from('<html><script>alert(1)</script></html>'), 'image/jpeg', 422, 'type'],
      // Valid PNG with a script appended (polyglot).
      [
        Buffer.concat([makePng(300, 450), Buffer.from('<script>x</script>')]),
        'image/png',
        422,
        'structure',
      ],
      [makePng(299, 450), 'image/png', 422, 'dimensions'],
      [makePng(300, 449), 'image/png', 422, 'dimensions'],
      [Buffer.alloc(0), 'image/png', 422, 'empty'],
      [Buffer.alloc(5 * 1024 * 1024 + 1, 1), 'image/png', 413],
    ];
    for (const [bytes, type, status, code] of cases) {
      const res = await upload(clients.superAdmin, movie.id, 'poster', bytes, type);
      expect(res.status, `${type} ${String(code)}`).toBe(status);
      if (code) {
        expect(res.body).toMatchObject({ error: { fields: [{ path: 'file', code }] } });
      }
    }
    // A backdrop needs at least 1280 × 720.
    await upload(clients.superAdmin, movie.id, 'backdrop', makePng(1279, 720)).expect(422);
    await upload(clients.superAdmin, movie.id, 'trailer', makePng(300, 450)).expect(400);
    // Nothing rejected was stored.
    expect(readdirSync(uploadsDir)).toEqual(filesBefore);
    expect(
      (await prisma.movie.findUniqueOrThrow({ where: { id: movie.id } })).posterPath,
    ).toBeNull();
  });

  it('removes the old file when an image is replaced, and both when the movie is deleted', async () => {
    const movie = await create();
    const first = adminMovieResponseSchema.parse(
      (await upload(clients.superAdmin, movie.id, 'poster', makePng(300, 450)).expect(200)).body,
    ).movie.posterPath;
    const second = adminMovieResponseSchema.parse(
      (await upload(clients.superAdmin, movie.id, 'poster', makePng(400, 600)).expect(200)).body,
    ).movie.posterPath;
    const fileOf = (path: string | null) => join(uploadsDir, (path ?? '').split('/').pop() ?? '');
    expect(existsSync(fileOf(first))).toBe(false);
    expect(existsSync(fileOf(second))).toBe(true);
    await clients.anonymous.get(first ?? '').expect(404);

    await clients.superAdmin.delete(`/api/admin/movies/${movie.id}`).expect(204);
    expect(existsSync(fileOf(second))).toBe(false);
  });

  it('serves only names the upload created (no traversal, no other files)', async () => {
    for (const path of [
      '/api/media/..%2F..%2F.env',
      '/api/media/poster.svg',
      '/api/media/0190f0a0-0000-7000-8000-000000000000.png',
      '/api/media/0190F0A0-0000-7000-8000-000000000000.PNG',
    ]) {
      expect((await clients.anonymous.get(path)).status, path).toBe(404);
    }
  });

  it('rate limits uploads per admin', async () => {
    const limited = makeTestApp({
      ...GENEROUS_LIMITS,
      adminRateLimits: {
        writePerUser: { windowMs: 60_000, max: 100 },
        sensitivePerUser: { windowMs: 60_000, max: 2 },
      },
    });
    const admin = (await staffClients(limited.app, fx)).superAdmin;
    for (let i = 0; i < 2; i++)
      await upload(admin, fx.movie.id, 'poster', makePng(10, 10)).expect(422);
    const res = await upload(admin, fx.movie.id, 'poster', makePng(300, 450));
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});
