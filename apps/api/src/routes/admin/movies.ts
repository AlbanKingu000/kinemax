// Movie management (SUPER_ADMIN only: movies are global, shared by every cinema), with the poster
// and backdrop upload. Movies that have showtimes are archived, never deleted.
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  adminMoviesQuerySchema,
  MOVIE_IMAGE_RULES,
  movieImageKindSchema,
  movieInputSchema,
  movieUpdateSchema,
  type AdminMovie,
  type AdminMovieResponse,
} from '@kinemax/shared';
import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { ImageRejectedError, probeImage, reencodeToWebp } from '../../domain/image-file.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { requireRole } from '../../http/auth-middleware.js';
import { HttpError, parseInput } from '../../http/errors.js';
import { MEDIA_URL_PREFIX, mediaFileOf } from '../media.js';
import { idParams, notFound } from '../booking-common.js';
import { audit, type AdminDeps } from './common.js';

const movieSelect = {
  id: true,
  slug: true,
  titleSq: true,
  titleEn: true,
  synopsisSq: true,
  synopsisEn: true,
  durationMinutes: true,
  ageRating: true,
  genres: true,
  releaseDate: true,
  director: true,
  cast: true,
  status: true,
  trailerYoutubeId: true,
  posterPath: true,
  backdropPath: true,
} satisfies Prisma.MovieSelect;

type MovieRow = Prisma.MovieGetPayload<{ select: typeof movieSelect }>;

const imageParams = z.object({ id: z.uuid(), kind: movieImageKindSchema });

/** A movie's editable fields as stored in the audit log. */
function snapshot(movie: MovieRow): Prisma.InputJsonObject {
  return { ...movie, releaseDate: movie.releaseDate.toISOString().slice(0, 10) };
}

function unprocessableImage(reason: string): HttpError {
  return new HttpError(422, 'unprocessable', 'The image was not accepted.', {
    fields: [{ path: 'file', code: reason }],
  });
}

