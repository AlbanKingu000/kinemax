import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@kinemax/shared';
import { COMMON_PASSWORDS } from './common-passwords.js';

export type PasswordPolicyIssue = 'too_short' | 'too_long' | 'too_common' | 'same_as_email';

/**
 * Checks a new password. Length is counted in characters; the maximum protects the server from
 * hashing huge inputs. Common passwords and the user's own email (or its local part) are rejected,
 * case-insensitively. Returns the issues found (empty = acceptable).
 */
export function checkPasswordPolicy(password: string, email: string): PasswordPolicyIssue[] {
  const issues: PasswordPolicyIssue[] = [];
  // Count code points, not UTF-16 units, so "ë" or an emoji counts as one character.
  const length = password.match(/./gsu)?.length ?? 0;
  if (length < PASSWORD_MIN_LENGTH) issues.push('too_short');
  if (length > PASSWORD_MAX_LENGTH) issues.push('too_long');
  const normalized = password.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) issues.push('too_common');
  const normalizedEmail = email.trim().toLowerCase();
  const localPart = normalizedEmail.split('@')[0] ?? '';
  if (normalized === normalizedEmail || (localPart !== '' && normalized === localPart)) {
    issues.push('same_as_email');
  }
  return issues;
}
