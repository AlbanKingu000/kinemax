// Ticket pricing. Pure and deterministic: the server is the only place that calculates prices, and
// the resulting breakdown is stored as a snapshot on the booking.
//
// Order of calculation for one ticket (all amounts in integer cents):
//   1. base price for the hall type (location-specific rule beats the global one)
//   2. + seat-type surcharge (VIP, ...)                             -> subtotal
//   3. + time adjustment in the location's local time (one rule)  -> percent of the subtotal or fixed
//   4. - ticket-category discount (STUDENT, CHILD, ...)            -> percent of step 3 or fixed
// COUPLE sofas sell two tickets (one per person, each with its own category) priced with steps 1, 3
// and 4, plus the COUPLE surcharge ONCE per sofa as a flat amount: it is neither time-adjusted nor
// discounted. Use priceSeatTickets for any seat; priceSeat prices single-ticket seats.
// Whole-hall (suite) prices use the hall's whole-hall price and step 3 only.
//
// Rule versions are chosen by `pricedAt` (normally "now", the purchase time): a rule applies when it
// is active and validFrom <= pricedAt < validTo. Time windows are matched against the showtime's
// start in the location's time zone. Percentages round half away from zero to whole cents. A price
// never goes below 0; the lines always add up to the total.

import { ticketsPerSeat } from './seat-tickets.js';
import { toLocalDateTime } from './time-zone.js';

export type AdjustmentKind = 'PERCENT' | 'FIXED_CENTS';
export type SeatTypeCode = 'STANDARD' | 'VIP' | 'COUPLE' | 'WHEELCHAIR' | 'COMPANION';

interface VersionedRule {
  id: string;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
}

export interface HallTypePriceRule extends VersionedRule {
  hallTypeId: string;
  locationId: string | null;
  priceCents: number;
}

export interface SeatTypeSurchargeRule extends VersionedRule {
  seatType: SeatTypeCode;
  amountCents: number;
}

export interface TimeAdjustmentRule extends VersionedRule {
  locationId: string | null;
  nameSq: string;
  daysOfWeek: readonly number[];
  startMinute: number;
  endMinute: number;
  kind: AdjustmentKind;
  value: number;
  priority: number;
}

export interface CategoryDiscountRule extends VersionedRule {
  ticketCategoryId: string;
  kind: AdjustmentKind;
  value: number;
}

export interface WholeHallPriceRule extends VersionedRule {
  hallId: string;
  priceCents: number;
}

export interface PricingRules {
  hallTypePrices: readonly HallTypePriceRule[];
  seatTypeSurcharges: readonly SeatTypeSurchargeRule[];
  timeAdjustments: readonly TimeAdjustmentRule[];
  categoryDiscounts: readonly CategoryDiscountRule[];
  wholeHallPrices: readonly WholeHallPriceRule[];
}

export interface PricingContext {
  /** When the price is calculated (purchase time); selects the rule versions. */
  pricedAt: Date;
  showtime: { startsAt: Date };
  location: { id: string; timeZone: string };
  hall: { id: string; hallTypeId: string; wholeHallOnly: boolean };
  rules: PricingRules;
}

export interface TicketCategoryRef {
  id: string;
  code: string;
}

export interface SeatPriceInput extends PricingContext {
  seat: { seatType: SeatTypeCode };
  ticketCategory: TicketCategoryRef;
}

export interface SeatTicketsInput extends PricingContext {
  seat: { seatType: SeatTypeCode };
  /** One category per person: 2 for a COUPLE sofa (occupant 1, 2), 1 for any other seat. */
  ticketCategories: readonly TicketCategoryRef[];
}

export type PriceLineKind =
  'BASE' | 'WHOLE_HALL' | 'SEAT_SURCHARGE' | 'TIME_ADJUSTMENT' | 'CATEGORY_DISCOUNT';

export interface PriceLine {
  kind: PriceLineKind;
  ruleId: string;
  amountCents: number;
  /** Rule parameters for the snapshot, e.g. "PERCENT -20". */
  detail?: string;
}

export interface PriceBreakdown {
  currency: 'EUR';
  totalCents: number;
  lines: PriceLine[];
  /** Local time the time windows were matched against. */
  local: { timeZone: string; date: string; isoDayOfWeek: number; minuteOfDay: number };
  pricedAt: string;
  ticketCategoryCode?: string;
}

/** Price of one seat: its tickets (in occupant order) plus an optional once-per-seat surcharge. */
export interface SeatPrice {
  currency: 'EUR';
  seatType: SeatTypeCode;
  tickets: PriceBreakdown[];
  /** COUPLE sofa surcharge, charged once per sofa (null when there is none). */
  seatSurcharge: PriceLine | null;
  totalCents: number;
}

export type PricingErrorCode =
  | 'NO_BASE_PRICE'
  | 'NO_WHOLE_HALL_PRICE'
  | 'WHOLE_HALL_ONLY'
  | 'NOT_WHOLE_HALL'
  | 'WRONG_TICKET_COUNT'
  | 'INVALID_INPUT';

