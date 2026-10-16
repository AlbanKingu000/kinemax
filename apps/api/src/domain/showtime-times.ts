// When a show ends for the no-overlap rule (G2): the movie plus the cleaning buffer, so the next
// show in the hall starts after the hall was cleaned. Shared by the seed and the admin panel.

export const CLEANING_BUFFER_MINUTES = 20;

/** End of a show's slot: start + movie length + cleaning buffer. */
export function showtimeEnd(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + (durationMinutes + CLEANING_BUFFER_MINUTES) * 60_000);
}
