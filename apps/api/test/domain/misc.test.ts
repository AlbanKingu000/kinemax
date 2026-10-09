import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';
import {
  BOOKING_CODE_LENGTH,
  BOOKING_CODE_PATTERN,
  generateBookingCode,
} from '../../src/domain/booking-code.js';
import {
  assertFulfillmentAllowed,
  FulfillmentError,
  isFulfillmentAllowed,
} from '../../src/domain/fulfillment.js';

describe('fulfillment', () => {
  const standard = { code: 'STANDARD', allowsSeatDelivery: false };
  const vip = { code: 'VIP_RECLINER', allowsSeatDelivery: true };
  const suite = { code: 'PRIVATE_SUITE', allowsSeatDelivery: true };

  it('always allows pickup at the counter', () => {
    for (const hallType of [standard, vip, suite]) {
      expect(isFulfillmentAllowed(hallType, 'PICKUP_AT_COUNTER')).toBe(true);
      expect(() => {
        assertFulfillmentAllowed(hallType, 'PICKUP_AT_COUNTER');
      }).not.toThrow();
    }
  });

  it('allows delivery to the seat only in VIP recliner and suite halls', () => {
    expect(isFulfillmentAllowed(vip, 'DELIVER_TO_SEAT')).toBe(true);
    expect(isFulfillmentAllowed(suite, 'DELIVER_TO_SEAT')).toBe(true);
    expect(isFulfillmentAllowed(standard, 'DELIVER_TO_SEAT')).toBe(false);
    expect(() => {
      assertFulfillmentAllowed(standard, 'DELIVER_TO_SEAT');
    }).toThrow(FulfillmentError);
    expect(() => {
      assertFulfillmentAllowed(standard, 'DELIVER_TO_SEAT');
    }).toThrow(/STANDARD/);
  });
});

describe('generateBookingCode', () => {
  it('creates random 16-character Crockford base32 codes', () => {
    const codes = Array.from({ length: 500 }, generateBookingCode);
    for (const code of codes) {
      expect(code).toHaveLength(BOOKING_CODE_LENGTH);
      expect(code).toMatch(BOOKING_CODE_PATTERN);
      expect(code).not.toMatch(/[ILOU]/);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('password hashing', () => {
  it('hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct horse');
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false);
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });
});
