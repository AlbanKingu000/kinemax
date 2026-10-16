import { z } from 'zod';
import {
  ageRatingSchema,
  genreSchema,
  languageVersionSchema,
  movieFormatSchema,
  slugSchema,
} from './catalog.js';

// Admin panel (/api/admin/*): staff only (SUPER_ADMIN everywhere, LOCATION_MANAGER for their
// locations). The server re-checks every id against the caller's scope.

/** A location the signed-in staff member may manage (the location switcher). */
export const adminLocationSchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  name: z.string(),
  city: z.string(),
  timeZone: z.string(),
});
export type AdminLocation = z.infer<typeof adminLocationSchema>;

/** GET /api/admin/locations: every location for a super admin, the assigned ones for a manager. */
export const adminLocationsResponseSchema = z.object({
  locations: z.array(adminLocationSchema),
});
export type AdminLocationsResponse = z.infer<typeof adminLocationsResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Dashboard (GET /api/admin/stats)
// ---------------------------------------------------------------------------------------------

export const statsRangeSchema = z.enum(['today', '7d', '30d']);
export type StatsRange = z.infer<typeof statsRangeSchema>;

/** Query of GET /api/admin/stats: no location = all the caller's cinemas. */
export const statsQuerySchema = z
  .object({ location: z.uuid().optional(), range: statsRangeSchema.default('today') })
  .strict();

const cents = z.int();
const count = z.int().min(0);

export const statsResponseSchema = z.object({
  range: statsRangeSchema,
  timeZone: z.string(),
  /** Local dates (YYYY-MM-DD) of the first and last day of the range. */
  from: z.iso.date(),
  to: z.iso.date(),
  /** Net of refunds made in the range (refunds are subtracted on the day they happened). */
  revenue: z.object({
    ticketsCents: cents,
    foodCents: cents,
    totalCents: cents,
    refundsCents: count,
  }),
  /** Tickets paid in the range minus tickets refunded in the range (a suite counts its seats). */
  ticketsSold: z.int(),
  /** Booked seats / seats of the active shows that start in the range. */
  occupancy: z.object({ soldSeats: count, capacity: count }),
  /** One entry per local day of the range, oldest first. */
  daily: z.array(
    z.object({ date: z.iso.date(), ticketsCents: cents, foodCents: cents, totalCents: cents }),
  ),
  topMovies: z.array(
    z.object({
      movieId: z.uuid(),
      titleSq: z.string(),
      titleEn: z.string().nullable(),
      ticketsSold: z.int(),
      revenueCents: cents,
    }),
  ),
  hallTypes: z.array(
    z.object({
      code: z.string(),
      nameSq: z.string(),
      nameEn: z.string().nullable(),
      ticketsSold: z.int(),
      revenueCents: cents,
    }),
  ),
  /** Active shows starting in the next 24 hours, soonest first (at most 20). */
  upcoming: z.array(
    z.object({
      showtimeId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
      movieTitleSq: z.string(),
      movieTitleEn: z.string().nullable(),
      hallName: z.string(),
      locationName: z.string(),
      soldSeats: count,
      capacity: count,
    }),
  ),
  /** Paid bookings with food delivered to the seat, for shows starting today. */
  seatDeliveryOrdersToday: count,
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Movies (SUPER_ADMIN; movies are global)
// ---------------------------------------------------------------------------------------------

export const movieStatusSchema = z.enum(['COMING_SOON', 'NOW_SHOWING', 'ARCHIVED']);
export type MovieStatus = z.infer<typeof movieStatusSchema>;

/** YouTube video ids are exactly 11 characters of A-Z a-z 0-9 _ - (also a database CHECK). */
export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const requiredText = (max: number) => z.string().trim().min(1).max(max);
/** Optional English texts: empty means "not translated" (null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value));

export const movieInputSchema = z
  .object({
    slug: slugSchema,
    titleSq: requiredText(200),
    titleEn: optionalText(200),
    synopsisSq: requiredText(4000),
    synopsisEn: optionalText(4000),
    durationMinutes: z.int().min(1).max(600),
    ageRating: ageRatingSchema,
    genres: z
      .array(genreSchema)
      .min(1)
      .max(5)
      .refine((genres) => new Set(genres).size === genres.length, { message: 'duplicate' }),
    releaseDate: z.iso.date(),
    director: requiredText(200),
    cast: z.array(requiredText(100)).max(30),
    status: movieStatusSchema,
    trailerYoutubeId: z.string().regex(YOUTUBE_ID_PATTERN).nullable(),
  })
  .strict();
export type MovieInput = z.input<typeof movieInputSchema>;

/** PATCH: any subset of the fields, at least one. */
export const movieUpdateSchema = movieInputSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const adminMovieSchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  titleSq: z.string(),
  titleEn: z.string().nullable(),
  synopsisSq: z.string(),
  synopsisEn: z.string().nullable(),
  durationMinutes: z.int(),
  ageRating: ageRatingSchema,
  genres: z.array(genreSchema),
  releaseDate: z.iso.date(),
  director: z.string(),
  cast: z.array(z.string()),
  status: movieStatusSchema,
  trailerYoutubeId: z.string().nullable(),
  posterPath: z.string().nullable(),
  backdropPath: z.string().nullable(),
  /** All showtimes (any state): a movie with showtimes can only be archived, not deleted. */
  showtimeCount: z.int().min(0),
  /** Active showtimes that have not started yet. */
  upcomingShowtimeCount: z.int().min(0),
});
export type AdminMovie = z.infer<typeof adminMovieSchema>;

