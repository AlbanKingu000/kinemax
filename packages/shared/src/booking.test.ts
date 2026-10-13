import { describe, expect, it } from 'vitest';
import { apiErrorResponseSchema } from './api-error.js';
import {
  bookingResponseSchema,
  currentBookingResponseSchema,
  holdRequestSchema,
  MAX_TICKETS_PER_BOOKING,
  ticketsRequestSchema,
} from './booking.js';

const SHOW = '0190f0a0-0000-7000-8000-0000000000b1';
const seat = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe('holdRequestSchema', () => {
  it('takes seats or a whole suite, never both or neither', () => {
    expect(holdRequestSchema.safeParse({ showtimeId: SHOW, seatIds: [seat(1)] }).success).toBe(
      true,
    );
    expect(holdRequestSchema.safeParse({ showtimeId: SHOW, wholeHall: true }).success).toBe(true);
    expect(
      holdRequestSchema.safeParse({ showtimeId: SHOW, seatIds: [seat(1)], wholeHall: true })
        .success,
    ).toBe(false);
    expect(holdRequestSchema.safeParse({ showtimeId: SHOW }).success).toBe(false);
    expect(holdRequestSchema.safeParse({ showtimeId: SHOW, wholeHall: false }).success).toBe(false);
  });

  it('refuses duplicate seats, too many seats, prices and unknown fields', () => {
    const parse = (body: object) => holdRequestSchema.safeParse({ showtimeId: SHOW, ...body });
    expect(parse({ seatIds: [seat(1), seat(1)] }).success).toBe(false);
    expect(
      parse({ seatIds: Array.from({ length: MAX_TICKETS_PER_BOOKING + 1 }, (_, i) => seat(i)) })
        .success,
    ).toBe(false);
    expect(parse({ seatIds: [seat(1)], totalCents: 1 }).success).toBe(false);
    expect(parse({ seatIds: ['not-a-uuid'] }).success).toBe(false);
  });
});

describe('ticketsRequestSchema', () => {
  const ticket = { seatId: seat(1), occupant: 1, category: 'ADULT' };

  it('takes categories and the age confirmation, never prices', () => {
    expect(
      ticketsRequestSchema.safeParse({ tickets: [ticket], ageRatingConfirmed: false }).success,
    ).toBe(true);
    expect(ticketsRequestSchema.safeParse({ tickets: [], ageRatingConfirmed: true }).success).toBe(
      true,
    );
    expect(
      ticketsRequestSchema.safeParse({
        tickets: [{ ...ticket, priceCents: 1 }],
        ageRatingConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      ticketsRequestSchema.safeParse({
        tickets: [{ ...ticket, occupant: 3 }],
        ageRatingConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      ticketsRequestSchema.safeParse({
        tickets: [{ ...ticket, category: 'adult' }],
        ageRatingConfirmed: false,
      }).success,
    ).toBe(false);
    expect(ticketsRequestSchema.safeParse({ tickets: [ticket] }).success).toBe(false);
  });
});

describe('booking responses', () => {
  const booking = {
    id: seat(90),
    status: 'HELD',
    showtimeId: SHOW,
    holdExpiresAt: '2026-10-13T18:40:00.000Z',
    serverNow: '2026-10-13T18:30:00.000Z',
    isWholeHall: false,
    ageRating: 'AGE_18',
    ageConfirmationRequired: true,
    ageRatingConfirmed: false,
    seats: [
      {
        seatId: seat(1),
        row: 'B',
        number: 1,
        type: 'COUPLE',
        tickets: [
          { occupant: 1, category: 'ADULT', priceCents: 450 },
          { occupant: 2, category: 'STUDENT', priceCents: 360 },
        ],
        surchargeCents: 200,
        totalCents: 1010,
      },
    ],
    wholeHallPriceCents: null,
    totalCents: 1010,
    currency: 'EUR',
    categories: [
      { code: 'ADULT', nameSq: 'I rritur', nameEn: null, descriptionSq: null, descriptionEn: null },
    ],
  };

  it('parses a booking and an empty current hold', () => {
    expect(bookingResponseSchema.parse({ booking }).booking.seats[0]?.tickets).toHaveLength(2);
    expect(currentBookingResponseSchema.parse({ booking: null }).booking).toBeNull();
    expect(
      bookingResponseSchema.safeParse({ booking: { ...booking, currency: 'USD' } }).success,
    ).toBe(false);
  });

  it('lets a hold conflict name the taken seats', () => {
    const body = apiErrorResponseSchema.parse({
      error: { code: 'conflict', message: 'x', takenSeatIds: [seat(1)] },
    });
    expect(body.error.takenSeatIds).toEqual([seat(1)]);
  });
});
