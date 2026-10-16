# Task 09: admin panel, part 1 of 2

Resume rule: read this file, continue from the first unchecked item, never redo a committed part,
tick items (with the file-editing tool) as they are finished.

## DECISIONS TO CONFIRM

(Taken without asking, with the safest reasonable option. Newest last.)

1. **A1, answers outside the scope.** Every `/api/admin/*` path (also unknown ones) is 401 for
   visitors and 403 for customers. A location id outside a manager's cinemas is 403; a resource
   found by id (hall, showtime) of another cinema is 404, so ids reveal nothing (docs/auth.md).
2. **A1, the web gate.** `/admin` is a lazy chunk loaded for staff only. Everybody else, signed
   out too, gets the ordinary site 404 (no login redirect, which would hint at the panel); staff
   sign in on /login and open "Paneli admin" from the account menu or the mobile drawer.
3. **A2, the frame.** Managers have no "Të gjitha": the switcher lists only their cinemas (first
   one preselected); the choice is remembered per browser (localStorage, safe if blocked).
   "Filmat" is hidden for managers (movies are global, part C). Later sections (Çmimet, Ushqimi,
   Skano, Përdoruesit) are listed as "Së shpejti", not links. The site's account menu is reused as
   the user menu, plus the SQ/EN switch. New icons: chart, cup, scan, edit, upload.
4. **A3, e2e staff.** The e2e database gets a super admin and the manager of **Ferizaj** (a cinema
   the customer journeys never book in, so admin specs may change its data). A setup project
   signs both in once per run through the API (the run stays under the login limit of 20 per IP
   per 15 minutes, decision 14 of task 8).
5. **Chrome check sign-in.** The dev API had been stopped earlier for low memory; it was started
   again for the Chrome check (3.8 GB free; the web dev server was still running). Staff sign in
   to the real Chrome through a session created by a local script that reads the seed password
   from .env, so no password is ever typed into a tool call or printed.
6. **Styleguide.** Part A has only the frame; the admin components (KPI tile, charts, dense table,
   fill bar, confirmation dialog) get their own /styleguide section from part B on.
7. **B1, what the numbers mean.** Revenue = demo payments by the time they succeeded, minus
   refunds by the time they were refunded (so a refund lowers the day it happened), split into
   food (the booking's food lines) and tickets (the rest). Tickets sold is net the same way; a
   suite booking counts its active seats. Occupancy = seats of CONFIRMED bookings / active seats,
   over the active shows starting on the range's local days (whole days, so later shows of today
   count with what they sold so far). Top movies and hall types are ranked by ticket revenue.
   "Today" is the cinema's local day; "all cinemas" uses the first cinema's time zone (all
   seeded cinemas share Europe/Belgrade; a `shortcut:` comment marks it). The upcoming list shows
   at most 20 shows. New migration `admin_stats_indexes`: indexes on `DemoPayment.succeededAt`
   and `refundedAt`; five set-based queries per request, no per-row queries.
8. **B2, charts without a library.** Own SVG components (no new dependency): `ColumnChart`
   (stacked tickets + food, legend, hover tooltip, "Shfaq të dhënat si tabelë"), `BarList`,
   `FillBar` (role meter), `StatTile`, `DataTable` (wide tables scroll inside their frame). Chart
   colours `--color-chart-1` #e6566a and `--color-chart-2` #b88524, checked with a colour-vision
   validator on the dark surfaces (the pair is in the "needs a second cue" band, so stacks have a
   2 px gap, a legend and the table); both are in `CONTRAST_PAIRS` (3:1 for graphics).
9. **C1, movie rules.** Movie routes are SUPER_ADMIN only (managers get 403 like customers;
   "Filmat" is hidden for them). Delete is allowed only for a movie that never had a showtime
   (409 otherwise); "archive" sets the status ARCHIVED after a dialog that says how many
   upcoming shows **stay active**: archiving does not cancel bookings (deactivating shows with
   refunds is part D's job, done show by show). Changing the duration does not move existing
   shows. The slug is filled from the Albanian title until edited; a duplicate is 409.
10. **C2, no re-encoding (TO CONFIRM).** Re-encoding would need `sharp`, which has an install
    script, so it was not added. Instead every upload is checked from its bytes: JPEG/PNG/WebP
    signature, a full structural walk to the format's end marker (any byte after it, e.g. an
    appended script, is rejected: polyglots), dimensions (poster at least 300 × 450, backdrop at
    least 1280 × 720, at most 8000 px a side), 5 MB (413 above). Metadata is removed without
    touching the pixels (JPEG APP1/APP13/comments, PNG text/eXIf/tIME chunks, WebP EXIF/XMP
    chunks). Limit: pixel data is not decoded, so a structurally valid file with broken pixels is
    accepted (the browser shows nothing). If you approve `sharp`, re-encoding replaces this.
