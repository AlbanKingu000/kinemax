import { describe, expect, it } from 'vitest';
import { seat } from '../test/seatmap';
import {
  aisleXs,
  clampFov,
  clampLook,
  direction,
  easeInOut,
  EYE_HEIGHT_M,
  flightPose,
  FOV_RANGE,
  LOOK_LIMITS,
  lookAngles,
  neighbourSeat,
  overviewPose,
  planFlight,
  rowsOf,
  screenDistance,
  screenExtent,
  seatPitch,
  seatPose,
  type Pose,
  type Vec3,
} from './seat-view';

const DEG = Math.PI / 180;
const screen = { widthM: 12, heightM: 5, x: 0, y: 0, z: 3.5 };
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('easeInOut', () => {
  it('starts and ends at rest and never goes backwards', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    // Slow at both ends: the first and last 5% cover far less than 5% of the way.
    expect(easeInOut(0.05)).toBeLessThan(0.01);
    expect(1 - easeInOut(0.95)).toBeLessThan(0.01);
    let previous = 0;
    for (let i = 1; i <= 100; i++) {
      const k = easeInOut(i / 100);
      expect(k).toBeGreaterThanOrEqual(previous);
      previous = k;
    }
  });
});

describe('camera flights', () => {
  const from: Pose = { position: [5, 8, -2], yaw: 2.7, pitch: -0.45, fov: 60 };
  const to: Pose = { position: [-1, 2.9, 11], yaw: 0.05, pitch: 0.02, fov: 55 };
  const flight = planFlight(from, to, 1.1, [0, 2, 9]);

  it('starts at the start and reaches the target exactly', () => {
    const start = flightPose(flight, 0);
    const end = flightPose(flight, 1);
    expect(start.position).toEqual(from.position);
    expect(start.yaw).toBeCloseTo(from.yaw);
    expect(end.position[0]).toBeCloseTo(to.position[0]);
    expect(end.position[1]).toBeCloseTo(to.position[1]);
    expect(end.position[2]).toBeCloseTo(to.position[2]);
    expect(wrap(end.yaw - to.yaw)).toBeCloseTo(0);
    expect(end.pitch).toBeCloseTo(to.pitch);
    expect(end.fov).toBeCloseTo(to.fov);
  });

  it('glides without jumps and is eased at both ends', () => {
    const steps = 240;
    const poses = Array.from({ length: steps + 1 }, (_, i) => flightPose(flight, i / steps));
    const moves = poses.slice(1).map((p, i) => dist(p.position, poses[i]?.position ?? p.position));
    const turns = poses.slice(1).map((p, i) => Math.abs(p.yaw - (poses[i]?.yaw ?? p.yaw)));
    const length = moves.reduce((a, b) => a + b, 0);
    // No single frame moves more than 3x an even share of the path, or turns more than 3 degrees.
    expect(Math.max(...moves)).toBeLessThan((length / steps) * 3);
    expect(Math.max(...turns)).toBeLessThan(3 * DEG);
    // Eased: the first and last frames barely move.
    expect(moves[0]).toBeLessThan(length / steps / 10);
    expect(moves.at(-1)).toBeLessThan(length / steps / 10);
  });

  it('rises a little above the higher end, then descends to the seat', () => {
    const heights = Array.from({ length: 101 }, (_, i) => flightPose(flight, i / 100).position[1]);
    const top = Math.max(...heights);
    expect(top).toBeGreaterThan(from.position[1]);
    expect(top).toBeLessThan(from.position[1] + 1.1);
    expect(heights.at(-1)).toBeCloseTo(to.position[1]);
  });

  it('turns through the hall for a big turn, and the short way for a small one', () => {
    // Halfway the camera looks towards the seats (+Z), not at the wall beside it.
    const mid = flightPose(flight, 0.5);
    expect(direction(mid.yaw, mid.pitch)[0]).toBeLessThan(0);
    const small = planFlight(to, { ...to, position: [-0.45, 2.9, 11], yaw: 0.1 }, 0.12, [0, 2, 9]);
    expect(small.yawDelta).toBeCloseTo(0.05);
  });
});

