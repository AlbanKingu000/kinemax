import { describe, expect, it } from 'vitest';
import {
  addDays,
  timeZoneOffsetMinutes,
  toLocalDateTime,
  zonedTimeToUtc,
} from '../../src/domain/time-zone.js';

const TZ = 'Europe/Belgrade';

describe('toLocalDateTime', () => {
  it('returns the local date, ISO weekday and minute of day', () => {
    expect(toLocalDateTime(new Date('2026-10-12T13:59:00Z'), TZ)).toEqual({
      date: '2026-10-12',
      isoDayOfWeek: 1,
      minuteOfDay: 15 * 60 + 59,
    });
    expect(toLocalDateTime(new Date('2026-10-18T22:00:00Z'), TZ)).toMatchObject({
      date: '2026-10-19',
      isoDayOfWeek: 1,
      minuteOfDay: 0,
    });
  });

  it('rejects invalid dates and unknown time zones', () => {
    expect(() => toLocalDateTime(new Date('nope'), TZ)).toThrow(RangeError);
    expect(() => toLocalDateTime(new Date(), 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('timeZoneOffsetMinutes', () => {
  it('knows summer and winter time', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), TZ)).toBe(120);
    expect(timeZoneOffsetMinutes(new Date('2026-12-01T12:00:00Z'), TZ)).toBe(60);
  });
});

describe('zonedTimeToUtc', () => {
  it('converts local times on normal days', () => {
    expect(zonedTimeToUtc('2026-10-12', 20 * 60, TZ).toISOString()).toBe(
      '2026-10-12T18:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-12-01', 20 * 60, TZ).toISOString()).toBe(
      '2026-12-01T19:00:00.000Z',
    );
  });

  it('round-trips with toLocalDateTime around the autumn DST change', () => {
    for (const minute of [0, 60, 4 * 60, 10 * 60 + 30, 23 * 60 + 15]) {
      for (const date of ['2026-10-24', '2026-10-25', '2026-10-26']) {
        const local = toLocalDateTime(zonedTimeToUtc(date, minute, TZ), TZ);
        expect(local).toMatchObject({ date, minuteOfDay: minute });
      }
    }
  });

  it('resolves ambiguous (fall-back) times to the first occurrence', () => {
    expect(zonedTimeToUtc('2026-10-25', 2 * 60 + 30, TZ).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });

  it('moves non-existent (spring-forward) times forward', () => {
    // 2026-03-29 02:30 does not exist in Kosovo; it becomes 03:30 CEST = 01:30Z.
    expect(zonedTimeToUtc('2026-03-29', 2 * 60 + 30, TZ).toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });

  it('rejects malformed input', () => {
    expect(() => zonedTimeToUtc('2026/10/12', 0, TZ)).toThrow(RangeError);
    expect(() => zonedTimeToUtc('2026-10-12', 1440, TZ)).toThrow(RangeError);
    expect(() => zonedTimeToUtc('2026-10-12', 1.5, TZ)).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
