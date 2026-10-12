// Sample /api/showtimes answers for web tests.
import type { ShowtimeGroup, ShowtimesResponse } from '@kinemax/shared';
import { scheduleDays } from '../i18n/format';

let next = 0;
/** A fresh showtime id (uuid shaped). */
export const showtimeId = () => `0190f0a0-0000-7000-8000-${String(++next).padStart(12, '0')}`;

export const group = (extra: Partial<ShowtimeGroup> = {}): ShowtimeGroup => ({
  hallType: { code: 'STANDARD', nameSq: 'Standard', nameEn: null },
  format: '2D',
  languageVersion: 'ORIGINAL_SQ_SUBTITLES',
  fromPrice: { kind: 'TICKET', amountCents: 450 },
  showtimes: [
    {
      id: showtimeId(),
      startsAt: '2026-10-12T18:30:00.000Z',
      endsAt: '2026-10-12T20:30:00.000Z',
      startTime: '20:30',
      endTime: '22:30',
      hallName: 'Salla 1',
      availability: 'AVAILABLE',
    },
  ],
  ...extra,
});

/** An answer for the requested date with one movie, or none when `empty`. */
export function showtimesAnswer(
  url: URL,
  options: { empty?: boolean; slug?: string; groups?: ShowtimeGroup[] } = {},
): ShowtimesResponse {
  const days = scheduleDays('Europe/Belgrade');
  const slug = options.slug ?? url.searchParams.get('movie') ?? 'film-a';
  return {
    location: {
      slug: 'prizren',
      name: 'Kinemax Prizren',
      city: 'Prizren',
      timeZone: 'Europe/Belgrade',
    },
    date: url.searchParams.get('date') ?? days[0] ?? '',
    days,
    movies: options.empty
      ? []
      : [
          {
            movie: {
              slug,
              titleSq: `Filmi ${slug}`,
              titleEn: null,
              ageRating: 'AGE_12',
              durationMinutes: 112,
              genres: ['DRAMA'],
              posterPath: `/seed/posters/${slug}.svg`,
            },
            groups: options.groups ?? [group()],
          },
        ],
  };
}
