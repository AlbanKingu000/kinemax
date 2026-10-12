import { describe, expect, it } from 'vitest';
import { dayTabLabel, formatLongDate, formatPrice, scheduleDays, todayIn } from './format';
import { messages } from './messages';

describe('format', () => {
  it('uses the cinema time zone for "today", not the browser one', () => {
    // 23:30 UTC on 28 March is already 29 March (00:30) in Prishtina.
    const instant = new Date('2026-03-28T23:30:00Z');
    expect(todayIn('Europe/Belgrade', instant)).toBe('2026-03-29');
    expect(todayIn('America/New_York', instant)).toBe('2026-03-28');
    expect(scheduleDays('Europe/Belgrade', instant)).toEqual([
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
    ]);
  });

  it('labels the day tabs', () => {
    expect(dayTabLabel(messages.sq, '2026-10-12', 0)).toEqual({ day: 'Sot', date: '12 tet' });
    expect(dayTabLabel(messages.sq, '2026-10-13', 1)).toEqual({ day: 'Nesër', date: '13 tet' });
    expect(dayTabLabel(messages.sq, '2026-10-14', 2)).toEqual({ day: 'Mër', date: '14 tet' });
    expect(dayTabLabel(messages.en, '2026-10-18', 6)).toEqual({ day: 'Sun', date: '18 Oct' });
  });

  it('formats long dates and prices per language', () => {
    expect(formatLongDate('sq', messages.sq, '2026-03-29')).toBe('e diel, 29 mars 2026');
    expect(formatLongDate('en', messages.en, '2026-03-29')).toBe('Sunday, 29 March 2026');
    expect(formatPrice('sq', 450)).toBe('4,50 €');
    expect(formatPrice('en', 14_000)).toBe('€140.00');
    expect(formatPrice('sq', 5)).toBe('0,05 €');
  });
});
