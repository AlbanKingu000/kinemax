import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@kinemax/shared';
import { ApiRequestError } from '../api/http';
import type { Messages } from '../i18n/messages';

/** A translated, generic message for a failed auth request (never the server's text). */
export function authErrorMessage(
  t: Messages,
  error: unknown,
  context: 'login' | 'register' | 'changePassword' | 'other' = 'other',
): string {
  if (!(error instanceof ApiRequestError)) return t.auth.errors.generic;
  if (error.code === 'rate_limited') {
    return t.auth.errors.rateLimited(Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60)));
  }
  if (error.code === 'network') return t.auth.errors.network;
  if (error.code === 'invalid_credentials') {
    return context === 'changePassword'
      ? t.auth.errors.wrongCurrent
      : t.auth.errors.invalidCredentials;
  }
  if (error.code === 'conflict' && context === 'register') return t.auth.errors.registerConflict;
  return t.auth.errors.generic;
}

/** Translates a field issue code (from zod or the API's password policy) for a field. */
export function fieldErrorMessage(t: Messages, field: string, code: string): string {
  const e = t.auth.errors;
  if (field === 'email') return e.email;
  if (field === 'name') return code === 'too_big' ? e.nameTooLong : e.required;
  switch (code) {
    case 'too_small':
      return e.tooShort(PASSWORD_MIN_LENGTH);
    case 'too_big':
      return e.tooLong(PASSWORD_MAX_LENGTH);
    case 'same_as_email':
      return e.sameAsEmail;
    case 'too_common':
      return e.tooCommon;
    case 'same_as_current':
      return e.sameAsCurrent;
    default:
      return e.required;
  }
}
