import { z } from 'zod';

// Request and response shapes of /api/auth. The server re-validates everything; the web app can use
// the same schemas for form validation. Unknown keys are rejected (.strict()), so a client can never
// smuggle fields like `role` into a request.

export const PASSWORD_MIN_LENGTH = 10;
/** Upper bound protects the server from very long inputs to the (expensive) password hash. */
export const PASSWORD_MAX_LENGTH = 128;

export const localeSchema = z.enum(['sq', 'en']);
export type Locale = z.infer<typeof localeSchema>;

export const userRoleSchema = z.enum(['CUSTOMER', 'LOCATION_MANAGER', 'SUPER_ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Emails are compared and stored trimmed and lowercase. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const nameSchema = z.string().trim().min(1).max(100);

export const registerRequestSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    preferredLocale: localeSchema.default('sq'),
  })
  .strict();
export type RegisterRequest = z.input<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    // Only bounded here; the policy applies when a password is set, not when it is checked.
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  })
  .strict();
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const updateMeRequestSchema = z
  .object({
    name: nameSchema.optional(),
    preferredLocale: localeSchema.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.preferredLocale !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateMeRequest = z.input<typeof updateMeRequestSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: newPasswordSchema,
  })
  .strict();
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>;

/** The current user as returned by the API. Never contains the password hash. */
export const authUserSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    role: userRoleSchema,
    preferredLocale: localeSchema,
    /** Locations a LOCATION_MANAGER manages (empty for other roles). */
    managedLocationIds: z.array(z.uuid()),
  })
  .strict();
export type AuthUser = z.infer<typeof authUserSchema>;

export const csrfResponseSchema = z.object({ csrfToken: z.string().min(1) }).strict();
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;

/** Login, register and change-password return the user and a fresh CSRF token for the new session. */
export const authSessionResponseSchema = z
  .object({ user: authUserSchema, csrfToken: z.string().min(1) })
  .strict();
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const meResponseSchema = z.object({ user: authUserSchema }).strict();

/** `GET /api/auth/session`: like /me, but 200 with `user: null` when signed out (no 401 noise). */
export const sessionResponseSchema = z.object({ user: authUserSchema.nullable() }).strict();
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;

/** Header carrying the CSRF token on every state-changing request. */
export const CSRF_HEADER = 'x-csrf-token';
