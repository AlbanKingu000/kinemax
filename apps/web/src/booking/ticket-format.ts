/** ABCD1234EFGH5678 → "ABCD 1234 EFGH 5678" (easier to read out at the counter). */
export const groupCode = (code: string) => code.replace(/(.{4})(?=.)/g, '$1 ');

/** An instant as the cinema's local date (YYYY-MM-DD) and time (HH:mm). */
export function localDateTime(instant: string, timeZone: string): { date: string; time: string } {
  const at = new Date(instant);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
  return { date, time };
}
