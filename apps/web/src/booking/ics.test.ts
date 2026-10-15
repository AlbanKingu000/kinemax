import { describe, expect, it, vi } from 'vitest';
import { calendarEvent, downloadCalendarEvent, type CalendarEvent } from './ics';

const event: CalendarEvent = {
  uid: 'ABCD1234EFGH5678@kinemax',
  startsAt: '2026-10-15T18:30:00.000Z',
  endsAt: '2026-10-15T21:00:00.000Z',
  title: 'Kodi Orbital 9, Salla 1; me titra',
  location: 'Kinemax Prizren, Rruga e Shadërvanit 3',
  description: 'Kodi i rezervimit: ABCD1234EFGH5678\nTrego kodin QR në hyrje.',
  createdAt: '2026-10-14T09:00:00.000Z',
};

describe('calendarEvent', () => {
  it('writes one event in UTC with escaped text and CRLF lines', () => {
    const ics = calendarEvent(event);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('\r\nDTSTART:20261015T183000Z\r\n');
    expect(ics).toContain('\r\nDTEND:20261015T210000Z\r\n');
    expect(ics).toContain('\r\nDTSTAMP:20261014T090000Z\r\n');
    expect(ics).toContain('SUMMARY:Kodi Orbital 9\\, Salla 1\\; me titra');
    expect(ics).toContain('DESCRIPTION:Kodi i rezervimit: ABCD1234EFGH5678\\nTrego kodin QR');
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('folds long lines at 75 octets without splitting letters', () => {
    const long = calendarEvent({ ...event, description: 'ë'.repeat(100) });
    const lines = long.split('\r\n');
    const encoder = new TextEncoder();
    for (const line of lines) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    const unfolded = long.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:${'ë'.repeat(100)}`);
  });

  it('downloads as a .ics file', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockReturnValue(undefined);
    downloadCalendarEvent(event, 'kinemax.ics');
    expect(create).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:x');
    vi.restoreAllMocks();
  });
});
