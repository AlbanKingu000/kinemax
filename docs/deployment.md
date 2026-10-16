# Deployment checklist

Kinemax is not deployed; this is the checklist for doing it. Security background:
[security.md](security.md).

## Shape

One Node process (the API) serves both `/api` and the built web app (`WEB_DIST_DIR`), so the
browser talks to a single origin: no CORS, `SameSite=Lax` cookies and the CSRF Origin check work
as in development. Put a reverse proxy (nginx, Caddy, a platform load balancer) in front for HTTPS
and set `TRUST_PROXY=1`. Alternative: let the proxy serve `apps/web/dist` itself and forward only
`/api` to the API (leave `WEB_DIST_DIR` unset); then the proxy must send the same security headers
as `securityHeaders()` in `apps/api/src/app.ts` and the SPA fallback to `index.html`.

## Environment

| Variable          | Production value                                                                 |
| ----------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`        | `production` (enables the checks below, Secure `__Host-` cookies, HSTS)          |
| `DATABASE_URL`    | `postgresql://kinemax:…@host:5432/kinemax` (app role, never a superuser)         |
| `APP_ORIGIN`      | `https://your.domain` (required, must be https)                                  |
| `CSRF_SECRET`     | 32+ random characters (required), e.g. `openssl rand -base64 48`                 |
| `UPLOADS_DIR`     | persistent directory outside the app (required), e.g. `/var/lib/kinemax/uploads` |
| `WEB_DIST_DIR`    | `apps/web/dist` (or unset when the proxy serves the web app)                     |
| `TRUST_PROXY`     | number of proxies in front (usually `1`)                                         |
| `HOST` / `PORT`   | `127.0.0.1` / `3001` behind a local proxy                                        |
| `COOKIE_SECURE`   | leave unset (always true in production)                                          |
| `SEED_*_PASSWORD` | not used: never run the demo seed in production                                  |

The API refuses to start and names every missing or invalid variable (values are never printed).

## Steps

1. `npm ci` (the install-script allowlist in `package.json` applies), then `npm run audit`.
2. `npm run build` (shared → api → web).
3. Migrations: `npm run db:deploy -w @kinemax/api` (`prisma migrate deploy`; never `migrate dev` or `reset`).
4. Create the first super admin by hand (no seed in production) and store its password in a
   password manager.
5. Start: `node apps/api/dist/server.js` from the repository root, under a process manager
   (systemd, pm2, a container) that restarts it; `SIGTERM` shuts it down cleanly.
6. Check: `GET /api/health` answers `{"status":"ok","db":"up"}`; the home page, a booking up to the
   demo payment and `/admin` load; the response headers include the CSP and HSTS.

## HTTPS

- TLS terminates at the proxy (Let's Encrypt or the platform's certificate); redirect port 80 to 443. HSTS (1 year, includeSubDomains) is sent by the API once `NODE_ENV=production`.
- The proxy must pass `X-Forwarded-For` / `X-Forwarded-Proto` and keep the `Host` header.

## Uploads and backups

- `UPLOADS_DIR` holds the re-encoded posters, backdrops and menu images (random names). Keep it on
  persistent storage, back it up with the database, and never serve it directly from the proxy
  (the API adds `nosniff` and a sandbox CSP).
- PostgreSQL: daily `pg_dump -Fc` (or the provider's point-in-time recovery), kept off the server
  and encrypted; test a restore. Bookings, payments and the audit log live only there.

## Before going live for real

The production TODOs in [security.md](security.md#production-todos-known-not-done): a shared
rate-limit store for more than one instance, email verification and password reset, and a real
payment provider (payments are DEMO only).
