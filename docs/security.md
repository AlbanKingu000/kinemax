# Kinemax security

Kinemax is a portfolio project with real accounts, an admin panel and DEMO payments. This page
covers the threat model, the controls, the findings of the final review (task 11) and what a real
production launch still needs. Auth details: [auth.md](auth.md). Database guarantees:
[data-model.md](data-model.md).

## Threat model (short)

| Asset                                  | Threat                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------- |
| Accounts and sessions                  | credential stuffing, session theft or fixation, CSRF                   |
| Bookings, tickets (QR codes)           | IDOR (reading or cancelling someone else's), double booking, forged QR |
| Prices and payments                    | client-side tampering with prices, seats, roles or user ids            |
| Admin panel                            | customers or managers of another cinema reaching admin data or writes  |
| Uploaded images                        | polyglot files, scripts served as images, decompression bombs          |
| Availability (holds, checkout, writes) | scripted floods of seat holds, payments and admin writes               |
| The web app                            | XSS, clickjacking, open redirects after login                          |

Attackers: anonymous visitors, signed-in customers, staff acting outside their cinema. Out of
scope: a compromised server or database host, real payment fraud (payments are demo only).

## Controls

- **Authentication**: argon2id password hashes, a password policy (length, common passwords, not
  the email), server-side sessions in PostgreSQL (only the SHA-256 of the token is stored), idle
  and absolute lifetimes, session id rotated on login and password change, logout destroys it.
- **Cookies**: httpOnly, SameSite=Lax, `Secure` + `__Host-` prefix in production.
- **CSRF**: every POST/PUT/PATCH/DELETE under `/api` needs an allowed `Origin` (or `Referer`) and
  an HMAC token bound to the session (or to an anonymous cookie). No route is exempt.
- **Authorization**: `requireAuth` / `requireRole` on every protected route, location scope for
  managers (`canAccessLocation`), ownership checks in the handlers (other users' bookings answer
  404, never 403).
- **Input**: every body, param and query goes through zod (`parseInput`); image uploads are
  checked by their bytes and re-encoded; media names must match an exact pattern.
- **Prices and seats** are computed and checked on the server only; the database enforces the
  rest (G0-G12: no double booking via exclusion constraints and seat locks, a booking status
  machine, CHECKs and triggers with `KX` SQLSTATEs).
- **Rate limits** (in memory): login (per IP and per email+IP), register, change password, seat
  holds, checkout, demo payment, cancellation, every admin write (sensitive writes stricter),
  check-in.
- **Headers** (helmet, see `securityHeaders` in `apps/api/src/app.ts`): CSP
  `default-src 'self'; script-src 'self'; style-src 'self'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; object-src 'none'`
  (no `unsafe-inline`, no `unsafe-eval`; `img-src` also allows `data:`/`blob:` for generated
  images), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
  and, over HTTPS only, HSTS (1 year) + `upgrade-insecure-requests`. Uploaded media add
  `default-src 'none'; sandbox`. API responses are `Cache-Control: no-store`.
- **Errors and logs**: generic messages to the client (no stack traces, no database details);
  logs carry ids and masked emails, never passwords, tokens, cookies or request bodies.
- **Supply chain**: exact versions, an install-script allowlist (npm 11 `allowScripts`), and the
  `npm run audit` gate (high/critical in production dependencies fail the build).

The route inventory test (`apps/api/test/route-inventory.db.test.ts`) reads every registered
`/api` route from the router and checks automatically: anonymous visitors get 401 outside an
explicit public list, customers get 403 on all of `/api/admin`, every write without a CSRF token
gets 403, malformed params and bodies get a 4xx (never 2xx or 500), route code reads input only
through zod, and the sensitive writes answer 429 when their limit is reached.

## Findings of the final review

| #   | Finding                                                                                                                           | Result                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /api/bookings/:id/checkout` had no rate limit                                                                               | **Fixed**: own per-user and per-IP budget (same rules as payments)                                                                             |
| 2   | `POST /api/admin/showtimes/bulk/preview` (an admin write endpoint) had no rate limit                                              | **Fixed**: counts as an admin write                                                                                                            |
| 3   | helmet's default CSP allowed `style-src https: 'unsafe-inline'` and `frame-ancestors 'self'`; HSTS was sent in development too    | **Fixed**: strict CSP above, `frame-ancestors 'none'`, HSTS only over HTTPS                                                                    |
| 4   | `Referrer-Policy: no-referrer` (helmet default) blocks YouTube embeds                                                             | **Fixed**: `strict-origin-when-cross-origin` (the origin only, never a path or query)                                                          |
| 5   | Example routes `/api/admin/ping` and `/api/manage/locations/:id/ping` were shipped                                                | **Fixed**: removed; the middleware is tested on a test-only app                                                                                |
| 6   | Production did not require `UPLOADS_DIR` (uploads would land inside the app directory)                                            | **Fixed**: required in production, like `APP_ORIGIN` (https) and `CSRF_SECRET`                                                                 |
| 7   | Cart writes (`PUT /bookings/:id/tickets`, `/food`, `DELETE /bookings/:id/hold`, `PATCH /auth/me`) have no own rate limit          | **Accepted**: only on the caller's own open hold or profile, cheap, behind session + CSRF; holds themselves are limited                        |
| 8   | Source maps of the web build are served                                                                                           | **Accepted**: the source holds no secrets (portfolio project); they make production errors readable                                            |
| 9   | npm audit: two high advisories in the Prisma CLI (deepmerge-ts, mysql2)                                                           | **Accepted** (documented in `scripts/audit-gate-core.ts`): CLI-only code paths, never loaded by the running API; revisit on each Prisma update |
| 10  | Greps: `$queryRawUnsafe`/`$executeRawUnsafe`, `dangerouslySetInnerHTML` (also an ESLint rule), `eval`/`new Function`, `innerHTML` | **Clean**: none in the code                                                                                                                    |
| 11  | Secrets in the repo or its history (every `.env` value checked against `git log --all -p`)                                        | **Clean**: only placeholders and test-only values                                                                                              |
| 12  | Open redirect via `?next=`                                                                                                        | **Clean**: `safeNextPath` accepts same-origin paths only (encoded, backslash and protocol-relative variants are unit tested)                   |
| 13  | Session fixation                                                                                                                  | **Clean**: new session id on login and password change (integration tested)                                                                    |
| 14  | IDOR on bookings, tickets, payments and admin resources                                                                           | **Clean**: owner checks answer 404; admin resources of another cinema answer 403/404 (tested per router with a second cinema)                  |
| 15  | Upload pipeline                                                                                                                   | **Clean**: 5 MB limit, type from magic bytes, structure walked, pixel limit, re-encoded to WebP without metadata, random names, sandboxed CSP  |
| 16  | QR check-in scope                                                                                                                 | **Clean**: staff only, the scanning cinema must be in the caller's scope, tickets of another cinema answer `wrong_location` without details    |
| 17  | Dependencies                                                                                                                      | **Clean**: every dependency is used; nothing removed                                                                                           |

## Production TODOs (known, not done)

- **Shared store for rate limits** (Redis or a table): the limits live in one process today; with
  more than one API instance each counts separately.
- **Email verification and password reset** (and optionally 2FA for staff): there is no email
  sending yet.
- **A real payment provider**: payments are a demo button; a real provider needs webhooks with
  signature checks, idempotency keys and PCI-scoped hosted fields (never card data on our servers).
- Customers are not notified when a show they booked is deactivated (they are refunded
  automatically).
- A CSP report endpoint (`report-to`) to see violations in production.
