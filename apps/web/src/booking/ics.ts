// "Shto në kalendar": an iCalendar (RFC 5545) event for a ticket, built in the browser.

/** 2026-10-15T18:30:00.000Z → 20261015T183000Z */
const utc = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Text values escape backslash, semicolon, comma and line breaks. */
const escapeText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 octets continue on the next line after a space (UTF-8 safe). */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      octets = 0;
    }
    current += char;
    octets += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export interface CalendarEvent {
  uid: string;
  startsAt: string;
  endsAt: string;
  title: string;
  location: string;
  description: string;
  /** When the file was made (DTSTAMP). */
  createdAt: string;
}

export function calendarEvent(event: CalendarEvent): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kinemax//Bileta//SQ',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${utc(event.createdAt)}`,
    `DTSTART:${utc(event.startsAt)}`,
    `DTEND:${utc(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(event.location)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(fold)
    .join('\r\n')
    .concat('\r\n');
}

/** Lets the browser save the event as a file. */
export function downloadCalendarEvent(event: CalendarEvent, fileName: string): void {
  const url = URL.createObjectURL(new Blob([calendarEvent(event)], { type: 'text/calendar' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
