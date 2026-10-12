// Formatting that must not depend on the browser's locale data (Albanian is often missing) or on
// the browser's time zone: calendar days are always days of the cinema's time zone.
import { SCHEDULE_DAYS } from '@kinemax/shared';
import { formatReleaseDate, type Locale, type Messages } from './messages';

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD; only the time zone data of Intl is used here.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

/** The browsable days, today first, in the cinema's time zone. */
export function scheduleDays(timeZone: string, now: Date = new Date()): string[] {
  const today = todayIn(timeZone, now);
  return Array.from({ length: SCHEDULE_DAYS }, (_, i) => addDays(today, i));
}

/** 0 = Monday ... 6 = Sunday. */
function weekdayIndex(isoDate: string): number {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Day tab label: "Sot" / "Nesër" / "Mër", plus "14 tet". */
export function dayTabLabel(
  t: Messages,
  isoDate: string,
  index: number,
): { day: string; date: string } {
  const [, month, day] = isoDate.split('-').map(Number);
  const name =
    index === 0
      ? t.dates.today
      : index === 1
        ? t.dates.tomorrow
        : (t.dates.weekdaysShort[weekdayIndex(isoDate)] ?? '');
  return { day: name, date: `${String(day)} ${t.dates.monthsShort[(month ?? 1) - 1] ?? ''}` };
}

/** "e diel, 29 mars 2026" / "Sunday, 29 March 2026". */
export function formatLongDate(locale: Locale, t: Messages, isoDate: string): string {
  return `${t.dates.weekdaysLong[weekdayIndex(isoDate)] ?? ''}, ${formatReleaseDate(locale, isoDate)}`;
}

/** Euro amounts from cents: "4,50 €" in Albanian, "€4.50" in English. */
export function formatPrice(locale: Locale, cents: number): string {
  const euros = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, '0');
  return locale === 'sq' ? `${String(euros)},${rest} €` : `€${String(euros)}.${rest}`;
}
