# Task 07: booking (login/account UI, seat selection, seat holds)

Resume rule: read this file, continue from the first unchecked item, never redo a committed part,
tick items as they are finished.

## DECISIONS TO CONFIRM

(Decisions taken without asking, with the safest reasonable option. Newest last. "Confirmed" =
accepted by the owner on 12 Oct 2026: decisions 1, 2, 5, 6, 7, 8 and 9 below, numbered 1-7 in the
owner's message. Decision 10 was taken after that and still needs confirmation; it keeps
`@types/three` 0.186.0 but replaces the confirmed runtime version of decision 6.)

1. **A1, CSRF error code. Confirmed.** The API answered every CSRF failure with 403 `forbidden`,
   so the client could not tell a stale token from a real "not allowed". A failed token check now
   answers 403 `csrf_invalid` (a failed Origin check stays `forbidden`). The client retries once
   only on `csrf_invalid`. It reveals nothing a caller without a valid token does not already know.
2. **A1, session endpoint. Confirmed.** `GET /api/auth/me` answers 401 for visitors, and browsers
   log every 401 as a console error on each page load. The web app now loads the user from a new
   `GET /api/auth/session` (200 with `{ user }` or `{ user: null }`, `no-store`). `/me` keeps its
   401 contract. It returns exactly what /me returns for the same session.
3. **A2, password field.** (Part of the reported Part A implementation, not listed separately.)
   The show/hide toggle is a separate button with `aria-pressed`; the field turns off
   autocapitalize/autocorrect/spellcheck. Pasting stays allowed.
4. **A6, language saving.** (Part of the reported Part A implementation, not listed separately.)
   Changes are saved 800 ms after the last click (one PATCH for several clicks); failures are
   silent, the UI keeps the chosen language.
5. **A8, e2e timeouts. Confirmed.** The full auth journey (register, 3 logins, password change:
   argon2 on every step, plus 3 axe scans) and the styleguide axe test (the styleguide grew a lot)
   get 60 s instead of 30 s, each with a comment. To stay under the register rate limit (5 per
   hour per IP for the whole run), the foreign `?next=` checks run inside the same journey.
6. **B3, three.js version. Confirmed.** three 0.186.0 instead of 0.180, so that only one copy of
   `@types/three` is installed: drei's dependency `maath` ships `@types/three@0.186.0` as a real
   dependency, and two copies broke the types.
7. **B5, 2D map markup. Confirmed.** The 2D map is real HTML buttons placed on a scaled top-down
   layout (with a CSS screen arc) instead of SVG shapes: native focus, Enter/Space and screen
   reader behaviour without ARIA workarounds. The layout comes from the same x/y.
8. **B3/B4, clicking in 3D. Confirmed.** A click on a seat in 3D opens the view from that seat;
   choosing or removing it happens in the overlay ("Zgjidh këtë ulëse" / "Hiqe"), so orbiting the
   hall can never select a seat by accident.
9. **B1, 410 code. Confirmed.** A new API error code `gone` (410) for shows that already started.
10. **B3, three.js runtime 0.182.0 (replaces the version part of decision 6).** three r183+
    prints a console warning ("THREE.Clock … deprecated") because @react-three/fiber 9.8.1 (the
    latest) still uses `THREE.Clock`, which breaks the clean-console rule. three is therefore
    0.182.0, forced as the only copy with a root `package.json` `overrides` entry (drei's
    dependencies had pulled in 0.186 and stats-gl even 0.170: several three runtimes in one bundle
    would break the 3D view). `@types/three` stays 0.186.0, the single copy maath requires; the
    0.182 API we use is the same. Audit unchanged (only the documented Prisma CLI exceptions).
11. **B9, e2e console filter.** In the booking e2e, Chromium's own GL driver diagnostics ("GL Driver
    Message … GPU stall due to ReadPixels", printed by the headless software renderer) are ignored
    by the console check; every other warning or error still fails the test. The same filter is
    now in `e2e/movie-schedule.spec.ts`, whose journey ends on the booking page.
