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
| App shell + location picker + home page + public read API            | `9bce45f`            |
| Movie detail page + schedule page + booking placeholder              | `3b42f27`            |
| Login, register and account UI (task 07 part A)                      | `df22271`            |
| 3D + 2D seat selection with view from seat (task 07 part B)          | `d82cf0c`            |
| Seat holds, ticket categories, server-side prices (task 07 part C)   | `c7ecc24`            |
| Cinematic 3D hall + locked seat view (task 7d)                       | `a3e0401`            |
| 3D fixes: auto-hiding seat panel, framing, flight path, VIP (7e)     | `3b886a8`            |
| Food & drinks ordering (task 8 part A)                               | `e490b4e`            |
| Demo payment + booking confirmation with QR (task 8 part B)          | `0affa34`            |
| My tickets with QR codes + cancellation with refund (task 8 part C)  | `1b1f76e`            |
| Admin shell + access control (task 9 part A)                         | `df5c1de`            |
| Admin dashboard: sales and occupancy stats (task 9 part B)           | this commit          |

## Next (in this order)

1. Admin panel: super admin (prices, settings, users, all locations) + location managers (movies,
   showtimes, halls, bookings); deactivating a showtime must cancel/refund its bookings
2. Security review + full e2e pass
3. Push to a private GitHub repo (AlbanKingu000/kinemax)

Out of scope for now (task 8): sending emails (confirmations, tickets), real payment providers
(payments stay DEMO), and QR scanning by staff at the entrance.

## Known open points

- The 3D opening view comes from the front, so the whole Kinemax Grand screen is only seen from
  the seats or by orbiting (task 7d decision 1, to confirm). In its middle rows (H-K) the seat
  backs in front sit at the seat-view panel's edge (task 7e decision 4).

- Seat holds and their rate limits live in one API process: the cleanup job is safe with several
  processes, the in-memory hold rate limits are not (production needs a shared store).
- Showtime deactivation with sold tickets (task 5).
- The featured movie is a fixed rule (most showtimes in the next 7 days); an admin choice comes with the admin panel (task 5).
- Seed movies have no trailer ids, so the trailer modal is only covered by unit tests.
- Rate limits need a shared store with multiple API instances (production).
- Email verification, password reset and 2FA are later work.
