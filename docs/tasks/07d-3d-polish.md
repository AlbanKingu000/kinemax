# Task 7d: cinematic polish of the 3D hall and the "view from this seat"

Resume rule: read this file, continue from the first unchecked item, tick items as they are
finished.

## DECISIONS TO CONFIRM

(Taken without asking, with the safest reasonable option. Newest last.)

1. **Items 1 and 9 conflict: the opening view comes from the front.** No camera in front of the
   screen can show the whole seating AND the whole Grand screen (checked numerically for every
   position in front of the screen with the 60° field of view: none exists). Item 1 is top
   priority, so the hall opens beside and above the screen, looking back at the seats; the Grand
   curved screen is fully visible from the seats (every row from J back, with a margin) and when
   the user orbits round to the back (the orbit is no longer limited to the back half).
2. **Front view = cutaway.** To fit every row of the larger halls from beside the screen at a
   gentle 26° angle, the camera backs off until all seats fit, which in Standard and Grand puts
   it 2.5 m behind the screen wall. Walls, screen, frame and curtains are drawn from the inside
   only, so the camera sees through them (a classic cutaway); the other choice was a near
   top-down view from 15-20 m up.
3. **Seat colors are tokens shared by the 2D map, the legend and the 3D hall.** For the types to
   be distinguishable and the legend to match, there are three new tokens: `--color-seat-standard`
   (#8e1023, unchanged crimson), `--color-seat-vip` (#5a1a24, dark burgundy; was crimson-pressed,
   nearly the same as standard) and `--color-seat-couple` (#a3354b, rose velvet; was the standard
   crimson). The 2D map and the legend use them too, so VIP and couple seats change color in 2D.
   Ivory numbers on all three pass AA (new CONTRAST_PAIRS entries).
4. **Seated framing.** The seat view faces the screen center and then looks a little lower (75%
   of the way to the lowest angle at which the whole screen still fits with a 10% margin), so the
   rows in front show. The field of view is 55° and widens up to 60° when that keeps the whole
   screen in the frame; the wheel changes it within 48-64° only. Head-turn limits (±70°,
   -25°/+20°) are measured from this seated direction. The Grand curve is gentler (radius 2× the
   width instead of 1.25×), so its edges come 1.4 m forward instead of 2.3 m. Rows A-H of the
   Grand cannot see its full 22 m width at 60° and simply look up and around.
5. **Seat-view card.** The overlay is now a compact two-line card (seat + distance + choose/back;
   previous/next/look at the screen); the look-around hint is a small chip at the top left. On
   phones the card sits under the 3D view instead of covering most of it.
6. **Phones, 3D box.** The 3D box had `aspect-ratio: 16/10` with `min-height: 22rem`, which made
   it 563 px wide on a 390 px phone (horizontal scroll; this already happened before this task).
   Below 768 px it is now a fixed 26rem tall.
7. **Suites.** Suite seats (VIP type) are drawn as straight lounge sofas (segments joined, arms
   at the row ends), not turned towards the screen, with a rug, low tables and two lamps.
8. **Test hook.** `window.__kinemaxHall.viewSeat(id)` exists only when `navigator.webdriver` is
   true (automated browsers); it does exactly what a click on that seat does.
9. **No postprocessing.** The glows (selected seats, LEDs, sconces, downlights, booth) are
   additive sprites drawn in code; no bloom pass and no new runtime dependency.
10. **Lighter hall without a GPU.** With a software WebGL renderer (SwiftShader, llvmpipe,
    Microsoft Basic Render, detected once from the renderer name) the hall uses no antialiasing,
    a 0.75 pixel ratio, simple (Lambert) materials, two fewer lights and no haze. Measured in
    headless Chromium (SwiftShader): the seat flight went from 3 to 13 FPS, looking around from
    5 to 33 FPS. GPU devices get the full look.