12. **B3/B6, suites in 3D.** The suite page showed only the "Rezervo gjithë suitën" card, so the
    Suite 3D view and view-from-seat could not exist. Suites now show the 3D room too (3D/2D
    toggle; 2D shows only the card, no seat map). It is for looking only: the view-from-seat
    overlay has no "Zgjidh këtë ulëse" for suites; booking stays whole-hall.
13. **B8/B9, schedule filter e2e on phones.** The two existing desktop tests for the inline filter
    chips (URL/share/reload/back, keyboard) cannot run below 768px, where the chips now live in the
    bottom sheet. They are skipped on the mobile project only, and a new phone test covers the same
    ground through the sheet (Esc without applying + focus return, keyboard chips, Apliko → URL,
    shared link, reload, Pastro). The old small sheet test in booking.spec moved into it.
14. **Part B Chrome check method.** The Claude-in-Chrome window kept reporting
    `visibilityState: hidden` (rAF paused), so FPS could not be measured there. The interactive
    check (3D, click seat → view from seat → select in overlay → panel) was done with Claude in
    Chrome; screenshots, FPS and draw calls were taken by a Playwright script driving the installed
    Google Chrome (`channel: 'chrome'`, headed, GPU) against the dev server.

## Progress (keep up to date)

- Part A: done, committed `df22271`.
- Part B: done, committed as "feat: 3D and 2D seat selection with view from seat" (hash in
  docs/roadmap.md). verify green (e2e 50 passed, 4 project-specific skips). Chrome check found
  and fixed: Grand's curved screen sat behind the front wall (only its edges showed); the 3D
  overview cropped the screen and was too dark; "Salla Salla 1 në 3D" label; the wheelchair marker
  was a blue system emoji (now a `wheelchair` design-system icon); suites had no 3D (decision
  12); the 2D seat map and the `sheet` Modal variant were missing from /styleguide (added).
  Measured in Chrome: 56-58 FPS during camera flights, draw calls Standard 36, VIP 52, Grand 40,
  Suite 26; 3D chunk 917 kB (247 kB gzip); console clean; no horizontal overflow at 390 px.
  Screenshots: `booking-3d-*-desktop.png`, `booking-view-from-seat-*-desktop.png`,
  `booking-2d-mobile-390*.png`, `schedule-filter-sheet-mobile-390.png`.
- Part C: not started.

## Checklist

### Part A: Login, register and account UI

- [x] A1 Auth client (provider, shared fetch wrapper with CSRF, retry once on CSRF 403, 429)
- [x] A2 /login and /register forms
- [x] A3 Safe `?next=` handling
- [x] A4 /account (protected)
- [x] A5 Header and drawer account menu
- [x] A6 preferredLocale after login, save SQ/EN changes (debounced, silent)
- [x] A7 Accessibility (error summary, aria-describedby, aria-live, no double submit)
- [x] A8 Tests (unit + e2e + axe)
- [x] Part A: verify + Chrome check + screenshots + commit

### Part B: 3D + 2D seat selection with "view from this seat"

- [x] B1 API GET /api/showtimes/:id/seatmap
- [x] B2 /booking/:showtimeId layout (summary, 3D/2D toggle, side panel / bottom sheet, polling)
- [x] B3 3D hall (three.js, @react-three/fiber, @react-three/drei, lazy chunk)
- [x] B4 View from this seat
- [x] B5 2D SVG map (keyboard + screen reader)
- [x] B6 Client rules (max 10, suites, wheelchair note, sessionStorage)
- [x] B7 "Vazhdo" (login redirect keeps the selection)
- [x] B8 Schedule page mobile filter sheet
- [x] B9 Tests (API, web, e2e, axe)
  - [x] B9.0 API seatmap tests
  - [x] B9a Web tests (BookingPage rewrite, rules, sessionStorage, polling pause, WebGL fallback)
  - [x] B9b Fixed test-only e2e account (kinemax_test only)
  - [x] B9c Booking e2e spec
  - [x] B9d Selected-seat contrast pair
- [x] Part B: verify + Chrome check + screenshots + commit

### Part C: Seat holds (10 min), ticket categories, server-side prices

