// Small helpers shared by the auth forms and the header.
import type { AuthUser } from '@kinemax/shared';

/** Splits zod issues into field codes (the first issue per field). */
export function fieldIssues(
  issues: readonly { path: readonly PropertyKey[]; code: string }[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !(key in fields)) fields[key] = issue.code;
  }
  return fields;
}

/** Mirrors the server policy: the password may not be the email or its part before "@". */
export function sameAsEmail(password: string, email: string): boolean {
  const p = password.trim().toLowerCase();
  const e = email.trim().toLowerCase();
  return p !== '' && (p === e || p === e.split('@')[0]);
}

/** The first name for the header ("Ana Krasniqi" → "Ana"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** Staff may open the admin panel (the API checks the role and the cinema on every request). */
export function isStaff(user: AuthUser | null): boolean {
  return user?.role === 'SUPER_ADMIN' || user?.role === 'LOCATION_MANAGER';
}
