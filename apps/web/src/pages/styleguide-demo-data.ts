// Sample catalog data for the /styleguide demos (development only). Fictional, like the seed.
import type {
  FeaturedMovie,
  LocationSummary,
  MovieSummary,
  SeatMapResponse,
  SeatMapSeat,
  ShowtimeGroup,
  ShowtimeSlot,
} from '@kinemax/shared';
import { scheduleDays } from '../i18n/format';

const hallType = (code: string, nameSq: string, nameEn: string, hallCount: number) => ({
  code,
  nameSq,
  nameEn,
  hallCount,
});

export const DEMO_LOCATIONS: LocationSummary[] = [
  {
    slug: 'prishtine',
    name: 'Kinemax Prishtinë',
    city: 'Prishtinë',
    address: 'Bulevardi i Dritës 12, 10000 Prishtinë',
    timeZone: 'Europe/Belgrade',
    hallTypes: [
      hallType('STANDARD', 'Standard', 'Standard', 3),
      hallType('VIP_RECLINER', 'VIP Recliner', 'VIP Recliner', 1),
      hallType('PREMIUM_LARGE_FORMAT', 'Kinemax Grand', 'Kinemax Grand', 1),
    ],
  },
  {
    slug: 'prizren',
    name: 'Kinemax Prizren',
    city: 'Prizren',
    address: 'Rruga e Lumit 8, 20000 Prizren',
    timeZone: 'Europe/Belgrade',
    hallTypes: [
      hallType('STANDARD', 'Standard', 'Standard', 2),
      hallType('PRIVATE_SUITE', 'Suitë private', 'Private suite', 1),
    ],
  },
];

const movie = (
  slug: string,
  titleSq: string,
  titleEn: string,
  extra: Partial<MovieSummary>,
): MovieSummary => ({
  slug,
  titleSq,
  titleEn,
  synopsisSq: 'Një histori e trilluar për Kinemax.',
  synopsisEn: 'A fictional story for Kinemax.',
  ageRating: 'AGE_12',
  durationMinutes: 104,
  genres: ['DRAMA'],
  releaseDate: '2026-11-13',
  posterPath: `/seed/posters/${slug}.svg`,
  formats: [],
  languageVersions: [],
  ...extra,
});

export const DEMO_MOVIES: MovieSummary[] = [
  movie('levizja-e-fundit-e-gjyshit', 'Lëvizja e Fundit e Gjyshit', "Grandpa's Last Move", {
    ageRating: 'AGE_7',
    genres: ['COMEDY', 'FAMILY'],
    releaseDate: '2026-11-06',
  }),
  movie('agimi-mbi-uren-e-kuqe', 'Agimi mbi Urën e Kuqe', 'Dawn over the Red Bridge', {
    ageRating: 'AGE_15',
    genres: ['HISTORY', 'WAR'],
    releaseDate: '2026-11-20',
  }),
  movie('ritmi-i-rruges-2042', 'Ritmi i Rrugës 2042', 'Street Rhythm 2042', {
    genres: ['MUSIC', 'SCI_FI'],
    releaseDate: '2026-12-04',
  }),
];

export const DEMO_FEATURED: FeaturedMovie = {
  ...movie('kodi-orbital-9', 'Kodi Orbital 9', 'Orbital Code 9', {
    durationMinutes: 131,
    genres: ['SCI_FI', 'THRILLER'],
    releaseDate: '2026-09-30',
    synopsisSq:
      'Një inxhiniere softueri zbulon se satelitët e vjetër po i dërgojnë mesazhe njëri-tjetrit pa asnjë njeri në kontroll.',
    synopsisEn:
      'A software engineer discovers that old satellites are messaging each other with no human in control.',
    formats: ['2D', '3D'],
    languageVersions: ['ORIGINAL_SQ_SUBTITLES'],
  }),
  backdropPath: null,
  // No trailer in the demo: the button only appears with a real id (and loads YouTube on click).
  trailerYoutubeId: null,
};