export function createMoviesRouter({
  prisma,
  logger,
  now,
  uploadsDir,
  limit,
}: Pick<AdminDeps, 'prisma' | 'logger' | 'now'> & {
  uploadsDir: string;
  limit: (req: Request, kind: 'write' | 'sensitive', event: string) => void;
}): Router {
  const router = Router();
  router.use('/movies', requireRole('SUPER_ADMIN'));

  const counts = async (ids: string[]) => {
    const [all, upcoming] = await Promise.all([
      prisma.showtime.groupBy({ by: ['movieId'], where: { movieId: { in: ids } }, _count: true }),
      prisma.showtime.groupBy({
        by: ['movieId'],
        where: { movieId: { in: ids }, isActive: true, startsAt: { gt: now() } },
        _count: true,
      }),
    ]);
    const map = (rows: { movieId: string; _count: number }[]) =>
      new Map(rows.map((row) => [row.movieId, row._count]));
    return { all: map(all), upcoming: map(upcoming) };
  };

  const toAdminMovies = async (rows: MovieRow[]): Promise<AdminMovie[]> => {
    const { all, upcoming } = await counts(rows.map((row) => row.id));
    return rows.map((row) => ({
      ...row,
      releaseDate: row.releaseDate.toISOString().slice(0, 10),
      showtimeCount: all.get(row.id) ?? 0,
      upcomingShowtimeCount: upcoming.get(row.id) ?? 0,
    }));
  };

  const loadMovie = async (id: string): Promise<AdminMovie> => {
    const row = await prisma.movie.findUnique({ where: { id }, select: movieSelect });
    if (!row) throw notFound();
    const [movie] = await toAdminMovies([row]);
    if (!movie) throw notFound();
    return movie;
  };

  router.get('/movies', async (req, res) => {
    const query = parseInput(adminMoviesQuerySchema, req.query);
    const rows = await prisma.movie.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { titleSq: { contains: query.q, mode: 'insensitive' } },
                { titleEn: { contains: query.q, mode: 'insensitive' } },
                { director: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: movieSelect,
      orderBy: [{ releaseDate: 'desc' }, { titleSq: 'asc' }],
    });
    res.json({ movies: await toAdminMovies(rows) });
  });

  router.get('/movies/:id', async (req, res) => {
    const { id } = parseInput(idParams, req.params);
    const body: AdminMovieResponse = { movie: await loadMovie(id) };
    res.json(body);
  });

  router.post('/movies', async (req, res) => {
    limit(req, 'write', 'admin_movie_write');
    const input = parseInput(movieInputSchema, req.body);
    const created = await prisma.$transaction(async (tx) => {
      const movie = await tx.movie.create({
        data: { ...input, releaseDate: new Date(`${input.releaseDate}T00:00:00Z`) },
        select: movieSelect,
      });
      await audit(tx, req, {
        action: 'movie.create',
        entityType: 'Movie',
        entityId: movie.id,
        after: snapshot(movie),
      });
      return movie;
    });
    const body: AdminMovieResponse = { movie: await loadMovie(created.id) };
    res.status(201).json(body);
  });

  router.patch('/movies/:id', async (req, res) => {
    limit(req, 'write', 'admin_movie_write');
    const { id } = parseInput(idParams, req.params);
    const input = parseInput(movieUpdateSchema, req.body);
    await prisma.$transaction(async (tx) => {
      const before = await tx.movie.findUnique({ where: { id }, select: movieSelect });
      if (!before) throw notFound();
      const after = await tx.movie.update({
        where: { id },
        data: {
          ...input,
          ...(input.releaseDate ? { releaseDate: new Date(`${input.releaseDate}T00:00:00Z`) } : {}),
        },
        select: movieSelect,
      });
      await audit(tx, req, {
        action:
          input.status === 'ARCHIVED' && before.status !== 'ARCHIVED'
            ? 'movie.archive'
            : 'movie.update',
        entityType: 'Movie',
        entityId: id,
        before: snapshot(before),
        after: snapshot(after),
      });
    });
    const body: AdminMovieResponse = { movie: await loadMovie(id) };
    res.json(body);
  });

  /** Only a movie that never had a showtime can be deleted; otherwise archive it (409). */
  router.delete('/movies/:id', async (req, res) => {
    limit(req, 'sensitive', 'admin_movie_delete');
    const { id } = parseInput(idParams, req.params);
    const removed = await prisma.$transaction(async (tx) => {
      const movie = await tx.movie.findUnique({ where: { id }, select: movieSelect });
      if (!movie) throw notFound();
      if ((await tx.showtime.count({ where: { movieId: id } })) > 0) {
        throw new HttpError(409, 'conflict', 'A movie with showtimes can only be archived.');
      }
      await tx.movie.delete({ where: { id } });
      await audit(tx, req, {
        action: 'movie.delete',
        entityType: 'Movie',
        entityId: id,
        before: snapshot(movie),
      });
      return movie;
    });
    await removeMedia([removed.posterPath, removed.backdropPath]);
    res.status(204).end();
  });

  router.post(
    '/movies/:id/images/:kind',
    (req, _res, next) => {
      // Before the body is read: the limit counts attempts, also rejected ones.
      limit(req, 'sensitive', 'admin_movie_image');
      next();
    },
    // Any content type: the type is decided by the bytes, never by the client's header.
    express.raw({ type: () => true, limit: MOVIE_IMAGE_RULES.maxBytes }),
    async (req, res) => {
      const { id, kind } = parseInput(imageParams, req.params);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw unprocessableImage('empty');
      const exists = await prisma.movie.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw notFound();

      let bytes: Buffer;
      let type: string;
      try {
        const image = probeImage(req.body);
        const rules = MOVIE_IMAGE_RULES[kind];
        if (
          image.width < rules.minWidth ||
          image.height < rules.minHeight ||
          image.width > MOVIE_IMAGE_RULES.maxSide ||
          image.height > MOVIE_IMAGE_RULES.maxSide
        ) {
          throw unprocessableImage('dimensions');
        }
        // Stored as WebP whatever was uploaded; the original type goes to the audit log.
        bytes = await reencodeToWebp(req.body, MOVIE_IMAGE_RULES.maxSide);
        type = image.type;
      } catch (error) {
        if (error instanceof ImageRejectedError) throw unprocessableImage(error.reason);
        throw error;
      }

      const file = `${randomUUID()}.webp`;
      await writeFile(join(uploadsDir, file), bytes, { flag: 'wx' });
      const column = kind === 'poster' ? 'posterPath' : 'backdropPath';
      let previous: string | null;
      try {
        previous = await prisma.$transaction(async (tx) => {
          const before = await tx.movie.findUniqueOrThrow({
            where: { id },
            select: { posterPath: true, backdropPath: true },
          });
          const old = before[column];
          await tx.movie.update({
            where: { id },
            data: { [column]: `${MEDIA_URL_PREFIX}${file}` },
          });
          await audit(tx, req, {
            action: `movie.${kind}`,
            entityType: 'Movie',
            entityId: id,
            before: { [column]: old },
            after: { [column]: `${MEDIA_URL_PREFIX}${file}`, bytes: bytes.length, type },
          });
          return old;
        });
      } catch (error) {
        await removeMedia([`${MEDIA_URL_PREFIX}${file}`]);
        throw error;
      }
      // The old upload is no longer referenced: remove it (seed images in the web app stay).
      await removeMedia([previous]);
      logger.info('movie.image', { movieId: id, kind, bytes: bytes.length, type });
      const body: AdminMovieResponse = { movie: await loadMovie(id) };
      res.json(body);
    },
  );

  /** Deletes our uploaded files behind these paths (others, e.g. /seed/..., are ignored). */
  async function removeMedia(paths: (string | null)[]) {
    for (const path of paths) {
      const file = path ? mediaFileOf(path) : undefined;
      if (!file) continue;
      await unlink(join(uploadsDir, file)).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn('media.unlink_failed', { file });
        }
      });
    }
  }

  return router;
}
