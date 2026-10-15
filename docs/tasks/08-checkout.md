# Task 08: food & drinks, demo payment + confirmation, my tickets

Resume rule: read this file, continue from the first unchecked item, never redo a committed part,
tick items (with the file-editing tool) as they are finished.

## DECISIONS TO CONFIRM

(Taken without asking, with the safest reasonable option. Newest last.)

1. **A1, menu endpoint shape.** `GET /api/locations/:slug/menu?showtime=<id>` returns the items
   with their ids (the food PUT needs them), the cinema's price, category, texts, image and combo
   contents; `seatDelivery` is the hall type's `allowsSeatDelivery` for that show, `null` without
   `?showtime`. A showtime of another cinema answers 404. Public, cached 60 s like the catalog.
2. **A2, where the rules live.** The serve-timing rule is enforced three times: the request schema
   (400 `validation_failed`), the domain (`serveTimingFor`, 422) and a database CHECK (G13, new
   migration `food_serve_timing`; existing seat deliveries, none in the seed, are backfilled to
   "before the show"). "Seat delivery only where the hall type allows it" stays in the domain only:
   a database trigger for it would need a new `KX` code and is not asked for.
3. **A3, names.** A food line keeps the existing Albanian name snapshot; the English name is read
   from the menu item (no new snapshot column). Each item appears once per fulfillment in an order.
4. **A4, one choice per order.** The UI asks "Merre në banak / Na e sjellim te ulësja" (and the
   serve time) once for the whole order; the API accepts it per line. Quantity changes are saved
   350 ms after the last click; leaving the step waits for that save. "Kalo këtë hap" removes an
   order already chosen.
5. **A4, VIP dishes.** VIP dishes are offered wherever the cinema lists them (counter pickup in
   other halls), so their seed description "Shërbehet në vend / Served at your seat" (wrong there)
   became "Përgatitet në çast / Freshly prepared".
6. **A4, illustrations.** The 19 item images are original flat SVG illustrations in the brand
   palette, drawn by `apps/api/prisma/seed/menu-art.ts`, written by the seed to
   `apps/web/public/seed/menu/` and committed (a test keeps the files identical to the generator).
   They are decorative (`alt=""`): each card's name is its heading.
7. **A4, structure.** "Vazhdo" on "Biletat" now opens `/booking/:showtimeId/food`; the hold loader,
   countdown and "time is up" view moved from the tickets step to `booking/hold.tsx`, shared by
   both steps. New design-system component `QuantityStepper` (shown on /styleguide).
