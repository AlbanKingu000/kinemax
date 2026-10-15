# Authentication and authorization

Session-based authentication with server-side sessions, CSRF protection and role/location
authorization. Code: `apps/api/src/auth/` (sessions, tokens, CSRF, rate limits, password policy),
`apps/api/src/http/auth-middleware.ts` (middleware), `apps/api/src/routes/auth.ts` (endpoints),
request/response schemas in `packages/shared/src/auth.ts`.

## Endpoints (`/api/auth`, JSON, zod-validated, unknown keys rejected)

| Method | Path               | Auth    | What it does                                                                |
| ------ | ------------------ | ------- | --------------------------------------------------------------------------- |
| GET    | `/csrf`            | -       | CSRF token for the current (anonymous or signed-in) session                 |
| POST   | `/register`        | -       | name, email, password, preferredLocale; creates a CUSTOMER and signs in     |
| POST   | `/login`           | -       | email, password; signs in (new session)                                     |
| POST   | `/logout`          | -       | deletes the current session (idempotent)                                    |
| POST   | `/logout-all`      | session | deletes every session of the user                                           |
| GET    | `/session`         | -       | `{ user }` or `{ user: null }` (200 either way; the web app uses it)        |
| GET    | `/me`              | session | id, name, email, role, preferredLocale, managedLocationIds (never the hash) |
| PATCH  | `/me`              | session | name and/or preferredLocale only                                            |
| POST   | `/change-password` | session | currentPassword, newPassword; rotates this session, revokes all others      |

Register, login and change-password return `{ user, csrfToken }`: the token for the new session.

Example protected routes: `GET /api/admin/ping` (SUPER_ADMIN) and
`GET /api/manage/locations/:locationId/ping` (managers of that location, SUPER_ADMIN).

## Sessions

- Token: 32 bytes from `crypto.randomBytes`, base64url (256 bits). The cookie carries it; the
  database stores only its SHA-256 hash (`Session.tokenHash`), so a database or log leak never
  contains a usable token.
- Cookie: `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` (30 days), plus `Secure` and the
  `__Host-` prefix in production (`__Host-kinemax_session`), which browsers only accept when Secure,
  Path=/ and without Domain, so subdomains cannot set or overwrite it. Development over http uses
  `kinemax_session` (browsers refuse `__Host-` without https). `COOKIE_SECURE` overrides; it cannot
  be false in production.
- **Idle timeout 7 days (sliding)**: a week without any request ends the session, so a forgotten
  device does not stay signed in, while weekly visitors (typical for a cinema) are not asked to
  sign in every time. `lastSeenAt` is written at most every 5 minutes to avoid a database write
  per request.
- **Absolute lifetime 30 days**: even an active session ends 30 days after sign-in, which limits
  how long a stolen cookie can be used.
- **Rotation**: login, register and change-password create a new session and delete the request's
  previous one (prevents session fixation). Logout deletes the row; logout-all deletes all rows.
- **Inactive users** (`isActive = false`) cannot sign in (same generic error as a wrong password)
  and their sessions are rejected and deleted on the next request.
- **Cleanup**: the API process deletes expired sessions at start and every hour
  (`startSessionCleanup`). The DELETE is idempotent, so several processes can run it.

## CSRF

