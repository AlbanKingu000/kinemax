// Where to go after signing in (?next=). Only same-origin relative paths are accepted, so a link
// like /login?next=https://evil.example cannot send someone to another site after login.

const FALLBACK = '/';
const BASE = 'https://kinemax.invalid';
/**
 * Control characters, whitespace and backslashes never belong in our paths; browsers treat a
 * backslash like "/" (so "/\evil.example" would be protocol-relative).
 */
const hasForbiddenCharacter = (value: string): boolean => {
  if (/[\s\\]/.test(value)) return true;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
};
/** "//host" or "/\host": protocol-relative URLs to another origin. */
const PROTOCOL_RELATIVE = /^\/[/\\]/;

const looksSafe = (value: string) =>
  value.startsWith('/') && !PROTOCOL_RELATIVE.test(value) && !hasForbiddenCharacter(value);

/**
 * The path to return to after login, or "/" when `raw` is missing or not a safe same-origin path.
 * The value is decoded up to three times so encoded variants ("/%2F%2Fevil", "%2F%2Fevil") are
 * caught too. The login and register pages are not targets (no loops).
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return FALLBACK;
  let decoded = raw;
  for (let i = 0; i < 3; i++) {
    if (!looksSafe(decoded)) return FALLBACK;
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return FALLBACK;
    }
    if (next === decoded) break;
    decoded = next;
  }
  if (!looksSafe(decoded)) return FALLBACK;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return FALLBACK;
  }
  if (url.origin !== BASE) return FALLBACK;
  if (url.pathname === '/login' || url.pathname === '/register') return FALLBACK;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A login link that brings the user back to `path` afterwards. */
export function loginPath(path: string): string {
  const next = safeNextPath(path);
  return next === FALLBACK ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}