8. **A5, e2e accounts.** The checkout journeys get their own fixed test account per Playwright
   project (`e2e-bleresi…@kinemax.test`, test database only), run one after the other
   (`checkout.spec.ts`, serial) and book shows no other spec uses; the e2e catalog now includes the
   menu (the seed's menu code is shared).

9. **B1, checkout.** `POST /api/bookings/:id/checkout` (no body) answers 200 with the payment and
   the booking. "Tickets set" means the booking has its tickets (every seat carries exactly its
   tickets, guaranteed by G12) or is a suite. A 15+/18+ booking without the age confirmation
   answers 422. Calling it again reuses the open (PENDING) payment and keeps its amount equal to
   the booking's current server total, so there is never more than one open payment.
10. **B3, payment rules.** `POST /api/payments/:id/simulate` locks the payment and its booking, so
    parallel calls run one after the other: the first success confirms, later ones answer 200 with
    the same result. A declined (FAILED) payment cannot succeed later (409); paying again opens a
    new payment through checkout (the page does this by itself). If the total changed after the
    payment was opened (food edited), paying the old amount answers 409. Paying after the hold
    expired closes the payment as FAILED and answers 410, also when only the database clock knows
    (the status trigger's KX002 is mapped to 410 here). Rate limits: 30 per user and 120 per IP per
    10 minutes (in memory, like the others; `docs/auth.md`).
11. **B4, the ticket.** New `GET /api/bookings/:id/ticket` (owner only, bookings that were
    confirmed; 404 otherwise) feeds the confirmation page and part C. QR library:
    **`qrcode.react` 4.2.0** (ISC, by zpao, the most used React QR component; no dependencies at
    all, no install/prepare scripts, released Dec 2024), drawing an SVG of `KINEMAX:<code>` only;
    it uses `currentColor` so the colors come from the tokens (near-black on ivory, high contrast for
    scanners). "Shto në kalendar" builds an RFC 5545 `.ics` file in the browser (UTC times, escaped
    and folded lines); no server endpoint. Until part C the "Biletat e mia" link opens `/account`.
12. **B2, nothing to type.** The payment step has no input of any kind (asserted by a unit test and
    the e2e); the card is a picture (`role="img"`, "Karta demo 4242 •••• •••• 4242"), the DEMO
    notice is a warning banner. Routes: `/booking/:showtimeId/pay` and
    `/booking/:bookingId/confirmed`.

13. **Web unit test timeout 15 s.** The full-app web tests (router, several steps that may each
    wait up to 5 s, `STEP_WAIT`) ran into Vitest's default 5 s limit for the whole test under
    coverage once the suite grew, while another program kept ~3.5 of 8 cores busy (a renderer of
    the owner's own Chrome, left untouched). The web Vitest config now allows 15 s per test, like
    the styleguide and routes tests already did; no assertion changed.

14. **e2e and the login rate limit.** With the new journeys a full e2e run made more than 20 logins
    from 127.0.0.1 within 15 minutes, so the last spec (hold expiry) got 429 "Shumë përpjekje".
    The limit stays as it is; instead the checkout journeys sign in once per project through the
    API (`/api/auth/csrf` + `/api/auth/login`, kept as Playwright storage state in the project's
    output folder). Only the full journey signs in through the login page. All checkout tests use
    the same fixture (`signedIn`): a test with other worker fixtures gets a worker of its own and
    ran beside the serial ones as the same user, so its new hold ended the other one (409).

15. **C1, the lists.** `GET /api/me/bookings` lists only bookings that were ever confirmed (open
    holds and expired holds are not tickets). Upcoming = CONFIRMED and not yet ended (`endsAt`, so
    a film that is running stays upcoming); past = CONFIRMED and ended, newest first; cancelled =
    CANCELLED/REFUNDED, by `cancelledAt` newest first. `GET /api/me/bookings/:code` answers 404
    for a malformed code, an unknown one and another user's (same answer). Both `no-store`.

16. **C3, cancellation rules.** `POST /api/bookings/:id/cancel` (owner, CSRF, no body): allowed
    while the server clock is before `startsAt − AppSettings.cancellationCutoffMinutes` (120: at
    exactly 120 minutes yes, at 119 no). After the cutoff 409 (the UI already disables the button
    and says why); a booking that is not CONFIRMED 409; an already REFUNDED one answers 200 with
    the same ticket (idempotent, one audit row even for parallel requests, the booking row is
    locked). The full total (tickets + food) is refunded: payment SUCCEEDED → REFUNDED, booking →
    REFUNDED (the trigger frees the seats), AuditLog `booking.refund` with the owner as actor.
    Rate limit 10 per user / 60 per IP per 10 minutes (docs/auth.md).

17. **C2, a cancelled ticket.** A refunded ticket keeps its page (status badge, refund line) but
    shows no QR code, so it cannot be shown at the door. The cut-off time is shown in the
    cinema's time zone. "Biletat e mia" is a new item in the account menu and the mobile drawer;
    the account page links to it.

18. **e2e show choice.** `findShowtime` skips shows that start within 30 minutes (one that starts
    mid-journey ends the hold, 410), and the cancellation journey picks a show at least 3 hours
    away so it is before the cutoff.

## Progress (keep up to date)

- Started 15 Oct 2026.
- Part A: done. New tests: API 14 integration (menu, food PUT, G13) + domain + seed art; shared 4;
  web 6 (food step) + 2 (stepper); e2e 2 journeys × 2 projects (`checkout.spec.ts`). `npm run
verify` green (shared 24, api 285, web 363, scripts 10; coverage web 92.23% / 83.13%; e2e 61
  passed, 4 project skips). A first verify run failed only because screenshot runs loaded the
  machine at the same time (7 web timeouts) plus one real stale fixture in the shared booking test
  (fixed). Chrome check (Claude in Chrome, dev server, seed customer): VIP show → 2D seat →
  tickets → food → seat delivery during the film + Kombo klasike → saved on the server at the
  Prizren price (4,80 €), reload resumes it, no overflow, console clean. 390 px and screenshots
  with the Playwright script in installed Chrome (console clean, no overflow):
  `checkout-food-vip_recliner-{desktop,mobile-390}.png`,
  `checkout-food-order-vip_recliner-{desktop,mobile-390}.png`, `checkout-food-standard-desktop.png`.
  Committed as "feat: food and drinks ordering" (hash in docs/roadmap.md).
- Part B: done. New dependency `qrcode.react` 4.2.0 (decision 11). New tests: API 13 checkout
  integration (idempotent checkout, server age gate, expiry 410 incl. the database clock, six
  parallel pays confirm once, decline → new payment → success, tampering, ownership, rate limit,
  ticket view); shared 2; web 6 payment/confirmation (no inputs, QR value `KINEMAX:<code>`,
  `.ics`), 3 `.ics`; e2e 2 journeys × 2 projects (home → … → QR ticket with the `.ics` file;
  decline then success). `npm run verify` green (shared 26, api 298, web 373, scripts 10; coverage
  web 92.21% / 82.86%; e2e 65 passed, 4 project skips) after decisions 13 and 14. Chrome check
  (Claude in Chrome, dev server, seed customer): VIP show → seat → tickets → food (popcorn) → the
  payment step (DEMO banner, no inputs, 12,30 €) → "Simulo refuzim" (still HELD) → "Paguaj
  (demo)" → confirmation with QR, grouped code, food line; reload: console clean, no overflow.
  Screenshots (Playwright, installed Chrome, console clean): `checkout-pay-{desktop,mobile-390}.png`,
  `checkout-pay-declined-{desktop,mobile-390}.png`, `checkout-confirmation-{desktop,mobile-390}.png`.
  Committed as "feat: demo payment and booking confirmation" (hash in docs/roadmap.md).
- Part C: done. New tests: API 9 integration (lists by tab, by code, the cutoff at exactly 120
  and 119 minutes, another time zone and cutoff, parallel double cancel = one refund and one
  audit row, the seat bookable again, 404/409/400/403/429); web 6 (tabs and cards, empty state,
  large QR + brightness tip, cancel dialog with the refund first, disabled after the cutoff,
  unknown code); e2e 1 journey × 2 projects (confirmation → "Biletat e mia" → ticket → cancel →
  "Të anuluara", the seat AVAILABLE again). `npm run verify` green (shared 26, api 307, web 379,
  scripts 10; coverage api 96.42% / 87.54%, web 92.13% / 82.70%; e2e 67 passed, 4 project skips;
  audit passed) after the e2e worker fix in decision 14. Chrome check (Claude in Chrome, dev
  server, seed customer): "Biletat e mia" with 3 upcoming → ticket (264 px QR, tip, "Mund ta
  anulosh deri më …") → dialog "Do të rimbursohen 21,30 € (demo)" → refunded, no QR, listed
  under "Të anuluara"; console clean. That window ignores resizing, so 390 px and the
  screenshots come from the Playwright script in installed Chrome (console clean, no overflow):
  `checkout-my-tickets-{desktop,mobile-390}.png`, `checkout-ticket-detail-{desktop,mobile-390}.png`,
  `checkout-cancel-dialog-{desktop,mobile-390}.png`,
  `checkout-ticket-refunded-{desktop,mobile-390}.png`,
  `checkout-my-tickets-cancelled-{desktop,mobile-390}.png`. Committed as "feat: my tickets with
  QR codes and cancellation" (hash in docs/roadmap.md).

## Checklist

### Part A: Food & drinks (optional step)

- [x] A1 GET /api/locations/:slug/menu (+ seat delivery for a showtime)
- [x] A2 Migration: serve timing (BEFORE_SHOW / DURING_SHOW) for seat delivery, DB + domain rules
- [x] A3 PUT /api/bookings/:id/food (owner, HELD, not expired; validation, server prices, total)
- [x] A4 UI step "Ushqimi & pijet" (skip, tabs, cards with brand images, steppers, combos,
      pickup/seat delivery, serve timing, running total, countdown)
- [x] A5 Tests (API, UI, e2e: combo with seat delivery in VIP; skip in Standard)
- [x] Part A: verify + Chrome check + screenshots + roadmap + commit "feat: food and drinks
      ordering"

### Part B: Demo payment + confirmation

- [x] B1 POST /api/bookings/:id/checkout (tickets set, age gate on the server, idempotent PENDING
      payment)
- [x] B2 Demo payment page (DEMO label, no card fields, stylized fake card, pay/decline, summary,
      countdown)
- [x] B3 POST /api/payments/:id/simulate (success: one transaction, exactly once; decline: retry;
      expired → 410)
- [x] B4 Confirmation page /booking/:id/confirmed (ticket summary, code, QR "KINEMAX:<code>", .ics,
      link to Biletat e mia)
- [x] B5 Tests (double-pay concurrency, expiry, age gate, tampering, idempotency, decline→retry,
      ownership, QR content; e2e full journey + decline then success)
- [x] Part B: verify + Chrome check + screenshots + roadmap + commit "feat: demo payment and
      booking confirmation"

### Part C: My tickets, QR and cancellation

- [x] C1 GET /api/me/bookings and GET /api/me/bookings/:code
- [x] C2 /account/tickets ("Biletat e mia": tabs, cards, detail with large QR, brightness tip, .ics)
- [x] C3 POST /api/bookings/:id/cancel (cutoff on the server, refund, seats released, audit log,
      confirmation dialog, disabled after the cutoff)
- [x] C4 Tests (cutoff boundaries, time zone, double cancel, seats bookable again, ownership,
      audit; e2e confirmation → my tickets → cancel → "Të anuluara", seat free)
- [x] Part C: verify + Chrome check + screenshots + roadmap + commit "feat: my tickets with QR codes
      and cancellation"

### Final

- [x] Roadmap (DONE; next: the admin panel; out of scope: emails, real payment providers, staff QR
      scanning), every box ticked, final report

## The task (as given)

Task 8: food & drinks, demo payment + confirmation, and "My tickets" with QR and cancellation.
Three parts (A, B, C).

STEP 0: Read CLAUDE.md, docs/roadmap.md, docs/data-model.md, docs/auth.md and
docs/tasks/07-booking.md. Save this whole prompt as docs/tasks/08-checkout.md with a checklist (one
checkbox per numbered item, plus "verify + Chrome check + screenshots + commit" per part). Commit
it: "docs: plan for checkout task". Whenever you resume, read that file and continue from the first
unchecked item. Tick items with the file-editing tool (not shell commands) as you finish them.

WORKING RULES: work autonomously. When a decision would normally need me, take the safest option
and record it under "DECISIONS TO CONFIRM" at the top of the task file. Never do anything
destructive. After EACH part: npm run verify passes, real Chrome check (desktop + ~390px, console
clean), screenshots into C:\Users\albanme\Desktop\kinemax-screenshots\ with the prefix "checkout-",
update docs/roadmap.md, commit that part on its own. Security rules from CLAUDE.md apply strictly:
the client never sends prices, every write needs auth + CSRF + ownership checks, other users'
bookings → 404.

══════════ PART A: Food & drinks (optional step) ══════════

A1. GET /api/locations/:slug/menu (public): items available at that cinema with their location
price, category, descriptions sq/en, image path, combos with their components. Also say whether
seat delivery is possible for a given showtime (hall type allowsSeatDelivery).

A2. New migration (never edit committed ones): add a serve-timing field for seat delivery:
BEFORE_SHOW or DURING_SHOW (served ~20 min after the start). Required for DELIVER_TO_SEAT, null for
PICKUP_AT_COUNTER. Enforce it in the DB where possible plus domain logic.

A3. PUT /api/bookings/:id/food (owner, HELD, not expired): replaces the food list [{menuItemId,
quantity, fulfillment, serveTiming?}]. Validate: the item is available at the showtime's cinema,
quantity 1-20 per item and at most 40 items in total, DELIVER_TO_SEAT only in halls whose type
allows it. The server writes the price snapshots and recalculates the booking total (tickets +
food). An empty list is valid (food is optional).

A4. UI step "Ushqimi & pijet" after "Biletat": a prominent "Kalo këtë hap" (skip) button; category
tabs (Popcorn, Pije, Snacks, Nachos, Hot dog, VIP, Kombo); elegant item cards with images generated
in our brand style (original abstract illustrations, no stock or real brand photos); quantity
steppers; combos list their contents; for VIP/Suite halls a choice "Merre në banak" / "Na e sjellim
te ulësja", and for seat delivery "Para filmit" / "Gjatë filmit (rreth 20 min pas fillimit)". A
running total, the hold countdown still visible, and the menu matches the cinema.

A5. Tests: API (availability per cinema, seat-delivery rules, serve timing required, quantity
limits, server prices, ownership 404, expired hold 410) + UI + e2e (add a combo with seat delivery
in a VIP hall; skip food in a Standard hall).

Commit: "feat: food and drinks ordering"

══════════ PART B: Demo payment + confirmation ══════════

B1. POST /api/bookings/:id/checkout (owner, CSRF, HELD, not expired): requires tickets set; for
15+/18+ films REQUIRES ageRatingConfirmed (enforced on the SERVER now; this was the open point from
task 7). Creates a DemoPayment PENDING with the server-calculated total. Calling it again reuses the
open payment (idempotent).

B2. Demo payment page: clearly labeled "DEMO – nuk kryhet asnjë pagesë reale". SECURITY: NO
free-text card number, expiry or CVC fields at all (nobody should ever type a real card here). Show
a stylized demo card (fixed fake "4242 •••• •••• 4242") plus buttons "Paguaj (demo)" and "Simulo
refuzim". Show the order summary (tickets, food, total) and the countdown.

B3. POST /api/payments/:id/simulate {outcome: "success" | "decline"} (owner, CSRF, rate-limited):
success → in ONE transaction payment SUCCEEDED + booking CONFIRMED (the DB trigger still refuses an
expired hold) + confirmedAt. Idempotent: double clicks or parallel calls confirm exactly once.
decline → payment FAILED, the booking stays HELD so the user can retry until the hold expires.
Paying after expiry → 410, nothing confirmed.

B4. Confirmation page /booking/:id/confirmed: an elegant ticket-style summary (movie, cinema, hall,
local date/time, seats with categories, food with serve choice, total), the booking code, and a QR
code. The QR encodes ONLY "KINEMAX:<booking code>" (no personal data). Use a well-known QR library
(explain it, check it has no install script). An "Shto në kalendar" .ics download. A link to
"Biletat e mia".

B5. Tests: double-pay concurrency (exactly one confirmation), pay after expiry, the age gate on the
server, amount tampering impossible, idempotency, decline then retry success, ownership 404, QR
content. e2e: the full journey home → movie → time → seats → login → tickets → food → pay →
confirmation with QR, plus the decline-then-success path.

Commit: "feat: demo payment and booking confirmation"

══════════ PART C: My tickets, QR and cancellation ══════════

C1. GET /api/me/bookings (owner only): upcoming, past and cancelled/refunded, with everything the
cards need. GET /api/me/bookings/:code for one booking.

C2. /account/tickets ("Biletat e mia", also linked from /account and the header account menu):
tabs "Të ardhshme / Të kaluara / Të anuluara"; ticket cards; a detail view with a large QR, a "rrit
ndriçimin e ekranit" tip and the .ics download.

C3. POST /api/bookings/:id/cancel (owner, CSRF, rate-limited): allowed only until
AppSettings.cancellationCutoffMinutes (120) before the start, computed on the server. CONFIRMED →
refund: the demo payment REFUNDED and the booking REFUNDED (respect the existing status machine),
seats released by the trigger, an AuditLog entry. A confirmation dialog shows the refund amount
first. After the cutoff the button is disabled with a clear explanation.

C4. Tests: cutoff boundaries (exactly 120 min, 119 min, time zone), double cancel idempotent, seats
bookable again after cancel, ownership 404, audit entry. e2e: confirmation → my tickets → cancel →
appears under "Të anuluara" and the seat is free again.

Commit: "feat: my tickets with QR codes and cancellation"

FINAL: update docs/roadmap.md (move these items to DONE; next: the admin panel), tick every
checkbox, and end with a short report: what was built per part, new dependencies, DECISIONS TO
CONFIRM, test counts, verify results, screenshot names. Out of scope (note in the roadmap): sending
emails, real payment providers, staff QR scanning (comes with the admin panel).
