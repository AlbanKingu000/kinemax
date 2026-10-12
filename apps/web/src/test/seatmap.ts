// Sample /api/showtimes/:id/seatmap answers for web tests.
import type { SeatMapResponse, SeatMapSeat } from '@kinemax/shared';

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