export class PricingError extends Error {
  override name = 'PricingError';
  constructor(
    readonly code: PricingErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** Rounds a rational n / d (d > 0) to the nearest integer, halves away from zero. */
export function roundHalfAwayFromZero(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  return sign * Math.floor((2 * abs + denominator) / (2 * denominator));
}

/** The amount (cents) of a percent or fixed adjustment applied to `amount`. */
export function adjustmentAmount(amount: number, kind: AdjustmentKind, value: number): number {
  return kind === 'PERCENT' ? roundHalfAwayFromZero(amount * value, 100) : value;
}

export function isRuleApplicable(rule: VersionedRule, at: Date): boolean {
  return (
    rule.isActive &&
    rule.validFrom.getTime() <= at.getTime() &&
    (rule.validTo === null || at.getTime() < rule.validTo.getTime())
  );
}

/** Newest version first (validFrom descending), then id for a stable order. */
function byNewest(a: VersionedRule, b: VersionedRule): number {
  return b.validFrom.getTime() - a.validFrom.getTime() || a.id.localeCompare(b.id);
}

function locationSpecificFirst(locationId: string) {
  return (a: { locationId: string | null }, b: { locationId: string | null }) =>
    Number(b.locationId === locationId) - Number(a.locationId === locationId);
}

function validateContext(context: PricingContext): ReturnType<typeof toLocalDateTime> {
  const { pricedAt, showtime, location } = context;
  if (Number.isNaN(pricedAt.getTime()) || Number.isNaN(showtime.startsAt.getTime())) {
    throw new PricingError('INVALID_INPUT', 'pricedAt and showtime.startsAt must be valid dates');
  }
  try {
    return toLocalDateTime(showtime.startsAt, location.timeZone);
  } catch {
    throw new PricingError('INVALID_INPUT', `Unknown time zone "${location.timeZone}"`);
  }
}

function selectTimeAdjustment(
  context: PricingContext,
  local: ReturnType<typeof toLocalDateTime>,
): TimeAdjustmentRule | undefined {
  const locationFirst = locationSpecificFirst(context.location.id);
  return context.rules.timeAdjustments
    .filter(
      (rule) =>
        isRuleApplicable(rule, context.pricedAt) &&
        (rule.locationId === null || rule.locationId === context.location.id) &&
        rule.daysOfWeek.includes(local.isoDayOfWeek) &&
        rule.startMinute <= local.minuteOfDay &&
        local.minuteOfDay < rule.endMinute,
    )
    .sort((a, b) => b.priority - a.priority || locationFirst(a, b) || byNewest(a, b))[0];
}

/** Appends a line whose amount is clamped so the running total never drops below zero. */
function addLine(lines: PriceLine[], running: number, line: PriceLine): number {
  const amountCents = Math.max(line.amountCents, -running);
  lines.push({ ...line, amountCents });
  return running + amountCents;
}

function finish(
  context: PricingContext,
  local: ReturnType<typeof toLocalDateTime>,
  lines: PriceLine[],
  totalCents: number,
  ticketCategoryCode?: string,
): PriceBreakdown {
  return {
    currency: 'EUR',
    totalCents,
    lines,
    local: { timeZone: context.location.timeZone, ...local },
    pricedAt: context.pricedAt.toISOString(),
    ...(ticketCategoryCode === undefined ? {} : { ticketCategoryCode }),
  };
}

function applyTimeAdjustment(
  context: PricingContext,
  local: ReturnType<typeof toLocalDateTime>,
  lines: PriceLine[],
  running: number,
): number {
  const rule = selectTimeAdjustment(context, local);
  if (!rule) return running;
  return addLine(lines, running, {
    kind: 'TIME_ADJUSTMENT',
    ruleId: rule.id,
    amountCents: adjustmentAmount(running, rule.kind, rule.value),
    detail: `${rule.kind} ${String(rule.value)}`,
  });
}

function selectSeatSurcharge(
  rules: PricingRules,
  seatType: SeatTypeCode,
  pricedAt: Date,
): SeatTypeSurchargeRule | undefined {
  return rules.seatTypeSurcharges
    .filter((rule) => rule.seatType === seatType && isRuleApplicable(rule, pricedAt))
    .sort(byNewest)[0];
}

function assertSeatSoldPerSeat(hall: PricingContext['hall']): void {
  if (hall.wholeHallOnly) {
    throw new PricingError(
      'WHOLE_HALL_ONLY',
      'This hall is only sold as a whole; use priceWholeHall',
    );
  }
}

/**
 * One ticket. `seatSurchargeType` is the seat type whose surcharge is part of the ticket price
 * (VIP, ...), or null for tickets on a COUPLE sofa, whose surcharge is charged once per sofa.
 */
function priceTicket(
  input: PricingContext,
  local: ReturnType<typeof toLocalDateTime>,
  ticketCategory: TicketCategoryRef,
  seatSurchargeType: SeatTypeCode | null,
): PriceBreakdown {
  const { pricedAt, hall, location, rules } = input;

  const base = rules.hallTypePrices
    .filter(
      (rule) =>
        rule.hallTypeId === hall.hallTypeId &&
        (rule.locationId === null || rule.locationId === location.id) &&
        isRuleApplicable(rule, pricedAt),
    )
    .sort((a, b) => locationSpecificFirst(location.id)(a, b) || byNewest(a, b))[0];
  if (!base) {
    throw new PricingError('NO_BASE_PRICE', `No base price for hall type ${hall.hallTypeId}`);
  }

  const lines: PriceLine[] = [];
  let running = addLine(lines, 0, { kind: 'BASE', ruleId: base.id, amountCents: base.priceCents });

  const surcharge =
    seatSurchargeType === null
      ? undefined
      : selectSeatSurcharge(rules, seatSurchargeType, pricedAt);
  if (surcharge) {
    running = addLine(lines, running, {
      kind: 'SEAT_SURCHARGE',
      ruleId: surcharge.id,
      amountCents: surcharge.amountCents,
      detail: surcharge.seatType,
    });
  }

  running = applyTimeAdjustment(input, local, lines, running);

  const discount = rules.categoryDiscounts
    .filter(
      (rule) => rule.ticketCategoryId === ticketCategory.id && isRuleApplicable(rule, pricedAt),
    )
    .sort(byNewest)[0];
  if (discount) {
    running = addLine(lines, running, {
      kind: 'CATEGORY_DISCOUNT',
      ruleId: discount.id,
      amountCents: -adjustmentAmount(running, discount.kind, discount.value),
      detail: `${ticketCategory.code} ${discount.kind} ${String(discount.value)}`,
    });
  }

  return finish(input, local, lines, running, ticketCategory.code);
}

/** Price of one ticket on a single-ticket seat (every seat type except COUPLE). */
export function priceSeat(input: SeatPriceInput): PriceBreakdown {
  const local = validateContext(input);
  assertSeatSoldPerSeat(input.hall);
  if (ticketsPerSeat(input.seat.seatType) !== 1) {
    throw new PricingError(
      'WRONG_TICKET_COUNT',
      `${input.seat.seatType} seats sell ${String(ticketsPerSeat(input.seat.seatType))} tickets; use priceSeatTickets`,
    );
  }
  return priceTicket(input, local, input.ticketCategory, input.seat.seatType);
}

/**
 * Price of all tickets on one seat: 1 ticket for ordinary seats, 2 for a COUPLE sofa (each priced
 * with its own category) plus the sofa surcharge once, not time-adjusted and not discounted.
 */
export function priceSeatTickets(input: SeatTicketsInput): SeatPrice {
  const local = validateContext(input);
  assertSeatSoldPerSeat(input.hall);
  const { seat, ticketCategories, rules, pricedAt } = input;
  const expected = ticketsPerSeat(seat.seatType);
  if (ticketCategories.length !== expected) {
    throw new PricingError(
      'WRONG_TICKET_COUNT',
      `A ${seat.seatType} seat needs exactly ${String(expected)} ticket(s), got ${String(ticketCategories.length)}`,
    );
  }

  const perSeatSurcharge = seat.seatType === 'COUPLE';
  const tickets = ticketCategories.map((category) =>
    priceTicket(input, local, category, perSeatSurcharge ? null : seat.seatType),
  );
  const rule = perSeatSurcharge ? selectSeatSurcharge(rules, seat.seatType, pricedAt) : undefined;
  const seatSurcharge: PriceLine | null = rule
    ? {
        kind: 'SEAT_SURCHARGE',
        ruleId: rule.id,
        amountCents: rule.amountCents,
        detail: 'COUPLE per sofa',
      }
    : null;

  return {
    currency: 'EUR',
    seatType: seat.seatType,
    tickets,
    seatSurcharge,
    totalCents:
      tickets.reduce((sum, ticket) => sum + ticket.totalCents, 0) +
      (seatSurcharge?.amountCents ?? 0),
  };
}

/** Price of a whole hall (private suite) for one showtime. */
export function priceWholeHall(input: PricingContext): PriceBreakdown {
  const local = validateContext(input);
  const { pricedAt, hall, rules } = input;
  if (!hall.wholeHallOnly) {
    throw new PricingError('NOT_WHOLE_HALL', 'This hall is sold per seat; use priceSeat');
  }
  const rule = rules.wholeHallPrices
    .filter((r) => r.hallId === hall.id && isRuleApplicable(r, pricedAt))
    .sort(byNewest)[0];
  if (!rule) {
    throw new PricingError('NO_WHOLE_HALL_PRICE', `No whole-hall price for hall ${hall.id}`);
  }
  const lines: PriceLine[] = [];
  let running = addLine(lines, 0, {
    kind: 'WHOLE_HALL',
    ruleId: rule.id,
    amountCents: rule.priceCents,
  });
  running = applyTimeAdjustment(input, local, lines, running);
  return finish(input, local, lines, running);
}
