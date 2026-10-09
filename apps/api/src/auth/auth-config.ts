// Session and cookie settings. Values are explained in docs/auth.md.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A session expires after 7 days without any request (sliding). */
export const SESSION_IDLE_TIMEOUT_MS = 7 * DAY;
/** ...and 30 days after login at the latest, however active it is. */
export const SESSION_ABSOLUTE_LIFETIME_MS = 30 * DAY;
/** lastSeenAt is written at most every 5 minutes, not on every request. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * MINUTE;
/** Expired sessions are deleted once an hour. */
export const SESSION_CLEANUP_INTERVAL_MS = 60 * MINUTE;

export interface CookieSettings {
  /** Secure cookies with the __Host- prefix (production, https). */
  secure: boolean;
  sessionCookieName: string;
  /** Random anonymous id that CSRF tokens are bound to before login. */
  csrfCookieName: string;
}

/**
 * Cookie names. With Secure the "__Host-" prefix makes browsers reject the cookie unless it is
 * Secure, has Path=/ and no Domain, so it cannot be set or overwritten by a subdomain. Browsers
 * refuse that prefix over plain http, so development uses unprefixed names.
 */
export function cookieSettings(secure: boolean): CookieSettings {
  const prefix = secure ? '__Host-' : '';
  return {
    secure,
    sessionCookieName: `${prefix}kinemax_session`,
    csrfCookieName: `${prefix}kinemax_csrf`,
  };
}
