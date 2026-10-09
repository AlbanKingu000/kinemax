import { describe, expect, it } from 'vitest';
import {
  authUserSchema,
  changePasswordRequestSchema,
  loginRequestSchema,
  PASSWORD_MAX_LENGTH,
  registerRequestSchema,
  updateMeRequestSchema,
} from './index.js';

describe('auth request schemas', () => {
  it('normalizes the email and defaults the locale on register', () => {
    expect(
      registerRequestSchema.parse({
        name: '  Ana ',
        email: '  Ana@Kinemax.TEST ',
        password: 'a-long-unique-passphrase',
      }),
    ).toEqual({
      name: 'Ana',
      email: 'ana@kinemax.test',
      password: 'a-long-unique-passphrase',
      preferredLocale: 'sq',
    });
  });

  it('rejects unknown keys such as role, and bad emails or lengths', () => {
    const base = { name: 'Ana', email: 'ana@kinemax.test', password: 'a-long-unique-passphrase' };
    expect(registerRequestSchema.safeParse({ ...base, role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
    expect(
      registerRequestSchema.safeParse({ ...base, password: 'x'.repeat(PASSWORD_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
  });

  it('bounds login passwords without applying the policy', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.test', password: 'x' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'a@b.test', password: '' }).success).toBe(false);
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.test', password: 'x'.repeat(129) }).success,
    ).toBe(false);
  });

  it('PATCH /me accepts only name and locale, and at least one of them', () => {
    expect(updateMeRequestSchema.parse({ name: 'Ana' })).toEqual({ name: 'Ana' });
    expect(updateMeRequestSchema.parse({ preferredLocale: 'en' })).toEqual({
      preferredLocale: 'en',
    });
    expect(updateMeRequestSchema.safeParse({}).success).toBe(false);
    expect(updateMeRequestSchema.safeParse({ role: 'SUPER_ADMIN' }).success).toBe(false);
    expect(updateMeRequestSchema.safeParse({ preferredLocale: 'de' }).success).toBe(false);
  });

  it('change-password applies the length rules to the new password', () => {
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: 'long-enough-1' })
        .success,
    ).toBe(true);
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: 'x', newPassword: 'short' }).success,
    ).toBe(false);
  });

  it('the user response never allows extra fields like passwordHash', () => {
    const user = {
      id: '01a12092-7928-7088-89c4-7862eb32d377',
      name: 'Ana',
      email: 'ana@kinemax.test',
      role: 'CUSTOMER',
      preferredLocale: 'sq',
      managedLocationIds: [],
    };
    expect(authUserSchema.parse(user)).toEqual(user);
    expect(authUserSchema.safeParse({ ...user, passwordHash: '$argon2id$...' }).success).toBe(
      false,
    );
  });
});