11. **e2e: the 3D journeys run on their own.** Software-rendered 3D in parallel workers starved
    the argon2 logins of other specs (timeouts) and once made PostgreSQL take over 5 s to open a
    pool connection (a 500 on the seat-map poll). The new `e2e/hall-3d.spec.ts` therefore runs in
    two extra Playwright projects (`hall-3d-desktop`, then `hall-3d-mobile`) after the main
    projects; `hold-expiry` now runs after them. No timeout was raised and no check was removed.
12. **New dev dependency `@react-three/test-renderer` 9.1.1** (pmndrs, the official
    react-three-fiber test renderer: no install scripts, no dependencies, released July 2026,
    dev only, so outside the production audit). It renders the 3D scene without WebGL, so the
    camera rig, the seat models and states and the room are unit tested (and the 80% coverage
    gate holds with the bigger 3D code).
13. **Header cinema.** The booking page also sets the header cinema when none was chosen yet
    (that visitor would otherwise get the cinema picker over the booking page).
14. **Seat models.** Armrests end exactly at the seat edge so neighbours touch without
    overlapping (no flicker where they meet); VIP seats in standard halls use the recliner shape
    at the hall's seat width, without the side table (no room for it below 0.8 m).

## Progress (keep up to date)

- Started 13 Oct 2026. Committed as "feat: cinematic 3D hall and locked seat view" (`a3e0401`).
- Baseline (before, commit `2d4de54`), installed Google Chrome headed, Intel UHD Graphics 620
  (D3D11), 1440×900, DPR 1, dev server, Prishtinë halls: 3D chunk 917.07 kB raw / 246.80 kB
  gzip. Draw calls overview/seat: Standard 37/16, VIP 62/12, Grand 40/23, Suite 30/30. FPS while
  orbiting with the mouse: Standard 48, VIP 55, Grand 57, Suite 37 (worst frame 438 ms, first
  interaction); FPS during the old 1 s flight (2D → "Shiko pamjen", includes the 3D remount):
  50-52.
- After (same machine and method): 3D chunk 941.72 kB raw / 255.43 kB gzip. Draw calls
  overview/seat: Standard 17/17, VIP 16/16, Grand 16/16, Suite 15/15. FPS during the 2.3 s seat
  flight 57-60, looking around in the seat 56-60, orbiting 60 (all four halls). Headless
  Chromium with SwiftShader (lite mode): flight 13, look-around 33, orbit 18 FPS.
- Tests: web 331 (new: seat-view 18, Hall3D scene 11, hall models/textures 10, BookingPage +2),
  api 269, shared 20; coverage web 92.06% statements / 82.94% branches. e2e 57 passed, 4
  project-specific skips (new `hall-3d.spec.ts`: 2 tests × 2 projects). `npm run verify` green
  (run 3; run 2 hit a one-off `MovieDetailPage` document-title timing flake under load, which
  passes on its own 3/3 and is untouched by this task).
- Chrome check: Claude in Chrome on the dev server (desktop): header switched Prishtinë →
  Prizren on a Prizren booking, real canvas click on a seat → seat view H11 with "Distanca nga
  ekrani ~11 m", "Ulësja tjetër" → H12, "Kthehu te salla", console clean (no warnings or
  errors), no horizontal overflow. As in task 07 decision 14, that window reports
  `visibilityState: hidden` (rAF paused) and cannot be resized, so flights, FPS, the 390 px
  checks (no overflow in 2D or 3D, seat view card under the view, keyboard look clamped at 70°)
  and the screenshots were done with a Playwright script driving the installed Google Chrome
  (headed, GPU) against the dev server; console clean there too.