describe('looking around from a seat', () => {
  it('keeps the head turn inside the limits', () => {
    expect(clampLook(2, 1)).toEqual({ yaw: LOOK_LIMITS.yaw, pitch: LOOK_LIMITS.up });
    expect(clampLook(-2, -1)).toEqual({ yaw: -LOOK_LIMITS.yaw, pitch: LOOK_LIMITS.down });
    expect(clampLook(0.2, -0.1)).toEqual({ yaw: 0.2, pitch: -0.1 });
    expect(LOOK_LIMITS.yaw).toBeCloseTo(70 * DEG);
    expect(LOOK_LIMITS.down).toBeCloseTo(-25 * DEG);
    expect(LOOK_LIMITS.up).toBeCloseTo(20 * DEG);
  });

  it('only allows a small field-of-view range', () => {
    expect(clampFov(10)).toBe(FOV_RANGE.min);
    expect(clampFov(120)).toBe(FOV_RANGE.max);
    expect(clampFov(57)).toBe(57);
  });
});

describe('neighbourSeat', () => {
  const companion = seat('C', 2, { type: 'COMPANION' });
  const third = seat('C', 3);
  const fifth = seat('C', 5, { status: 'TAKEN' });
  const row = [
    seat('C', 1, { type: 'WHEELCHAIR' }),
    companion,
    third,
    seat('C', 4, { type: 'WHEELCHAIR' }),
    fifth,
  ];
  const seats = [...row, seat('D', 3), seat('D', 4)];

  it('moves along the row, skipping wheelchair spaces', () => {
    expect(neighbourSeat(seats, third, 1)?.number).toBe(5);
    expect(neighbourSeat(seats, fifth, -1)?.number).toBe(3);
    expect(neighbourSeat(seats, third, -1)?.number).toBe(2);
  });

  it('stops at the row ends (a wheelchair space at the end is no seat)', () => {
    expect(neighbourSeat(seats, companion, -1)).toBeNull();
    expect(neighbourSeat(seats, fifth, 1)).toBeNull();
  });
});

describe('screenDistance', () => {
  it('measures from the seated eye to the screen center', () => {
    // Eye at 3.5 m (the screen center height): straight 12 m back and 5 m to the side → 13 m.
    const s = seat('H', 1, { x: 5, y: 12, z: 3.5 - EYE_HEIGHT_M });
    expect(screenDistance(s, screen)).toBeCloseTo(13);
  });
});

describe('seatPose', () => {
  it('sits at eye height above the tier, facing the screen', () => {
    const s = seat('H', 1, { x: 0, y: 11, z: 1.75 });
    const pose = seatPose(s, screen, 1.6, false);
    expect(pose.position).toEqual([0, 1.75 + EYE_HEIGHT_M, 11]);
    expect(pose.yaw).toBeCloseTo(0);
    expect(pose.fov).toBeGreaterThanOrEqual(55);
    expect(pose.fov).toBeLessThanOrEqual(60);
  });

  it('shows the whole screen with a margin from a normal seat, looking a little low', () => {
    for (const x of [-4, 0, 4]) {
      const s = seat('H', 1, { x, y: 11, z: 1.75 });
      const pose = seatPose(s, screen, 1.6, false);
      const extent = screenExtent(pose, screen, 1.6, false);
      expect(extent.x).toBeLessThan(1);
      expect(extent.y).toBeLessThanOrEqual(0.9);
      // Below the screen center, so the rows in front are in view.
      expect(pose.pitch).toBeLessThan(lookAngles(pose.position, [0, 3.5, 0]).pitch);
    }
  });

  it('keeps the curved Grand screen in view from the middle of the hall', () => {
    const grand = { widthM: 22, heightM: 9.5, x: 0, y: 0, z: 5.5 };
    const s = seat('K', 12, { x: 0.3, y: 15.6, z: 3.6 });
    const pose = seatPose(s, grand, 1.6, true);
    const extent = screenExtent(pose, grand, 1.6, true);
    expect(extent.x).toBeLessThan(1);
    expect(extent.y).toBeLessThan(1);
  });

  it('looks up from the front row', () => {
    const pose = seatPose(seat('A', 1, { x: 0, y: 4.5, z: 0 }), screen, 1.6, false);
    expect(pose.pitch).toBeGreaterThan(10 * DEG);
  });
});

