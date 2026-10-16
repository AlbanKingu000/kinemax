// Camera and seat math for the 3D hall, without three.js (the booking page uses it too, and it is
// unit tested). Positions are in three.js space: [x, up, depth] = [seat.x, seat.z, seat.y], with
// the screen wall at depth 0 and the seats at positive depth.
import type { SeatMapResponse, SeatMapSeat } from '@kinemax/shared';

export type Vec3 = readonly [number, number, number];

/** Where the camera is and where it looks (yaw/pitch in radians, three.js Euler order YXZ). */
export interface Pose {
  position: Vec3;
  yaw: number;
  pitch: number;
  /** Vertical field of view in degrees. */
  fov: number;
}

const DEG = Math.PI / 180;
/** Eyes above the seat's tier when seated. */
export const EYE_HEIGHT_M = 1.18;
/** The seated field of view (vertical, degrees) and the small range the wheel may change it in. */
export const SEAT_FOV_RANGE = { min: 55, max: 62 } as const;
export const OVERVIEW_FOV = 60;
/** How far the head turns from looking at the screen. */
export const LOOK_LIMITS = { yaw: 70 * DEG, down: -25 * DEG, up: 20 * DEG };
/** The only "zoom" in the seat view: a small field-of-view range. */
export const FOV_RANGE = { min: 48, max: 64 } as const;

type Screen = SeatMapResponse['hall']['screen'];

export const eyeOf = (seat: SeatMapSeat): Vec3 => [seat.x, seat.z + EYE_HEIGHT_M, seat.y];
export const screenCenterOf = (screen: Screen): Vec3 => [screen.x, screen.z, screen.y];

/** Straight-line distance from the seated eye to the screen center, in meters. */
export function screenDistance(seat: SeatMapSeat, screen: Screen): number {
  const [ex, ey, ez] = eyeOf(seat);
  const [sx, sy, sz] = screenCenterOf(screen);
  return Math.hypot(ex - sx, ey - sy, ez - sz);
}

/** Yaw/pitch that look from `from` at `to` (a three.js camera looks down -Z). */
export function lookAngles(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}

/** Unit view direction of a yaw/pitch. */
export function direction(yaw: number, pitch: number): Vec3 {
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

/** A curved screen (Kinemax Grand) is an arc of this radius (x the width); its edges come forward. */
export const CURVE_RADIUS_FACTOR = 2;

/** How far a point of a curved screen, `dx` meters from its middle, stands in front of the middle. */
function arcDepth(widthM: number, dx: number): number {
  const r = widthM * CURVE_RADIUS_FACTOR;
  return r - Math.sqrt(r ** 2 - dx ** 2);
}

/** How far the edges of a curved screen stand in front of its middle. */
export const curveDepth = (widthM: number) => arcDepth(widthM, widthM / 2);

/**
 * Points along the top and bottom edge of the screen. A flat edge is straight (its ends and middle
 * suffice); a curved one bends in the frame, so it is sampled along the arc.
 */
export function screenPoints(screen: Screen, curved: boolean): Vec3[] {
  const steps = curved ? 8 : 2;
  return Array.from({ length: steps + 1 }, (_, i) => (i / steps - 0.5) * screen.widthM).flatMap(
    (dx) =>
      [-1, 1].map((sy): Vec3 => [
        screen.x + dx,
        screen.z + (sy * screen.heightM) / 2,
        screen.y + (curved ? arcDepth(screen.widthM, dx) : 0),
      ]),
  );
}

/**
 * Where points land in the frame of a pose, in normalized device coordinates (-1..1 from the
 * left/bottom to the right/top edge). Points behind the camera are Infinity.
 */
export function project(pose: Pose, p: Vec3, aspect: number): { x: number; y: number } {
  const f = direction(pose.yaw, pose.pitch);
  const r: Vec3 = [Math.cos(pose.yaw), 0, -Math.sin(pose.yaw)];
  const u = cross(r, f);
  const tanV = Math.tan((pose.fov / 2) * DEG);
  const v: Vec3 = [p[0] - pose.position[0], p[1] - pose.position[1], p[2] - pose.position[2]];
  const z = dot(v, f);
  if (z <= 0.01) return { x: Infinity, y: Infinity };
  return { x: dot(v, r) / z / (tanV * aspect), y: dot(v, u) / z / tanV };
}

/** The screen's outline in the frame of a pose (normalized device coordinates). */
export function screenBounds(pose: Pose, screen: Screen, aspect: number, curved: boolean) {
  const points = screenPoints(screen, curved).map((p) => project(pose, p, aspect));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    bottom: Math.min(...ys),
    top: Math.max(...ys),
  };
}