- Screenshots: `polish-3d-{standard,vip,grand,suite}.png`, `polish-seat-{…}.png`,
  `polish-transition-1/2/3.png` in `%USERPROFILE%\Desktop\kinemax-screenshots\`.

## Checklist

- [x] 0 Baseline: FPS, draw calls, 3D chunk size (raw + gzip) before the change
- [x] 1 Initial camera from the front (beside the screen, elevated), settle animation, "Rikthe
      pamjen"
- [x] 2 Slow curved flight to a seat (2-2.5 s, ease-in-out), clicks ignored in flight, overlay
      after arrival, smooth flight back, reduced motion → crossfade
- [x] 3 Locked seat view: look around only (yaw ±70°, pitch -25°/+20°), drag/touch/arrows, small
      FOV range, "Shiko ekranin"
- [x] 4 Seat models (STANDARD, VIP recliner, COUPLE loveseat, WHEELCHAIR space, COMPANION piping),
      one InstancedMesh per model, legend colors match
- [x] 5 Seat states (available, hovered, selected, taken)
- [x] 6 Ambience (wall panels, sconces, step LEDs, downlights, screen frame + masking, screen
      spill, projector beam + haze, carpet, KX logo)
- [x] 7 View from seat: eye height 1.15-1.2 m, FOV 55-60°, whole screen visible, Grand fix,
      "Distanca nga ekrani ~12 m"
- [x] 8 Seat-to-seat buttons and [ / ] keys (skip wheelchair spaces, stop at row ends)
- [x] 9 Kinemax Grand curved screen fully visible; Suite without the black band, warm lounge sofas
- [x] 10 Booking page switches the header cinema to the showtime's cinema
- [x] 11 Unit tests (camera path, look clamping, neighbours, distance)
- [x] 12 e2e (desktop + 390 px): front view attribute, seat view, clamping, seat-to-seat, back,
      location switch
- [x] 13 Performance after (FPS ≥ 50, ≤ ~80 draw calls, chunk ≤ ~1.3 MB raw)
- [x] 14 npm run verify
- [x] 15 Chrome check (desktop + 390 px, console clean) + screenshots
- [x] 16 Roadmap + commit "feat: cinematic 3D hall and locked seat view"

## The task (as given)

Task 7d: cinematic polish of the 3D hall and the "view from this seat". Read CLAUDE.md,
docs/roadmap.md and docs/tasks/07-booking.md first. This is Kinemax's signature feature: quality
matters, but stay within the performance budget. Save this prompt as docs/tasks/07d-3d-polish.md
with a checklist and tick items as you go, so the work can resume after any interruption. Work
autonomously; record any decision that would need me under "DECISIONS TO CONFIRM" in that file and
take the safest option.

USER FEEDBACK (top priority, from me after testing in Chrome):

1. INITIAL CAMERA: the 3D hall must NOT open from the back of the hall. Open it from the FRONT,
   near the screen (beside it, slightly elevated), looking back at the seating, so every row is
   clearly visible and the whole seating fits the frame on desktop. "Rikthe pamjen" returns to this
   view. A short, subtle settle animation on open is fine (reduced motion → none).
2. TRANSITION TO A SEAT: today it feels mechanical. When a seat is clicked, the camera must glide
   SLOWLY and smoothly from the hall view to the seat (about 2-2.5 s, ease-in-out, a gentle curved
   path that rises slightly and then descends to the seat), while the look-at target moves smoothly
   to the screen center. No snapping or jumps. The seat overlay appears only after arrival. Clicks
   during the flight are ignored. "Kthehu te salla" flies back just as smoothly. Reduced motion → a
   short crossfade instead of the flight.
3. LOCKED SEAT VIEW: once in a seat, the user must NOT be able to leave it or orbit the hall. They
   can only LOOK AROUND from that seat, like turning their head: yaw about ±70°, pitch about
   -25°/+20°, by mouse drag, one-finger touch drag and arrow keys. No panning, no orbit, no zooming
   away (at most a small field-of-view range). Add a "Shiko ekranin" button that smoothly recenters
   the view on the screen.

MY REVIEW OF THE SCREENSHOTS:

4. SEAT MODELS: replace the box seats with real cinema-seat shapes (cushion, backrest, armrests),
   low-poly merged geometry, one InstancedMesh per model:
   - STANDARD: crimson velvet.
   - VIP_RECLINER: wider dark-burgundy leather recliner with footrest and a small side table.
   - COUPLE: a double-width loveseat with no middle armrest.
   - WHEELCHAIR: an open space with a floor marker (design-system icon decal).
   - COMPANION: standard shape with subtle ivory piping.

   Every type must be distinguishable in the overview, and the legend colors must match.

5. SEAT STATES clearly readable from a distance: available (type color), hovered (soft ivory
   outline/glow), selected (bright ivory with a crimson glow, the most visible thing in the hall),
   taken (dark desaturated grey, not interactive).
6. AMBIENCE, warmer and less empty, but elegant (not cartoonish): side walls with fabric acoustic
   panels and soft wall sconces, LED strips on the aisle steps, small ceiling downlights, a screen
   frame with black masking curtains, light spilling from the screen onto the front rows, a faint
   projector beam with light haze from the booth at the back (echoing the home-page hero),
   procedural carpet, and a small, subtle KX logo on the wall near the screen.
7. VIEW FROM SEAT must show the rows IN FRONT (seat backs), at a realistic eye height (~1.15-1.2 m
   above the seat's tier) with a ~55-60° field of view. The whole screen must be visible with some
   margin from normal seats (front rows naturally look up). Fix the Kinemax Grand screen being cut
   off at the top. Show "Distanca nga ekrani ~12 m" in the overlay (computed from the coordinates).
8. SEAT-TO-SEAT: in the seat view, "← Ulësja e mëparshme / Ulësja tjetër →" buttons (and [ / ]
   keys) glide a short distance to the neighbouring seat in the same row, skipping wheelchair
   spaces, so users can compare views without going back.
9. KINEMAX GRAND: a large curved screen fully visible in the overview. SUITE: remove the black band
   at the bottom of the frame, and make it a warm lounge with sofas.
10. LOCATION: when a booking page opens for a showtime at a different cinema than the one chosen in
    the header, switch the header's cinema to the showtime's cinema (silently, persisted as usual).

PERFORMANCE BUDGET (must hold; report before/after):

- Chrome desktop: at least 50 FPS during camera movement, at most ~80 draw calls, 3D chunk at most
  ~1.3 MB raw (report gzipped too).
- Merged geometries and InstancedMesh, procedural/tiny textures generated in code (no big external
  assets), frameloop "demand" outside animations, capped DPR. Subtle bloom/postprocessing only if
  it fits the budget, lazy-loaded with the 3D chunk.
- Mobile 3D: same camera rules, one-finger look in the seat view, pinch disabled there.

ACCESSIBILITY: the 2D map stays the fully accessible version. 3D respects reduced motion. The
seat-view overlay buttons are keyboard-reachable with visible focus.

TESTS

- Unit: the camera path (eased, reaches the target, no jumps), look-around clamping, seat-to-seat
  neighbour logic (skips wheelchair spaces, stops at row ends), distance calculation.
- e2e (desktop + 390px): open 3D → the camera starts at the front view (expose a data attribute for
  tests); open a seat (test hook) → seat view active, look-around clamped, seat-to-seat works, back
  to hall; the location header switch.
- Keep everything else green.

DEFINITION OF DONE: npm run verify passes. Real Chrome check at desktop and ~390px (console clean).
Screenshots in %USERPROFILE%\Desktop\kinemax-screenshots\: for each hall type (standard, vip,
grand, suite) the overview ("polish-3d-<type>.png") and the seat view ("polish-seat-<type>.png"),
plus 3 frames of one seat transition at the start, middle and end ("polish-transition-1/2/3.png").
Update docs/roadmap.md. Commit: "feat: cinematic 3D hall and locked seat view"

Report: what changed per item 1-10, FPS/draw calls/chunk size before vs after, decisions to
confirm, test counts, verify results.
