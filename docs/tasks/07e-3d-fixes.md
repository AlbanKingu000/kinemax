# Task 7e: final 3D fixes

Resume rule: read this file (and `07d-3d-polish.md`), continue from the first unchecked item, tick
items as they are finished.

## DECISIONS TO CONFIRM

(Taken without asking, with the safest reasonable option. Newest last.)

1. **The flight cannot see the screen at its very first moment without help.** The opening view
   (7d item 1) looks back at the seats from beside and behind the screen wall (cutaway), so in
   VIP and Suite the screen center was outside the frame at the start. The opening view now also
   frames the screen center: in VIP and Suite the camera stands a little further back (VIP
   1.0 m behind the screen wall instead of 0.1 m, Suite 0.7 m instead of 0.4 m in front). Standard
   and Grand are unchanged.
2. **Flight path.** A cubic curve that rises at the start, stays high above the seating (3 m above
   the higher end, on the side the camera starts from) up to 90% of the way and then comes down
   into the row. The camera looks at a point gliding from the seating's middle to the screen center
   in the first half; where the screen center would leave the frame, the gaze turns to it a little
   earlier (just enough). The flight plays at an even visual speed (a quarter of the time for the
   travel, three quarters for the turning), so the 180° turn is spread out instead of a quick swing
   (worst 2.3° per 1/240 of the flight, was up to 4.4° with plain easing), and lasts 2.5 s (was
   2.3 s; the asked range is 2-2.5 s). Because the camera starts behind the screen plane, it must
   cross it: at that moment it looks down at the front of the hall from above, with the screen at
   the edge of the frame (not at a side wall). A path that would pass right over its gaze point
   (only possible from an orbited view) takes a small sideways detour instead of spinning.
3. **Seat framing.** The seat view now faces the middle of the screen as seen from the seat (both
   edges equally far from the frame sides), not its center point, uses the narrowest field of
   view in 55-62° that keeps the whole screen inside a 10% margin (sides and top) and above the
   lower half of the frame, and looks as low as the top margin allows (was 75% of the way), so the
   rows in front show above the compact panel.
4. **Kinemax Grand middle rows (H-K).** The 9.5 m tall curved screen and the steep tiers leave no
   more vertical room within 62°: the whole screen is in view with a margin, but the seat backs in
   front sit at the panel's top edge there; they show when the panel fades out (looking around).
   From row L back they are clearly above the panel. Front rows (A-G) look up at the screen.
5. **Phones.** A portrait 3D box cannot show a whole screen's width within a 62° (vertical) field
   of view from the middle of the hall; the same framing rules apply and the screen's sides are a
   head turn away (the 390 px box is 358 × 416 px).
6. **Compact panel.** One strip over the bottom of the view (seat + distance, choose, ‹ ›, "Shiko
   ekranin", "Kthehu te salla"; wraps to two tight lines on narrow desktops). Previous/next seat
   are icon buttons with the same accessible names and a tooltip. The look-around hint shows for
   the first 5 s of the first seat view in a browser session (sessionStorage). The corner tag
   ("H9") is top left, `aria-hidden` (the panel stays in the accessibility tree with the full
   text). A pointer resting over the panel keeps it shown, also when the page scrolls under it.
   New tokens `--duration-overlay-out: 150ms` / `--duration-overlay-in: 250ms` (zeroed under
   reduced motion, shown on /styleguide).
7. **VIP seats.** `--color-seat-vip` #5a1a24 → #7c2a3a (lighter burgundy; the 2D map and the
   legend use the same token; ivory numbers on it 8.2:1). New `--color-seat-piping` #c9a46a (gold
   piping on the headrest and the cushion front, 3D only, on /styleguide). Recliner armrests now
   narrow with the seat width, so a recliner in a standard hall's 0.55 m row keeps a wide cushion
   and back (it read as a thin dark post). +1 draw call in halls with VIP seats.
8. **Booth window.** A 0.62 × 0.30 m warm window (#ffc58c at 0.85 instead of near-white at 1.6,
   was 1.1 × 0.55 m) in a soft amber halo; the beam starts at the window's size.
9. **Flaky e2e, root cause: the desktop booking page always opened in 3D.** This 2D-only test
   loaded and software-rendered the whole 3D hall twice (on arrival, and again after the login
   redirect), next to argon2 logins and other workers. Fix in the app: the 2D/3D choice is kept
   for the browser session (sessionStorage `kinemax.seatView`), so coming back from the login the
   visitor gets the 2D map they chose. Visible change: a visitor who picked 2D gets 2D on the next
   booking page in the same session (and 3D likewise). The test now also waits on the login
   response itself (status 200) and asserts the 2D map is back. No timeout was changed.
10. **Test fixture from the real generator.** `apps/web/src/test/halls.ts` (test-only) imports the
    API's pure seat-layout generator, so the framing and flight tests run on the seed's real halls
    (Grand 1, Salla 2, VIP 5, Suita 6) and follow any change to them.