/** Where the screen lands in the frame of a pose: its largest |x| and |y|, 1 = the frame edge. */
export function screenExtent(
  pose: Pose,
  screen: Screen,
  aspect: number,
  curved: boolean,
): { x: number; y: number } {
  const b = screenBounds(pose, screen, aspect, curved);
  return {
    x: Math.max(Math.abs(b.left), Math.abs(b.right)),
    y: Math.max(Math.abs(b.bottom), Math.abs(b.top)),
  };
}

/**
 * Seated framing, in normalized device coordinates: the screen stays inside SCREEN_MARGIN of the
 * frame sides and top, and above SCREEN_FLOOR, so the rows in front (seat backs) show below it,
 * above the seat-view panel at the bottom of the frame.
 */
export const SCREEN_MARGIN = 0.9;
export const SCREEN_FLOOR = -0.5;

/**
 * The seated pose: eye height, facing the middle of the screen as seen from the seat (both edges
 * equally far from the frame sides). It uses the narrowest field of view (within SEAT_FOV_RANGE)
 * that fits the whole screen with the margins above, and looks as low as the top margin allows,
 * so as much as possible of the rows in front shows, as from a real seat. Where the screen cannot
 * fit (front rows, narrow phone frames), the widest view looks at the screen: the rest is a head
 * turn away.
 */