export const adminMoviesQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: movieStatusSchema.optional(),
  })
  .strict();

export const adminMoviesResponseSchema = z.object({ movies: z.array(adminMovieSchema) });
export const adminMovieResponseSchema = z.object({ movie: adminMovieSchema });
export type AdminMovieResponse = z.infer<typeof adminMovieResponseSchema>;

export const movieImageKindSchema = z.enum(['poster', 'backdrop']);
export type MovieImageKind = z.infer<typeof movieImageKindSchema>;

/** Upload rules (checked on the server from the file's bytes, never its name or MIME type). */
export const MOVIE_IMAGE_RULES = {
  maxBytes: 5 * 1024 * 1024,
  maxSide: 8000,
  poster: { minWidth: 300, minHeight: 450 },
  backdrop: { minWidth: 1280, minHeight: 720 },
} as const;

// ---------------------------------------------------------------------------------------------
// Showtimes (managers for their cinemas)
// ---------------------------------------------------------------------------------------------

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const adminShowtimesQuerySchema = z
  .object({ location: z.uuid(), date: z.iso.date() })
  .strict();

export const adminShowtimeSchema = z.object({
  id: z.uuid(),
  movieId: z.uuid(),
  movieTitleSq: z.string(),
  movieTitleEn: z.string().nullable(),
  hallId: z.uuid(),
  hallName: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  format: movieFormatSchema,
  languageVersion: languageVersionSchema,
  isActive: z.boolean(),
  /** Started or over: read-only. */
  isPast: z.boolean(),
  /** Tickets of paid bookings. */
  soldTickets: z.int().min(0),
  /** HELD and CONFIRMED bookings: what a deactivation cancels. */
  activeBookings: z.int().min(0),
  /** Paid bookings and their total: what a deactivation refunds. */
  paidBookings: z.int().min(0),
  refundCents: z.int().min(0),
});
export type AdminShowtime = z.infer<typeof adminShowtimeSchema>;

export const adminShowtimesResponseSchema = z.object({
  timeZone: z.string(),
  date: z.iso.date(),
  cleaningBufferMinutes: z.int(),
  halls: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      hallTypeNameSq: z.string(),
      hallTypeNameEn: z.string().nullable(),
      wholeHallOnly: z.boolean(),
    }),
  ),
  /** Movies that can be scheduled (not archived). */
  movies: z.array(
    z.object({
      id: z.uuid(),
      titleSq: z.string(),
      titleEn: z.string().nullable(),
      durationMinutes: z.int(),
    }),
  ),
  showtimes: z.array(adminShowtimeSchema),
});
export type AdminShowtimesResponse = z.infer<typeof adminShowtimesResponseSchema>;

/** A show in the cinema's local time; the server computes the instants and the end. */
export const showtimeInputSchema = z
  .object({
    movieId: z.uuid(),
    hallId: z.uuid(),
    date: z.iso.date(),
    time: localTime,
    format: movieFormatSchema,
    languageVersion: languageVersionSchema,
  })
  .strict();
export type ShowtimeInput = z.infer<typeof showtimeInputSchema>;

/** PATCH: with sold tickets only format and language may change. */
export const showtimeUpdateSchema = showtimeInputSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

export const BULK_SHOWTIMES_MAX = 60;

/** One movie in one hall at several local dates and times (the panel sends the chosen slots). */
export const bulkShowtimesSchema = z
  .object({
    movieId: z.uuid(),
    hallId: z.uuid(),
    format: movieFormatSchema,
    languageVersion: languageVersionSchema,
    slots: z
      .array(z.object({ date: z.iso.date(), time: localTime }).strict())
      .min(1)
      .max(BULK_SHOWTIMES_MAX),
  })
  .strict();
export type BulkShowtimesInput = z.infer<typeof bulkShowtimesSchema>;

export const slotStatusSchema = z.enum(['ok', 'conflict', 'past', 'duplicate']);

export const bulkPreviewResponseSchema = z.object({
  slots: z.array(
    z.object({
      date: z.iso.date(),
      time: localTime,
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      status: slotStatusSchema,
      /** The shows it overlaps (status conflict). */
      conflicts: z.array(
        z.object({
          showtimeId: z.uuid(),
          movieTitleSq: z.string(),
          movieTitleEn: z.string().nullable(),
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
        }),
      ),
    }),
  ),
});
export type BulkPreviewResponse = z.infer<typeof bulkPreviewResponseSchema>;

export const adminShowtimeResponseSchema = z.object({ showtime: adminShowtimeSchema });
export const bulkCreateResponseSchema = z.object({ created: z.int().min(0) });

export const deactivateResponseSchema = z.object({
  showtime: adminShowtimeSchema,
  cancelledBookings: z.int().min(0),
  refundedBookings: z.int().min(0),
  refundedCents: z.int().min(0),
});
export type DeactivateResponse = z.infer<typeof deactivateResponseSchema>;