- [ ] C1 POST /api/bookings/hold
- [ ] C2 GET /api/bookings/:id
- [ ] C3 PUT /api/bookings/:id/tickets
- [ ] C4 DELETE /api/bookings/:id/hold
- [ ] C5 Background cleanup of stale holds
- [ ] C6 Age confirmation
- [ ] C7 UI step "Biletat" (countdown, categories, totals, resume)
- [ ] C8 Tests (concurrency, ownership, prices, expiry, e2e)
- [ ] Part C: verify + Chrome check + screenshots + commit

### Final

- [ ] Roadmap updated (DONE with hashes; next: food & drinks, then demo payment), all boxes ticked,
      final report

## The task (as given)

This is a large task in three parts (A, B, C). Work through them in order, AUTONOMOUSLY, so the
work survives interruptions such as usage-limit pauses or a new session.

STEP 0 (do this first):

- Read docs/roadmap.md, docs/data-model.md and docs/auth.md.
- Save this whole prompt as docs/tasks/07-booking.md, with a checklist: one checkbox per numbered
  item in each part, plus "verify + Chrome check + screenshots + commit" at the end of each part.
  Commit it: "docs: plan for booking task".
- Whenever you resume (after a pause, an error or in a new session), read docs/tasks/07-booking.md
  and continue from the first unchecked item. Never redo a committed part. Tick items as you finish
  them.

WORKING RULES FOR THIS TASK

- Don't stop to ask me. If you hit a decision that would normally need me (a visible design
  decision beyond this spec, a security trade-off, anything destructive or irreversible), take the
  SAFEST reasonable option, write it in a "DECISIONS TO CONFIRM" section at the top of
  docs/tasks/07-booking.md, and continue. Never do anything destructive (deleting data, resetting
  databases other than kinemax_test, force operations) without me.
- After EACH part: npm run verify must pass, then the real Chrome check (desktop + ~390px, console
  clean), screenshots into C:\Users\albanme\Desktop\kinemax-screenshots\, update docs/roadmap.md,
  and commit that part on its own.
- Design: premium dark, black + deep crimson, design-system components only. Security: CLAUDE.md
  rules strictly.

PART A: Login, register and account UI

- A1. Auth client: an auth provider that loads GET /api/auth/me and exposes
  user/login/register/logout/logoutAll/updateMe/changePassword. CSRF token in memory only, sent as
  X-CSRF-Token by ONE shared fetch wrapper on every POST/PUT/PATCH/DELETE. Use the fresh token
  returned after login/register/change-password. On a 403 caused by a missing/expired CSRF token,
  refetch it and retry ONCE. Generic translated errors; 429 → "Shumë përpjekje, provo përsëri pas X
  minutash" from Retry-After.
- A2. /login and /register: elegant centered forms, proper labels + autocomplete (email,
  current-password, new-password, name), a show/hide password toggle, paste allowed, client
  validation mirroring the shared zod schema (10-128 chars, not equal to the email) with a helpful
  hint.
- A3. ?next= returns the user to where they came from. SECURITY: accept only same-origin relative
  paths starting with a single "/" (reject "//", schemes, backslashes, encoded variants). Default
  "/".
- A4. /account (protected → /login?next=/account): name + preferred language (editable), email
  read-only, change password, "Dil nga të gjitha pajisjet", and a placeholder "Biletat e mia".
- A5. Header and mobile drawer: "Hyr" when logged out; an account menu with the first name
  ("Llogaria ime", "Dil") when logged in.
- A6. After login, switch the UI to preferredLocale; when a logged-in user changes SQ/EN, save it
  with PATCH /api/auth/me (debounced, silent on failure).
- A7. Accessibility: an error summary that receives focus, aria-describedby on field errors,
  aria-live for async messages, loading state on submit (no double submit).
- A8. Tests: auth provider (CSRF retry once, 401/403/429), the next-param validator with many
  malicious examples, forms. e2e desktop + 390px: register → name in header → logout → login →
  /account edits → change password → logout-all; generic wrong-password error; protected redirect
  and return; ?next=https://evil.example and //evil.example ignored; axe on /login, /register,
  /account.

