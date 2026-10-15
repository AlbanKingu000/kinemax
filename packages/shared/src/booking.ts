import { z } from 'zod';
import { ageRatingSchema, seatTypeSchema } from './catalog.js';
import { bookingFoodSchema } from './food.js';

/** At most this many tickets per booking; a COUPLE sofa counts as two. */
export const MAX_TICKETS_PER_BOOKING = 10;

/** Ratings the buyer must confirm for every viewer before continuing. */
export const AGE_CONFIRMATION_RATINGS: readonly z.infer<typeof ageRatingSchema>[] = [
  'AGE_15',
  'AGE_18',
];

export const ticketCategoryCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);

// --- Requests ---

/** POST /api/bookings/hold: seats of a per-seat hall, or a whole suite. Never prices. */
export const holdRequestSchema = z
  .object({
    showtimeId: z.uuid(),
    seatIds: z.array(z.uuid()).min(1).max(MAX_TICKETS_PER_BOOKING).optional(),
    wholeHall: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => (v.seatIds === undefined) !== (v.wholeHall === undefined), {
    message: 'Send either seatIds or wholeHall.',
    path: ['seatIds'],
  })
  .refine((v) => !v.seatIds || new Set(v.seatIds).size === v.seatIds.length, {
    message: 'Seat ids must be unique.',
    path: ['seatIds'],
  });
export type HoldRequest = z.infer<typeof holdRequestSchema>;

/**
 * PUT /api/bookings/:id/tickets: one category per ticket (a sofa has occupants 1 and 2) and the
 * age confirmation. Never prices: the server calculates them. Suites send no tickets.
 */
export const ticketsRequestSchema = z
  .object({
    tickets: z
      .array(
        z
          .object({
            seatId: z.uuid(),
            occupant: z.int().min(1).max(2),
            category: ticketCategoryCodeSchema,
          })
          .strict(),
      )
      .max(MAX_TICKETS_PER_BOOKING),
    ageRatingConfirmed: z.boolean(),
  })
  .strict();
export type TicketsRequest = z.infer<typeof ticketsRequestSchema>;

// --- Responses ---

export const bookingStatusSchema = z.enum([
  'HELD',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
]);
export type BookingStatus = z.infer<typeof bookingStatusSchema>;

export const bookingTicketSchema = z.object({
  occupant: z.int().min(1).max(2),
  category: ticketCategoryCodeSchema,
  priceCents: z.int().min(0),
});
export type BookingTicket = z.infer<typeof bookingTicketSchema>;

export const bookingSeatSchema = z.object({
  seatId: z.uuid(),
  row: z.string(),
  number: z.int(),
  type: seatTypeSchema,
  tickets: z.array(bookingTicketSchema),
  /** The once-per-sofa surcharge (0 for other seats). */
  surchargeCents: z.int().min(0),
  totalCents: z.int().min(0),
});
export type BookingSeat = z.infer<typeof bookingSeatSchema>;

export const ticketCategorySchema = z.object({
  code: ticketCategoryCodeSchema,
  nameSq: z.string(),
  nameEn: z.string().nullable(),
  descriptionSq: z.string().nullable(),
  descriptionEn: z.string().nullable(),
});
export type TicketCategoryInfo = z.infer<typeof ticketCategorySchema>;

export const bookingSchema = z.object({
  id: z.uuid(),
  status: bookingStatusSchema,
  showtimeId: z.uuid(),
  holdExpiresAt: z.iso.datetime().nullable(),
  /** The server's clock when the answer was made: the countdown never trusts the device clock. */
  serverNow: z.iso.datetime(),
  isWholeHall: z.boolean(),
  ageRating: ageRatingSchema,
  ageConfirmationRequired: z.boolean(),
  ageRatingConfirmed: z.boolean(),
  seats: z.array(bookingSeatSchema),
  wholeHallPriceCents: z.int().min(0).nullable(),
  /** Optional food & drinks, with price snapshots. */
  food: z.array(bookingFoodSchema),
  /** Tickets (or the whole suite) and food; totalCents is their sum. */
  ticketsCents: z.int().min(0),
  foodCents: z.int().min(0),
  totalCents: z.int().min(0),
  currency: z.literal('EUR'),
  /** The categories a ticket can have, in display order. */
  categories: z.array(ticketCategorySchema),
});
export type Booking = z.infer<typeof bookingSchema>;

export const bookingResponseSchema = z.object({ booking: bookingSchema });
export type BookingResponse = z.infer<typeof bookingResponseSchema>;

/** GET /api/bookings/current: the signed-in user's active hold, or null. */
export const currentBookingResponseSchema = z.object({ booking: bookingSchema.nullable() });
export type CurrentBookingResponse = z.infer<typeof currentBookingResponseSchema>;
