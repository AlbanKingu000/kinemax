import { describe, expect, it } from 'vitest';
import {
  foodRequestSchema,
  MAX_FOOD_ITEMS_PER_BOOKING,
  MAX_FOOD_QUANTITY_PER_ITEM,
  menuQuerySchema,
} from './food.js';

const item = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const line = (n: number, extra: object = {}) => ({
  menuItemId: item(n),
  quantity: 1,
  fulfillment: 'PICKUP_AT_COUNTER',
  ...extra,
});
const ok = (items: object[]) => foodRequestSchema.safeParse({ items }).success;

describe('food request', () => {
  it('accepts an empty order and pickup or seat delivery lines', () => {
    expect(ok([])).toBe(true);
    expect(
      ok([line(1), line(2, { fulfillment: 'DELIVER_TO_SEAT', serveTiming: 'BEFORE_SHOW' })]),
    ).toBe(true);
    // The same item for pickup and for the seat: two lines.
    expect(
      ok([line(1), line(1, { fulfillment: 'DELIVER_TO_SEAT', serveTiming: 'DURING_SHOW' })]),
    ).toBe(true);
  });

  it('needs a serve time exactly for seat delivery', () => {
    expect(ok([line(1, { fulfillment: 'DELIVER_TO_SEAT' })])).toBe(false);
    expect(ok([line(1, { serveTiming: 'BEFORE_SHOW' })])).toBe(false);
    expect(ok([line(1, { fulfillment: 'DELIVER_TO_SEAT', serveTiming: 'AFTER_SHOW' })])).toBe(
      false,
    );
  });

  it('limits quantities per item and in total, and each item once per fulfillment', () => {
    expect(MAX_FOOD_QUANTITY_PER_ITEM).toBe(20);
    expect(MAX_FOOD_ITEMS_PER_BOOKING).toBe(40);
    expect(ok([line(1, { quantity: 0 })])).toBe(false);
    expect(ok([line(1, { quantity: 21 })])).toBe(false);
    expect(ok([line(1, { quantity: 20 }), line(2, { quantity: 20 })])).toBe(true);
    expect(ok([line(1, { quantity: 20 }), line(2, { quantity: 20 }), line(3)])).toBe(false);
    expect(ok([line(1), line(1)])).toBe(false);
  });

  it('never takes prices or unknown fields', () => {
    expect(ok([line(1, { unitPriceCents: 1 })])).toBe(false);
    expect(foodRequestSchema.safeParse({ items: [], totalCents: 0 }).success).toBe(false);
    expect(menuQuerySchema.safeParse({ showtime: item(1) }).success).toBe(true);
    expect(menuQuerySchema.safeParse({ showtime: 'x' }).success).toBe(false);
  });
});
