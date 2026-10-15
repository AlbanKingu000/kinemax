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
export const SEAT_FOV_RANGE = { min: 55, max: 60 } as const;
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

/** How far the edges of a curved screen stand in front of its middle. */
export function curveDepth(widthM: number): number {
  const r = widthM * CURVE_RADIUS_FACTOR;
  return r - Math.sqrt(r ** 2 - (widthM / 2) ** 2);
}

/** The corners and the top/bottom middle of the screen (a curved screen's edges stand forward). */
function screenPoints(screen: Screen, curved: boolean): Vec3[] {
  const edge = curved ? curveDepth(screen.widthM) : 0;
  return [-1, 0, 1].flatMap((sx) =>
    [-1, 1].map((sy): Vec3 => [
      screen.x + (sx * screen.widthM) / 2,
      screen.z + (sy * screen.heightM) / 2,
      screen.y + (sx === 0 ? 0 : edge),
    ]),
  );
}

/** Where the screen lands in the frame of a pose: its largest |x| and |y|, 1 = the frame edge. */
export function screenExtent(
  pose: Pose,
  screen: Screen,
  aspect: number,
  curved: boolean,
): { x: number; y: number } {
  const f = direction(pose.yaw, pose.pitch);
  const r: Vec3 = [Math.cos(pose.yaw), 0, -Math.sin(pose.yaw)];
  const u = cross(r, f);
  const tanV = Math.tan((pose.fov / 2) * DEG);
  let x = 0;
  let y = 0;
  for (const p of screenPoints(screen, curved)) {
    const v: Vec3 = [p[0] - pose.position[0], p[1] - pose.position[1], p[2] - pose.position[2]];
    const z = dot(v, f);
    x = Math.max(x, Math.abs(dot(v, r)) / z / (tanV * aspect));
    y = Math.max(y, Math.abs(dot(v, u)) / z / tanV);
  }
  return { x, y };
}

/** Fraction of the frame half-height the screen may use when the seated view looks lower. */
const SCREEN_MARGIN = 0.9;
/** How far (0..1) the seated view lowers towards the lowest pitch that still shows the screen. */
const SEAT_LOOK_LOWER = 0.75;

/**
 * The seated pose: eye height, facing the screen center. The field of view widens a little
 * (within SEAT_FOV_RANGE) where that keeps the whole screen in the frame, and the view looks a
 * little lower where the screen still fits with a margin, so the rows in front (seat backs) show,
 * as from a real seat. Front rows, which see a screen taller than the frame, simply look up at it.
 */
export function seatPose(seat: SeatMapSeat, screen: Screen, aspect: number, curved: boolean): Pose {
  const position = eyeOf(seat);
  const { yaw, pitch } = lookAngles(position, screenCenterOf(screen));
  const at = (p: number, fov: number): Pose => ({ position, yaw, pitch: p, fov });
  // At 90 degrees the extents are the tangents the frame must cover.
  const need = screenExtent(at(pitch, 90), screen, aspect, curved);
  const fov = Math.min(
    SEAT_FOV_RANGE.max,
    Math.max(SEAT_FOV_RANGE.min, (2 * Math.atan(Math.max(need.x, need.y) * 1.06)) / DEG),
  );
  let lowest = pitch;
  for (let p = pitch - DEG; p > pitch - 25 * DEG; p -= DEG) {
    if (screenExtent(at(p, fov), screen, aspect, curved).y > SCREEN_MARGIN) break;
    lowest = p;
  }
  return at(pitch - (pitch - lowest) * SEAT_LOOK_LOWER, fov);
}

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

/** Slow at the end only, for the opening settle. */
export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export interface Flight {
  from: Pose;
  to: Pose;
  /** Control point of the curved (quadratic Bezier) path. */
  control: Vec3;
  /** The yaw change, chosen to turn through the hall rather than towards a nearby wall. */
  yawDelta: number;
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Plans a camera flight. The path rises `lift` meters above the higher end and comes down again;
 * of the two ways to turn, it takes the one that looks more towards `lookThrough` halfway.
 */
export function planFlight(from: Pose, to: Pose, lift: number, lookThrough: Vec3): Flight {
  const mid: Vec3 = [
    (from.position[0] + to.position[0]) / 2,
    Math.max(from.position[1], to.position[1]) + lift,
    (from.position[2] + to.position[2]) / 2,
  ];
  const short = wrap(to.yaw - from.yaw);
  const long = short - Math.sign(short || 1) * 2 * Math.PI;
  const toward = lookAngles(mid, lookThrough).yaw;
  const score = (delta: number) => Math.cos(wrap(from.yaw + delta / 2 - toward));
  // Turning the long way is only worth it for big turns (it never doubles a small one).
  const yawDelta = Math.abs(short) > 2.6 && score(long) > score(short) ? long : short;
  return { from, to, control: mid, yawDelta };
}

/** The pose at progress t (0..1) of a flight, eased. */
export function flightPose(flight: Flight, t: number): Pose {
  const k = easeInOut(t);
  const { from, to, control } = flight;
  const a = (1 - k) ** 2;
  const b = 2 * (1 - k) * k;
  const c = k ** 2;
  const position = [0, 1, 2].map(
    (i) => a * (from.position[i] ?? 0) + b * (control[i] ?? 0) + c * (to.position[i] ?? 0),
  ) as unknown as Vec3;
  return {
    position,
    yaw: from.yaw + flight.yawDelta * k,
    pitch: from.pitch + (to.pitch - from.pitch) * k,
    fov: from.fov + (to.fov - from.fov) * k,
  };
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

const OVERVIEW_AZIMUTH = 24 * DEG;
const OVERVIEW_ELEVATION = 26 * DEG;

/**
 * The opening view: from the front, beside the screen and a little above it, looking back at the
 * seating. The camera backs off along that direction until every point fits the frame (in big
 * halls it ends up behind the screen wall, which is not drawn from behind: a cutaway).
 */
export function overviewPose(
  points: readonly Vec3[],
  aspect: number,
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
    return points.every((p) => {
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
