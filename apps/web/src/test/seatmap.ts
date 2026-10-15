// Sample /api/showtimes/:id/seatmap answers for web tests.
import type { Booking, SeatMapResponse, SeatMapSeat, Ticket } from '@kinemax/shared';

export const SHOWTIME_ID = '0190f0a0-0000-7000-8000-0000000000b1';
export const SUITE_SHOWTIME_ID = '0190f0a0-0000-7000-8000-0000000000b2';

let n = 0;
export const seat = (
  row: string,
  number: number,
  extra: Partial<SeatMapSeat> = {},
): SeatMapSeat => ({
  id: `0190f0a0-0000-7000-8000-${String(++n).padStart(12, '0')}`,
  row,
  number,
  type: 'STANDARD',
  x: number - 4,
  y: row.charCodeAt(0) - 60,
  z: 0,
  rotationDeg: 0,
  widthUnits: 1,
  status: 'AVAILABLE',
  ...extra,
});

/** Row A: 6 standard seats; row B: a sofa, a wheelchair space, a companion seat, 2 taken seats. */
export function standardMap(extra: Partial<SeatMapResponse> = {}): SeatMapResponse {
  const seats = [
    ...[1, 2, 3, 4, 5, 6].map((i) => seat('A', i)),
    seat('B', 1, { type: 'COUPLE', widthUnits: 2 }),
    seat('B', 3, { type: 'WHEELCHAIR' }),
    seat('B', 4, { type: 'COMPANION' }),
    seat('B', 5, { status: 'TAKEN' }),
    seat('B', 6, { status: 'TAKEN' }),
  ];
  return {
    showtime: {
      id: SHOWTIME_ID,
      startsAt: '2026-10-13T18:30:00.000Z',
      date: '2026-10-13',
      startTime: '20:30',
      format: '2D',
      languageVersion: 'ORIGINAL_SQ_SUBTITLES',
    },
    movie: {
      slug: 'kodi',
      titleSq: 'Kodi Orbital 9',
      titleEn: null,
      ageRating: 'AGE_12',
      durationMinutes: 131,
      genres: ['SCI_FI'],
      posterPath: '/seed/posters/kodi.svg',
      backdropPath: null,
    },
    location: {
      slug: 'prizren',
      name: 'Kinemax Prizren',
      city: 'Prizren',
      timeZone: 'Europe/Belgrade',
    },
    hall: {
      name: 'Salla 1',
      hallType: { code: 'STANDARD', nameSq: 'Standard', nameEn: null },
      wholeHallOnly: false,
      screen: { widthM: 10, heightM: 4, x: 0, y: 0, z: 3 },
    },
    seats,
    prices: { STANDARD: 450, COUPLE: 1100, WHEELCHAIR: 450, COMPANION: 450 },
    wholeHall: null,
    ...extra,
  };
}

export function suiteMap(taken = false): SeatMapResponse {
  const base = standardMap();
  return {
    ...base,
    showtime: { ...base.showtime, id: SUITE_SHOWTIME_ID },
    hall: {
      ...base.hall,
      name: 'Suita 4',
      hallType: { code: 'PRIVATE_SUITE', nameSq: 'Suitë private', nameEn: 'Private suite' },
      wholeHallOnly: true,
    },
    seats: [1, 2, 3].map((i) =>
      seat('A', i, { type: 'VIP', status: taken ? 'TAKEN' : 'AVAILABLE' }),
    ),
    prices: {},
    wholeHall: { priceCents: 11_000, taken },
  };
}