export const DEMO_DAYS = scheduleDays('Europe/Belgrade');

const slot = (
  n: number,
  startTime: string,
  availability: ShowtimeSlot['availability'],
): ShowtimeSlot => ({
  id: `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
  startsAt: '2026-10-12T18:00:00.000Z',
  endsAt: '2026-10-12T20:00:00.000Z',
  startTime,
  endTime: '22:00',
  hallName: 'Salla 2',
  availability,
});

// Links point to /booking/:id in the demo too; the ids do not exist.
export const DEMO_SHOWTIME_GROUPS: ShowtimeGroup[] = [
  {
    hallType: { code: 'STANDARD', nameSq: 'Standard', nameEn: 'Standard' },
    format: '2D',
    languageVersion: 'ORIGINAL_SQ_SUBTITLES',
    fromPrice: { kind: 'TICKET', amountCents: 360 },
    showtimes: [
      slot(1, '16:00', 'AVAILABLE'),
      slot(2, '18:30', 'FEW_LEFT'),
      slot(3, '21:00', 'SOLD_OUT'),
    ],
  },
  {
    hallType: { code: 'PRIVATE_SUITE', nameSq: 'Suitë private', nameEn: 'Private suite' },
    format: '3D',
    languageVersion: 'DUBBED_SQ',
    fromPrice: { kind: 'WHOLE_HALL', amountCents: 11_000 },
    showtimes: [slot(4, '14:15', 'AVAILABLE'), slot(5, '17:45', 'SOLD_OUT')],
  },
];

const demoSeat = (
  row: string,
  number: number,
  x: number,
  extra: Partial<SeatMapSeat> = {},
): SeatMapSeat => ({
  id: `demo-${row}${String(number)}`,
  row,
  number,
  type: 'STANDARD',
  x,
  y: row.charCodeAt(0) - 61,
  z: 0,
  rotationDeg: 0,
  widthUnits: 1,
  status: 'AVAILABLE',
  ...extra,
});

/** A small hall with every seat type and state, for the 2D seat map demo. */
export const DEMO_SEATMAP: SeatMapResponse = {
  showtime: {
    id: 'demo-showtime',
    startsAt: '2026-10-13T18:30:00.000Z',
    date: '2026-10-13',
    startTime: '20:30',
    format: '2D',
    languageVersion: 'ORIGINAL_SQ_SUBTITLES',
  },
  movie: {
    slug: 'demo',
    titleSq: 'Demo',
    titleEn: null,
    ageRating: 'AGE_12',
    durationMinutes: 120,
    genres: [],
    posterPath: null,
    backdropPath: null,
  },
  location: {
    slug: 'prizren',
    name: 'Kinemax Prizren',
    city: 'Prizren',
    timeZone: 'Europe/Belgrade',
  },
  hall: {
    name: 'Salla Demo',
    hallType: { code: 'STANDARD', nameSq: 'Standard', nameEn: null },
    wholeHallOnly: false,
    screen: { widthM: 8, heightM: 3.5, x: 0, y: 0, z: 3 },
  },
  seats: [
    demoSeat('A', 1, -3, { type: 'WHEELCHAIR' }),
    demoSeat('A', 2, -2, { type: 'COMPANION' }),
    ...[3, 4, 5, 6].map((n) => demoSeat('A', n, n - 4)),
    ...[1, 2, 3, 4, 5, 6].map((n) =>
      demoSeat('B', n, n - 4, n === 3 || n === 4 ? { status: 'TAKEN' } : {}),
    ),
    ...[1, 2, 3, 4, 5, 6].map((n) => demoSeat('C', n, n - 4, { type: 'VIP' })),
    ...[1, 2, 3].map((n) => demoSeat('D', n, n * 2.5 - 5.5, { type: 'COUPLE', widthUnits: 2 })),
  ],
  prices: { STANDARD: 450, VIP: 650, COUPLE: 1100, WHEELCHAIR: 450, COMPANION: 450 },
  wholeHall: null,
};
