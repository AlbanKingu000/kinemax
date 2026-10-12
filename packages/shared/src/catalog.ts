import { z } from 'zod';

// Public read-only catalog API (/api/locations, /api/movies, /api/featured). Both languages are
// returned; the web app picks the current one and falls back to Albanian when English is missing.
// No internal ids: everything is addressed by slug.

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);

export const ageRatingSchema = z.enum(['ALL', 'AGE_7', 'AGE_12', 'AGE_15', 'AGE_18']);
export type AgeRating = z.infer<typeof ageRatingSchema>;

export const genreSchema = z.enum([
  'ACTION',
  'ADVENTURE',
  'ANIMATION',
  'COMEDY',
  'CRIME',
  'DOCUMENTARY',
  'DRAMA',
  'FAMILY',
  'FANTASY',
  'HISTORY',
  'HORROR',
  'MUSIC',
  'MYSTERY',
  'ROMANCE',
  'SCI_FI',
  'THRILLER',
  'WAR',
]);
export type Genre = z.infer<typeof genreSchema>;

export const movieFormatSchema = z.enum(['2D', '3D']);
export type MovieFormat = z.infer<typeof movieFormatSchema>;

export const languageVersionSchema = z.enum([
  'ORIGINAL_SQ_SUBTITLES',
  'DUBBED_SQ',
  'ORIGINAL_NO_SUBTITLES',
]);
export type LanguageVersion = z.infer<typeof languageVersionSchema>;

export const movieListStatusSchema = z.enum(['NOW_SHOWING', 'COMING_SOON']);
export type MovieListStatus = z.infer<typeof movieListStatusSchema>;

/** `GET /api/movies` query. Unknown parameters are rejected. */
export const moviesQuerySchema = z
  .object({ status: movieListStatusSchema, location: slugSchema.optional() })
  .strict();
export type MoviesQuery = z.infer<typeof moviesQuerySchema>;

/** `GET /api/featured` query. */
export const featuredQuerySchema = z.object({ location: slugSchema.optional() }).strict();
export type FeaturedQuery = z.infer<typeof featuredQuerySchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const locationSummarySchema = z.object({
  slug: slugSchema,
  name: z.string(),
  city: z.string(),
  address: z.string(),
  timeZone: z.string(),
  /** Active halls per hall type, in the hall types' display order. */
  hallTypes: z.array(
    z.object({
      code: z.string(),
      nameSq: z.string(),
      nameEn: z.string().nullable(),
      hallCount: z.number().int().positive(),
    }),
  ),
});
export type LocationSummary = z.infer<typeof locationSummarySchema>;

export const locationsResponseSchema = z.object({ locations: z.array(locationSummarySchema) });
export type LocationsResponse = z.infer<typeof locationsResponseSchema>;

export const movieSummarySchema = z.object({
  slug: slugSchema,
  titleSq: z.string(),
  titleEn: z.string().nullable(),
  synopsisSq: z.string(),
  synopsisEn: z.string().nullable(),
  ageRating: ageRatingSchema,
  durationMinutes: z.number().int().positive(),
  genres: z.array(genreSchema),
  releaseDate: isoDateSchema,
  posterPath: z.string().nullable(),
  /** Formats and language versions of the upcoming showtimes in scope (empty for coming soon). */
  formats: z.array(movieFormatSchema),
  languageVersions: z.array(languageVersionSchema),
});
export type MovieSummary = z.infer<typeof movieSummarySchema>;

export const moviesResponseSchema = z.object({ movies: z.array(movieSummarySchema) });
export type MoviesResponse = z.infer<typeof moviesResponseSchema>;

export const featuredMovieSchema = movieSummarySchema.extend({
  backdropPath: z.string().nullable(),
  /** YouTube video id; the web app embeds it via youtube-nocookie.com only after a click. */
  trailerYoutubeId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{11}$/)
    .nullable(),
});
export type FeaturedMovie = z.infer<typeof featuredMovieSchema>;

/** `movie` is null when nothing is scheduled in the featured window. */
export const featuredResponseSchema = z.object({ movie: featuredMovieSchema.nullable() });
export type FeaturedResponse = z.infer<typeof featuredResponseSchema>;
