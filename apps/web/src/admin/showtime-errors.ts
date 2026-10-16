import { ApiRequestError } from '../api/http';
import type { AdminMessages } from '../i18n/admin-messages';

/** A clear sentence for a failed showtime write (overlap, past, sold tickets, …). */
export function showtimeErrorMessage(error: unknown, s: AdminMessages['showtimes']): string {
  if (!(error instanceof ApiRequestError)) return s.errors.generic;
  const code = error.fields[0]?.code;
  if (error.status === 409) {
    if (code === 'tickets_sold') return s.errors.ticketsSold;
    if (code === 'past') return s.errors.started;
    // The database refused an overlap (exclusion constraint) or a bulk slot is taken.
    return s.errors.overlap;
  }
  if (error.status === 422) return code === 'past' ? s.errors.past : s.errors.unavailable;
  return s.errors.generic;
}
