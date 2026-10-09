// Deterministic demo schedule. A given (hall, date) always gets the same showtimes, no matter on
// which day the seed runs, so re-running the seed is idempotent.

import type { HallTypeCode, MovieSeed } from './data.js';

export const CLEANING_BUFFER_MINUTES = 20;
const LAST_START_MINUTE = 23 * 60 + 15;

export interface ScheduleHall {
  key: string;
  type: HallTypeCode;
  /** Position of the hall within its location; staggers start times. */
  index: number;
}

export type ScheduleMovie = Pick<MovieSeed, 'slug' | 'durationMinutes' | 'ageRating' | 'genres'>;

export interface PlannedShowtime {
  hallKey: string;
  movieSlug: string;
  /** Local date YYYY-MM-DD and minutes since local midnight. */
  date: string;
  startMinute: number;
  /** Movie duration + cleaning buffer; endsAt = startsAt + this. */
  blockMinutes: number;
  format: 'FORMAT_2D' | 'FORMAT_3D';
  languageVersion: 'ORIGINAL_SQ_SUBTITLES' | 'DUBBED_SQ' | 'ORIGINAL_NO_SUBTITLES';
}

const roundUp = (minutes: number, step: number) => Math.ceil(minutes / step) * step;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Animation, family films and ALL-rated films: dubbed matinees, nothing after 20:00. */
function isForKids(movie: ScheduleMovie): boolean {
  return (
    movie.genres.includes('ANIMATION') ||
    movie.genres.includes('FAMILY') ||
    movie.ageRating === 'ALL'
  );
}

function fitsSlot(movie: ScheduleMovie, startMinute: number): boolean {
  if (movie.ageRating === 'AGE_18' || movie.genres.includes('HORROR'))
    return startMinute >= 19 * 60;
  if (isForKids(movie)) return startMinute <= 20 * 60;
  return true;
}

function formatFor(
  hall: ScheduleHall,
  movie: ScheduleMovie,
  slot: number,
): PlannedShowtime['format'] {
  const spectacle = movie.genres.some(
    (g) => g === 'SCI_FI' || g === 'ADVENTURE' || g === 'ANIMATION',
  );
  if (hall.type === 'PREMIUM_LARGE_FORMAT' && spectacle && slot % 2 === 0) return 'FORMAT_3D';
  if (hall.type === 'STANDARD' && movie.genres.includes('ANIMATION') && slot % 3 === 1)
    return 'FORMAT_3D';
  return 'FORMAT_2D';
}

function languageFor(
  hall: ScheduleHall,
  movie: ScheduleMovie,
  date: string,
  startMinute: number,
): PlannedShowtime['languageVersion'] {
  if (isForKids(movie)) {
    return startMinute < 18 * 60 ? 'DUBBED_SQ' : 'ORIGINAL_SQ_SUBTITLES';
  }
  if (startMinute >= 22 * 60 && (dayNumber(date) + hall.index) % 3 === 0)
    return 'ORIGINAL_NO_SUBTITLES';
  return 'ORIGINAL_SQ_SUBTITLES';
}

/** Plans showtimes for every hall and date. Shows in one hall never overlap (incl. cleaning). */
export function planShowtimes(options: {
  halls: readonly ScheduleHall[];
  movies: readonly ScheduleMovie[];
  dates: readonly string[];
}): PlannedShowtime[] {
  const { halls, movies, dates } = options;
  if (movies.length === 0) return [];
  const planned: PlannedShowtime[] = [];

  for (const date of dates) {
    for (const hall of halls) {
      const maxShows = hall.type === 'PRIVATE_SUITE' ? 3 : Number.POSITIVE_INFINITY;
      let start = roundUp((isWeekend(date) ? 10 * 60 + 30 : 13 * 60) + hall.index * 15, 5);
      let slot = 0;
      while (start <= LAST_START_MINUTE && slot < maxShows) {
        const offset = dayNumber(date) * 3 + hall.index * 5 + slot;
        let movie: ScheduleMovie | undefined;
        for (let i = 0; i < movies.length && !movie; i++) {
          const candidate = movies[(offset + i) % movies.length];
          if (candidate && fitsSlot(candidate, start)) movie = candidate;
        }
        if (!movie) {
          start += 30; // nothing suitable at this time (e.g. only adult films before 19:00)
          continue;
        }
        const blockMinutes = movie.durationMinutes + CLEANING_BUFFER_MINUTES;
        planned.push({
          hallKey: hall.key,
          movieSlug: movie.slug,
          date,
          startMinute: start,
          blockMinutes,
          format: formatFor(hall, movie, slot),
          languageVersion: languageFor(hall, movie, date, start),
        });
        start = roundUp(start + blockMinutes, 15);
        slot++;
      }
    }
  }
  return planned;
}
