import { describe, expect, it } from 'vitest';
import { simulatePaymentRequestSchema, ticketQrValue } from './checkout.js';

describe('demo checkout', () => {
  it('encodes only the booking code in the QR', () => {
    expect(ticketQrValue('ABCD1234EFGH5678')).toBe('KINEMAX:ABCD1234EFGH5678');
  });

  it('accepts only an outcome from the client, never an amount', () => {
    expect(simulatePaymentRequestSchema.safeParse({ outcome: 'success' }).success).toBe(true);
    expect(simulatePaymentRequestSchema.safeParse({ outcome: 'decline' }).success).toBe(true);
    expect(simulatePaymentRequestSchema.safeParse({ outcome: 'refund' }).success).toBe(false);
    expect(
      simulatePaymentRequestSchema.safeParse({ outcome: 'success', amountCents: 1 }).success,
    ).toBe(false);
  });
});
