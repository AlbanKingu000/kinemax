# Kinemax

Kinemax is a personal portfolio project: the website of a **fictional** premium cinema chain with
locations in several cities. The look will be a luxury dark theme in black and red.

This is the project foundation. The web app currently shows a placeholder home page with the API and
database health; locations, movies, schedules, seat booking, food & drinks, accounts, an admin panel
and demo payments come in later tasks. The site will be in Albanian (default) and English, with
prices in EUR.

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
- Node.js 22.22 or newer (an active LTS; developed with Node 24) and npm
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
create and drop its temporary shadow database, so no `SHADOW_DATABASE_URL` is needed.

## Quick start (Windows)

```powershell
git clone <repo> kinemax
cd kinemax
copy .env.example .env      # then put the kinemax role password into both URLs
npm install                 # also generates the Prisma client
npx playwright install chromium
npm run db:migrate          # apply migrations to the development database
npm run dev                 # http://localhost:5180
```

The API validates its environment at startup and exits with a clear list of problems if something is
missing or wrong.

## Environment variables

| Variable               | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`         | Development database (`kinemax`)                                           |
| `DATABASE_URL_TEST`    | Test database; the name must end in `_test` or tests refuse to run         |
| `HOST`, `PORT`         | API bind address (default `127.0.0.1:3001`)                                |
| `CORS_ALLOWED_ORIGINS` | Extra exact origins allowed cross-origin (default: none, no wildcard ever) |

`.env` is git-ignored; `.env.example` holds placeholders only.

## Scripts

| Script               | What it does                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `npm run dev`        | API (watch mode) and web dev server together                                             |
| `npm run db:migrate` | `prisma migrate dev` on the development database                                         |
| `npm run db:studio`  | Prisma Studio                                                                            |
| `npm run db:reset`   | Wipes and re-migrates the development database after you type its name; refuses `*_test` |
| `npm run lint`       | ESLint and Prettier check                                                                |
| `npm run format`     | Prettier write                                                                           |
| `npm run typecheck`  | TypeScript in every workspace                                                            |
| `npm test`           | Vitest in shared, api (incl. integration tests on `kinemax_test`) and web                |
| `npm run test:cov`   | Same with coverage, 80% minimum                                                          |
| `npm run build`      | Builds shared, api and web                                                               |
| `npm run e2e`        | Builds, then runs Playwright against the production builds and `kinemax_test`            |
| `npm run audit`      | `npm audit --audit-level=high`                                                           |
| `npm run verify`     | lint, typecheck, test:cov, build, e2e and audit                                          |

## Security baseline

helmet, no `x-powered-by`, strict CORS (no wildcard), a 100 kB JSON body limit, zod validation of the
environment, and a central error handler that never sends stack traces or internals to the client.

### Dependency audit note

`prisma@7.10.0` pins `mysql2` and `deepmerge-ts` versions with high-severity advisories. They are only
used by the Prisma CLI (dev dependency; `mysql2` is not used with PostgreSQL). The root `package.json`
`overrides` lift them to fixed versions (`mysql2@3.24.5`, `deepmerge-ts@8.0.2`), so `npm ls` reports
them as "invalid" (expected). Remove the overrides once Prisma ships fixed versions.
