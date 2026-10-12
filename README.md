# Kinemax

Kinemax is a personal portfolio project: the website of a **fictional** premium cinema chain with
locations in several cities. The look will be a luxury dark theme in black and red.

So far there is the project foundation, the full database model with realistic demo data
(locations, halls with 3D seat layouts, movies, showtimes, prices, menus, users) and the visual
identity with a design system (see [Design system](#design-system)). The web app has the site shell
(header, mobile menu, footer, cinema picker) and the home page with the featured movie, now
showing and coming soon, fed by the public read API (`GET /api/locations`, `/api/movies`,
`/api/featured`); the other pages show "coming soon". The booking flow, accounts, the admin panel
and demo payments come in later tasks (see [docs/roadmap.md](docs/roadmap.md)). The site will be
in Albanian (default) and English, with prices in EUR. See [docs/data-model.md](docs/data-model.md) for the data model.

## Stack

| Part              | Tech                                                          |
| ----------------- | ------------------------------------------------------------- |
| `apps/web`        | React 19, Vite, react-router, TypeScript                      |
| `apps/api`        | Node, Express 5, Prisma 7 (pg driver adapter), TypeScript     |
| `packages/shared` | zod schemas and types used by the web app and the API         |
| Database          | PostgreSQL 18 (native Windows install, local connections)     |
| Tooling           | ESLint (flat config), Prettier, Vitest, Supertest, Playwright |

In development the browser only talks to the Vite dev server; Vite proxies `/api` to the API, so the
web app and API share one origin.

## Prerequisites

- Windows 10/11
- Node.js 22.22 or newer (an active LTS; developed with Node 24)
- npm 11.16 or newer (needed for the install-script policy, see below)
- Git
- PostgreSQL 18 (see below)

## PostgreSQL setup

PostgreSQL 18 is installed natively with the official EDB installer (for example
`winget install --id PostgreSQL.PostgreSQL.18`). It is set up for local use only:

- `listen_addresses = 'localhost'`
- `pg_hba.conf` only allows `127.0.0.1/32` and `::1/128` with `scram-sha-256`
- no Windows Firewall rule opens port 5432

As the `postgres` superuser, create one app role and two databases (use your own strong password):

```sql
CREATE ROLE kinemax WITH LOGIN PASSWORD 'CHANGE_ME' CREATEDB;  -- not a superuser
CREATE DATABASE kinemax OWNER kinemax;       -- development
CREATE DATABASE kinemax_test OWNER kinemax;  -- tests only
```

The app, tests and scripts only ever use the `kinemax` role. `CREATEDB` lets `prisma migrate dev`
create and drop its temporary shadow database, so no `SHADOW_DATABASE_URL` is needed. The first
migration creates the trusted `btree_gist` extension (allowed for the database owner) and sets the
database's default time zone to UTC.

## Quick start (Windows)

```powershell
git clone <repo> kinemax
cd kinemax
copy .env.example .env      # then put the kinemax role password into both URLs
npm install                 # also generates the Prisma client
npx playwright install chromium
npm run db:migrate          # apply migrations to the development database
npm run db:seed             # demo data; generates the demo passwords into .env
npm run dev                 # http://localhost:5180
```

## Demo data

`npm run db:seed` fills the **development** database (it refuses `*_test` databases and
`NODE_ENV=production`) and can be run again at any time:

- 4 locations (Prishtinë, Prizren, Pejë, Ferizaj) with 16 halls of 4 types, ~2,000 seats with 3D
  coordinates (aisles, stadium tiers, VIP middle rows, couple sofas, wheelchair spaces with
  companion seats, recliner and suite layouts)
- 12 fictional movies with abstract placeholder art in `apps/web/public/seed/` (no real titles,
  posters or trademarks) and 14 days of showtimes
- price rules, ticket categories, per-location menus with combos
- demo users (`.test` addresses, so no mail can ever reach anyone):

| Email                                                       | Role             | Password in `.env`          |
| ----------------------------------------------------------- | ---------------- | --------------------------- |
| `admin@kinemax.test`                                        | SUPER_ADMIN      | `SEED_SUPER_ADMIN_PASSWORD` |
| `menaxher.<prishtine\|prizren\|peje\|ferizaj>@kinemax.test` | LOCATION_MANAGER | `SEED_MANAGER_PASSWORD`     |
| `klient1@kinemax.test`, `klient2@kinemax.test`              | CUSTOMER         | `SEED_CUSTOMER_PASSWORD`    |

Missing `SEED_*` passwords are generated randomly into `.env` and never printed. Integration tests
use their own small fixture in `kinemax_test`.

Passwords are hashed with **argon2id** via the `argon2` package: argon2id is the OWASP-recommended
password hash, the package is widely used and ships prebuilt binaries, and Node's own
`crypto.argon2` is still experimental and missing on Node 22.

The API validates its environment at startup and exits with a clear list of problems if something is
missing or wrong.

## Environment variables

| Variable               | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`         | Development database (`kinemax`)                                           |
| `DATABASE_URL_TEST`    | Test database; the name must end in `_test` or tests refuse to run         |
| `HOST`, `PORT`         | API bind address (default `127.0.0.1:3001`)                                |
| `CORS_ALLOWED_ORIGINS` | Extra exact origins allowed cross-origin (default: none, no wildcard ever) |
| `APP_ORIGIN`           | Web app origin for the CSRF Origin check (default `http://localhost:5180`) |
| `COOKIE_SECURE`        | Secure `__Host-` cookies (default: on in production only)                  |
| `CSRF_SECRET`          | CSRF HMAC key, 32+ characters (required in production)                     |
| `TRUST_PROXY`          | Number of reverse proxies in front of the API (default 0)                  |
| `SEED_*_PASSWORD`      | Dev-only demo user passwords, generated by `npm run db:seed`               |

`.env` is git-ignored; `.env.example` holds placeholders only.

## Scripts

| Script               | What it does                                                                          |
| -------------------- | ------------------------------------------------------------------------------------- |
| `npm run dev`        | API (watch mode) and web dev server together                                          |
| `npm run db:migrate` | `prisma migrate dev` on the development database                                      |
| `npm run db:seed`    | Idempotent demo data for the development database (refuses `*_test`)                  |
| `npm run db:studio`  | Prisma Studio                                                                         |
| `npm run db:reset`   | Wipes, re-migrates and re-seeds the development database after you type its name      |
| `npm run lint`       | ESLint and Prettier check                                                             |
| `npm run format`     | Prettier write                                                                        |
| `npm run typecheck`  | TypeScript in every workspace                                                         |
| `npm test`           | Vitest in shared, api (incl. integration tests on `kinemax_test`), web and `scripts/` |
| `npm run test:cov`   | Same with coverage, 80% minimum                                                       |
| `npm run build`      | Builds shared, api and web                                                            |
| `npm run e2e`        | Builds, then runs Playwright against the production builds and `kinemax_test`         |
| `npm run audit`      | Production audit gate (`npm audit --omit=dev`, fails on high/critical, see below)     |
| `npm run audit:dev`  | Full `npm audit` including dev tooling; reports only, never fails                     |
| `npm run verify`     | lint, typecheck, test:cov, build, e2e and audit (production dependencies)             |

## Design system

Luxury dark cinema in black and deep crimson, dark theme only.

- **Styleguide:** `npm run dev`, then http://localhost:5180/styleguide. It shows the logos,
  favicons, colors with contrast ratios, type, spacing, every component in every state and the hero
  background, in Albanian and English. It exists only in development builds; production shows the
  not-found page there.
- **Tokens:** `apps/web/src/styles/tokens.css` (colors, type scale, spacing, radii, shadows and
  glows, z-index, motion, focus ring). `src/styles/tokens.test.ts` checks every color pair listed in
  `src/styles/contrast.ts` for WCAG AA.
- **Fonts:** Cormorant Garamond (display) and Manrope (body), self-hosted variable fonts from
  Fontsource, latin subset only (it covers ë, Ë, ç, Ç and €), `font-display: swap`, preloaded in
  production builds. About 61 KB in total.
- **Components:** `apps/web/src/components`, React with CSS modules: Button, Link, Input, Select,
  Checkbox, Radio/RadioGroup, Switch, FormField, Tabs, Badge (age, format, language), Chip, Card,
  MovieCard, Skeleton, Modal, Toast, Container/Grid, Icon, Logo, LanguageSwitch and
  HeroBackground.
- **Logo:** the KX monogram. All letters are outlines taken from Cormorant Garamond (SIL Open Font
  License, see `apps/web/src/assets/brand/FONT-LICENSE.md`).
  `npm run brand:generate -w @kinemax/web` regenerates the SVGs, `logo-data.ts` and the favicon
  PNGs (it renders them with Playwright's Chromium).
- **Languages:** a small typed i18n layer (`apps/web/src/i18n`), not a library. Translations are
  plain objects; English must match the Albanian type, so a missing key fails `npm run typecheck`.
  The SQ/EN switch remembers the choice in localStorage and sets `<html lang>`.

## Security baseline

helmet, no `x-powered-by`, strict CORS (no wildcard), a 100 kB JSON body limit, zod validation of the
environment, and a central error handler that never sends stack traces or internals to the client.

### Authentication

Details in [docs/auth.md](docs/auth.md). In short:

- `/api/auth`: `csrf`, `register` (always a CUSTOMER), `login`, `logout`, `logout-all`, `me`
  (GET/PATCH), `change-password`.
- Server-side sessions: a random 256-bit token in an `HttpOnly; SameSite=Lax` cookie
  (`__Host-` + `Secure` in production); only its SHA-256 hash is stored. 7-day sliding idle
  timeout, 30-day absolute lifetime, rotation on login/register/password change, hourly cleanup.
- CSRF: every state-changing request needs the `X-CSRF-Token` header (HMAC token bound to the
  session) and an allowed `Origin`/`Referer`.
- argon2id passwords (10-128 characters, no common passwords, not the email), generic login errors
  with similar timing, in-memory rate limits (single process; use a shared store with several
  instances), masked security logs.
- Authorization middleware `requireAuth`, `requireRole(...)`, `requireLocationAccess(...)` and a
  central database-error mapping (409/422/500) shared by all routes.

### Dependency audit

The audit is split in two:

- `npm run audit` (part of `verify`, `scripts/audit-gate.ts`) runs `npm audit --omit=dev` and fails
  on any high or critical advisory in **production** dependencies, except the documented exceptions
  below.
- `npm run audit:dev` runs the full audit including dev-only tooling and only reports. Review its
  findings when updating dependencies, but they do not block `verify`.

Why the gate needs exceptions: `@prisma/client` (a production dependency) declares the Prisma CLI as
an optional peer dependency, so npm counts the whole CLI tree as production-reachable (`devOptional`),
and `--omit=dev` alone still reports it. The CLI pins `mysql2` and `deepmerge-ts` versions with
high-severity advisories:

| Advisory              | Package        | Why it is accepted                                                     |
| --------------------- | -------------- | ---------------------------------------------------------------------- |
| `GHSA-ggr8-5vv4-36mx` | `deepmerge-ts` | Only used by the Prisma CLI to merge its own config files              |
| `GHSA-3f6p-5ww8-9rcr` | `mysql2`       | MySQL driver bundled with the Prisma CLI; Kinemax uses PostgreSQL only |

Each exception only applies to that package inside the Prisma CLI (`node_modules/prisma/` or
`node_modules/@prisma/config/`). Any other high/critical advisory, or the same package installed
anywhere else, still fails the gate. The gate prints exceptions that are no longer reported as
"stale" so they can be removed. We do not force other versions into the CLI with `overrides`; update
Prisma when a release with fixed versions is available. Never run `npm audit fix --force`.

### Install scripts

Dependency install scripts are restricted with npm's `allowScripts` policy (root `package.json`) and
`strict-allow-scripts=true` (`.npmrc`, needs npm 11.16 or newer). Only these may run install scripts:

| Entry                    | Why                                                                        |
| ------------------------ | -------------------------------------------------------------------------- |
| `@prisma/engines@7.10.0` | Downloads the Prisma schema engine needed by `prisma migrate`              |
| `prisma@7.10.0`          | Node version check only; denying it would also stop npm linking the CLI    |
| `esbuild@0.28.2`         | Verifies/installs the platform binary used by `tsx`                        |
| `argon2@0.45.1`          | argon2id password hashing; loads its prebuilt binary or builds it          |
| `fsevents` → `false`     | macOS-only optional dependency; ships a prebuilt binary, script not needed |

Entries are pinned, so upgrading one of these packages needs a new approval. Any other dependency
with install scripts makes `npm install`/`npm ci` fail before anything runs. Review it, then approve
it with `npm approve-scripts <pkg>` or deny it with `npm deny-scripts <pkg>`.

Older npm versions silently ignore `strict-allow-scripts`, so the root `package.json` requires
`"npm": ">=11.16.0"` in `engines`, and `engine-strict=true` (`.npmrc`) makes them refuse to install.
