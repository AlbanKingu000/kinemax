import {
  featuredQuerySchema,
  moviesQuerySchema,
  type FeaturedResponse,
  type LanguageVersion,
  type LocationsResponse,
  type MovieFormat,
  type MovieSummary,
  type MoviesResponse,
} from '@kinemax/shared';
import { Router, type Response } from 'express';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError, parseInput } from '../http/errors.js';

const DAY_MS = 86_400_000;
/** "Now showing" = scheduled within this window from now. */
export const NOW_SHOWING_WINDOW_DAYS = 14;
/** The featured movie is the one with the most showtimes within this window. */
export const FEATURED_WINDOW_DAYS = 7;
/** Public catalog data changes rarely (admin edits); a short cache keeps it fresh enough. */
export const CATALOG_MAX_AGE_SECONDS = 60;

const FORMAT: Record<'FORMAT_2D' | 'FORMAT_3D', MovieFormat> = {
  FORMAT_2D: '2D',
  FORMAT_3D: '3D',
};
const FORMAT_ORDER: MovieFormat[] = ['2D', '3D'];
const LANGUAGE_ORDER: LanguageVersion[] = [
  'ORIGINAL_SQ_SUBTITLES',
  'DUBBED_SQ',
  'ORIGINAL_NO_SUBTITLES',
];

const movieSelect = {
  id: true,
  slug: true,
  titleSq: true,
  titleEn: true,
  synopsisSq: true,
  synopsisEn: true,
  ageRating: true,
  durationMinutes: true,
  genres: true,
  releaseDate: true,
  posterPath: true,
  backdropPath: true,
  trailerYoutubeId: true,
} satisfies Prisma.MovieSelect;
type MovieRow = Prisma.MovieGetPayload<{ select: typeof movieSelect }>;

interface Versions {
  formats: Set<MovieFormat>;
  languages: Set<LanguageVersion>;
}

function toSummary(movie: MovieRow, versions?: Versions): MovieSummary {
  return {
    slug: movie.slug,
    titleSq: movie.titleSq,
    titleEn: movie.titleEn,
    synopsisSq: movie.synopsisSq,
    synopsisEn: movie.synopsisEn,
    ageRating: movie.ageRating,
    durationMinutes: movie.durationMinutes,
    genres: movie.genres,
    releaseDate: movie.releaseDate.toISOString().slice(0, 10),
    posterPath: movie.posterPath,
    formats: FORMAT_ORDER.filter((f) => versions?.formats.has(f)),
    languageVersions: LANGUAGE_ORDER.filter((l) => versions?.languages.has(l)),
  };
}

/**
 * Public, session-independent data may be cached by browsers and shared caches for a short time.
 * Never when the response sets a cookie (loadSession clears a stale session cookie on any request).
 */
function cachePublicly(res: Response): void {
  if (res.getHeader('Set-Cookie') === undefined) {
    res.set('Cache-Control', `public, max-age=${String(CATALOG_MAX_AGE_SECONDS)}`);
  }
}

