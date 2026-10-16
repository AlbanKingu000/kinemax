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
| Admin dashboard: sales and occupancy stats (task 9 part B)           | `004687b`            |
| Admin movies + secure poster/backdrop upload (task 9 part C)         | `9ac116d`            |
| Admin showtimes; deactivation cancels + refunds (task 9 part D)      | `506531d`            |
| Admin hall and seat editor with 3D preview (task 9 part E)           | `383af31`            |
| Sold shows locked, WebP re-encoding, occupancy precision (task 10/0) | `0fbf826`            |
| Admin prices (versioned) and settings (task 10 part A)               | `b16b495`            |
| Admin food management and seat-delivery list (task 10 part B)        | `d317819`            |
| QR ticket check-in at the entrance (task 10 part C)                  | `4d6d1e6`            |
| Admin users and audit log (task 10 part D)                           | `e48cf2a`            |
| Security review, route inventory test, strict CSP (task 11)          | `56a9a3b`            |
| Production readiness: API serves the web build (task 11)             | `a0b7e51`            |
| Cleanup, dev database reset, portfolio README, v1.0.0 (task 11)      | `a7b27cb`, `0729733` |
| Public repo prep, no source maps, CSP eval fix (task 12)             | `305aa31`            |

## Next

Nothing planned: v1.0.0 (tag `v1.0.0`) is the portfolio release. Production TODOs are listed in
[security.md](security.md#production-todos-known-not-done).

## Future ideas

- Email: booking confirmations with the ticket, email verification, password reset, 2FA for staff.
- A real payment provider (hosted fields, signed webhooks, idempotency keys).
- A shared store (Redis or a table) for rate limits and holds, for more than one API instance.
- Notify customers when a booked show is deactivated.
- Admin choice of the featured movie; per-cinema time zones in reports and the audit log.
- Loyalty points, gift cards and promo codes.
- Trailer ids for the seed movies; an opening 3D view from the middle of the hall.
- A CSP report endpoint and error monitoring in production.

## Known open points

- The 3D opening view comes from the front, so the whole Kinemax Grand screen is only seen from
  the seats or by orbiting (task 7d decision 1, to confirm). In its middle rows (H-K) the seat
  backs in front sit at the seat-view panel's edge (task 7e decision 4).

- Seat holds and their rate limits live in one API process: the cleanup job is safe with several
  processes, the in-memory hold rate limits are not (production needs a shared store).
- The featured movie is a fixed rule (most showtimes in the next 7 days); an admin choice comes with the admin panel (task 5).
- Seed movies have no trailer ids, so the trailer modal is only covered by unit tests.
- Audit-log date filters and the dashboard use one time zone (Europe/Belgrade); cinemas in
  other zones would need per-cinema days.
- Customers are not told when a show they booked is deactivated (refunded automatically; emails
  are out of scope).
- Rate limits need a shared store with multiple API instances (production).
- Email verification, password reset and 2FA are later work.
