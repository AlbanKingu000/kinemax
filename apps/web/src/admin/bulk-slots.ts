// Turning the bulk form's inputs into slots (pure, unit-tested).
import { addDays } from '../i18n/format';

const MAX_DAYS = 14;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "14:00, 17:30" → ["14:00", "17:30"], or null when one is not a time. */
export function parseTimes(text: string): string[] | null {
  const times = text
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (/^\d:\d{2}$/.test(part) ? `0${part}` : part));
  if (times.length === 0 || times.some((time) => !TIME.test(time))) return null;
  return [...new Set(times)].sort();
}

/** Every date from `from` to `to` (inclusive), or null for a reversed or too long range. */
export function dateRange(from: string, to: string): string[] | null {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    dates.push(date);
    if (dates.length > MAX_DAYS) return null;
  }
  return dates.length > 0 ? dates : null;
}
