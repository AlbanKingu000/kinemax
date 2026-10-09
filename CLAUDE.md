# Working rules for Kinemax

## Context

- Kinemax is a personal portfolio project: a website for a **fictional** premium cinema chain with
  locations in several cities.
- Planned features: locations, movies (now showing / coming soon), schedule per location, different
  hall types (details defined later, so keep the data model flexible), seat booking, food & drinks
  ordered together with tickets, user accounts, an admin panel, and DEMO payments only.
- Languages: Albanian (`sq`, default) and English (`en`). All UI text goes through the translation
  files (`apps/web/src/i18n`), never hardcoded in components.
- Currency: EUR.
- Stack: npm workspaces. `apps/web` (React 19, Vite, react-router), `apps/api` (Express 5, Prisma,
  PostgreSQL), `packages/shared` (zod schemas/types used by both). TypeScript strict everywhere.

## Database

- Native PostgreSQL 18 on Windows, local connections only (`listen_addresses = 'localhost'`,
  `pg_hba.conf` allows only 127.0.0.1/32 and ::1/128 with scram-sha-256).
- The app, tests and scripts use the `kinemax` role only. Never use the `postgres` superuser.
- `kinemax` is the development database; tests (Vitest integration and Playwright e2e) run only
  against `kinemax_test`. The guards that enforce this must never be removed or weakened.
- Data model: `docs/data-model.md`. Money is integer cents, timestamps are `timestamptz` in UTC
  (sessions run with `TimeZone=UTC`), texts have `*Sq` (required) and `*En` (optional) columns.
- The DB-level guarantees (G0-G11 at the end of the `init_domain` migration: overlap exclusion,
  seat locks, status machine, CHECKs, triggers) must never be removed or weakened. New guarantees
  go into new migrations as raw SQL with a comment; check that `prisma migrate dev --create-only`
  then produces an empty migration (no drift).
- Prisma 7 does not run `generate` after `migrate dev`, nor the seed after `migrate reset`; run them
  explicitly. Prices are only ever calculated on the server (`apps/api/src/domain/pricing.ts`).

## Commands

```bash
npm run dev          # API (http://127.0.0.1:3001) + web (http://localhost:5180, proxies /api)
npm run lint         # ESLint + Prettier check
npm run typecheck    # tsc in every workspace
npm test             # Vitest (shared, api incl. kinemax_test integration, web)
npm run test:cov     # Vitest with coverage (80% minimum)
npm run build        # shared -> api -> web
npm run e2e          # build + Playwright against the production builds (kinemax_test)
npm run verify       # lint, typecheck, test:cov, build, e2e, audit (production deps)
npm run audit        # production audit gate: npm audit --omit=dev, fails on high/critical except
                     # the documented Prisma CLI exceptions in scripts/audit-gate-core.ts
npm run audit:dev    # full npm audit incl. dev tooling (report only, never fails)
npm run db:migrate   # prisma migrate dev (development database)
npm run db:seed      # idempotent demo data (development database only; refuses *_test)
npm run db:studio    # Prisma Studio
npm run db:reset     # wipe, re-migrate and re-seed the dev database (asks; refuses *_test)
```

## Scope

- One task per prompt. Do exactly that task. No unrelated refactors or "improvements".

## Definition of done (every task)

1. `npm run verify` passes. Never skip, weaken or delete a test to make it pass.
2. Add or update tests for every change (unit/integration and, for user flows, e2e).
3. Test it for real in Google Chrome: start the dev server, click through the new or changed flow,
   check the console for errors and warnings, at desktop width and at ~390px mobile width.
4. End with a short summary: files changed, how it was tested, open risks.

## Design (be careful)

- Premium, luxury dark theme in **black + red**. The mood is inspired by noircinema.sa, but never copy
  its logos, text, photos, code, assets or layout. Use only Kinemax's own name, text, images and logo.
- Colors, spacing and typography come from design tokens (CSS variables) only.
- WCAG AA contrast everywhere. Red text on black often fails: check it.
- If a task needs a visible design change beyond what was asked, describe it and ask first.
- Keep keyboard navigation, visible focus states, alt text and reduced-motion support.

## Security (strict: this project has accounts and an admin)

- Passwords are hashed with argon2id, never logged, never returned by the API.
- Server-side sessions stored in the database. Session cookie: httpOnly, Secure in production,
  SameSite=Lax. Rotate the session id on login; logout destroys the session.
- CSRF protection on every state-changing request.
- Rate limiting on auth endpoints and other sensitive endpoints.
- Validate every request body, params and query with zod on the server. Never trust the client for
  prices, seat availability, roles or user ids.
- Server-side authorization on every protected route (the user owns the resource; admin role for
  admin routes).
- Prisma only. Raw SQL only through tagged `$queryRaw`, never string concatenation.
- No `dangerouslySetInnerHTML`.
- No secrets, tokens or real credentials in the repo or in commits. `.env` is never committed.
  Never print passwords (terminal output, logs, reports).
- Payments are DEMO only: never collect or store real card numbers.
- Errors: generic messages to the client; details only in server logs, without passwords, tokens or
  cookies.
- Keep the baseline: helmet, no `x-powered-by`, strict CORS (no wildcard; the browser talks to one
  origin through the Vite proxy), JSON body size limit, the central error handler.
- New dependencies only when really needed. Explain why and prefer well-known, maintained packages.
  Never run `npm audit fix --force`.
- Never add a new npm audit exception or a new allowed install script without my explicit approval.
  Propose it with the advisory/reason and wait.

### Auth building blocks (use them, don't reinvent them; details in `docs/auth.md`)

- Middleware in `apps/api/src/http/auth-middleware.ts`: `requireAuth` (401), `requireRole(...roles)`
  (401/403), `requireLocationAccess(prisma, req => locationId)` (SUPER_ADMIN everywhere, managers
  only their `ManagerLocation`s, customers never). `req.auth.user` is the signed-in user. Resource
  ownership (e.g. "this booking is mine") is checked in the handler, on the server.
- CSRF + Origin checks run globally for POST/PUT/PATCH/DELETE under `/api`; clients send the token
  from `GET /api/auth/csrf` in `X-CSRF-Token`. Never exempt a route.
- Validate input with `parseInput(schema, req.body)` and throw `HttpError` for expected failures
  (`apps/api/src/http/errors.ts`). Shared request/response schemas live in `packages/shared`.
- Database errors are mapped centrally (`apps/api/src/http/db-errors.ts`): 23505/23P01/23001 and
  trigger exceptions -> 409, CHECK constraints and FK-on-insert -> 422, anything else -> 500. Both
  Prisma error shapes (statement error and COMMIT-time `DriverAdapterError`) are handled; use
  `sqlStateOf(error)` when a handler needs to branch on a SQLSTATE.
- Security logs: `logger.info/warn` with ids and `maskEmail(...)`, never passwords, tokens, cookies,
  full emails or request bodies.
- Rate limits are in-memory (`apps/api/src/auth/rate-limit.ts`); a multi-instance deployment needs
  a shared store.

## Git and GitHub

- Repo-local identity only. Never change global or system git config.
- After each finished task (verify green, Chrome check done), make ONE local commit with a
  Conventional Commits message (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`). Review
  `git status` first and stage only the task's files.
- No remote and no push until explicitly asked. Never force push.
- Never add Co-Authored-By or any other AI attribution to commit messages or PR descriptions.