/** A HELD booking of `seatIds` in `map` (ADULT tickets at 4,50 €, sofa surcharge 2,00 €). */
export function heldBooking(
  map: SeatMapResponse,
  seatIds: string[],
  extra: Partial<Booking> = {},
): Booking {
  const now = Date.now();
  const seats = seatIds.map((id) => {
    const seat = map.seats.find((s) => s.id === id);
    if (!seat) throw new Error(`no seat ${id}`);
    const count = seat.type === 'COUPLE' ? 2 : 1;
    const surchargeCents = seat.type === 'COUPLE' ? 200 : 0;
    return {
      seatId: seat.id,
      row: seat.row,
      number: seat.number,
      type: seat.type,
      tickets: Array.from({ length: count }, (_, i) => ({
        occupant: i + 1,
        category: 'ADULT',
        priceCents: 450,
      })),
      surchargeCents,
      totalCents: count * 450 + surchargeCents,
    };
  });
  return {
    id: BOOKING_ID,
    status: 'HELD',
    showtimeId: map.showtime.id,
    holdExpiresAt: new Date(now + 10 * 60_000).toISOString(),
    serverNow: new Date(now).toISOString(),
    isWholeHall: false,
    ageRating: map.movie.ageRating,
    ageConfirmationRequired: false,
    ageRatingConfirmed: false,
    seats,
    wholeHallPriceCents: null,
    food: [],
    ticketsCents: seats.reduce((sum, s) => sum + s.totalCents, 0),
    foodCents: 0,
    totalCents: seats.reduce((sum, s) => sum + s.totalCents, 0),
    currency: 'EUR',
    categories: [
      {
        code: 'ADULT',
        nameSq: 'I rritur',
        nameEn: 'Adult',
        descriptionSq: null,
        descriptionEn: null,
      },
      {
        code: 'STUDENT',
        nameSq: 'Student',
        nameEn: 'Student',
        descriptionSq: 'Me kartë studenti të vlefshme.',
        descriptionEn: 'With a valid student card.',
      },
    ],
    ...extra,
  };
}

export const BOOKING_ID = '0190f0a0-0000-7000-8000-0000000000c1';

export const TICKET_CODE = 'ABCD1234EFGH5678';

/** A paid booking as a ticket (VIP hall, a combo brought during the film). */
export function paidTicket(booking: Booking, extra: Partial<Ticket> = {}): Ticket {
  return {
    id: booking.id,
    code: TICKET_CODE,
    status: 'CONFIRMED',
    movie: {
      slug: 'kodi',
      titleSq: 'Kodi Orbital 9',
      titleEn: null,
      posterPath: '/seed/posters/kodi.svg',
      ageRating: 'AGE_12',
      durationMinutes: 131,
    },
    location: {
      slug: 'prizren',
      name: 'Kinemax Prizren',
      address: 'Rruga e Shadërvanit 3',
      timeZone: 'Europe/Belgrade',
    },
    hall: {
      name: 'Salla 1',
      hallTypeCode: 'VIP_RECLINER',
      hallTypeNameSq: 'VIP',
      hallTypeNameEn: null,
    },
    startsAt: '2026-10-20T18:30:00.000Z',
    endsAt: '2026-10-20T21:00:00.000Z',
    localDate: '2026-10-20',
    localTime: '20:30',
    isWholeHall: false,
    seats: booking.seats,
    food: [
      {
        menuItemId: '0190f0a0-0000-7000-8000-000000000301',
        nameSq: 'Kombo klasike',
        nameEn: null,
        quantity: 1,
        unitPriceCents: 500,
        totalCents: 500,
        fulfillment: 'DELIVER_TO_SEAT',
        serveTiming: 'DURING_SHOW',
      },
    ],
    ticketsCents: booking.ticketsCents,
    foodCents: 500,
    totalCents: booking.ticketsCents + 500,
    currency: 'EUR',
    confirmedAt: '2026-10-15T10:00:00.000Z',
    cancelledAt: null,
    categories: booking.categories,
    payment: { status: 'SUCCEEDED', amountCents: booking.ticketsCents + 500, reference: 'DEMO-X' },
    cancellation: {
      allowed: true,
      until: '2026-10-20T16:30:00.000Z',
      refundCents: booking.ticketsCents + 500,
    },
    ...extra,
  };
}