describe('overviewPose', () => {
  const seats = [
    ...[-4, -2, 2, 4].map((x, i) => seat('A', i + 1, { x, y: 4.5, z: 0 })),
    ...[-4, -2, 2, 4].map((x, i) => seat('F', i + 1, { x, y: 10, z: 1.5 })),
  ];
  const points = seats.flatMap((s): Vec3[] => [
    [s.x - 0.45, s.z, s.y - 0.5],
    [s.x + 0.45, s.z + 1.15, s.y + 0.5],
  ]);

  it('looks back at the seats from the front, beside and above the screen', () => {
    const { pose, target } = overviewPose(points, 1.6);
    expect(pose.position[2]).toBeLessThan(4.5); // in front of the first row
    expect(pose.position[0]).toBeGreaterThan(0); // beside the screen
    expect(pose.position[1]).toBeGreaterThan(3); // above the seats
    expect(Math.cos(pose.yaw)).toBeLessThan(0); // facing the back of the hall
    expect(target[2]).toBeCloseTo(7.25);
  });

  it('fits every seat in the frame', () => {
    for (const aspect of [1.6, 1]) {
      const { pose } = overviewPose(points, aspect);
      const f = direction(pose.yaw, pose.pitch);
      const r: Vec3 = [Math.cos(pose.yaw), 0, -Math.sin(pose.yaw)];
      const u: Vec3 = [
        r[1] * f[2] - r[2] * f[1],
        r[2] * f[0] - r[0] * f[2],
        r[0] * f[1] - r[1] * f[0],
      ];
      const tan = Math.tan((pose.fov / 2) * DEG);
      for (const p of points) {
        const v = [p[0] - pose.position[0], p[1] - pose.position[1], p[2] - pose.position[2]];
        const z = (v[0] ?? 0) * f[0] + (v[1] ?? 0) * f[1] + (v[2] ?? 0) * f[2];
        expect(z).toBeGreaterThan(0);
        expect(Math.abs((v[0] ?? 0) * r[0] + (v[2] ?? 0) * r[2]) / z).toBeLessThanOrEqual(
          tan * aspect,
        );
        expect(
          Math.abs((v[0] ?? 0) * u[0] + (v[1] ?? 0) * u[1] + (v[2] ?? 0) * u[2]) / z,
        ).toBeLessThanOrEqual(tan);
      }
    }
  });
});

describe('hall layout helpers', () => {
  const rowA = [
    seat('A', 1, { x: -2.75 }),
    seat('A', 2, { x: -2.2 }),
    seat('A', 3, { x: 2.2 }),
    seat('A', 4, { x: 3.025, widthUnits: 2 }),
  ];

  it('groups rows front to back, seats left to right', () => {
    const rows = rowsOf([seat('B', 1, { x: 1, y: 6 }), ...rowA.slice().reverse()]);
    expect(rows.map((r) => r[0]?.row)).toEqual(['A', 'B']);
    expect(rows[0]?.map((s) => s.number)).toEqual([1, 2, 3, 4]);
  });

  it('finds the seat width and the aisles', () => {
    expect(seatPitch(rowA)).toBeCloseTo(0.55);
    expect(seatPitch([seat('A', 1)])).toBe(0.55);
    const aisles = aisleXs(rowA, 0.55);
    expect(aisles).toHaveLength(3);
    expect(aisles[0]).toBeLessThan(-2.75);
    expect(aisles[1]).toBeCloseTo(0);
    expect(aisles[2]).toBeGreaterThan(3.025);
  });
});