export function seatPose(seat: SeatMapSeat, screen: Screen, aspect: number, curved: boolean): Pose {
  const position = eyeOf(seat);
  const center = lookAngles(position, screenCenterOf(screen));
  const bearings = screenPoints(screen, curved).map((p) =>
    wrap(lookAngles(position, p).yaw - center.yaw),
  );
  const yaw = center.yaw + (Math.max(...bearings) + Math.min(...bearings)) / 2;
  const at = (pitch: number, fov: number): Pose => ({ position, yaw, pitch, fov });
  /** The lowest look (in 0.25 degree steps) that keeps the screen top inside the margin. */
  const lowest = (fov: number) => {
    if (screenBounds(at(center.pitch, fov), screen, aspect, curved).top > SCREEN_MARGIN) {
      return null;
    }
    let pitch = center.pitch;
    while (
      pitch > center.pitch - 30 * DEG &&
      screenBounds(at(pitch - DEG / 4, fov), screen, aspect, curved).top <= SCREEN_MARGIN
    ) {
      pitch -= DEG / 4;
    }
    return pitch;
  };
  for (let fov: number = SEAT_FOV_RANGE.min; fov <= SEAT_FOV_RANGE.max; fov += 0.5) {
    const pitch = lowest(fov);
    if (pitch === null) continue;
    const b = screenBounds(at(pitch, fov), screen, aspect, curved);
    if (b.bottom >= SCREEN_FLOOR && Math.max(-b.left, b.right) <= SCREEN_MARGIN) {
      return at(pitch, fov);
    }
  }
  return at(lowest(SEAT_FOV_RANGE.max) ?? center.pitch, SEAT_FOV_RANGE.max);
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Head-turn offsets from the screen direction, kept inside LOOK_LIMITS. */
export function clampLook(yaw: number, pitch: number): { yaw: number; pitch: number } {
  return {
    yaw: Math.min(LOOK_LIMITS.yaw, Math.max(-LOOK_LIMITS.yaw, yaw)),
    pitch: Math.min(LOOK_LIMITS.up, Math.max(LOOK_LIMITS.down, pitch)),
  };
}

export const clampFov = (fov: number) => Math.min(FOV_RANGE.max, Math.max(FOV_RANGE.min, fov));

/** Slow at both ends, no jumps (cubic ease-in-out). */
export function easeInOut(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
}

type Look = { yaw: number; pitch: number };

export interface Flight {
  from: Pose;
  to: Pose;
  /** Control points of the curved (cubic Bezier) path: near the start and near the end. */
  controls: readonly [Vec3, Vec3];
  /** The points the camera looks at when it leaves and when it lands. */
  look: readonly [Vec3, Vec3];
  /** The part of the flight (0..1) in which the gaze moves from the first point to the second. */
  gaze: readonly [number, number];
  /** How the start and end poses turn away from looking straight at their point. */
  turn: readonly [Look, Look];
  keep?: FlightPlan['keep'];
  /**
   * Cumulative share (0..1) of the flight's movement and turning at TIMING_STEPS even steps of the
   * path: the flight plays at an even visual speed, slower where it turns more.
   */
  timing: readonly number[];
}

const TIMING_STEPS = 120;

export interface FlightPlan {
  /** Meters the path rises above the higher end. */
  lift: number;
  /** What the camera looks at when it leaves and when it lands. */
  look: readonly [Vec3, Vec3];
  /** When the gaze moves (default: the whole flight). */
  gaze?: readonly [number, number];
  /**
   * Where (0..1 of the way from the end nearer the screen to the deeper one, across and along the
   * hall) the path stays high before it comes down to the deeper end.
   */
  over?: readonly [number, number];
  /**
   * Keep the look point of this end (the screen center) in the frame: where it would leave, the
   * gaze turns towards it a little earlier, just enough.
   */
  keep?: { end: 0 | 1; aspect: number };
}

/** How far inside the frame (normalized device coordinates) a flight keeps its `keep` point. */
export const KEEP_IN_VIEW = 0.95;

/** How far along the hall the path is already high near the end nearer the screen. */
const RISE = 0.15;
/** Sideways shifts (meters) of the path's top tried, so the path does not pass over its gaze. */
const DETOURS = [0, 3, -3, 6, -6];
const SPIN = 9 * DEG;

/**
 * Plans a camera flight. The path rises `lift` meters above the higher end, stays high over the
 * seating up to the point `over` of the way towards the end deeper in the hall (not beside the
 * screen), and comes down again. The camera keeps looking at a point that glides from the start's to the end's.
 * A path passing right over that point would spin the view, so of a few sideways detours the one
 * that turns the view most gently is taken.
 */
export function planFlight(from: Pose, to: Pose, plan: FlightPlan): Flight {
  const deepFirst = from.position[2] > to.position[2];
  const [near, deep] = deepFirst ? [to, from] : [from, to];
  const [acrossOver, alongOver] = plan.over ?? [0.5, 0.5];
  const high = Math.max(from.position[1], to.position[1]) + plan.lift;
  const along = (k: number) => near.position[2] + (deep.position[2] - near.position[2]) * k;
  const nearTop: Vec3 = [near.position[0], high, along(RISE)];
  const deepTop: Vec3 = [
    near.position[0] + (deep.position[0] - near.position[0]) * acrossOver,
    high,
    along(alongOver),
  ];
  const tops = deepFirst ? [deepTop, nearTop] : [nearTop, deepTop];
  const turnOf = (pose: Pose, at: Vec3): Look => {
    const straight = lookAngles(pose.position, at);
    return { yaw: wrap(pose.yaw - straight.yaw), pitch: pose.pitch - straight.pitch };
  };
  // Keeping a point in view only applies when both ends show it (an orbit may have turned away).
  const keep =
    plan.keep &&
    [from, to].every((pose) => {
      const p = project(pose, plan.look[plan.keep?.end ?? 0], plan.keep?.aspect ?? 1);
      return Math.max(Math.abs(p.x), Math.abs(p.y)) <= KEEP_IN_VIEW;
    })
      ? plan.keep
      : undefined;
  const dx = to.position[0] - from.position[0];
  const dz = to.position[2] - from.position[2];
  const length = Math.hypot(dx, dz);
  const across: Vec3 = length > 0.5 ? [-dz / length, 0, dx / length] : [1, 0, 0];
  const plans = DETOURS.map((shift) => {
    const flight: Flight = {
      from,
      to,
      controls: [0, 1].map((i): Vec3 => {
        const p = tops[i] ?? nearTop;
        return [p[0] + across[0] * shift, p[1], p[2] + across[2] * shift];
      }) as unknown as [Vec3, Vec3],
      look: plan.look,
      gaze: plan.gaze ?? [0, 1],
      turn: [turnOf(from, plan.look[0]), turnOf(to, plan.look[1])],
      keep,
      timing: [],
    };
    const poses = Array.from({ length: TIMING_STEPS + 1 }, (_, i) =>
      pathPose(flight, i / TIMING_STEPS),
    );
    const moves = poses.slice(1).map((p, i) => {
      const q = poses[i] ?? p;
      const way = Math.hypot(...p.position.map((v, j) => v - (q.position[j] ?? 0)));
      return [way, viewTurn(p, q)] as const;
    });
    return { flight, moves, peak: Math.max(...moves.map((m) => m[1])) };
  });
  // The direct path, unless it spins (turns more than SPIN in one step): then the gentlest.
  const best = plans.reduce((a, b) => (a.peak > SPIN && b.peak < a.peak ? b : a));
  // A quarter of the time goes to the way, three quarters to the turning, each spread evenly.
  const total = (j: 0 | 1) => best.moves.reduce((sum, m) => sum + m[j], 0);
  const [way, turning] = [total(0), total(1)];
  const steps = best.moves.map(
    ([d, a]) => (way > 1e-6 ? d / way : 0) + (turning > 1e-3 ? (3 * a) / turning : 0) || 1,
  );
  const all = steps.reduce((a, b) => a + b, 0);
  let sum = 0;
  return { ...best.flight, timing: [0, ...steps.map((e) => (sum += e) / all)] };
}

/** How far the view turns between two poses: where it points, and its side axis (a spin). */
function viewTurn(p: Pose, q: Pose): number {
  const angle = (u: Vec3, v: Vec3) => Math.acos(Math.min(1, dot(u, v)));
  const side = (yaw: number): Vec3 => [Math.cos(yaw), 0, -Math.sin(yaw)];
  return Math.max(
    angle(direction(p.yaw, p.pitch), direction(q.yaw, q.pitch)),
    angle(side(p.yaw), side(q.yaw)),
  );
}

/** The pose at progress t (0..1) of a flight: eased, at an even visual speed (see timing). */
export function flightPose(flight: Flight, t: number): Pose {
  const u = easeInOut(t);
  const { timing } = flight;
  let i = 0;
  while (i < TIMING_STEPS - 1 && (timing[i + 1] ?? 1) < u) i++;
  const [a, b] = [timing[i] ?? 0, timing[i + 1] ?? 1];
  return pathPose(flight, (i + (b > a ? (u - a) / (b - a) : 0)) / TIMING_STEPS);
}

/** The pose at the point k (0..1) of the path. */
function pathPose(flight: Flight, k: number): Pose {
  const { from, to, controls, look, gaze, turn } = flight;
  const weights = [(1 - k) ** 3, 3 * (1 - k) ** 2 * k, 3 * (1 - k) * k ** 2, k ** 3];
  const points = [from.position, controls[0], controls[1], to.position];
  const position = [0, 1, 2].map((i) =>
    points.reduce((sum, p, j) => sum + (weights[j] ?? 0) * (p[i] ?? 0), 0),
  ) as unknown as Vec3;
  const fov = from.fov + (to.fov - from.fov) * k;
  const gazing = (w: number): Pose => {
    const target = [0, 1, 2].map(
      (i) => (look[0][i] ?? 0) + ((look[1][i] ?? 0) - (look[0][i] ?? 0)) * w,
    ) as unknown as Vec3;
    const straight = lookAngles(position, target);
    return {
      position,
      yaw: straight.yaw + turn[0].yaw + wrap(turn[1].yaw - turn[0].yaw) * k,
      pitch: straight.pitch + turn[0].pitch + (turn[1].pitch - turn[0].pitch) * k,
      fov,
    };
  };
  const w = easeInOut((k - gaze[0]) / Math.max(1e-6, gaze[1] - gaze[0]));
  const { keep } = flight;
  if (!keep) return gazing(w);
  const inside = (g: number) => {
    const p = project(gazing(g), look[keep.end], keep.aspect);
    return Math.max(Math.abs(p.x), Math.abs(p.y)) <= KEEP_IN_VIEW;
  };
  if (inside(w)) return gazing(w);
  // Bisect between the planned gaze (point outside) and looking right at the point (inside).
  let outer = w;
  let inner: number = keep.end;
  for (let i = 0; i < 18; i++) {
    const mid = (outer + inner) / 2;
    if (inside(mid)) inner = mid;
    else outer = mid;
  }
  return gazing(inner);
}

/**
 * The next seat to the left (-1) or right (+1) in the same row, by seat number. Wheelchair spaces
 * are skipped (there is no seat to sit in); null at the end of the row.
 */
export function neighbourSeat(
  seats: readonly SeatMapSeat[],
  seat: SeatMapSeat,
  step: -1 | 1,
): SeatMapSeat | null {
  return (
    seats
      .filter((s) => s.row === seat.row && s.type !== 'WHEELCHAIR')
      .sort((a, b) => (a.number - b.number) * step)
      .find((s) => (s.number - seat.number) * step > 0) ?? null
  );
}

/**
 * From the hall view to a seat: the path rises above the seating and stays high up to 90% of the
 * way along the hall (on the side the camera starts from); the gaze turns from the seats to the
 * screen in the first half, keeping the screen center in the frame. The way back mirrors it.
 */
export const TO_SEAT = { lift: 3, gaze: [0, 0.5], over: [0, 0.9] } as const;

/** A box around every seated person, for framing the opening view. */
export function seatPoints(seats: readonly SeatMapSeat[]): Vec3[] {
  return seats.flatMap((s): Vec3[] => [
    [s.x - 0.45 * s.widthUnits, s.z, s.y - 0.5],
    [s.x + 0.45 * s.widthUnits, s.z + 1.15, s.y + 0.5],
  ]);
}

const OVERVIEW_AZIMUTH = 24 * DEG;
const OVERVIEW_ELEVATION = 26 * DEG;

/**
 * The opening view: from the front, beside the screen and a little above it, looking back at the
 * seating. The camera backs off along that direction until every point fits the frame, and so
 * does `alsoInView` (the screen center, so a flight to a seat keeps it in the frame from the
 * start). It ends up behind the screen wall, which is not drawn from behind: a cutaway.
 */
export function overviewPose(
  points: readonly Vec3[],
  aspect: number,
  alsoInView: readonly Vec3[] = [],
): { pose: Pose; target: Vec3 } {
  const mid = (i: number) =>
    (Math.min(...points.map((p) => p[i] ?? 0)) + Math.max(...points.map((p) => p[i] ?? 0))) / 2;
  const target: Vec3 = [mid(0), mid(1), mid(2)];
  // From the target towards the camera: to the right, up, towards the screen.
  const back: Vec3 = [
    Math.sin(OVERVIEW_AZIMUTH) * Math.cos(OVERVIEW_ELEVATION),
    Math.sin(OVERVIEW_ELEVATION),
    -Math.cos(OVERVIEW_AZIMUTH) * Math.cos(OVERVIEW_ELEVATION),
  ];
  const at = (d: number): Vec3 => [
    target[0] + back[0] * d,
    target[1] + back[1] * d,
    target[2] + back[2] * d,
  ];
  const { yaw, pitch } = lookAngles(at(1), target);
  const f = direction(yaw, pitch);
  const r: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const u = cross(r, f);
  const tanV = Math.tan((OVERVIEW_FOV / 2) * DEG) * 0.94; // a small margin around the seating
  const tanH = tanV * aspect;
  const fits = (d: number) => {
    const cam = at(d);
    return [...points, ...alsoInView].every((p) => {
      const v = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]] as const;
      const z = dot(v, f);
      const x = dot(v, r) / z;
      const y = dot(v, u) / z;
      return z > 0.1 && Math.abs(x) <= tanH && Math.abs(y) <= tanV;
    });
  };
  let lo = 0.5;
  let hi = 200;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    if (fits(d)) hi = d;
    else lo = d;
  }
  return { pose: { position: at(hi), yaw, pitch, fov: OVERVIEW_FOV }, target };
}