Every POST/PUT/PATCH/DELETE under `/api` needs both checks; otherwise 403 ("The request was
blocked."): `forbidden` for a failed Origin check, `csrf_invalid` for a missing, stale or forged
token. Only `csrf_invalid` may be retried, once, after fetching a new token from `GET /api/auth/csrf`
(the web app does this in its one fetch wrapper, `apps/web/src/api/http.ts`):

1. **Origin**: the `Origin` header (or the `Referer`'s origin when Origin is missing) must be
   `APP_ORIGIN` or one of `CORS_ALLOWED_ORIGINS`. Missing, `null` or foreign origins fail.
2. **Token** in the `X-CSRF-Token` header: a stateless synchronizer token,
   `nonce.HMAC-SHA256(CSRF_SECRET, binding + nonce)`. The binding is the session's token hash when
   signed in, otherwise a random value in the httpOnly anonymous cookie `kinemax_csrf` (so login
   and register are protected too). A token from another session, an anonymous token after login,
   or a forged token fails.

Why this design: no extra table or per-request state (the HMAC is checked statelessly), tokens are
bound to the session so they cannot be replayed elsewhere, and the bound value is httpOnly, so a
cross-site page can neither read the token (no CORS) nor compute it. The Origin check is a second,
independent layer; `SameSite=Lax` is a third. The check runs before the JSON body is parsed.

Client flow: `GET /api/auth/csrf` -> send the token with every state-changing request -> use the
`csrfToken` from login/register/change-password responses afterwards (the session changed).
`CSRF_SECRET` is required in production; in development a random key per process is used (tokens
become invalid after an API restart, the client fetches a new one).

## Passwords and abuse protection

- argon2id (`apps/api/src/auth/password.ts`).
- Policy (`password-policy.ts`): 10-128 characters (the maximum protects the server from hashing
  huge inputs), not in the bundled common-password list, not equal to the email or its local part
  (case-insensitive). Failures return 400 `validation_failed` with field codes (`too_small`,
  `too_big`, `too_common`, `same_as_email`, `same_as_current`), never the password.
- **No account enumeration on login**: unknown email, wrong password and inactive account all
  return 401 `invalid_credentials` ("Email or password is incorrect."). For unknown or inactive
  accounts the password is verified against a dummy argon2id hash, so timing is similar.
- **Register with an existing email**: 409 `conflict` with the generic message "This account could
  not be created." and no session. Without email verification a sign-up form cannot fully hide that
  an address is taken, so the response stays generic, the password is hashed before the insert
  (same timing for new and existing emails), and registration is rate limited per IP. Once email
  verification exists, register can always answer "check your inbox".
- **Rate limits** (in-memory, fixed window, per API process; production with several instances
  needs a shared store such as Redis), all answering 429 `rate_limited` with `Retry-After`:

  | Limit                       | Value              | Notes                               |
  | --------------------------- | ------------------ | ----------------------------------- |
  | login per email + IP        | 5 per 15 minutes   | reset after a successful login      |
  | login per IP (all accounts) | 20 per 15 minutes  | stops password spraying from one IP |
  | register per IP             | 5 per hour         |                                     |
  | change-password per user    | 5 per 15 minutes   |                                     |
  | seat hold per user          | 30 per 10 minutes  | `POST /api/bookings/hold`           |
  | seat hold per IP            | 120 per 10 minutes | `POST /api/bookings/hold`           |
  | demo payment per user       | 30 per 10 minutes  | `POST /api/payments/:id/simulate`   |
  | demo payment per IP         | 120 per 10 minutes | `POST /api/payments/:id/simulate`   |
  | cancellation per user       | 10 per 10 minutes  | `POST /api/bookings/:id/cancel`     |
  | cancellation per IP         | 60 per 10 minutes  | `POST /api/bookings/:id/cancel`     |

  Behind a reverse proxy set `TRUST_PROXY` to the number of proxies, or every client shares the
  proxy's IP.

- **Security log events** (no passwords, tokens, cookies or full emails; emails are masked as
  `a***@domain`): `auth.register.success`, `auth.register.rejected`, `auth.login.success`,
  `auth.login.failure` (with reason), `auth.logout`, `auth.logout_all`,
  `auth.change_password.success`/`.failure`, `security.rate_limited`, `security.csrf.blocked`,
  `auth.sessions.cleanup`.

## Authorization middleware

`apps/api/src/http/auth-middleware.ts`:

```ts
router.get('/orders', requireAuth, handler); // 401 when not signed in
router.post('/prices', requireRole('SUPER_ADMIN'), handler); // 401 / 403
router.get(
  '/locations/:locationId/schedule',
  requireRole('LOCATION_MANAGER', 'SUPER_ADMIN'),
  requireLocationAccess(prisma, (req) => req.params.locationId),
  handler,
);
```

`requireLocationAccess`: SUPER_ADMIN may access every location, a LOCATION_MANAGER only locations
assigned in `ManagerLocation`, a CUSTOMER never. Malformed or unknown ids get 403 too, so nothing is
revealed. `req.auth` holds `{ sessionId, tokenHash, user: { id, email, name, role, preferredLocale } }`.
Resource ownership checks (e.g. "this booking belongs to the user") belong in each handler.

## Error mapping

The central error handler (`apps/api/src/http/errors.ts`) sends a generic `{ error: { code,
message, fields?, takenSeatIds? } }` (`takenSeatIds`: the requested seats someone else holds, on a
409 from `POST /api/bookings/hold`) and logs details server-side. Throw `HttpError` for expected failures and
use `parseInput(schema, req.body)` for validation (400 `validation_failed` with field paths and
codes, never values). Database errors are recognized in both Prisma shapes (statement errors as
`PrismaClientKnownRequestError`, COMMIT-time errors of interactive transactions as a raw
`DriverAdapterError`) by `apps/api/src/http/db-errors.ts`. The mapping looks at the **SQLSTATE
only**: PostgreSQL can translate its messages (`lc_messages`), so message text is logged for humans
but never interpreted. Our triggers raise custom codes (class `KX`, see
[data-model.md](data-model.md#error-codes)) instead of 23514.

| SQLSTATE | Meaning                                                           | HTTP | code             |
| -------- | ----------------------------------------------------------------- | ---- | ---------------- |
| 23505    | unique violation (e.g. seat already locked)                       | 409  | `conflict`       |
| 23P01    | exclusion violation (overlapping showtime)                        | 409  | `conflict`       |
| 23001    | RESTRICT violation (deleting or re-keying a referenced row)       | 409  | `conflict`       |
| KX001    | booking status transition not allowed                             | 409  | `conflict`       |
| KX002    | hold expired, booking can no longer be confirmed                  | 409  | `conflict`       |
| KX003    | seat/hall lock needs an active booking                            | 409  | `conflict`       |
| KX006    | seat type change on a seat with tickets                           | 409  | `conflict`       |
| 23514    | CHECK constraint                                                  | 422  | `unprocessable`  |
| 23503    | foreign key on insert/update (referenced row does not exist)      | 422  | `unprocessable`  |
| KX004    | hall booking mode (seat lock in a suite, suite lock elsewhere)    | 422  | `unprocessable`  |
| KX005    | wrong ticket count on a seat (occupant above capacity, at COMMIT) | 422  | `unprocessable`  |
| other    | anything else                                                     | 500  | `internal_error` |

Why: 409 means "well-formed, but conflicts with the current state; refresh and retry" (someone took
the seat, the hold expired, the booking was released). 422 means "the request describes something
the database never accepts, whatever the state": validation or domain logic should have caught it
before the database.

- 23514 is identified by SQLSTATE alone. PostgreSQL also reports the constraint name as a
  structured field, but Prisma's pg adapter does not pass it on for CHECK violations (it does for
  unique, foreign key and RESTRICT violations, and the handler logs it). Since our triggers no
  longer use 23514, the code alone is unambiguous.
- All our foreign keys are RESTRICT, CASCADE or SET NULL (none NO ACTION), so a delete of a
  referenced row is always 23001, and 23503 always means "insert/update with a missing referenced
  row". New foreign keys should keep that rule.
- Logs contain the SQLSTATE, the constraint name when available and PostgreSQL's message, never
  the error `detail` (it can contain row values such as password hashes).
- Branch on codes with `sqlStateOf(error)` and the constants in
  `apps/api/src/db/domain-error-codes.ts`; never match message text.

## Out of scope (later)

Email verification, password reset by email, two-factor authentication, OAuth / social login.
