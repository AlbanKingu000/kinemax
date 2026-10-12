# Kinemax roadmap

The single source of truth for project progress. Read it at the start of every session; when a
task is finished, move it to DONE with its commit hash.

## Done

| Task                                                                 | Commit(s)            |
| -------------------------------------------------------------------- | -------------------- |
| Project foundation (monorepo, native PostgreSQL 18, tooling, verify) | `fbaeb40`            |
| npm audit gate + install-script policy                               | `eda21e6`, `9e0348e` |
| Domain data model + demo seed (DB-level guarantees G0-G12)           | `711bd5e`            |
| Couple sofas = 2 tickets + 1 surcharge                               | `8febc2b`            |
| Session auth + roles + CSRF + rate limits + error mapping            | `a2d9c58`            |
| Stable KX SQLSTATEs for trigger errors                               | `07ad010`            |
| Brand (logo C, KX monogram) + design system + /styleguide            | `d57fe80`            |

## Next (in this order)

1. App shell + location picker + home page + public read API
2. Movie detail page + schedule page (by location/day, formats, language versions)
3. Seat selection: 3D interactive hall + "view from this seat" + seat holds (10 min) with
   stale-hold cleanup
4. Food & drinks ordering (optional; pickup at counter or seat delivery in VIP/Suite)
5. Demo payment + booking confirmation
6. My account: login/register UI, my tickets with QR code, cancellation (until 2h before)
7. Admin panel: super admin (prices, settings, users, all locations) + location managers (movies,
   showtimes, halls, bookings); deactivating a showtime must cancel/refund its bookings
8. Security review + full e2e pass
9. Push to a private GitHub repo (AlbanKingu000/kinemax)

## Known open points

- Flaky e2e `e2e/styleguide.spec.ts` "no axe violations": two full axe scans take 16-25 s
  against the 30 s test timeout, and `page.reload` sometimes fails with `net::ERR_ABORTED`
  (likely a Vite dev-server reload). It makes `npm run verify` fail intermittently; fix it as its
  own task before task 1.

- Stale HELD bookings need an automatic cleanup (task 3).
- Showtime deactivation with sold tickets (task 7).
- Rate limits need a shared store with multiple API instances (production).
- Email verification, password reset and 2FA are later work.
