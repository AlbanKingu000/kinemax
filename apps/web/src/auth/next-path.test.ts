import { describe, expect, it } from 'vitest';
import { loginPath, safeNextPath } from './next-path';

describe('safeNextPath', () => {
  it.each([
    ['/account', '/account'],
    [
      '/booking/0190f0a0-0000-7000-8000-000000000042',
      '/booking/0190f0a0-0000-7000-8000-000000000042',
    ],
    ['/schedule?date=2026-10-12&format=3D', '/schedule?date=2026-10-12&format=3D'],
    ['/movies/kodi#oraret', '/movies/kodi#oraret'],
    ['/movies/k%C3%ABng%C3%AB', '/movies/k%C3%ABng%C3%AB'],
    ['/a/../account', '/account'],
  ])('accepts the same-origin path %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    '',
    'account',
    'https://evil.example',
    'https://evil.example/account',
    'http:evil.example',
    '//evil.example',
    '//evil.example/account',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/\\/evil.example',
    '\\/evil.example',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    ' /account',
    '/account\n',
    '/\t/evil.example',
    '/%2F%2Fevil.example',
    '/%2f%2fevil.example',
    '%2F%2Fevil.example',
    '%2F%5Cevil.example',
    '/%5Cevil.example',
    '/%5cevil.example',
    '/%252F%252Fevil.example',
    '/%25252F%25252Fevil.example',
    '/%E0%A4%A',
    '/%00evil',
    '/login',
    '/login?next=/account',
    '/register',
    `/${'a'.repeat(600)}`,
  ])('falls back to "/" for %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/');
  });
});

describe('loginPath', () => {
  it('encodes the way back, or just /login', () => {
    expect(loginPath('/booking/abc?x=1')).toBe('/login?next=%2Fbooking%2Fabc%3Fx%3D1');
    expect(loginPath('/')).toBe('/login');
    expect(loginPath('//evil.example')).toBe('/login');
  });
});