Commit: "feat: login, register and account UI"

PART B: 3D + 2D seat selection with "view from this seat"
(The signature feature of Kinemax: design quality matters. The selection lives in the browser in
this part; the server hold comes in part C.)

- B1. API GET /api/showtimes/:id/seatmap: hall (name, hall type, wholeHallOnly, screen
  size/position), seats (id, row, number, type, x/y/z, rotation, widthUnits), the status of each
  seat AVAILABLE/TAKEN from live reservations only (expired holds are free; never reveal who holds
  a seat), ADULT price per seat type for the legend, and for suites the whole-hall price + taken
  flag. Cache-Control: no-store. Unknown/past showtime → 404/410 with a friendly UI.
- B2. /booking/:showtimeId layout: showtime summary on top (movie, cinema, hall + type, local
  date/time, format, language, age badge); the seat map in the center with a "3D / 2D" toggle
  (desktop opens 3D, phones open 2D with "Shiko sallën në 3D"; no WebGL or a very weak device → 2D
  only with a note); a side panel (bottom sheet on mobile) with the selected seats, an estimated
  total at ADULT prices labeled "çmimi final llogaritet në hapin tjetër", a legend and "Vazhdo".
  Refresh availability every ~20s while visible (pause when hidden); if a selected seat becomes
  TAKEN, unselect it with a gentle notice.
- B3. 3D hall with three.js via @react-three/fiber + @react-three/drei (explain the dependencies,
  confirm none needs an install script, lazy-load the 3D chunk and report its size). Realistic
  premium look from the real coordinates: stadium tiers, dark walls with subtle acoustic panels,
  aisle step lights, soft warm light, and the screen glowing with the movie's backdrop/poster. Per
  hall type: STANDARD crimson velvet seats; VIP_RECLINER wide dark-burgundy leather recliners with
  side tables; Kinemax Grand a much larger curved screen and a deeper hall; PRIVATE_SUITE lounge
  sofas in an intimate room. COUPLE sofas clearly double; WHEELCHAIR spaces with a marker and no
  seat; COMPANION marked. States: available, hovered, selected (ivory/crimson highlight), taken
  (dimmed, not clickable). Tooltip: row, seat, type, ADULT price. Performance: InstancedMesh, capped
  pixel ratio, frameloop "demand", dispose on unmount; report FPS and draw calls. Orbit camera with
  limits (not under the floor or behind the screen), zoom limits, a "Rikthe pamjen" button.
- B4. View from this seat: clicking a seat in 3D (or "Shiko pamjen" for a seat in 2D) flies the
  camera (~1s, eased) to eye height above the seat, looking at the screen center; reduced motion →
  instant. Overlay: "Rreshti F · Ulësja 8 · VIP" + "Zgjidh këtë ulëse"/"Hiqe" + "Kthehu te salla".
- B5. 2D map (SVG, top-down from the same x/y, screen at the top): every seat is a real button with
  an aria-label like "Rreshti F, ulësja 8, VIP, e lirë, 10,50 €"; roving tabindex with arrow keys
  along and between rows; Enter/Space selects; double-width sofas; wheelchair/companion icons; a
  legend. Fully usable by keyboard and screen reader on its own.
- B6. Client rules: max 10 tickets (a sofa counts as 2) with a friendly message; suites → no
  seat-by-seat selection, a single "Rezervo gjithë suitën" with the whole-hall price; selecting a
  wheelchair space shows a short note suggesting the companion seat. Keep the selection in
  sessionStorage per showtime so it survives the login redirect; on return re-check and drop seats
  taken meanwhile.
- B7. "Vazhdo": logged out → /login?next=/booking/:showtimeId with the selection kept; logged in →
  part C's hold flow (until part C exists, a short "next step" note).
- B8. Schedule page mobile fix: day tabs ABOVE the filters on all sizes; below 768px the filters
  move into a "Filtrat (n)" button opening a bottom sheet (focus trap, Esc, inert background,
  "Pastro" + "Apliko"); filters stay in the URL.
