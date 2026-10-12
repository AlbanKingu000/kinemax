# Kinemax roadmap

The single source of truth for project progress. Read it at the start of every session; when a
task is finished, move it to DONE with its commit hash.

## Done

| Task                                                                 | Commit(s)                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| Project foundation (monorepo, native PostgreSQL 18, tooling, verify) | `fbaeb40`                                            |
| npm audit gate + install-script policy                               | `eda21e6`, `9e0348e`                                 |
| Domain data model + demo seed (DB-level guarantees G0-G12)           | `711bd5e`                                            |
| Couple sofas = 2 tickets + 1 surcharge                               | `8febc2b`                                            |
| Session auth + roles + CSRF + rate limits + error mapping            | `a2d9c58`                                            |
| Stable KX SQLSTATEs for trigger errors                               | `07ad010`                                            |
| Brand (logo C, KX monogram) + design system + /styleguide            | `d57fe80`                                            |
| App shell + location picker + home page + public read API            | `9bce45f`                                            |
| Movie detail page + schedule page + booking placeholder              | `3b42f27`                                            |
| Login, register and account UI (task 07 part A)                      | `feat: login, register and account UI` (this commit) |

## Next (in this order)

1. Seat selection (task 07 parts B and C, plan in docs/tasks/07-booking.md): 3D interactive hall + "view from this seat" + seat holds (10 min) with
   stale-hold cleanup
2. Food & drinks ordering (optional; pickup at counter or seat delivery in VIP/Suite)
3. Demo payment + booking confirmation
4. My account: my tickets with QR code, cancellation (until 2h before) (login, register and the
   account page are done)
5. Admin panel: super admin (prices, settings, users, all locations) + location managers (movies,
   showtimes, halls, bookings); deactivating a showtime must cancel/refund its bookings
6. Security review + full e2e pass
7. Push to a private GitHub repo (AlbanKingu000/kinemax)

## Known open points

- Stale HELD bookings need an automatic cleanup (task 1). Availability already ignores holds whose
  `holdExpiresAt` has passed.
- The booking placeholder (/booking/:showtimeId) becomes seat selection in task 1.
- Showtime deactivation with sold tickets (task 5).
- The featured movie is a fixed rule (most showtimes in the next 7 days); an admin choice comes with the admin panel (task 5).
- Seed movies have no trailer ids, so the trailer modal is only covered by unit tests.
- Rate limits need a shared store with multiple API instances (production).
- Email verification, password reset and 2FA are later work.
