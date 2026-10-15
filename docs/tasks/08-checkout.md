# Task 08: food & drinks, demo payment + confirmation, my tickets

Resume rule: read this file, continue from the first unchecked item, never redo a committed part,
tick items (with the file-editing tool) as they are finished.

## DECISIONS TO CONFIRM

(Taken without asking, with the safest reasonable option. Newest last.)

## Progress (keep up to date)

- Started 15 Oct 2026.

## Checklist

### Part A: Food & drinks (optional step)

- [ ] A1 GET /api/locations/:slug/menu (+ seat delivery for a showtime)
- [ ] A2 Migration: serve timing (BEFORE_SHOW / DURING_SHOW) for seat delivery, DB + domain rules
- [ ] A3 PUT /api/bookings/:id/food (owner, HELD, not expired; validation, server prices, total)
- [ ] A4 UI step "Ushqimi & pijet" (skip, tabs, cards with brand images, steppers, combos,
      pickup/seat delivery, serve timing, running total, countdown)
- [ ] A5 Tests (API, UI, e2e: combo with seat delivery in VIP; skip in Standard)
- [ ] Part A: verify + Chrome check + screenshots + roadmap + commit "feat: food and drinks
      ordering"

### Part B: Demo payment + confirmation

- [ ] B1 POST /api/bookings/:id/checkout (tickets set, age gate on the server, idempotent PENDING
      payment)
- [ ] B2 Demo payment page (DEMO label, no card fields, stylized fake card, pay/decline, summary,
      countdown)
- [ ] B3 POST /api/payments/:id/simulate (success: one transaction, exactly once; decline: retry;
      expired → 410)
- [ ] B4 Confirmation page /booking/:id/confirmed (ticket summary, code, QR "KINEMAX:<code>", .ics,
      link to Biletat e mia)
- [ ] B5 Tests (double-pay concurrency, expiry, age gate, tampering, idempotency, decline→retry,
      ownership, QR content; e2e full journey + decline then success)
- [ ] Part B: verify + Chrome check + screenshots + roadmap + commit "feat: demo payment and
      booking confirmation"

### Part C: My tickets, QR and cancellation

- [ ] C1 GET /api/me/bookings and GET /api/me/bookings/:code
- [ ] C2 /account/tickets ("Biletat e mia": tabs, cards, detail with large QR, brightness tip, .ics)
- [ ] C3 POST /api/bookings/:id/cancel (cutoff on the server, refund, seats released, audit log,
      confirmation dialog, disabled after the cutoff)
- [ ] C4 Tests (cutoff boundaries, time zone, double cancel, seats bookable again, ownership,
      audit; e2e confirmation → my tickets → cancel → "Të anuluara", seat free)
- [ ] Part C: verify + Chrome check + screenshots + roadmap + commit "feat: my tickets with QR codes
      and cancellation"

### Final

- [ ] Roadmap (DONE; next: the admin panel; out of scope: emails, real payment providers, staff QR
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