11. **C2, storage and serving.** Files get random UUID names with the extension of the detected
    type, live in `UPLOADS_DIR` (default `uploads/` in the repository, git-ignored; tests use a
    temp folder, e2e `test-results/e2e-uploads`), and are served only by
    `GET /api/media/<uuid>.<ext>` with the type of that extension, `nosniff`,
    `Content-Security-Policy: default-src 'none'; sandbox` and a one-year immutable cache.
    Replaced files are deleted after the database change; a deleted movie takes its files along.
    Upload rate limit: the "sensitive" admin limit (30 per 10 minutes per admin).
12. **C2, client.** The panel uploads the file's bytes as the request body (the one fetch
    wrapper now sends a `Blob` as is), with the same CSRF header as every write.
13. **Overflow checks at 390 px.** Mobile emulation zooms out to fit a page that is too wide, so
    `scrollWidth <= innerWidth` never fails there. The admin e2e and the screenshot script now
    compare with the configured width; that found a visually hidden table header escaping its
    scroll frame (fixed in `DataTable`).
14. **D1, planning.** Times are entered in the cinema's local time; the server turns them into
    instants and computes the end (movie + 20 min cleaning, `CLEANING_BUFFER_MINUTES`, now in
    the domain and used by the seed too). The page is a day plan per hall; a super admin first
    picks one cinema ("Të gjitha" shows a hint). Bulk = one movie in one hall, a date range of
    at most 14 days × a list of times (at most 60 shows); the preview marks each slot ready,
    overlapping (with the show it hits), in the past or repeated, and saving is all or nothing
    (409 if anything changed meanwhile). Overlaps on single creates/edits come from the
    database rule (23P01 → 409) and are shown as "Salla është e zënë…".
15. **D2, what may change.** As soon as a show has any HELD or CONFIRMED booking, only the
    format and the language version can change (movie, hall, date and time answer 409
    `tickets_sold`). A show that started is read-only (no edit, no (de)activation).
16. **D2, deactivation.** One transaction: the show row is locked, set inactive, every HELD
    booking is CANCELLED (its PENDING payment FAILED) and every CONFIRMED one REFUNDED with its
    payment (demo); the trigger frees the seats. Audit: `showtime.deactivate` (ids and refunded
    total) plus one `booking.refund` per refund (actor = the staff member). Repeating it changes
    nothing. Customers are not notified (emails are out of scope). The seat hold now locks the
    show row `FOR SHARE` before touching bookings, so a hold cannot slip in during a
    deactivation (and the two never deadlock). An inactive future show can be put back on sale
    ("Aktivizo", 409 if the hall was taken meanwhile).
