// Time-zone helpers built on Intl (no dependency). All instants are UTC Date objects; local times
// are expressed as an ISO date string plus minutes since local midnight.

export interface LocalDateTime {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** ISO day of week: 1 = Monday ... 7 = Sunday. */
  isoDayOfWeek: number;
  /** Minutes since local midnight, 0..1439. */
  minuteOfDay: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // Throws RangeError for an unknown time zone.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function partsOf(instant: Date, timeZone: string): Record<string, string> {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid date');
  const parts: Record<string, string> = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) parts[part.type] = part.value;
  return parts;
}

/** Local date, weekday and minute of day of an instant in a time zone. */
export function toLocalDateTime(instant: Date, timeZone: string): LocalDateTime {
  const p = partsOf(instant, timeZone);
  return {
    date: `${p.year ?? ''}-${p.month ?? ''}-${p.day ?? ''}`,
    isoDayOfWeek: WEEKDAYS[p.weekday ?? ''] ?? 0,
    minuteOfDay: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Offset of the time zone from UTC at an instant, in minutes (e.g. +120 for CEST). */
export function timeZoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = partsOf(instant, timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Converts a local date + minute of day in a time zone to the UTC instant.
 * Local times that do not exist (spring-forward gap) resolve to the instant one offset-step later;
 * ambiguous times (fall-back) resolve to the first (summer-time) occurrence.
 */
export function zonedTimeToUtc(date: string, minuteOfDay: number, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || minuteOfDay < 0 || minuteOfDay >= 1440 || !Number.isInteger(minuteOfDay)) {
    throw new RangeError(`Invalid local date/time: ${date} +${String(minuteOfDay)}min`);
  }
  const naive = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, minuteOfDay);
  // Take the offset from just before the wanted time (handles the gap and the overlap), then
  // re-check with the offset at the candidate instant.
  const firstGuess =
    naive - timeZoneOffsetMinutes(new Date(naive - 3 * 3600_000), timeZone) * 60_000;
  const offset = timeZoneOffsetMinutes(new Date(firstGuess), timeZone);
  const candidate = naive - offset * 60_000;
  const local = toLocalDateTime(new Date(candidate), timeZone);
  if (local.date === date && local.minuteOfDay === minuteOfDay) return new Date(candidate);
  return new Date(firstGuess);
}

/** Adds whole days to a YYYY-MM-DD calendar date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}
