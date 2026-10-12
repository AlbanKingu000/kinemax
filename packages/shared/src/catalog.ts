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

// ---------------------------------------------------------------------------------------------
// Movie detail (/api/movies/:slug)
// ---------------------------------------------------------------------------------------------

export const movieDetailSchema = movieSummarySchema
  .omit({ formats: true, languageVersions: true })
  .extend({
    status: movieListStatusSchema,
    director: z.string(),
    cast: z.array(z.string()),
    backdropPath: z.string().nullable(),
    trailerYoutubeId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{11}$/)
      .nullable(),
  });
export type MovieDetail = z.infer<typeof movieDetailSchema>;

export const movieDetailResponseSchema = z.object({ movie: movieDetailSchema });
export type MovieDetailResponse = z.infer<typeof movieDetailResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Showtimes (/api/showtimes, /api/showtimes/:id)
// ---------------------------------------------------------------------------------------------

/** Days that can be browsed: today and the 6 following days, in the cinema's time zone. */
export const SCHEDULE_DAYS = 7;

/** Comma-separated query values ("2D,3D"), each validated; duplicates removed. */
const csv = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .string()
    .max(200)
    .transform((value) => [...new Set(value.split(',').map((part) => part.trim()))])
    .pipe(z.array(item).min(1));

export const hallTypeCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);

export const showtimesQuerySchema = z
  .object({
    location: slugSchema,
    /** Calendar day in the cinema's time zone; defaults to its today. */
    date: isoDateSchema.optional(),
    movie: slugSchema.optional(),
    hallType: csv(hallTypeCodeSchema).optional(),
    format: csv(movieFormatSchema).optional(),
    language: csv(languageVersionSchema).optional(),
  })
  .strict();
export type ShowtimesQuery = z.input<typeof showtimesQuerySchema>;

/**
 * AVAILABLE, FEW_LEFT (fewer than 15% of the hall's seats free) or SOLD_OUT. Suites are sold as a
 * whole, so they are only AVAILABLE or SOLD_OUT.
 */
export const availabilitySchema = z.enum(['AVAILABLE', 'FEW_LEFT', 'SOLD_OUT']);
export type Availability = z.infer<typeof availabilitySchema>;

const localTimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

const hallTypeRefSchema = z.object({
  code: z.string(),
  nameSq: z.string(),
  nameEn: z.string().nullable(),
});

export const showtimeSlotSchema = z.object({
  id: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** Start and end in the cinema's time zone, "HH:MM". */
  startTime: localTimeSchema,
  endTime: localTimeSchema,
  hallName: z.string(),
  availability: availabilitySchema,
});
export type ShowtimeSlot = z.infer<typeof showtimeSlotSchema>;

/**
 * Lowest price in the group: an ADULT ticket on the cheapest single-ticket seat type of the hall
 * (TICKET), or the price of the whole suite (WHOLE_HALL). Null when no price rule applies.
 */
export const fromPriceSchema = z.object({
  kind: z.enum(['TICKET', 'WHOLE_HALL']),
  amountCents: z.number().int().nonnegative(),
});
export type FromPrice = z.infer<typeof fromPriceSchema>;

export const showtimeGroupSchema = z.object({
  hallType: hallTypeRefSchema,
  format: movieFormatSchema,
  languageVersion: languageVersionSchema,
  fromPrice: fromPriceSchema.nullable(),
  showtimes: z.array(showtimeSlotSchema),
});
export type ShowtimeGroup = z.infer<typeof showtimeGroupSchema>;

export const scheduleMovieSchema = movieSummarySchema.pick({
  slug: true,
  titleSq: true,
  titleEn: true,
  ageRating: true,
  durationMinutes: true,
  genres: true,
  posterPath: true,
});
export type ScheduleMovie = z.infer<typeof scheduleMovieSchema>;

export const showtimesResponseSchema = z.object({
  location: z.object({
    slug: slugSchema,
    name: z.string(),
    city: z.string(),
    timeZone: z.string(),
  }),
  date: isoDateSchema,
  /** The browsable days (today first), in the cinema's time zone. */
  days: z.array(isoDateSchema),
  movies: z.array(z.object({ movie: scheduleMovieSchema, groups: z.array(showtimeGroupSchema) })),
});
export type ShowtimesResponse = z.infer<typeof showtimesResponseSchema>;

export const showtimeDetailResponseSchema = z.object({
  showtime: z.object({
    id: z.uuid(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    /** Calendar day and times in the cinema's time zone. */
    date: isoDateSchema,
    startTime: localTimeSchema,
    endTime: localTimeSchema,
    format: movieFormatSchema,
    languageVersion: languageVersionSchema,
    /** True once the show has started: it can no longer be booked. */
    hasStarted: z.boolean(),
    movie: scheduleMovieSchema,
    location: z.object({
      slug: slugSchema,
      name: z.string(),
      city: z.string(),
      address: z.string(),
      timeZone: z.string(),
    }),
    hall: z.object({ name: z.string(), wholeHallOnly: z.boolean(), hallType: hallTypeRefSchema }),
  }),
});
export type ShowtimeDetailResponse = z.infer<typeof showtimeDetailResponseSchema>;