/** Seats grouped by row, front row first, each row from left to right. */
export function rowsOf(seats: readonly SeatMapSeat[]): SeatMapSeat[][] {
  const rows = new Map<string, SeatMapSeat[]>();
  for (const s of seats) rows.set(s.row, [...(rows.get(s.row) ?? []), s]);
  return [...rows.values()]
    .map((row) => row.sort((a, b) => a.x - b.x))
    .sort((a, b) => (a[0]?.y ?? 0) - (b[0]?.y ?? 0));
}

/** Width of one seat unit: the smallest center distance between neighbours, per unit. */
export function seatPitch(seats: readonly SeatMapSeat[]): number {
  let pitch = Infinity;
  for (const row of rowsOf(seats)) {
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1];
      const b = row[i];
      if (a && b) pitch = Math.min(pitch, (b.x - a.x) / ((a.widthUnits + b.widthUnits) / 2));
    }
  }
  return Number.isFinite(pitch) && pitch > 0.2 ? pitch : 0.55;
}

/** The middle of every aisle along a row: the gaps between seat blocks and both row ends. */
export function aisleXs(row: readonly SeatMapSeat[], pitch: number): number[] {
  const first = row[0];
  const last = row.at(-1);
  if (!first || !last) return [];
  const edge = (s: SeatMapSeat) => (s.widthUnits * pitch) / 2;
  const xs = [first.x - edge(first) - 0.45];
  for (let i = 1; i < row.length; i++) {
    const a = row[i - 1];
    const b = row[i];
    if (a && b && b.x - edge(b) - (a.x + edge(a)) > pitch * 0.5) xs.push((a.x + b.x) / 2);
  }
  return [...xs, last.x + edge(last) + 0.45];
}
