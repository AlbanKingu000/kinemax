import { describe, expect, it } from 'vitest';
import { apiErrorResponseSchema, healthResponseSchema } from './index.js';

describe('healthResponseSchema', () => {
  it('accepts a healthy and an unhealthy response', () => {
    expect(healthResponseSchema.parse({ status: 'ok', db: 'up' })).toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(healthResponseSchema.parse({ status: 'error', db: 'down' })).toEqual({
      status: 'error',
      db: 'down',
    });
  });

  it('rejects unknown values and missing fields', () => {
    expect(healthResponseSchema.safeParse({ status: 'fine', db: 'up' }).success).toBe(false);
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(false);
    expect(healthResponseSchema.safeParse(null).success).toBe(false);
  });
});

describe('apiErrorResponseSchema', () => {
  it('accepts a known error code', () => {
    const body = { error: { code: 'not_found', message: 'Not found.' } };
    expect(apiErrorResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects an unknown error code', () => {
    const body = { error: { code: 'stack_trace', message: 'x' } };
    expect(apiErrorResponseSchema.safeParse(body).success).toBe(false);
  });
});