17. **E1, one generator.** `generateSeats` and the spacing per hall type
    (`HALL_TYPE_SPACING`, the seed's values; unknown types use STANDARD) moved to
    `@kinemax/shared`, so the editor previews exactly the coordinates the server saves; the seed
    templates use the same table (a test checks every seeded hall). The seed and e2e scripts now
    run tsx with the `kinemax-source` condition, so they need no build of the shared package.
18. **E1, the editing model.** A hall is rows of blocks (an aisle between blocks), each seat a
    cell. Numbers are always 1..n left to right and positions are recomputed on every change, so
    "renumber" is automatic; a row can be renamed. Tools: select (click, Shift + click range in a
    row, drag), change type, remove/deactivate, activate, add a seat to the right, add a row
    (the last row's block sizes, standard seats), undo all, save. The 3D preview is behind
    "Shfaq pamjen 3D" (WebGL only on demand) and redraws with every change. Extra gaps in front
    of a row (cross aisles) and tier heights are not editable: they come from the hall type.
    `SeatMap2D` got optional editor hooks (spoken label, selectable greyed seats, Shift, drag).
19. **E2, safety rules on the server (one transaction, `hall.layout` audit row).** A seat with
    booking history is never deleted: leaving it out is 409 `has_history`; the editor keeps it
    greyed as "joaktive" in its place (it keeps its row and number on old tickets). A seat with
    a booking for a show that has not ended must stay active with the same row, number and
    ticket count (409 `blocked`; the editor lists the blocking shows) — this also forbids
    renaming its row or adding seats to its left. A seat with history never changes its ticket
    count (409 `capacity_history`, also G12/KX006): deactivate it and add a new one. A suite
    with a whole-hall booking for a show that has not ended cannot change at all
    (`suite_booked`); `wholeHallOnly` itself is not editable. The save locks the hall and its
    future shows (`FOR UPDATE`), so a seat hold cannot appear between the checks and the commit.

## Progress (keep up to date)

- Started 16 Oct 2026.
- Part A: done. API: `/api/admin` router behind the staff roles, `GET /api/admin/locations`,
  `canAccessLocation` extracted from `requireLocationAccess`, admin helpers (scope, audit, rate
  limits). Tests: API 6 (`test/admin/access.db.test.ts` + the harness `test/support/admin.ts`),
  web 9 (`AdminShell.test.tsx`), e2e 3 × 2 projects (`admin.spec.ts`, setup project).
  `npm run verify` green (shared 26, api 313, web 389, scripts 10; coverage api 95.19% / 85.61%,
  web 92.07% / 82.77%; e2e 75 passed; audit passed). Chrome check (Claude in Chrome, dev server):
  as the seed customer /admin is the site 404; as the Prizren manager the panel shows only
  Kinemax Prizren, no "Filmat", navigation and SQ/EN work, console clean. That window ignores
  resizing, so 390 px comes from the Playwright script in installed Chrome (console clean, no
  overflow): `admin-shell-super-admin-{desktop,mobile-390}.png`,
  `admin-shell-manager-{desktop,mobile-390}.png`, `admin-shell-nav-drawer-mobile-390.png`,
  `admin-shell-customer-404-{desktop,mobile-390}.png`. Committed as "feat: admin shell and
  access control" (hash in docs/roadmap.md).
- Part B: done. `GET /api/admin/stats` + migration `admin_stats_indexes` (no drift). Tests: API
  6 (pinned clock: net revenue with a refund, suite seats, occupancy, 7/30 days, scope per role,
  IDOR, validation); web 4 dashboard + 4 chart + 5 widgets; e2e: the manager journey now checks
  the dashboard (period, data table, fill bars). `npm run verify` green (shared 26, api 319, web
  407, scripts 10; coverage api 95.52% / 85.51%, web 92.10% / 82.74%; e2e 75 passed; audit
  passed). Chrome check (dev server, Prizren manager): figures, 30 days with the data table,
  console clean after a reload (earlier errors were hot-reload noise from mid-edit). Screenshots
  (Playwright, installed Chrome, console clean, no overflow):
  `admin-dashboard-30d-{desktop,mobile-390}.png`, `admin-dashboard-manager-{desktop,mobile-390}.png`,
  `admin-dashboard-table-desktop.png`. Committed as "feat: admin dashboard with sales and
  occupancy stats".
- Part C: done. API: `/api/admin/movies` (list/search/filter, detail, create, edit, delete or
  archive), `POST /api/admin/movies/:id/images/:kind`, `GET /api/media/:file`, `UPLOADS_DIR`;
  domain `image-file.ts` (signature, structure, size, metadata stripping). Tests: API 11 movies
  integration (CRUD + audit, validation, archive rules, every role refused incl. both managers,
  SVG/fake extension/polyglot/sizes/empty/oversized, metadata gone, media headers, no
  traversal, cleanup, rate limit) + 6 image domain; shared 4; web 7 (list, filters, error
  summary, create, slug conflict, archive dialog, upload errors) + new components; e2e 1 × 2
  (create archived movie → SVG rejected → PNG poster served with nosniff → delete, file gone).
  `npm run verify` green (shared 30 at 100%, api 336, web 414, scripts 10; coverage api 94.93% /
  84.73%, web 91.57% / 82.04%; e2e 77 passed; audit passed). Chrome check (dev server, seed
  super admin): list, form error summary, create "Drita e Veriut" (archived), real PNG upload
  with preview, delete dialog → deleted, the file removed from `uploads/`; console clean.
  Screenshots (console clean, no overflow with the strict check): `admin-movies-list-{desktop,mobile-390}.png`,
  `admin-movie-edit-{desktop,mobile-390}.png`, `admin-movie-delete-dialog-desktop.png`,
  `admin-movie-form-errors-desktop.png`; the 390 px shots of parts A/B were retaken with the
  strict check. Committed as "feat: admin movies with secure poster upload".
- Part D: done. API: `/api/admin/showtimes` (day list, detail, create, bulk preview + create,
  edit, deactivate, activate), the hold's show lock, `CLEANING_BUFFER_MINUTES` in the domain.
  Tests: API 15 (local time → instant, server end, 409 overlap from the database, past and
  archived refused, bulk statuses and all-or-nothing, moving a show, only format/language after
  sales, started shows read-only, deactivation: holds cancelled + payments failed, paid
  bookings refunded, seats free, audit, idempotent, no new holds; reactivation 409 when taken;
  IDOR for list/create/bulk/edit/deactivate); web 8 (cinema choice, day per hall, day
  navigation, create with end hint and overlap message, locked edit, deactivation dialog with
  the refund sentence, bulk preview → only free slots) + 2 helper tests; e2e 1 × 2 (create →
  overlap → deactivate → bulk 4, after the seeded days). `npm run verify` green (shared 30, api
  351, web 422, scripts 10; coverage api 95.20% / 85.03%, web 90.50% / 81.15%; e2e 79 passed;
  audit passed). Chrome check (dev server, seed super admin, Prizren): with a paid demo
  booking made by a local script (seed customer, 2 tickets, 7,20 €), the dialog said "2 bileta
  do të anulohen dhe rimbursohen (7,20 €, demo)"; confirmed → refunded, 0 tickets,
  "Joaktive"; "Aktivizo" put it back; console clean. Screenshots (console clean, no overflow):
  `admin-showtimes-day-{desktop,mobile-390}.png`,
  `admin-showtime-deactivate-dialog-{desktop,mobile-390}.png`, `admin-showtime-new-desktop.png`,
  `admin-showtime-edit-locked-desktop.png`, `admin-showtime-bulk-desktop.png`. Committed as
  "feat: admin showtime management".
- Part E: done. Shared: `generateSeats`, `HALL_TYPE_SPACING`, `ticketsPerSeat`, layout schemas.
  API: `/api/admin/halls` (list), `GET/PUT /api/admin/halls/:id/layout`. Web: halls list, seat
  editor on the 2D map (click, Shift range, drag), live 3D preview on demand. Tests: API 10
  (layout with history/blockers, numbers and coordinates equal to the generator, the public
  seat map reflects the change, delete vs deactivate, every blocked change, capacity with
  history, booked suite, validation, IDOR) + seed spacing test; shared 5; web 7 model + 6 page
  (selection, refusals, deactivate, add row/seat, rename, type, save body, server refusal, 3D
  stand-in shows the edited seats); e2e 1 × 2 (add a row → save → remove it → save). `npm run
verify` green (shared 35 at 100% branches, api 362, web 435, scripts 10; coverage api 95.30% /
  85.24%, web 90.52% / 80.77%; e2e 81 passed; audit passed). Chrome check (dev server, seed super
  admin, Prizren): VIP 3 → add row E → saved → Shift-selected E1–E8 → 3D preview highlighted
  them → removed → saved (back to 4 rows, 32 seats); Salla 1: the seat booked by the demo
  booking is refused with its show listed. Twice the extension's screenshot capture of that
  window timed out while the page itself kept working (checked with scripts and headless runs:
  no hang in the app). Screenshots (console clean, no overflow):
  `admin-halls-list-{desktop,mobile-390}.png`, `admin-seat-editor-{desktop,mobile-390}.png`,
  `admin-seat-editor-3d-desktop.png` (the preview's screen now uses a raster image: an SVG
  without a size gave WebGL warnings). Committed as "feat: admin hall and seat editor".

## Checklist

### Part A: Admin shell and access

- [x] A1 /admin routes (SUPER_ADMIN and LOCATION_MANAGER only; others get a 404-style page) + an
      "Admin" link in the account menu for those roles
- [x] A2 Layout: sidebar, top bar with location switcher, user menu, "Kthehu te site-i"
- [x] A3 Shared admin API client + authorization test harness reused by every part
- [x] Part A: verify + Chrome check + screenshots + roadmap + commit "feat: admin shell and access
      control"

### Part B: Dashboard

- [x] B1 GET /api/admin/stats?location=&range=today|7d|30d (revenue, tickets, occupancy, top 5
      movies, sales by hall type, upcoming 24 h with fill %, seat-delivery orders today; efficient
      SQL, indexes if needed)
- [x] B2 UI: KPI tiles, revenue chart, sales by hall type, top movies, upcoming showtimes with fill
      bars; accessible charts with a data table toggle
- [x] Part B: verify + Chrome check + screenshots + roadmap + commit "feat: admin dashboard with
      sales and occupancy stats"

### Part C: Movies and poster upload (SUPER_ADMIN)

- [x] C1 List/search/filter movies; create/edit; archive instead of delete when it has showtimes
- [x] C2 Secure poster/backdrop upload (magic bytes, 5 MB, dimensions, no SVG, random names,
      stored outside the build, controlled route with nosniff + caching, old files cleaned up)
- [x] C3 Tests (fake extension, polyglot, oversized, wrong dimensions, svg, IDOR/role, archive)
- [x] Part C: verify + Chrome check + screenshots + roadmap + commit "feat: admin movies with
      secure poster upload"

### Part D: Showtimes (managers for their locations)

- [x] D1 Calendar/list per location and day; create (server-computed end time); bulk create with
      a conflict preview; overlaps 409 with a clear message
- [x] D2 Edit (safe fields only once tickets are sold); deactivate with cancel + refund of every
      active booking in one transaction, audit log
- [x] D3 Tests (conflicts, bulk, deactivation with bookings, manager scope, past read-only)
- [x] Part D: verify + Chrome check + screenshots + roadmap + commit "feat: admin showtime
      management"

### Part E: Hall and seat editor (managers for their locations)

- [x] E1 Visual 2D editor (select, add seats/rows, remove, seat type, renumber; coordinates from
      the grid; live 3D preview)
- [x] E2 Safety rules (history → deactivate only, G12 blockers shown, one validated batch in one
      transaction with audit, suites keep whole-hall rules)
- [x] E3 Tests (batch validation, blocked changes, deactivate vs delete, coordinates, 3D, scope)
- [x] Part E: verify + Chrome check + screenshots + roadmap + commit "feat: admin hall and seat
      editor"

### Final

- [ ] Roadmap (next: admin part 2 = prices & settings, food, QR check-in, users & audit log),
      every box ticked, push to origin, final report

## The task (as given)

Task 9: admin panel, part 1 of 2. Five parts (A-E).

STEP 0: Read CLAUDE.md, docs/roadmap.md, docs/data-model.md, docs/auth.md and
docs/tasks/08-checkout.md. Save this prompt as docs/tasks/09-admin-1.md with a checklist (one
checkbox per numbered item, plus "verify + Chrome check + screenshots + commit" per part). Commit
it. Whenever you resume, read that file and continue from the first unchecked item. Tick items
with the file-editing tool.

WORKING RULES: work autonomously; when a decision would need me, take the safest option and record
it under "DECISIONS TO CONFIRM" at the top of the task file. Never do anything destructive. After
EACH part: npm run verify, real Chrome check (desktop + ~390px, console clean), screenshots into
C:\Users\albanme\Desktop\kinemax-screenshots\ prefixed "admin-", update docs/roadmap.md, commit the
part. When ALL parts are done and verify is green, push to origin (per CLAUDE.md).

SECURITY (strict, this is the most sensitive area):

- Every admin endpoint lives under /api/admin/\*, behind requireAuth + requireRole + (for
  location-scoped data) requireLocationAccess. SUPER_ADMIN sees everything; a LOCATION_MANAGER
  only their locations; customers never.
- For EVERY admin endpoint, write tests proving a manager can't read or change another location's
  data by changing ids in the URL or body (IDOR), and that customers get 403.
- Every write: CSRF, zod validation, an AuditLog entry (actor, action, before/after), rate
  limiting on sensitive actions. Generic errors to the client.
- Destructive actions need a confirmation dialog that states the impact (e.g. "12 bileta do të
  anulohen dhe rimbursohen").

DESIGN: the same brand (black + deep crimson, Cormorant + Manrope) but compact and dense for work:
a sidebar, dense tables, filters, forms, keyboard-friendly, accessible tables. Desktop first; must
still be usable at ~390px.

══════ PART A: Admin shell and access ══════

A1. /admin routes (SUPER_ADMIN and LOCATION_MANAGER only; others → 404-style page, not a hint that
/admin exists). An "Admin" link in the account menu for those roles.

A2. Layout: sidebar (Dashboard, Filmat, Shfaqjet, Sallat, and later Çmimet, Ushqimi, Skano,
Përdoruesit), a top bar with a location switcher (super admin: all locations + "Të gjitha";
manager: only theirs), the user menu and a "Kthehu te site-i" link.

A3. A shared admin API client + the authorization tests harness reused by every part.

Commit: "feat: admin shell and access control"

══════ PART B: Dashboard ══════

B1. GET /api/admin/stats?location=&range=today|7d|30d: revenue (tickets, food, total; refunds
subtracted), tickets sold, occupancy % (sold seats / capacity of showtimes in range), top 5
movies, sales by hall type, upcoming showtimes for the next 24 h with fill %, today's
seat-delivery orders count. Computed with efficient SQL (no N+1); add indexes if needed (new
migration).

B2. UI: KPI tiles, a revenue-over-time chart, sales by hall type, top movies, and the upcoming
showtimes table with fill bars. Charts in the brand palette, accessible (text alternatives, data
table toggle). Lightweight: own SVG or a small library (explain the choice; nothing heavy).

Commit: "feat: admin dashboard with sales and occupancy stats"

══════ PART C: Movies and poster upload (SUPER_ADMIN; movies are global) ══════

C1. List/search/filter movies; create/edit (titles/synopsis sq+en, duration, age rating, genres,
release date, director, cast, status, trailer YouTube id validated as 11 chars); archive instead
of delete when it has showtimes.

C2. Poster and backdrop upload, SECURE: JPEG/PNG/WebP only, verified by magic bytes (never by
extension or the client MIME type); max 5 MB; checked dimensions (e.g. min 300x450 for posters);
NO SVG (XSS risk); random file names; stored outside the web build and served by a controlled
route with the correct Content-Type, X-Content-Type-Options: nosniff and caching. Prefer
re-encoding to strip metadata, but don't add a package that needs an install script without
asking me: if re-encoding needs sharp, record it as a DECISION TO CONFIRM and use the safe
no-reencode path for now. Old files are cleaned up when replaced.

C3. Tests: upload validation (fake extension, polyglot file, oversized, wrong dimensions, svg
rejected), IDOR/role tests, archive rules.

Commit: "feat: admin movies with secure poster upload"

══════ PART D: Showtimes (managers for their locations) ══════

D1. A calendar/list per location and day; create a showtime (movie, hall, start, format, language
version), with end time = duration + cleaning buffer computed on the server. Bulk create: one
movie into several days and times at once, with a preview of conflicts before saving. Overlaps →
409 shown as a clear conflict message (DB exclusion constraint).

D2. Edit (only if no tickets sold; otherwise only safe fields). Deactivate a showtime: if tickets
are sold, the dialog shows how many bookings will be cancelled; on confirm, in ONE transaction
deactivate it, cancel + refund (demo) every active booking and release the seats, with an
AuditLog entry. This closes the open roadmap point.

D3. Tests: conflicts, bulk create, deactivation with bookings (all refunded, seats free, audit),
manager scope, past showtimes read-only.

Commit: "feat: admin showtime management"

══════ PART E: Hall and seat editor (managers for their locations) ══════

E1. A visual 2D editor (reusing the 2D seat map) per hall: select seats (click, shift/drag), add
seats or whole rows, remove seats, change seat type (Standard, VIP, Couple sofa, Wheelchair space,
Companion), renumber a row. Coordinates (x/y/z) are recomputed from the grid with the spacing
rules of the hall type, so the 3D view stays correct. Live 3D preview of the hall.

E2. Safety rules: a seat with ANY booking history is never deleted, only deactivated
(isActive=false). A seat with an active/future reservation can't be deactivated or change capacity
(the existing G12 guard): the editor shows which showtimes block it. Changes are saved as one
validated batch (no overlapping seats, unique row/number, couple seats width 2) in one
transaction, with an AuditLog entry. Suites keep whole-hall rules.

E3. Tests: batch validation, blocked changes with future bookings, deactivate vs delete,
coordinates sane, 3D seatmap reflects changes, manager scope.

Commit: "feat: admin hall and seat editor"

FINAL: update docs/roadmap.md (next: admin part 2 = prices & settings, food management, QR
check-in, users & audit log), tick every checkbox, push to origin, and report: what was built per
part, new dependencies, DECISIONS TO CONFIRM, test counts, verify results, screenshot names, and
the seeded admin/manager logins to test with (say they're in .env; never print passwords).
