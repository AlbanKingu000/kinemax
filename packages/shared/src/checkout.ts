import { z } from 'zod';
import {
  bookingSchema,
  bookingSeatSchema,
  bookingStatusSchema,
  ticketCategorySchema,
} from './booking.js';
import { ageRatingSchema, slugSchema } from './catalog.js';
import { bookingFoodSchema } from './food.js';

// Demo checkout: a payment for the server-calculated total, simulated success or decline, and the
// confirmed ticket. DEMO ONLY: no card number, expiry or CVC exists anywhere in the system.

export const paymentStatusSchema = z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSchema = z.object({
  id: z.uuid(),
  status: paymentStatusSchema,
  /** Always the server's total of the booking. */
  amountCents: z.int().min(0),
  currency: z.literal('EUR'),
});
export type Payment = z.infer<typeof paymentSchema>;

/** POST /api/bookings/:id/checkout (no body) and POST /api/payments/:id/simulate answer this. */
export const checkoutResponseSchema = z.object({ payment: paymentSchema, booking: bookingSchema });
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/** POST /api/payments/:id/simulate: the demo provider's answer. Nothing else is accepted. */
export const simulatePaymentRequestSchema = z
  .object({ outcome: z.enum(['success', 'decline']) })
  .strict();
export type SimulatePaymentRequest = z.infer<typeof simulatePaymentRequestSchema>;

/** The content of a ticket's QR code: only the public booking code, no personal data. */
export const ticketQrValue = (code: string) => `KINEMAX:${code}`;

/** A booking as a ticket: everything the confirmation page and "Biletat e mia" show. */
export const ticketSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  status: bookingStatusSchema,
  movie: z.object({
    slug: slugSchema,
    titleSq: z.string(),
    titleEn: z.string().nullable(),
    posterPath: z.string().nullable(),
    ageRating: ageRatingSchema,
    durationMinutes: z.int().positive(),
  }),
  location: z.object({
    slug: slugSchema,
    name: z.string(),
    address: z.string(),
    timeZone: z.string(),
  }),
  hall: z.object({
    name: z.string(),
    hallTypeCode: z.string(),
    hallTypeNameSq: z.string(),
    hallTypeNameEn: z.string().nullable(),
  }),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** The start in the cinema's time zone (YYYY-MM-DD, HH:mm). */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localTime: z.string().regex(/^\d{2}:\d{2}$/),
  isWholeHall: z.boolean(),
  seats: z.array(bookingSeatSchema),
  food: z.array(bookingFoodSchema),
  ticketsCents: z.int().min(0),
  foodCents: z.int().min(0),
  totalCents: z.int().min(0),
  currency: z.literal('EUR'),
  confirmedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  /** Names of the ticket categories, for the seats' tickets. */
  categories: z.array(ticketCategorySchema),
  payment: z
    .object({ status: paymentStatusSchema, amountCents: z.int().min(0), reference: z.string() })
    .nullable(),
  /**
   * Confirmed and not over yet: whether it can still be cancelled (until `until`, the start minus
   * the cancellation cutoff, decided by the server) and the refund. Otherwise null.
   */
  cancellation: z
    .object({ allowed: z.boolean(), until: z.iso.datetime(), refundCents: z.int().min(0) })
    .nullable(),
});
export type Ticket = z.infer<typeof ticketSchema>;

export const ticketResponseSchema = z.object({ ticket: ticketSchema });
export type TicketResponse = z.infer<typeof ticketResponseSchema>;

/** GET /api/me/bookings: the signed-in user's paid bookings, soonest upcoming first. */
export const myBookingsResponseSchema = z.object({
  upcoming: z.array(ticketSchema),
  past: z.array(ticketSchema),
  /** Cancelled and refunded, newest first. */
  cancelled: z.array(ticketSchema),
});
export type MyBookingsResponse = z.infer<typeof myBookingsResponseSchema>;