11. **Screenshots incident.** While making the new screenshots a script briefly ran with the old
    file names and overwrote the eight 7d `polish-3d-*.png` / `polish-seat-*.png`. They were
    rendered again from the 7d commit (`e6737a2`, temporary worktree, same script); the movie art
    on the screen comes from today's schedule. `polish-transition-*.png` were not touched.

## Progress (keep up to date)

- Started 15 Oct 2026. Committed as "fix: auto-hiding seat view panel, framing, transition path and
  VIP readability" (`3b886a8`).
- Before = the 7d final state (`e6737a2`), measured with the same script on the same machine
  (installed Google Chrome headed, Intel UHD Graphics 620, 1440×900, DPR 1, dev server,
  Prishtinë halls): 3D chunk 941.72 kB raw / 255.43 kB gzip; draw calls overview/seat Standard
  17/17, VIP 16/16, Grand 16/16, Suite 15/15; FPS flight 57-60, look-around 56-60, orbit 60.
- After: 3D chunk 942.68 kB raw / 255.78 kB gzip. Draw calls overview/seat: Standard 17-18/18, VIP
  14-17/17, Grand 15-17/17, Suite 15/15 (the VIP gold piping is the +1). FPS in five runs: seat
  flight 57-60 (one run of eleven measured 49 with 34 ms frames; the repeats were 59-60), looking
  around 59-60, orbiting 57-60. Within the budget (≥ 50 FPS, ≤ ~80 draw calls, ≤ ~1.3 MB).
- Seat framing (desktop 16:10, real halls): from the middle back the whole screen stays inside
  ±0.95 of the frame in all four halls (Grand row J: edges at ±0.90, top at 0.90; was ±0.92 with
  no margin at 60°, and the 7d screenshot showed it cramped under the old two-line card).
- Flaky e2e "keyboard pick in 2D → Vazhdo → login → back with the same seats", 20 runs
  (`--repeat-each=10`, desktop + mobile) at 8 workers: before (original test, no remembered view)
  2 failed (desktop, URL wait after the login), desktop avg 20.0 s / max 27.6 s; after 0 failed,
  desktop avg 15.6 s / max 18.1 s, mobile 10.5 / 14.2 s. Also 20/20 at the default workers. Step
  timing showed where the time went: desktop "sign in → back on the booking page" took 2.0 s on
  average (max 3.5 s) against 0.6 s on mobile, and dropped to 1.4 s (= mobile) with the fix.
- Tests: web 355 (new: auto-hide hook 6, real-hall framing/flight 7, VIP models/scene 3,
  BookingPage +2), api 269, shared 20, scripts 10; coverage web 92.37% statements / 83% branches.
  e2e 57 passed, 4 project-specific skips. `npm run verify` green on the first run.
- 3D e2e (`hall-3d.spec.ts`, desktop + mobile): 12/12 with `--repeat-each=3 --workers=1`; the
  phone project drags with real touch events (one finger).
- Chrome check: Claude in Chrome on the dev server (desktop): booking page, 2D chosen, reload →
  2D map again without a 3D canvas, no horizontal overflow, console clean. That window again
  reports `visibilityState: hidden` (rAF paused; see 07d), so flights, the seat view, the drag and
  390 px were checked with the Playwright script driving the installed Google Chrome (headed,
  GPU) against the dev server: console clean at 1440 and 390 px; at 390 px the panel sits under
  the view and fades without moving the page.
