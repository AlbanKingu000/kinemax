import { z } from 'zod';
import { slugSchema } from './catalog.js';

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
