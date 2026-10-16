// Fakes for admin panel tests: staff users, their cinemas and a default /api/admin answer.
import type { AdminLocation, AdminMovie, AuthUser, StatsResponse } from '@kinemax/shared';
import { stubAuth, testUser } from './auth';
import type { CatalogStub } from './catalog';

export const ADMIN_LOCATIONS: AdminLocation[] = [
  {
    id: '0190f0a0-0000-7000-8000-00000000a001',
    slug: 'prishtina',
    name: 'Kinemax Prishtina',
    city: 'Prishtinë',
    timeZone: 'Europe/Belgrade',
  },
  {
    id: '0190f0a0-0000-7000-8000-00000000a002',
    slug: 'prizren',
    name: 'Kinemax Prizren',
    city: 'Prizren',
    timeZone: 'Europe/Belgrade',
  },
];

export const superAdminUser = (): AuthUser =>
  testUser({ name: 'Admin Kinemax', role: 'SUPER_ADMIN' });

/** Manages the second cinema (Prizren) only. */
export const managerUser = (): AuthUser =>
  testUser({
    name: 'Menaxher Prizren',
    role: 'LOCATION_MANAGER',
    managedLocationIds: [ADMIN_LOCATIONS[1]?.id ?? ''],
  });

type AdminHandler = NonNullable<CatalogStub['admin']>;

/**
 * Stubs auth for `user` and the admin API: /api/admin/locations answers the cinemas the user may
 * see; everything else goes to `handler` (default 404).
 */
export function stubAdmin(user: AuthUser | null, handler: AdminHandler = () => undefined) {
  return stubAuth(user, {
    admin: (request) => {
      if (request.method === 'GET' && request.path === '/api/admin/locations') {
        return {
          locations:
            user?.role === 'SUPER_ADMIN'
              ? ADMIN_LOCATIONS
              : ADMIN_LOCATIONS.filter((l) => user?.managedLocationIds.includes(l.id)),
        };
      }
      return handler(request);
    },
  });
}

/** A dashboard answer for tests (one show tonight, a refund, two hall types). */
export function statsFixture(overrides: Partial<StatsResponse> = {}): StatsResponse {
  return {
    range: 'today',
    timeZone: 'Europe/Belgrade',
    from: '2026-10-16',
    to: '2026-10-16',
    revenue: { ticketsCents: 14_150, foodCents: 300, totalCents: 14_450, refundsCents: 450 },
    ticketsSold: 3,
    occupancy: { soldSeats: 4, capacity: 7 },
    daily: [{ date: '2026-10-16', ticketsCents: 14_150, foodCents: 300, totalCents: 14_450 }],
    topMovies: [
      {
        movieId: '0190f0a0-0000-7000-8000-00000000b001',
        titleSq: 'Fanari i heshtur',
        titleEn: 'The Silent Lighthouse',
        ticketsSold: 3,
        revenueCents: 14_150,
      },
    ],
    hallTypes: [
      { code: 'STANDARD', nameSq: 'Standard', nameEn: null, ticketsSold: 1, revenueCents: 150 },
      {
        code: 'PRIVATE_SUITE',
        nameSq: 'Suitë private',
        nameEn: 'Private suite',
        ticketsSold: 2,
        revenueCents: 14_000,
      },
    ],
    upcoming: [
      {
        showtimeId: '0190f0a0-0000-7000-8000-00000000c001',
        startsAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
        movieTitleSq: 'Fanari i heshtur',
        movieTitleEn: 'The Silent Lighthouse',
        hallName: 'Salla 1',
        locationName: 'Kinemax Prizren',
        soldSeats: 3,
        capacity: 12,
      },
    ],
    seatDeliveryOrdersToday: 1,
    ...overrides,
  };
}

/** An admin movie for tests (a released movie with shows). */
export function adminMovie(overrides: Partial<AdminMovie> = {}): AdminMovie {
  return {
    id: '0190f0a0-0000-7000-8000-00000000d001',
    slug: 'fanari-i-heshtur',
    titleSq: 'Fanari i Heshtur',
    titleEn: 'The Silent Lighthouse',
    synopsisSq: 'Një roje fari dhe një stuhi.',
    synopsisEn: null,
    durationMinutes: 112,
    ageRating: 'AGE_12',
    genres: ['DRAMA'],
    releaseDate: '2026-09-01',
    director: 'Regjisore Demo',
    cast: ['Aktore Një'],
    status: 'NOW_SHOWING',
    trailerYoutubeId: null,
    posterPath: null,
    backdropPath: null,
    showtimeCount: 12,
    upcomingShowtimeCount: 4,
    ...overrides,
  };
}

/** The value, or a failed test when it is missing (instead of a non-null assertion). */
export function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value');
  return value;
}