- Screenshots in `C:\Users\albanme\Desktop\kinemax-screenshots\`: `polish2-3d-{standard,vip,grand,
suite}.png`, `polish2-seat-{…}.png`, `polish2-seat-hidden-panel.png` (mid-drag, panel hidden, tag
  "H9"), `polish2-transition-1/2/3.png` (start, 50%, arrival).

## Checklist

- [x] 0 Baseline: FPS, draw calls, 3D chunk size before the change
- [x] 1 Auto-hiding seat-view overlay (fade out on look, back after 800 ms still, corner label,
      never while focus/hover inside, hint chip only the first seconds once per session, compact
      desktop panel, reduced motion instant, stays in the accessibility tree, mobile too)
- [x] 2 Framing: seat backs in front visible above the panel area (look-at height, FOV 55-62°)
- [x] 3 Grand seat view: whole curved screen visible with a margin from the middle to the back;
      unit test projecting the screen corners for sample seats per hall type
- [x] 4 Transition path: screen center stays in the frame for the whole flight (arc above the
      seating, look-at near the screen); unit test sampling 10 points
- [x] 5 VIP seats readable and premium (lighter burgundy leather, ivory/gold piping), every hall
      overview checked
- [x] 6 Projector booth window: small warm glow with a soft beam (not a blown-out white rectangle)
- [x] 7 Flaky e2e "keyboard pick in 2D → Vazhdo → login → back with the same seats": root cause,
      fix, proven with --repeat-each=10 on desktop + mobile, zero failures
- [x] 8 Performance budget kept (≥50 FPS, ≤~80 draw calls, chunk ≤~1.3 MB raw), before/after
- [x] 9 Unit tests: overlay auto-hide state machine (interaction → hidden; idle 800 ms → shown;
      focus/hover inside → never hidden; reduced motion)
- [x] 10 e2e: drag in the seat view hides the panel and it returns; keyboard focus in the panel
      keeps it visible
- [x] 11 npm run verify
- [x] 12 Chrome check (console clean) + screenshots polish2-3d-<type>.png, polish2-seat-<type>.png,
      polish2-seat-hidden-panel.png, polish2-transition-1/2/3.png
- [x] 13 Roadmap + commit "fix: auto-hiding seat view panel, framing, transition path and VIP
      readability"

## The task (as given)

Task 7e: final 3D fixes after reviewing the 7d screenshots and my own testing. Read
docs/tasks/07d-3d-polish.md first. Save this prompt as docs/tasks/07e-3d-fixes.md with a checklist
and tick items as you go. Work autonomously; record decisions under "DECISIONS TO CONFIRM".

1. AUTO-HIDING SEAT-VIEW OVERLAY (my feedback after testing; top priority): in the seat view, the
   bottom panel ("Rreshti M · Ulësja 14 · Standard", distance, Zgjidh/Kthehu/← →/Shiko ekranin)
   and the hint chip at the top ("Tërhiq ose përdor shigjetat…") take too much space and block
   the view while the customer looks around.
   - As soon as the user starts looking around (mouse drag, touch drag, arrow keys), fade out the
     panel and the hint chip (~150 ms).
   - When the view has been still for ~800 ms, fade them back in (~250 ms).
   - Keep a tiny, unobtrusive seat label (e.g. "M14") visible in a corner while hidden, so the
     user knows where they are.
   - Never hide while keyboard focus is inside the panel, or while the pointer hovers over it. The
     hint chip shows only for the first few seconds of the first seat view, then never again in
     that session.
   - Make the panel itself more compact on desktop (one or two tight lines, smaller padding) so
     even when shown it covers less of the scene.
   - Reduced motion → instant show/hide without fades. Screen readers: the panel stays in the
     accessibility tree (hide visually only, e.g. opacity + pointer-events), so no content is
     lost.
   - Same behavior on mobile (one-finger drag).
2. FRAMING: with the compact panel, adjust the seat-view framing (look-at height and FOV within
   ~55-62°) so the seat backs in front are visible above the panel area.
3. KINEMAX GRAND SEAT VIEW: the curved screen is cut off left/right/top from row J (~15 m). For
   every seat from the middle of the hall to the back, the whole screen must be visible with a
   small margin (front rows may legitimately need to look around). Add a unit test that projects
   the screen's corners for a sample of seats per hall type and asserts they're inside the view.
4. TRANSITION PATH: the middle frame of the seat flight looks at the side wall near the screen
   edge, which is disorienting. Keep the screen center inside the frame for the whole flight: the
   path arcs above the seating, not beside the screen, and the look-at target stays on or near the
   screen. Add a unit test sampling the path at 10 points, asserting the screen center stays
   inside the frustum.
5. VIP ROWS INSIDE STANDARD HALLS look so dark that they read as seats turned backwards. Make VIP
   seats clearly readable and premium: a slightly lighter burgundy leather with subtle ivory/gold
   piping or a lit seat number, still distinguishable from Standard. Check every hall type's
   overview.
6. PROJECTOR BOOTH WINDOW: the bright white rectangle at the back is blown out. Make it a small
   warm-glowing window with a soft beam.
7. FLAKY E2E: make booking.spec.ts "keyboard pick in 2D → Vazhdo → login → back with the same
   seats" robust under parallel load. Find WHY it's slow (not just a bigger timeout): e.g. wait on
   the specific network response instead of fixed waits, or reduce polling during the test. Prove
   it with --repeat-each=10 on desktop + mobile with zero failures.
8. Keep the performance budget (≥50 FPS, ≤~80 draw calls, 3D chunk ≤~1.3 MB raw). Report
   before/after.

TESTS: unit tests for the overlay auto-hide state machine (start interaction → hidden; idle 800 ms
→ shown; focus/hover inside → never hidden; reduced motion), plus the framing/path tests above;
e2e: drag in the seat view hides the panel and it returns after stopping; keyboard focus in the
panel keeps it visible.

DEFINITION OF DONE: npm run verify passes. Chrome check (console clean). New screenshots in
C:\Users\albanme\Desktop\kinemax-screenshots\: polish2-3d-<type>.png and polish2-seat-<type>.png
for standard, vip, grand, suite, plus polish2-seat-hidden-panel.png (mid-drag, panel hidden) and
polish2-transition-1/2/3.png. Update docs/roadmap.md. Commit: "fix: auto-hiding seat view panel,
framing, transition path and VIP readability"
