/**
 * Parses a Cookie request header into name -> value. Malformed pairs are skipped; for duplicate
 * names the first value wins (browsers send the most specific cookie first).
 */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (name === '' || name in cookies) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
      value = value.slice(1, -1);
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      // Not valid percent-encoding: not one of our cookies.
    }
  }
  return cookies;
}