export function createCatalogRouter(prisma: PrismaClient): Router {
  const router = Router();

  /** 404 for a slug that does not exist or is inactive; nothing else is revealed. */
  async function assertActiveLocation(slug: string | undefined): Promise<void> {
    if (slug === undefined) return;
    const location = await prisma.location.findFirst({
      where: { slug, isActive: true },
      select: { slug: true },
    });
    if (!location) throw new HttpError(404, 'not_found', 'Not found.');
  }

  /** Active upcoming showtimes of NOW_SHOWING movies in active halls (of one location). */
  function showtimeScope(locationSlug: string | undefined, days: number) {
    const now = new Date();
    return {
      isActive: true,
      startsAt: { gte: now, lt: new Date(now.getTime() + days * DAY_MS) },
      movie: { status: 'NOW_SHOWING' },
      hall: {
        isActive: true,
        location: { isActive: true, ...(locationSlug ? { slug: locationSlug } : {}) },
      },
    } satisfies Prisma.ShowtimeWhereInput;
  }

  /** Distinct formats and language versions per movie within the scope. */
  async function versionsByMovie(where: Prisma.ShowtimeWhereInput) {
    const rows = await prisma.showtime.findMany({
      where,
      distinct: ['movieId', 'format', 'languageVersion'],
      select: { movieId: true, format: true, languageVersion: true },
    });
    const byMovie = new Map<string, Versions>();
    for (const row of rows) {
      const entry = byMovie.get(row.movieId) ?? { formats: new Set(), languages: new Set() };
      entry.formats.add(FORMAT[row.format]);
      entry.languages.add(row.languageVersion);
      byMovie.set(row.movieId, entry);
    }
    return byMovie;
  }

  router.get('/locations', async (_req, res) => {
    const locations = await prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        city: true,
        address: true,
        timeZone: true,
        halls: {
          where: { isActive: true },
          select: {
            hallType: { select: { code: true, nameSq: true, nameEn: true, sortOrder: true } },
          },
        },
      },
    });
    const body: LocationsResponse = {
      locations: locations.map(({ halls, ...location }) => {
        const types = new Map<
          string,
          LocationsResponse['locations'][number]['hallTypes'][number]
        >();
        for (const { hallType } of [...halls].sort(
          (a, b) => a.hallType.sortOrder - b.hallType.sortOrder,
        )) {
          const entry = types.get(hallType.code);
          if (entry) entry.hallCount += 1;
          else {
            types.set(hallType.code, {
              code: hallType.code,
              nameSq: hallType.nameSq,
              nameEn: hallType.nameEn,
              hallCount: 1,
            });
          }
        }
        return { ...location, hallTypes: [...types.values()] };
      }),
    };
    cachePublicly(res);
    res.json(body);
  });

  router.get('/movies', async (req, res) => {
    const query = parseInput(moviesQuerySchema, req.query);
    await assertActiveLocation(query.location);

    let movies: MovieSummary[];
    if (query.status === 'COMING_SOON') {
      // Releases are chain-wide: a valid location is accepted but does not narrow the list.
      const rows = await prisma.movie.findMany({
        where: { status: 'COMING_SOON' },
        orderBy: [{ releaseDate: 'asc' }, { slug: 'asc' }],
        select: movieSelect,
      });
      movies = rows.map((movie) => toSummary(movie));
    } else {
      const versions = await versionsByMovie(
        showtimeScope(query.location, NOW_SHOWING_WINDOW_DAYS),
      );
      const rows = await prisma.movie.findMany({
        where: { id: { in: [...versions.keys()] } },
        orderBy: [{ releaseDate: 'desc' }, { slug: 'asc' }],
        select: movieSelect,
      });
      movies = rows.map((movie) => toSummary(movie, versions.get(movie.id)));
    }
    cachePublicly(res);
    res.json({ movies } satisfies MoviesResponse);
  });

  /**
   * Featured rule (until the admin can pick one): among NOW_SHOWING movies, the one with the most
   * active showtimes in the next 7 days (at the location, or across all locations); ties go to the
   * newest release, then to the slug, so the answer is deterministic.
   */
  router.get('/featured', async (req, res) => {
    const query = parseInput(featuredQuerySchema, req.query);
    await assertActiveLocation(query.location);

    const scope = showtimeScope(query.location, FEATURED_WINDOW_DAYS);
    const counts = await prisma.showtime.groupBy({
      by: ['movieId'],
      where: scope,
      _count: { _all: true },
    });
    const movies = await prisma.movie.findMany({
      where: { id: { in: counts.map((c) => c.movieId) } },
      select: movieSelect,
    });
    const showCount = new Map(counts.map((c) => [c.movieId, c._count._all]));
    const [featured] = movies.sort(
      (a, b) =>
        (showCount.get(b.id) ?? 0) - (showCount.get(a.id) ?? 0) ||
        b.releaseDate.getTime() - a.releaseDate.getTime() ||
        a.slug.localeCompare(b.slug),
    );

    let body: FeaturedResponse = { movie: null };
    if (featured) {
      // Badges describe the same window as the "now showing" list.
      const versions = await versionsByMovie({
        ...showtimeScope(query.location, NOW_SHOWING_WINDOW_DAYS),
        movieId: featured.id,
      });
      body = {
        movie: {
          ...toSummary(featured, versions.get(featured.id)),
          backdropPath: featured.backdropPath,
          trailerYoutubeId: featured.trailerYoutubeId,
        },
      };
    }
    cachePublicly(res);
    res.json(body);
  });

  return router;
}