- B9. Tests: API seatmap (fields, TAKEN vs expired holds, suites, 404/410); web (2D keyboard nav,
  max-10 with sofas, suites, sessionStorage restore, polling pause, WebGL fallback); e2e desktop +
  390px (keyboard seat pick in 2D → Vazhdo logged out → login → back with the same seats; the 3D
  canvas renders; the view-from-seat overlay via "Shiko pamjen"; the mobile filter sheet; axe on the
  booking page in 2D).

Screenshots: the 3D view + view-from-seat for each hall type (Standard, VIP, Grand, Suite) on
desktop, the 2D map on mobile, and the mobile schedule filter sheet.
Commit: "feat: 3D and 2D seat selection with view from seat"

PART C: Seat holds (10 min), ticket categories, server-side prices

- C1. POST /api/bookings/hold (auth + CSRF) {showtimeId, seatIds[] | wholeHall:true}. In ONE
  transaction: expire stale HELD bookings of that showtime (HELD and holdExpiresAt < now → EXPIRED,
  which releases their locks via the existing trigger); release the user's own previous active hold
  (max ONE active hold per user); validate (showtime active and not started, seats active and in
  that hall, at most 10 tickets with sofas counting 2, suite rules); create the HELD booking with
  holdExpiresAt = now + AppSettings.seatHoldMinutes (10) and default ADULT tickets; insert the seat
  locks (the DB unique keys decide races). Seat already taken → 409 with the taken seat ids, so the
  UI refreshes and highlights them. Rate-limit this endpoint per user and per IP.
- C2. GET /api/bookings/:id (owner only; another user's booking → 404, never 403, so nothing
  leaks): status, expiry, seats/tickets, price breakdown.
- C3. PUT /api/bookings/:id/tickets (owner, HELD, not expired): [{seatId, occupant, category}]. The
  server computes every price with the existing pricing function, writes the BookingSeat snapshots
  and totalCents, and returns the breakdown. The client NEVER sends prices. A sofa needs exactly 2
  tickets.
- C4. DELETE /api/bookings/:id/hold (owner): HELD → CANCELLED, which releases the seats.
- C5. Background cleanup: every minute, expire stale HELD bookings (idempotent, batched, logged),
  like the session cleanup.
- C6. Age confirmation: for 15+/18+ films the user must tick "Konfirmoj që të gjithë shikuesit i
  plotësojnë kufirin e moshës" before continuing; store ageRatingConfirmed on the booking
  (server-validated).
- C7. UI step "Biletat" after a successful hold: a visible countdown mm:ss (aria-live announcements
  at 5 min and 1 min), a category select per ticket (sofa = 2 tickets; category descriptions from
  the DB), live server-priced totals, the age confirmation when needed, "Ndrysho ulëset" (releases
  the hold and returns to the map with the selection kept), and "Vazhdo" → a placeholder for the
  next step (food & drinks, then demo payment). When the timer expires: a clear message and back to
  the map. Returning to the same showtime while a hold is still active resumes it.
- C8. Tests: concurrency (parallel holds on the same seat → exactly one wins), stale holds expired
  inside the hold transaction and by the job, one active hold per user, ownership (404 for others),
  no client prices accepted, a seat from another hall → 422, more than 10 tickets → 422, started
  showtime → 409/410, an expired hold can't change tickets, sofa ticket count, age confirmation; UI
  countdown/expiry; e2e desktop + 390px: select → Vazhdo → login → hold → choose categories (prices
  update) → age confirm → continue placeholder; and an expiry test (use a short hold time only in
  kinemax_test via AppSettings).

Screenshots: the "Biletat" step desktop + mobile.
Commit: "feat: seat holds, ticket categories and server-side pricing"

FINAL: update docs/roadmap.md (move the finished items to DONE with hashes; next up: food & drinks,
then demo payment), make sure every checkbox in docs/tasks/07-booking.md is ticked, and end with a
short report: what was built per part, dependencies + 3D chunk size, FPS/draw calls, the DECISIONS
TO CONFIRM list, test counts and verify results.
