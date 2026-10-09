import { describe, expect, it } from 'vitest';
import {
  adjustmentAmount,
  isRuleApplicable,
  priceSeat,
  priceSeatTickets,
  priceWholeHall,
  PricingError,
  roundHalfAwayFromZero,
  type PricingContext,
  type PricingRules,
  type SeatPriceInput,
  type TimeAdjustmentRule,
} from '../../src/domain/pricing.js';

const TZ = 'Europe/Belgrade';
const V0 = new Date('2026-01-01T00:00:00Z');
const PRICED_AT = new Date('2026-10-09T10:00:00Z');

const window = (
  id: string,
  days: number[],
  start: number,
  end: number,
  kind: 'PERCENT' | 'FIXED_CENTS',
  value: number,
  priority = 10,
  locationId: string | null = null,
): TimeAdjustmentRule => ({
  id,
  locationId,
  nameSq: id,
  daysOfWeek: days,
  startMinute: start,
  endMinute: end,
  kind,
  value,
  priority,
  validFrom: V0,
  validTo: null,
  isActive: true,
});

const rules: PricingRules = {
  hallTypePrices: [
    {
      id: 'base-std',
      hallTypeId: 'STD',
      locationId: null,
      priceCents: 450,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
    {
      id: 'base-std-prn',
      hallTypeId: 'STD',
      locationId: 'PRN',
      priceCents: 500,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
    {
      id: 'base-odd',
      hallTypeId: 'ODD',
      locationId: null,
      priceCents: 455,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
    {
      id: 'base-cheap',
      hallTypeId: 'CHEAP',
      locationId: null,
      priceCents: 100,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
  ],
  seatTypeSurcharges: [
    {
      id: 'sur-vip',
      seatType: 'VIP',
      amountCents: 150,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
    {
      id: 'sur-couple',
      seatType: 'COUPLE',
      amountCents: 200,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
  ],
  timeAdjustments: [
    window('matinee', [1, 2, 3, 4, 5], 0, 960, 'PERCENT', -20),
    window('weekend-evening', [5, 6, 7], 1080, 1440, 'FIXED_CENTS', 100),
    window('cheap-tuesday', [2], 0, 1440, 'PERCENT', -30, 20),
  ],
  categoryDiscounts: [
    {
      id: 'disc-student',
      ticketCategoryId: 'STUDENT',
      kind: 'PERCENT',
      value: 20,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
    {
      id: 'disc-child',
      ticketCategoryId: 'CHILD',
      kind: 'FIXED_CENTS',
      value: 150,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
    {
      id: 'disc-senior',
      ticketCategoryId: 'SENIOR',
      kind: 'PERCENT',
      value: 25,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
  ],
  wholeHallPrices: [
    {
      id: 'suite-price',
      hallId: 'SUITE',
      priceCents: 14_000,
      validFrom: V0,
      validTo: null,
      isActive: true,
    },
  ],
};

/** 2026-10-15 is a Thursday; CEST (UTC+2) until 2026-10-25. */
function input(overrides: Partial<SeatPriceInput> & { startsAt?: string } = {}): SeatPriceInput {
  const { startsAt = '2026-10-15T18:00:00Z', ...rest } = overrides; // Thu 20:00 local
  return {
    pricedAt: PRICED_AT,
    showtime: { startsAt: new Date(startsAt) },
    location: { id: 'FRZ', timeZone: TZ },
    hall: { id: 'H1', hallTypeId: 'STD', wholeHallOnly: false },
    seat: { seatType: 'STANDARD' },
    ticketCategory: { id: 'ADULT', code: 'ADULT' },
    rules,
    ...rest,
  };
}

/** The pricing context of a seat input (without its single ticket category). */
function contextOf(seatInput: SeatPriceInput): PricingContext {
  const { pricedAt, showtime, location, hall, rules: seatRules } = seatInput;
  return { pricedAt, showtime, location, hall, rules: seatRules };
}

const kinds = (breakdown: ReturnType<typeof priceSeat>) => breakdown.lines.map((l) => l.kind);
const sum = (breakdown: ReturnType<typeof priceSeat>) =>
  breakdown.lines.reduce((total, line) => total + line.amountCents, 0);

describe('priceSeat', () => {
  it('charges the global base price when nothing else applies', () => {
    const price = priceSeat(input());
    expect(price.totalCents).toBe(450);
    expect(price.lines).toEqual([{ kind: 'BASE', ruleId: 'base-std', amountCents: 450 }]);
    expect(price.local).toEqual({
      timeZone: TZ,
      date: '2026-10-15',
      isoDayOfWeek: 4,
      minuteOfDay: 1200,
    });
    expect(price.currency).toBe('EUR');
    expect(price.ticketCategoryCode).toBe('ADULT');
    expect(price.pricedAt).toBe(PRICED_AT.toISOString());
  });

  it('prefers a location-specific base price', () => {
    expect(priceSeat(input({ location: { id: 'PRN', timeZone: TZ } })).totalCents).toBe(500);
  });

  it('adds the seat-type surcharge to single-ticket seats', () => {
    expect(priceSeat(input({ seat: { seatType: 'VIP' } })).totalCents).toBe(600);
    expect(priceSeat(input({ seat: { seatType: 'WHEELCHAIR' } })).totalCents).toBe(450);
    expect(priceSeat(input({ seat: { seatType: 'COMPANION' } })).totalCents).toBe(450);
  });

  it('refuses COUPLE sofas, which sell two tickets', () => {
    expect(() => priceSeat(input({ seat: { seatType: 'COUPLE' } }))).toThrow(
      expect.objectContaining({ code: 'WRONG_TICKET_COUNT' }),
    );
  });

  describe('time windows (location time zone)', () => {
    it('applies the weekday matinee until 15:59 and stops at 16:00', () => {
      // Monday 2026-10-12, 15:59 and 16:00 local = 13:59Z and 14:00Z.
      const before = priceSeat(input({ startsAt: '2026-10-12T13:59:00Z' }));
      expect(before.totalCents).toBe(360);
      expect(before.lines[1]).toMatchObject({
        kind: 'TIME_ADJUSTMENT',
        ruleId: 'matinee',
        amountCents: -90,
      });
      expect(priceSeat(input({ startsAt: '2026-10-12T14:00:00Z' })).totalCents).toBe(450);
    });

    it('applies the weekend evening from 18:00 local, not before', () => {
      // Friday 2026-10-16: 17:59 local = 15:59Z, 18:00 local = 16:00Z.
      expect(priceSeat(input({ startsAt: '2026-10-16T15:59:00Z' })).totalCents).toBe(450);
      expect(priceSeat(input({ startsAt: '2026-10-16T16:00:00Z' })).totalCents).toBe(550);
    });

    it('uses local time, not UTC, around midnight', () => {
      // 2026-10-16T22:30Z is Friday 22:30 in UTC (weekend evening) but Saturday 00:30 in Kosovo,
      // which is outside every window.
      const price = priceSeat(input({ startsAt: '2026-10-16T22:30:00Z' }));
      expect(price.local).toMatchObject({ date: '2026-10-17', isoDayOfWeek: 6, minuteOfDay: 30 });
      expect(price.totalCents).toBe(450);
      // Saturday 23:59 local is still inside the window.
      expect(priceSeat(input({ startsAt: '2026-10-17T21:59:00Z' })).totalCents).toBe(550);
    });

    it('follows the daylight-saving change (CEST -> CET on 2026-10-25)', () => {
      // 16:30Z is 18:30 local on Saturday 24 (CEST) but 17:30 local on Sunday 25 (CET).
      expect(priceSeat(input({ startsAt: '2026-10-24T16:30:00Z' })).totalCents).toBe(550);
      const sunday = priceSeat(input({ startsAt: '2026-10-25T16:30:00Z' }));
      expect(sunday.local).toMatchObject({ isoDayOfWeek: 7, minuteOfDay: 17 * 60 + 30 });
      expect(sunday.totalCents).toBe(450);
    });

    it('picks the highest-priority window when several match', () => {
      // Tuesday 14:00 local matches the matinee (priority 10) and cheap Tuesday (priority 20).
      const price = priceSeat(input({ startsAt: '2026-10-13T12:00:00Z' }));
      expect(price.lines[1]).toMatchObject({ ruleId: 'cheap-tuesday', amountCents: -135 });
      expect(price.totalCents).toBe(315);
    });

    it('prefers a location-specific window at equal priority, then the newest version', () => {
      const local = window('prn-thursday', [4], 1140, 1260, 'PERCENT', -10, 10, 'PRN');
      const global = window('global-thursday', [4], 1140, 1260, 'PERCENT', -50, 10);
      const newer = {
        ...window('newer-thursday', [4], 1140, 1260, 'PERCENT', -40, 10),
        validFrom: new Date('2026-06-01T00:00:00Z'),
      };
      const withRules = (timeAdjustments: TimeAdjustmentRule[]) => ({ ...rules, timeAdjustments });
      const atPrn = input({
        location: { id: 'PRN', timeZone: TZ },
        rules: withRules([global, local]),
      });
      expect(priceSeat(atPrn).lines[1]?.ruleId).toBe('prn-thursday');
      expect(priceSeat(input({ rules: withRules([global, local]) })).lines[1]?.ruleId).toBe(
        'global-thursday',
      );
      expect(priceSeat(input({ rules: withRules([global, newer]) })).lines[1]?.ruleId).toBe(
        'newer-thursday',
      );
    });
  });

  describe('ticket categories', () => {
    it('applies percentage and fixed discounts after the time adjustment', () => {
      const student = priceSeat(
        input({ seat: { seatType: 'VIP' }, ticketCategory: { id: 'STUDENT', code: 'STUDENT' } }),
      );
      expect(student.totalCents).toBe(480);
      expect(kinds(student)).toEqual(['BASE', 'SEAT_SURCHARGE', 'CATEGORY_DISCOUNT']);
      expect(priceSeat(input({ ticketCategory: { id: 'CHILD', code: 'CHILD' } })).totalCents).toBe(
        300,
      );
      // Monday matinee 360, senior -25% = -90.
      const senior = priceSeat(
        input({
          startsAt: '2026-10-12T10:00:00Z',
          ticketCategory: { id: 'SENIOR', code: 'SENIOR' },
        }),
      );
      expect(senior.totalCents).toBe(270);
      expect(senior.lines.at(-1)).toMatchObject({
        kind: 'CATEGORY_DISCOUNT',
        amountCents: -90,
        detail: 'SENIOR PERCENT 25',
      });
    });

    it('has no discount line for categories without a rule', () => {
      expect(kinds(priceSeat(input()))).toEqual(['BASE']);
    });

    it('never goes below zero and the lines always add up to the total', () => {
      const cheap = input({
        hall: { id: 'H9', hallTypeId: 'CHEAP', wholeHallOnly: false },
        ticketCategory: { id: 'CHILD', code: 'CHILD' },
      });
      const price = priceSeat(cheap);
      expect(price.totalCents).toBe(0);
      expect(price.lines.at(-1)).toMatchObject({ amountCents: -100 });
      for (const breakdown of [
        price,
        priceSeat(input()),
        priceSeat(input({ startsAt: '2026-10-13T12:00:00Z' })),
      ]) {
        expect(sum(breakdown)).toBe(breakdown.totalCents);
      }
    });
  });

  describe('rounding', () => {
    it('rounds percentages half away from zero to whole cents', () => {
      // 455 * -30% = -136.5 -> -137.
      const price = priceSeat(
        input({
          startsAt: '2026-10-13T12:00:00Z',
          hall: { id: 'H2', hallTypeId: 'ODD', wholeHallOnly: false },
        }),
      );
      expect(price.lines[1]?.amountCents).toBe(-137);
      expect(price.totalCents).toBe(318);
    });

    it('roundHalfAwayFromZero and adjustmentAmount', () => {
      expect(roundHalfAwayFromZero(1365, 10)).toBe(137);
      expect(roundHalfAwayFromZero(-1365, 10)).toBe(-137);
      expect(roundHalfAwayFromZero(1364, 10)).toBe(136);
      expect(roundHalfAwayFromZero(-1364, 10)).toBe(-136);
      expect(roundHalfAwayFromZero(0, 100)).toBe(0);
      expect(adjustmentAmount(333, 'PERCENT', 20)).toBe(67);
      expect(adjustmentAmount(333, 'FIXED_CENTS', -50)).toBe(-50);
    });
  });

  describe('rule versions (validFrom / validTo / isActive)', () => {
    const versioned: PricingRules = {
      ...rules,
      hallTypePrices: [
        {
          id: 'v1',
          hallTypeId: 'STD',
          locationId: null,
          priceCents: 450,
          validFrom: V0,
          validTo: new Date('2026-11-01T00:00:00Z'),
          isActive: true,
        },
        {
          id: 'v2',
          hallTypeId: 'STD',
          locationId: null,
          priceCents: 480,
          validFrom: new Date('2026-11-01T00:00:00Z'),
          validTo: null,
          isActive: true,
        },
        {
          id: 'off',
          hallTypeId: 'STD',
          locationId: null,
          priceCents: 1,
          validFrom: V0,
          validTo: null,
          isActive: false,
        },
      ],
    };

    it('selects the version valid at pricedAt (validTo exclusive) and ignores inactive rules', () => {
      expect(
        priceSeat(input({ rules: versioned, pricedAt: new Date('2026-10-31T23:59:59Z') }))
          .totalCents,
      ).toBe(450);
      expect(
        priceSeat(input({ rules: versioned, pricedAt: new Date('2026-11-01T00:00:00Z') }))
          .totalCents,
      ).toBe(480);
    });

    it('isRuleApplicable', () => {
      const rule = {
        id: 'r',
        validFrom: V0,
        validTo: new Date('2026-02-01T00:00:00Z'),
        isActive: true,
      };
      expect(isRuleApplicable(rule, V0)).toBe(true);
      expect(isRuleApplicable(rule, new Date('2025-12-31T23:59:59Z'))).toBe(false);
      expect(isRuleApplicable(rule, new Date('2026-02-01T00:00:00Z'))).toBe(false);
      expect(isRuleApplicable({ ...rule, isActive: false }, V0)).toBe(false);
    });
  });

  describe('errors', () => {
    const codeOf = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof PricingError ? error.code : 'OTHER';
      }
      return 'NONE';
    };

    it('fails without a base price, for suites, unknown time zones and invalid dates', () => {
      expect(
        codeOf(() =>
          priceSeat(input({ hall: { id: 'X', hallTypeId: 'NONE', wholeHallOnly: false } })),
        ),
      ).toBe('NO_BASE_PRICE');
      expect(
        codeOf(() =>
          priceSeat(input({ hall: { id: 'SUITE', hallTypeId: 'STD', wholeHallOnly: true } })),
        ),
      ).toBe('WHOLE_HALL_ONLY');
      expect(
        codeOf(() => priceSeat(input({ location: { id: 'FRZ', timeZone: 'Mars/Olympus' } }))),
      ).toBe('INVALID_INPUT');
      expect(codeOf(() => priceSeat(input({ pricedAt: new Date('nope') })))).toBe('INVALID_INPUT');
    });
  });
});

describe('priceSeatTickets', () => {
  const ADULT = { id: 'ADULT', code: 'ADULT' };
  const STUDENT = { id: 'STUDENT', code: 'STUDENT' };
  const CHILD = { id: 'CHILD', code: 'CHILD' };
  const base = input();
  const sofa = (
    ticketCategories: { id: string; code: string }[],
    overrides: Partial<SeatPriceInput> & { startsAt?: string } = {},
  ) => {
    const context = contextOf(input(overrides));
    return priceSeatTickets({ ...context, seat: { seatType: 'COUPLE' }, ticketCategories });
  };

  it('prices a sofa as two tickets with their own categories plus the surcharge once', () => {
    // Thursday 20:00: ADULT 450 + STUDENT 450 - 20% = 360, sofa surcharge 200 once.
    const price = sofa([ADULT, STUDENT]);
    expect(price.tickets.map((t) => [t.ticketCategoryCode, t.totalCents])).toEqual([
      ['ADULT', 450],
      ['STUDENT', 360],
    ]);
    expect(price.seatSurcharge).toEqual({
      kind: 'SEAT_SURCHARGE',
      ruleId: 'sur-couple',
      amountCents: 200,
      detail: 'COUPLE per sofa',
    });
    expect(price.totalCents).toBe(1010);
    expect(price.seatType).toBe('COUPLE');
    expect(price.currency).toBe('EUR');
  });

  it('never puts the sofa surcharge into a ticket, so discounts do not touch it', () => {
    const price = sofa([STUDENT, STUDENT]);
    for (const ticket of price.tickets) {
      expect(ticket.lines.map((l) => l.kind)).toEqual(['BASE', 'CATEGORY_DISCOUNT']);
      expect(ticket.totalCents).toBe(360);
    }
    expect(price.totalCents).toBe(360 + 360 + 200);
  });

  it('applies the time adjustment to each ticket but not to the surcharge', () => {
    // Monday matinee -20%: tickets 360 each, CHILD -150 -> 210; surcharge stays 200.
    const price = sofa([ADULT, CHILD], { startsAt: '2026-10-12T10:00:00Z' });
    expect(price.tickets.map((t) => t.totalCents)).toEqual([360, 210]);
    expect(price.seatSurcharge?.amountCents).toBe(200);
    expect(price.totalCents).toBe(770);
  });

  it('charges no surcharge when no COUPLE rule applies', () => {
    const noSofaRule = {
      ...rules,
      seatTypeSurcharges: rules.seatTypeSurcharges.filter((r) => r.seatType !== 'COUPLE'),
    };
    const price = sofa([ADULT, ADULT], { rules: noSofaRule });
    expect(price.seatSurcharge).toBeNull();
    expect(price.totalCents).toBe(900);
  });

  it('prices ordinary seats as one ticket with the surcharge inside the ticket', () => {
    const context = contextOf(base);
    const vip = priceSeatTickets({
      ...context,
      seat: { seatType: 'VIP' },
      ticketCategories: [STUDENT],
    });
    expect(vip.tickets).toHaveLength(1);
    expect(vip.seatSurcharge).toBeNull();
    // (450 + 150) - 20% = 480: same as priceSeat.
    expect(vip.totalCents).toBe(480);
    expect(vip.tickets[0]).toEqual(
      priceSeat({ ...base, seat: { seatType: 'VIP' }, ticketCategory: STUDENT }),
    );
  });

  it('rejects the wrong number of tickets and whole-hall-only halls', () => {
    const context = contextOf(base);
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (error) {
        return error instanceof PricingError ? error.code : 'OTHER';
      }
      return 'NONE';
    };
    expect(code(() => sofa([ADULT]))).toBe('WRONG_TICKET_COUNT');
    expect(code(() => sofa([ADULT, ADULT, ADULT]))).toBe('WRONG_TICKET_COUNT');
    expect(
      code(() =>
        priceSeatTickets({
          ...context,
          seat: { seatType: 'STANDARD' },
          ticketCategories: [ADULT, ADULT],
        }),
      ),
    ).toBe('WRONG_TICKET_COUNT');
    expect(
      code(() =>
        priceSeatTickets({ ...context, seat: { seatType: 'STANDARD' }, ticketCategories: [] }),
      ),
    ).toBe('WRONG_TICKET_COUNT');
    expect(
      code(() =>
        priceSeatTickets({
          ...context,
          hall: { id: 'S', hallTypeId: 'STD', wholeHallOnly: true },
          seat: { seatType: 'COUPLE' },
          ticketCategories: [ADULT, ADULT],
        }),
      ),
    ).toBe('WHOLE_HALL_ONLY');
  });
});

describe('priceWholeHall', () => {
  const suite = { id: 'SUITE', hallTypeId: 'SUITE_TYPE', wholeHallOnly: true };

  it('charges the whole-hall price plus the time adjustment', () => {
    expect(priceWholeHall(input({ hall: suite })).totalCents).toBe(14_000);
    const weekend = priceWholeHall(input({ hall: suite, startsAt: '2026-10-17T18:00:00Z' }));
    expect(weekend.lines.map((l) => l.kind)).toEqual(['WHOLE_HALL', 'TIME_ADJUSTMENT']);
    expect(weekend.totalCents).toBe(14_100);
    expect(weekend.ticketCategoryCode).toBeUndefined();
  });

  it('fails for seat-sold halls and halls without a whole-hall price', () => {
    expect(() => priceWholeHall(input())).toThrow(PricingError);
    expect(() => priceWholeHall(input({ hall: { ...suite, id: 'OTHER' } }))).toThrow(
      /No whole-hall price/,
    );
  });
});
