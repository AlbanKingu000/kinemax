// The 3D hall (three.js via @react-three/fiber + drei). Lazy-loaded: only the booking page pulls
// this chunk in. Built from the real seat coordinates: x = left/right of the center line, y =
// distance from the screen wall, z = tier height. In three.js: X = x, Y (up) = z, Z = y.
//
// Camera: it opens from the front (beside and above the screen, looking back at the seats) and
// orbits there. Opening a seat glides there on a curved path; in the seat the camera is locked to
// the seat and can only look around (drag, one finger, arrow keys) within LOOK_LIMITS.
import type { SeatMapResponse, SeatMapSeat } from '@kinemax/shared';
import { Html, OrbitControls, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import styles from './Hall3D.module.css';
import {
  companionPiping,
  curtains,
  floorPlane,
  loveseat,
  planes,
  recliner,
  reclinerPiping,
  screenFrame,
  sideTable,
  sofaArm,
  sofaSegment,
  standardSeat,
  boxes,
  worldUVs,
} from './hall-models';
import {
  beamTexture,
  carpetTexture,
  fabricTexture,
  glowTexture,
  iconDecalTexture,
  monogramTexture,
  token,
} from './hall-textures';
import {
  aisleXs,
  clampFov,
  clampLook,
  curveDepth,
  CURVE_RADIUS_FACTOR,
  easeInOut,
  flightPose,
  lookAngles,
  overviewPose,
  planFlight,
  rowsOf,
  screenCenterOf,
  seatPitch,
  seatPoints,
  seatPose,
  SEAT_FOV_RANGE,
  TO_SEAT,
  type Flight,
  type FlightPlan,
  type Pose,
  type Vec3,
} from './seat-view';

export interface Hall3DProps {
  map: SeatMapResponse;
  selected: readonly string[];
  /** The seat to look from (the camera glides there); null for the hall view. */
  viewSeat: SeatMapSeat | null;
  onView: (seat: SeatMapSeat | null) => void;
  /** The camera has arrived at the seat (the seat view overlay may show now). */
  onArrive: (seatId: string) => void;
  /** "[" / "]" in the seat view: the neighbouring seat to the left (-1) or right (+1). */
  onStep: (step: -1 | 1) => void;
  /** The user turns the head in the seat view (drag, one finger, arrow keys). */
  onLook: () => void;
  /** Increment to glide back to the opening view ("Rikthe pamjen"). */
  resetSignal: number;
  /** Increment to turn the head back to the screen ("Shiko ekranin"). */
  recenterSignal: number;
  reducedMotion: boolean;
  tooltip: (seat: SeatMapSeat) => string;
  label: string;
  /** Accessible name of the seat view (how to look around). */
  lookLabel: string;
}

type Mode = 'front' | 'free' | 'flight' | 'seat';

/**
 * True for a software WebGL renderer (no GPU: SwiftShader, llvmpipe, Microsoft Basic Render).
 * Those get a lighter hall: no antialiasing, simpler materials, fewer lights, no haze.
 */
function softwareRenderer(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/** Camera state shared by the rig (inside the canvas) and the look-around input (outside). */
interface Rig {
  mode: Mode;
  flight: { plan: Flight; start: number; duration: number; done: () => void } | null;
  /** The seated pose while in a seat; look offsets turn the head from it. */
  base: Pose | null;
  look: { yaw: number; pitch: number };
  recenter: { from: { yaw: number; pitch: number }; start: number } | null;
  fov: number;
  /** The point the camera looks at (the seating's middle in the hall view, the screen in a seat). */
  gazeAt: Vec3;
}

/** A flight: where it looks at the end; the rest as in FlightPlan. */
type FlyPlan = Omit<FlightPlan, 'look'> & { lookAt: Vec3 };

const FLIGHT_MS = 2500;
const SEAT_TO_SEAT_MS = 1000;
const RESET_MS = 1300;
const SETTLE_MS = 1600;
const RECENTER_MS = 650;
const FADE_MS = 180;
const DEG = Math.PI / 180;

/** Colors that are not seat types (seat colors come from the design tokens). */
const WALL = { STANDARD: '#1f181b', PRIVATE_SUITE: '#2a1a1c' } as Record<string, string>;
const IVORY = '#f3eee8';
const TAKEN = '#3b3739';
const WARM = '#ffcf9e';
const AMBER = '#ffb06a';

type ModelKey = 'standard' | 'companion' | 'vip' | 'couple' | 'sofa';

function modelOf(seat: SeatMapSeat, suite: boolean): ModelKey | null {
  if (seat.type === 'WHEELCHAIR') return null;
  if (suite) return 'sofa';
  if (seat.type === 'VIP') return 'vip';
  if (seat.type === 'COUPLE') return 'couple';
  return seat.type === 'COMPANION' ? 'companion' : 'standard';
}

interface Bounds {
  halfWidth: number;
  depth: number;
  height: number;
  /** Floor height (tier) at a distance from the screen wall. */
  floorAt: (y: number) => number;
  rows: { seats: SeatMapSeat[]; front: number; z: number; y: number }[];
}

function hallBounds(map: SeatMapResponse): Bounds {
  const { screen } = map.hall;
  const rows = rowsOf(map.seats).map((seats, i, all) => {
    const first = seats[0];
    const prev = all[i - 1]?.[0];
    const y = first?.y ?? 0;
    const spacing = prev ? y - prev.y : 1;
    return { seats, y, z: first?.z ?? 0, front: y - spacing * 0.5 };
  });
  const xs = map.seats.map((s) => Math.abs(s.x) + 0.6 * s.widthUnits);
  const halfWidth = Math.max(screen.widthM / 2 + 2.9, ...xs.map((x) => x + 1.4));
  const depth = Math.max(...map.seats.map((s) => s.y), 6) + 2.4;
  const height = Math.max(
    screen.z + screen.heightM / 2 + 1.7,
    Math.max(...map.seats.map((s) => s.z)) + 3.8,
  );
  const floorAt = (y: number) =>
    rows.reduce((h, row) => (y >= row.front && row.z > h ? row.z : h), 0);
  return { halfWidth, depth, height, floorAt, rows };
}

const tmp = new THREE.Object3D();
const color = new THREE.Color();

/** Places instance i: on the floor at (x, y, z) (three.js space), turned by yaw. */
function place(
  mesh: THREE.InstancedMesh,
  i: number,
  at: Vec3,
  yaw = 0,
  scale: Vec3 = [1, 1, 1],
  tilt = 0,
) {
  tmp.position.set(...at);
  tmp.rotation.set(tilt, yaw, 0, 'YXZ');
  tmp.scale.set(...scale);
  tmp.updateMatrix();
  mesh.setMatrixAt(i, tmp.matrix);
}

/** The yaw that turns a seat towards the screen center (seat.rotationDeg, in three.js terms). */
const seatYaw = (seat: SeatMapSeat, suite: boolean) =>
  suite ? 0 : -THREE.MathUtils.degToRad(seat.rotationDeg);

interface SeatsProps {
  map: SeatMapResponse;
  selected: readonly string[];
  hovered: string | null;
  interactive: boolean;
  /** Software renderer: simpler materials. */
  lite: boolean;
  onHover: (seat: SeatMapSeat | null) => void;
  onPick: (seat: SeatMapSeat) => void;
}

/** One InstancedMesh per seat model, plus extras (piping, tables, sofa arms, decals, halos). */
function Seats({ map, selected, hovered, interactive, lite, onHover, onPick }: SeatsProps) {
  const suite = map.hall.hallType.code === 'PRIVATE_SUITE';
  const pitch = useMemo(() => seatPitch(map.seats), [map.seats]);
  const groups = useMemo(() => {
    const byModel = new Map<ModelKey, SeatMapSeat[]>();
    for (const seat of map.seats) {
      const key = modelOf(seat, suite);
      if (key) byModel.set(key, [...(byModel.get(key) ?? []), seat]);
    }
    return [...byModel.entries()];
  }, [map.seats, suite]);

  const assets = useMemo(() => {
    const velvet = lite
      ? new THREE.MeshLambertMaterial({ vertexColors: true })
      : new THREE.MeshPhysicalMaterial({
          vertexColors: true,
          roughness: 0.9,
          sheen: 1,
          sheenRoughness: 0.42,
          sheenColor: new THREE.Color('#d8b9bd'),
        });
    const leather = lite
      ? new THREE.MeshLambertMaterial({ vertexColors: true })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.05 });
    return {
      velvet,
      leather,
      piping: new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.6 }),
      gold: new THREE.MeshStandardMaterial({
        color: token('--color-seat-piping', '#c9a46a'),
        roughness: 0.35,
        metalness: 0.3,
      }),
      wood: new THREE.MeshStandardMaterial({
        vertexColors: true,
        color: '#4a2e1c',
        roughness: 0.5,
      }),
      colors: {
        standard: token('--color-seat-standard', '#8e1023'),
        companion: token('--color-seat-standard', '#8e1023'),
        vip: token('--color-seat-vip', '#7c2a3a'),
        couple: token('--color-seat-couple', '#a3354b'),
        sofa: token('--color-seat-vip', '#7c2a3a'),
      } satisfies Record<ModelKey, string>,
      crimson: token('--color-crimson', '#b3132f'),
      decal: iconDecalTexture('wheelchair', IVORY),
      glow: glowTexture(),
    };
  }, [lite]);
  useEffect(
    () => () => {
      for (const m of [assets.velvet, assets.leather, assets.piping, assets.gold, assets.wood]) {
        m.dispose();
      }
      assets.decal.dispose();
      assets.glow.dispose();
    },
    [assets],
  );

  const wheelchairs = useMemo(() => map.seats.filter((s) => s.type === 'WHEELCHAIR'), [map.seats]);
  const haloGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const halos = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  // A glow around the selected seats (crimson) and the hovered one (soft ivory). The glows face
  // the camera; they are hidden when the camera glides or sits in a seat.
  const glowing = useMemo(
    () =>
      interactive
        ? [
            ...selected.flatMap((id) => {
              const seat = map.seats.find((s) => s.id === id);
              return seat
                ? [{ seat, tint: new THREE.Color(assets.crimson).multiplyScalar(2.6) }]
                : [];
            }),
            ...map.seats
              .filter((s) => s.id === hovered && !selected.includes(s.id))
              .map((seat) => ({ seat, tint: new THREE.Color(IVORY).multiplyScalar(0.4) })),
          ]
        : [],
    [interactive, selected, hovered, map.seats, assets],
  );
  useLayoutEffect(() => {
    const mesh = halos.current;
    if (!mesh) return;
    glowing.forEach(({ tint }, i) => {
      mesh.setColorAt(i, tint);
    });
    mesh.count = glowing.length;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [glowing, invalidate]);
  useFrame(({ camera }) => {
    const mesh = halos.current;
    if (!mesh || glowing.length === 0) return;
    glowing.forEach(({ seat }, i) => {
      const size = Math.max(1.7, seat.widthUnits * pitch * 2.6);
      tmp.position.set(seat.x, seat.z + 0.62, seat.y);
      tmp.quaternion.copy(camera.quaternion);
      tmp.scale.set(size, size, 1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  const rowEnds = useMemo(
    () =>
      suite
        ? rowsOf(map.seats).flatMap((row) => {
            const first = row[0];
            const last = row.at(-1);
            return first && last
              ? [
                  { seat: first, x: first.x - pitch / 2 - 0.09 },
                  { seat: last, x: last.x + pitch / 2 + 0.09 },
                ]
              : [];
          })
        : [],
    [map.seats, pitch, suite],
  );

  return (
    <>
      {groups.map(([key, seats]) => (
        <SeatModel
          key={key}
          model={key}
          seats={seats}
          pitch={pitch}
          suite={suite}
          material={key === 'vip' || key === 'sofa' ? assets.leather : assets.velvet}
          baseColor={assets.colors[key]}
          selected={selected}
          hovered={hovered}
          interactive={interactive}
          onHover={onHover}
          onPick={onPick}
        />
      ))}
      {groups.map(([key, seats]) =>
        key === 'companion' ? (
          <Extra key={key} seats={seats} suite={suite} material={assets.piping}>
            {companionPiping(pitch)}
          </Extra>
        ) : key === 'vip' ? (
          <Fragment key={key}>
            <Extra seats={seats} suite={suite} material={assets.gold}>
              {reclinerPiping(pitch)}
            </Extra>
            {pitch >= 0.8 && (
              <Extra seats={seats} suite={suite} material={assets.wood}>
                {sideTable(pitch)}
              </Extra>
            )}
          </Fragment>
        ) : null,
      )}
      {rowEnds.length > 0 && (
        <SofaArms ends={rowEnds} material={assets.leather} tint={assets.colors.sofa} />
      )}
      {wheelchairs.length > 0 && (
        <WheelchairDecals seats={wheelchairs} pitch={pitch} texture={assets.decal} />
      )}
      <instancedMesh
        ref={halos}
        args={[haloGeometry, undefined, Math.max(1, map.seats.length)]}
        count={0}
        frustumCulled={false}
        renderOrder={2}
      >
        <meshBasicMaterial
          map={assets.glow}
          transparent
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

const MODEL_GEOMETRY: Record<ModelKey, (pitch: number) => THREE.BufferGeometry> = {
  standard: standardSeat,
  companion: standardSeat,
  vip: recliner,
  couple: (pitch) => loveseat(pitch * 2),
  sofa: sofaSegment,
};

function SeatModel({
  model,
  seats,
  pitch,
  suite,
  material,
  baseColor,
  selected,
  hovered,
  interactive,
  onHover,
  onPick,
}: Omit<SeatsProps, 'map' | 'lite'> & {
  model: ModelKey;
  seats: SeatMapSeat[];
  pitch: number;
  suite: boolean;
  material: THREE.Material;
  baseColor: string;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => MODEL_GEOMETRY[model](pitch), [model, pitch]);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    seats.forEach((seat, i) => {
      place(m, i, [seat.x, seat.z, seat.y], seatYaw(seat, suite));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [seats, suite]);

  // States: available (type color), hovered (towards ivory), selected (bright ivory: the most
  // visible thing in the hall), taken (dark desaturated grey).
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    seats.forEach((seat, i) => {
      if (selected.includes(seat.id)) color.set(IVORY).multiplyScalar(2.4);
      else if (seat.status === 'TAKEN') color.set(TAKEN);
      else if (hovered === seat.id)
        color.set(baseColor).lerp(new THREE.Color(IVORY), 0.5).multiplyScalar(1.5);
      else color.set(baseColor);
      m.setColorAt(i, color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    invalidate();
  }, [seats, selected, hovered, baseColor, invalidate]);

  const seatAt = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.instanceId === undefined ? undefined : seats[event.instanceId];

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, seats.length]}
      onPointerMove={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        const seat = seatAt(event);
        onHover(seat && seat.status === 'AVAILABLE' ? seat : null);
      }}
      onPointerOut={() => {
        onHover(null);
      }}
      onClick={(event) => {
        // Clicks while the camera glides, or from inside a seat, are ignored.
        if (!interactive) return;
        event.stopPropagation();
        const seat = seatAt(event);
        if (seat && (seat.status === 'AVAILABLE' || selected.includes(seat.id))) onPick(seat);
      }}
    />
  );
}

/** A second model drawn with the same placement as some seats (piping, side tables). */
function Extra({
  seats,
  suite,
  material,
  children: geometry,
}: {
  seats: SeatMapSeat[];
  suite: boolean;
  material: THREE.Material;
  children: THREE.BufferGeometry;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    seats.forEach((seat, i) => {
      place(m, i, [seat.x, seat.z, seat.y], seatYaw(seat, suite));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [seats, suite]);
  return <instancedMesh ref={mesh} args={[geometry, material, seats.length]} />;
}

function SofaArms({
  ends,
  material,
  tint,
}: {
  ends: { seat: SeatMapSeat; x: number }[];
  material: THREE.Material;
  tint: string;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => sofaArm(), []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    ends.forEach(({ seat, x }, i) => {
      place(m, i, [x, seat.z, seat.y]);
      m.setColorAt(i, color.set(tint));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [ends, tint]);
  return <instancedMesh ref={mesh} args={[geometry, material, ends.length]} />;
}

/** Wheelchair spaces: no seat, a design-system icon on the floor. */
function WheelchairDecals({
  seats,
  pitch,
  texture,
}: {
  seats: SeatMapSeat[];
  pitch: number;
  texture: THREE.Texture;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => floorPlane(), []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const size = Math.min(0.8, pitch * 1.3);
    seats.forEach((seat, i) => {
      place(m, i, [seat.x, seat.z + 0.012, seat.y], seatYaw(seat, false), [size, 1, size]);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [seats, pitch]);
  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, seats.length]}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </instancedMesh>
  );
}

/** Emissive bits (LED strips, sconces, downlights, booth window, lamps) and their soft glows. */
interface Light {
  at: Vec3;
  size: Vec3;
  color: string;
  /** Brightness multiplier (toneMapped off: 1 = full color). */
  power?: number;
}
interface Glow {
  at: Vec3;
  size: [number, number];
  /** 'floor' lies flat; 'left'/'right' wall faces point into the room; 'back' faces the screen. */
  facing: 'floor' | 'ceiling' | 'left' | 'right' | 'back';
  color: string;
  power: number;
}

function roomLights(map: SeatMapResponse, b: Bounds, suite: boolean) {
  const pitch = seatPitch(map.seats);
  const lights: Light[] = [];
  const glows: Glow[] = [];
  // LED strips on the step nosing of every aisle, with a small warm pool on the floor.
  for (const row of b.rows) {
    for (const x of aisleXs(row.seats, pitch)) {
      if (Math.abs(x) > b.halfWidth - 0.2) continue;
      lights.push({
        at: [x, row.z + 0.01, row.front + 0.03],
        size: [0.42, 0.02, 0.03],
        color: AMBER,
        power: 1.3,
      });
      glows.push({
        at: [x, row.z + 0.012, row.front + 0.3],
        size: [0.9, 0.6],
        facing: 'floor',
        color: AMBER,
        power: 0.3,
      });
    }
  }
  // Wall sconces between the acoustic panels, washing the wall up and down.
  for (const z of panelGaps(b)) {
    const y = b.floorAt(z) + 2.3;
    if (y > b.height - 0.6) continue;
    for (const side of [-1, 1] as const) {
      const x = side * (b.halfWidth - 0.05);
      lights.push({ at: [x, y, z], size: [0.05, 0.28, 0.09], color: WARM, power: 1.2 });
      glows.push({
        at: [side * (b.halfWidth - 0.02), y, z],
        size: [0.95, 2.2],
        facing: side < 0 ? 'left' : 'right',
        color: WARM,
        power: 0.42,
      });
    }
  }
  // Small downlights in the ceiling: a bright point in a soft halo, both facing down only (so
  // nothing shows when the camera looks over the walls from above).
  for (let z = 2; z < b.depth - 0.8; z += 2.8) {
    for (const x of [-0.55, 0, 0.55]) {
      const at: Vec3 = [x * b.halfWidth, b.height - 0.01, z];
      glows.push({ at, size: [0.16, 0.16], facing: 'ceiling', color: '#fff2e0', power: 2.2 });
      glows.push({ at, size: [0.9, 0.9], facing: 'ceiling', color: WARM, power: 0.35 });
    }
  }
  // The projection booth window high in the back wall: small and warm, in a soft halo.
  const [bx, by] = booth(b);
  lights.push({ at: [bx, by, b.depth - 0.012], size: BOOTH_WINDOW, color: '#ffc58c', power: 0.85 });
  glows.push({
    at: [bx, by, b.depth - 0.03],
    size: [2.4, 1.6],
    facing: 'back',
    color: AMBER,
    power: 0.3,
  });
  // Screen light spilling onto the floor in front of the screen.
  const { screen } = map.hall;
  glows.push({
    at: [0, 0.014, 2.6],
    size: [screen.widthM * 0.95, 5.5],
    facing: 'floor',
    color: '#d9dcff',
    power: 0.07,
  });
  if (suite) {
    for (const side of [-1, 1] as const) {
      const at: Vec3 = [side * (b.halfWidth - 0.6), 1.45, b.depth - 0.7];
      lights.push({ at, size: [0.36, 0.3, 0.36], color: '#ffc58a', power: 1.1 });
      glows.push({
        at: [side * (b.halfWidth - 0.02), 1.6, b.depth - 0.7],
        size: [1.6, 2.4],
        facing: side < 0 ? 'left' : 'right',
        color: '#ffb470',
        power: 0.5,
      });
      glows.push({
        at: [at[0], 0.015, at[2]],
        size: [2.2, 2.2],
        facing: 'floor',
        color: '#ffb470',
        power: 0.35,
      });
    }
  }
  return { lights, glows };
}

/** Depths of the gaps between the side-wall panels (where the sconces hang). */
function panelGaps(b: Bounds): number[] {
  const gaps: number[] = [];
  for (let z = 1.4; z < b.depth - 0.8; z += 2.6) gaps.push(z);
  return gaps;
}

const booth = (b: Bounds): Vec3 => [b.halfWidth * 0.18, b.height - 1.15, b.depth - 0.05];
const BOOTH_WINDOW: Vec3 = [0.62, 0.3, 0.02];

const GLOW_ROTATION: Record<Glow['facing'], [number, number]> = {
  floor: [-Math.PI / 2, 0],
  left: [0, Math.PI / 2],
  right: [0, -Math.PI / 2],
  back: [0, Math.PI],
  ceiling: [Math.PI / 2, 0],
};

function Room({ map, bounds: b, lite }: { map: SeatMapResponse; bounds: Bounds; lite: boolean }) {
  const code = map.hall.hallType.code;
  const suite = code === 'PRIVATE_SUITE';
  const curved = code === 'PREMIUM_LARGE_FORMAT';
  const { screen } = map.hall;
  const parts = useMemo(() => {
    const wall = WALL[code] ?? WALL.STANDARD ?? '#171214';
    // Floor and stadium tiers in one carpeted mesh.
    const floor = worldUVs(
      boxes([
        { size: [b.halfWidth * 2 - 0.02, 0.02, b.depth], at: [0, -0.01, b.depth / 2] },
        ...b.rows
          .filter((row) => row.z > 0.01)
          .map((row) => ({
            size: [b.halfWidth * 2 - 0.02, row.z, b.depth - row.front - 0.01] as Vec3,
            at: [0, row.z / 2, (row.front + b.depth) / 2] as Vec3,
          })),
      ]),
    );
    const walls = planes([
      {
        size: [b.depth, b.height],
        at: [-b.halfWidth, b.height / 2, b.depth / 2],
        rotation: [0, Math.PI / 2, 0],
        shade: 1,
      },
      {
        size: [b.depth, b.height],
        at: [b.halfWidth, b.height / 2, b.depth / 2],
        rotation: [0, -Math.PI / 2, 0],
        shade: 1,
      },
      {
        size: [b.halfWidth * 2, b.height],
        at: [0, b.height / 2, b.depth],
        rotation: [0, Math.PI, 0],
        shade: 0.9,
      },
      {
        size: [b.halfWidth * 2, b.height],
        at: [0, b.height / 2, 0],
        rotation: [0, 0, 0],
        shade: 0.3,
      },
      {
        size: [b.halfWidth * 2, b.depth],
        at: [0, b.height, b.depth / 2],
        rotation: [Math.PI / 2, 0, 0],
        shade: 0.45,
      },
    ]);
    // Fabric acoustic panels along both side walls.
    const panelItems = panelGaps(b)
      .slice(0, -1)
      .flatMap((z) => {
        const mid = z + 1.3;
        const bottom = b.floorAt(mid) + 0.9;
        const height = Math.min(2.8, b.height - bottom - 0.5);
        return height < 0.8
          ? []
          : [-1, 1].map((side) => ({
              size: [0.05, height, 2.1] as Vec3,
              at: [side * (b.halfWidth - 0.03), bottom + height / 2, mid] as Vec3,
            }));
      });
    const panels = worldUVs(boxes(panelItems));
    const { lights, glows } = roomLights(map, b, suite);
    // Projector beam: a frustum from the booth window to the screen, fading towards the screen.
    const [bx, by, bz] = booth(b);
    const beam = new THREE.BufferGeometry();
    const sw = screen.widthM / 2;
    const sh = screen.heightM / 2;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const;
    const positions: number[] = [];
    const uvs: number[] = [];
    corners.forEach(([cx, cy], i) => {
      const [nx, ny] = corners[(i + 1) % 4] ?? corners[0];
      const quad = [
        [bx + (cx * BOOTH_WINDOW[0]) / 2, by + (cy * BOOTH_WINDOW[1]) / 2, bz, 0],
        [bx + (nx * BOOTH_WINDOW[0]) / 2, by + (ny * BOOTH_WINDOW[1]) / 2, bz, 0],
        [screen.x + nx * sw, screen.z + ny * sh, 0.2, 1],
        [screen.x + cx * sw, screen.z + cy * sh, 0.2, 1],
      ] as const;
      for (const k of [0, 1, 2, 0, 2, 3]) {
        const v = quad[k] ?? quad[0];
        positions.push(v[0], v[1], v[2]);
        uvs.push(0.5, v[3]);
      }
    });
    beam.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    beam.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    // Light haze: dust motes floating in the beam.
    const haze = new THREE.BufferGeometry();
    const motes: number[] = [];
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      // From the booth (s = 0) towards a random point on the screen.
      const s = 0.08 + rnd() * 0.85;
      const tx = screen.x + (rnd() * 2 - 1) * sw * 0.85;
      const ty = screen.z + (rnd() * 2 - 1) * sh * 0.85;
      motes.push(bx + (tx - bx) * s, by + (ty - by) * s, bz + (0.2 - bz) * s);
    }
    haze.setAttribute('position', new THREE.Float32BufferAttribute(motes, 3));
    return { wall, floor, walls, panels, panelCount: panelItems.length, lights, glows, beam, haze };
  }, [map, b, code, suite, screen]);

  const textures = useMemo(
    () => ({
      carpet: suite ? carpetTexture('#2a1714', '#b88a5a') : carpetTexture('#21171a', '#8a2232'),
      rug: carpetTexture('#4a1f22', '#c9a46a'),
      fabric: fabricTexture(),
      glow: glowTexture(),
      beam: beamTexture(),
      logo: monogramTexture(IVORY, token('--color-crimson', '#b3132f')),
    }),
    [suite],
  );
  useEffect(
    () => () => {
      for (const t of Object.values(textures)) t.dispose();
    },
    [textures],
  );

  const lightMesh = useRef<THREE.InstancedMesh>(null);
  const glowMesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const lm = lightMesh.current;
    const gm = glowMesh.current;
    if (!lm || !gm) return;
    parts.lights.forEach((l, i) => {
      place(lm, i, l.at, 0, l.size);
      lm.setColorAt(i, color.set(l.color).multiplyScalar(l.power ?? 1));
    });
    parts.glows.forEach((g, i) => {
      const [tilt, yaw] = GLOW_ROTATION[g.facing];
      place(gm, i, g.at, yaw, [g.size[0], g.size[1], 1], tilt);
      gm.setColorAt(i, color.set(g.color).multiplyScalar(g.power));
    });
    for (const m of [lm, gm]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }, [parts]);

  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const unitPlane = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const curtainGeometry = useMemo(
    () =>
      curtains(
        screen.widthM,
        screen.heightM,
        screen.z,
        b.height,
        curved ? curveDepth(screen.widthM) : 0,
      ),
    [screen, b.height, curved],
  );
  const frame = useMemo(
    () => (curved ? null : screenFrame(screen.widthM, screen.heightM)),
    [screen, curved],
  );
  const furniture = useMemo(() => (suite ? suiteFurniture(map, b) : null), [map, b, suite]);

  return (
    <group>
      <mesh geometry={parts.floor}>
        <meshStandardMaterial
          map={textures.carpet}
          roughness={1}
          color={suite ? '#e0c8b8' : '#cfc4c4'}
        />
      </mesh>
      <mesh geometry={parts.walls}>
        <meshStandardMaterial vertexColors color={parts.wall} roughness={0.95} />
      </mesh>
      {parts.panelCount > 0 && (
        <mesh geometry={parts.panels}>
          <meshStandardMaterial
            map={textures.fabric}
            color={suite ? '#5a3a34' : '#3a2a2e'}
            roughness={1}
          />
        </mesh>
      )}
      <mesh geometry={curtainGeometry}>
        {lite ? (
          <meshLambertMaterial vertexColors color="#0d0b0c" />
        ) : (
          <meshPhysicalMaterial
            vertexColors
            color="#0d0b0c"
            roughness={0.95}
            sheen={0.6}
            sheenColor="#4a3a3e"
          />
        )}
      </mesh>
      {frame && (
        <mesh geometry={frame} position={[screen.x, screen.z, screen.y]}>
          <meshBasicMaterial vertexColors color="#050405" />
        </mesh>
      )}
      <instancedMesh ref={lightMesh} args={[unitBox, undefined, parts.lights.length]}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={glowMesh}
        args={[unitPlane, undefined, parts.glows.length]}
        renderOrder={1}
      >
        <meshBasicMaterial
          map={textures.glow}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <mesh geometry={parts.beam} renderOrder={3}>
        <meshBasicMaterial
          map={textures.beam}
          color="#fff0dc"
          transparent
          opacity={0.05}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <points geometry={parts.haze} renderOrder={3} visible={!lite}>
        <pointsMaterial
          map={textures.glow}
          color="#ffe9cc"
          size={0.04}
          transparent
          opacity={0.35}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
      {/* A small, quiet KX monogram on the left wall beside the screen */}
      <mesh
        position={[
          -b.halfWidth + 0.03,
          Math.min(screen.z + screen.heightM / 2 - 0.4, b.height - 1),
          1.6,
        ]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[0.85, 0.85]} />
        <meshBasicMaterial map={textures.logo} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      {furniture && (
        <>
          <mesh geometry={furniture.rug}>
            <meshStandardMaterial map={textures.rug} roughness={1} />
          </mesh>
          <mesh geometry={furniture.tables}>
            <meshStandardMaterial vertexColors color="#5a3824" roughness={0.45} metalness={0.1} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Suites: a rug under the sofas, low coffee tables in front of them, lamp stands. */
function suiteFurniture(map: SeatMapResponse, b: Bounds) {
  const rows = b.rows;
  const minX = Math.min(...map.seats.map((s) => s.x)) - 0.7;
  const maxX = Math.max(...map.seats.map((s) => s.x)) + 0.7;
  const front = (rows[0]?.y ?? 3) - 1.5;
  const rug = worldUVs(
    boxes([
      {
        size: [maxX - minX + 0.6, 0.012, (rows.at(-1)?.y ?? 5) - front + 1],
        at: [(minX + maxX) / 2, 0.006, (front + (rows.at(-1)?.y ?? 5) + 1) / 2],
      },
    ]),
  );
  const tables = boxes([
    ...rows.flatMap((row) => {
      const y = row.y - 0.95;
      const base = b.floorAt(y);
      return [
        {
          size: [Math.min(3.2, maxX - minX - 1.2), 0.05, 0.5] as Vec3,
          at: [0, base + 0.42, y] as Vec3,
        },
        {
          size: [Math.min(3, maxX - minX - 1.4), 0.36, 0.36] as Vec3,
          at: [0, base + 0.2, y] as Vec3,
          shade: 0.45,
        },
      ];
    }),
    ...[-1, 1].map((side) => ({
      size: [0.05, 1.3, 0.05] as Vec3,
      at: [side * (b.halfWidth - 0.6), 0.65, b.depth - 0.7] as Vec3,
      shade: 0.7,
    })),
  ]);
  return { rug, tables };
}

/** The screen, glowing with the movie's artwork (cropped to fill); curved for Kinemax Grand. */
function Screen({ map }: { map: SeatMapResponse }) {
  const texture = useTexture(
    map.movie.backdropPath ?? map.movie.posterPath ?? '/favicon.svg',
    (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
    },
  );
  const { widthM, heightM, x, y, z } = map.hall.screen;
  const curved = map.hall.hallType.code === 'PREMIUM_LARGE_FORMAT';
  const radius = widthM * CURVE_RADIUS_FACTOR;
  const geometry = useMemo(() => {
    const angle = 2 * Math.asin(widthM / 2 / radius);
    const g = curved
      ? new THREE.CylinderGeometry(radius, radius, heightM, 64, 1, true, -angle / 2, angle)
      : new THREE.PlaneGeometry(widthM, heightM);
    // Fill the screen with the artwork like CSS object-fit: cover (crop, never stretch); the
    // inside of the cylinder would show it mirrored, so u runs the other way there.
    const image = texture.image as { width?: number; height?: number } | undefined;
    const imageAspect = (image?.width ?? 16) / (image?.height ?? 9);
    const screenAspect = widthM / heightM;
    const su = Math.min(1, screenAspect / imageAspect);
    const sv = Math.min(1, imageAspect / screenAspect);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      const u = curved ? 1 - uv.getX(i) : uv.getX(i);
      uv.setXY(i, 0.5 + (u - 0.5) * su, 0.5 + (uv.getY(i) - 0.5) * sv);
    }
    return g;
  }, [curved, widthM, heightM, radius, texture]);

  return curved ? (
    // The middle of the arc sits just in front of the screen wall; the edges curve towards the seats.
    <mesh geometry={geometry} position={[x, z, y + radius + 0.15]} rotation={[0, Math.PI, 0]}>
      <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} color="#e8e4e4" />
    </mesh>
  ) : (
    <mesh geometry={geometry} position={[x, z, y + 0.1]}>
      <meshBasicMaterial map={texture} toneMapped={false} color="#e8e4e4" />
    </mesh>
  );
}

function currentPose(camera: THREE.PerspectiveCamera): Pose {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  return { position: camera.position.toArray(), yaw: e.y, pitch: e.x, fov: camera.fov };
}

function apply(camera: THREE.PerspectiveCamera, pose: Pose) {
  camera.position.set(...pose.position);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  if (Math.abs(camera.fov - pose.fov) > 1e-4) {
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
  }
}

/** What the look-around input (outside the canvas) can do with the camera. */
interface RigApi {
  look: (dYaw: number, dPitch: number) => void;
  zoom: (deltaFov: number) => void;
}

/** Where the camera is, for tests and the performance report. */
interface CameraReport {
  z: number;
  lookYaw: number;
  lookPitch: number;
  fov: number;
}

interface RigProps {
  layout: SeatMapResponse;
  bounds: Bounds;
  viewSeat: SeatMapSeat | null;
  resetSignal: number;
  recenterSignal: number;
  reducedMotion: boolean;
  setMode: (mode: Mode) => void;
  setFade: (on: boolean) => void;
  onArrive: (seatId: string) => void;
  onReady: (api: RigApi) => void;
  onFrame: (report: CameraReport) => void;
}

/**
 * Moves the camera: the opening settle, the orbit in the hall view, flights to and between seats,
 * and the locked seated look.
 */
function CameraRig(props: RigProps) {
  const { layout, bounds: b, viewSeat, resetSignal, recenterSignal, reducedMotion } = props;
  const { setMode, setFade, onArrive, onReady, onFrame } = props;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const curved = layout.hall.hallType.code === 'PREMIUM_LARGE_FORMAT';
  const screenCenter = useMemo(() => screenCenterOf(layout.hall.screen), [layout.hall.screen]);
  const overview = useMemo(
    () => overviewPose(seatPoints(layout.seats), aspect, [screenCenter]),
    [layout.seats, aspect, screenCenter],
  );
  const controls = useRef<OrbitControlsImpl>(null);
  const fadeTimer = useRef<number | undefined>(undefined);
  const rig = useRef<Rig>({
    mode: 'flight',
    flight: null,
    base: null,
    look: { yaw: 0, pitch: 0 },
    recenter: null,
    fov: SEAT_FOV_RANGE.min,
    gazeAt: [0, 0, 0],
  });

  const switchMode = useCallback(
    (mode: Mode) => {
      rig.current.mode = mode;
      setMode(mode);
    },
    [setMode],
  );

  useEffect(() => {
    onReady({
      look: (dYaw, dPitch) => {
        const r = rig.current;
        if (!r.base) return;
        r.recenter = null;
        r.look = clampLook(r.look.yaw + dYaw, r.look.pitch + dPitch);
        invalidate();
      },
      zoom: (deltaFov) => {
        const r = rig.current;
        if (!r.base) return;
        r.fov = clampFov(r.fov + deltaFov);
        invalidate();
      },
    });
  }, [onReady, invalidate]);

  const toOverview = useCallback(() => {
    const c = controls.current;
    rig.current.base = null;
    rig.current.gazeAt = overview.target;
    if (c) {
      c.target.set(...overview.target);
      c.enabled = true;
      c.update();
    }
    switchMode('front');
  }, [overview, switchMode]);

  const fly = useCallback(
    (to: Pose, duration: number, { lookAt, ...plan }: FlyPlan, done: () => void) => {
      const r = rig.current;
      const lookFrom = r.gazeAt;
      r.gazeAt = lookAt;
      if (controls.current) controls.current.enabled = false;
      r.base = null;
      r.recenter = null;
      window.clearTimeout(fadeTimer.current);
      switchMode('flight');
      if (reducedMotion) {
        // No flight: a short crossfade, the camera moves while the view is dark.
        r.flight = null;
        setFade(true);
        fadeTimer.current = window.setTimeout(() => {
          apply(camera, to);
          done();
          setFade(false);
          invalidate();
        }, FADE_MS);
        return;
      }
      r.flight = {
        plan: planFlight(currentPose(camera), to, { ...plan, look: [lookFrom, lookAt] }),
        start: performance.now(),
        duration,
        done,
      };
      invalidate();
    },
    [camera, invalidate, reducedMotion, setFade, switchMode],
  );
  useEffect(
    () => () => {
      window.clearTimeout(fadeTimer.current);
    },
    [],
  );

  // Opening: a short, subtle settle into the front view (none with reduced motion).
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (reducedMotion) {
      apply(camera, overview.pose);
      toOverview();
      return;
    }
    const [tx, ty, tz] = overview.target;
    const [px, py, pz] = overview.pose.position;
    const start: Vec3 = [tx + (px - tx) * 1.12 + 1.2, ty + (py - ty) * 1.1, tz + (pz - tz) * 1.12];
    apply(camera, { ...overview.pose, position: start, ...lookAngles(start, overview.target) });
    rig.current.gazeAt = overview.target;
    fly(overview.pose, SETTLE_MS, { lift: 0, lookAt: overview.target }, toOverview);
  }, [camera, fly, overview, reducedMotion, toOverview]);

  // A new aspect ratio while resting in the front view: frame the seats again.
  useEffect(() => {
    if (rig.current.mode !== 'front') return;
    apply(camera, overview.pose);
    toOverview();
    invalidate();
  }, [overview, camera, toOverview, invalidate]);

  // Seat changes: glide to the seat, to the neighbour, or back to the hall.
  const shownSeat = useRef<string | null>(null);
  useEffect(() => {
    const id = viewSeat?.id ?? null;
    const previous = shownSeat.current;
    if (id === previous) return;
    shownSeat.current = id;
    if (viewSeat) {
      const to = seatPose(viewSeat, layout.hall.screen, aspect, curved);
      const neighbour = previous !== null;
      const keep = { end: 1, aspect } as const;
      const plan: FlyPlan = neighbour
        ? { lift: 0.12, lookAt: screenCenter, keep }
        : { ...TO_SEAT, lookAt: screenCenter, keep };
      fly(to, neighbour ? SEAT_TO_SEAT_MS : FLIGHT_MS, plan, () => {
        const r = rig.current;
        r.base = to;
        r.look = { yaw: 0, pitch: 0 };
        r.fov = to.fov;
        switchMode('seat');
        onArrive(viewSeat.id);
      });
    } else {
      const { gaze } = TO_SEAT;
      fly(
        overview.pose,
        FLIGHT_MS,
        {
          ...TO_SEAT,
          gaze: [1 - gaze[1], 1 - gaze[0]],
          lookAt: overview.target,
          keep: { end: 0, aspect },
        },
        toOverview,
      );
    }
    // Only a different seat starts a flight (a resize keeps the seat).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSeat?.id]);

  const lastReset = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastReset.current) return;
    lastReset.current = resetSignal;
    if (shownSeat.current) return;
    fly(overview.pose, RESET_MS, { lift: 0.3, lookAt: overview.target }, toOverview);
  }, [resetSignal, fly, overview, toOverview]);

  const lastRecenter = useRef(recenterSignal);
  useEffect(() => {
    if (recenterSignal === lastRecenter.current) return;
    lastRecenter.current = recenterSignal;
    const r = rig.current;
    if (!r.base) return;
    if (reducedMotion) r.look = { yaw: 0, pitch: 0 };
    else r.recenter = { from: { ...r.look }, start: performance.now() };
    invalidate();
  }, [recenterSignal, reducedMotion, invalidate]);

  useFrame(() => {
    const r = rig.current;
    const now = performance.now();
    if (r.flight) {
      const t = Math.min(1, (now - r.flight.start) / r.flight.duration);
      apply(camera, flightPose(r.flight.plan, t));
      if (t >= 1) {
        const { done } = r.flight;
        r.flight = null;
        done();
      }
      invalidate();
    } else if (r.base) {
      if (r.recenter) {
        const k = easeInOut((now - r.recenter.start) / RECENTER_MS);
        r.look = { yaw: r.recenter.from.yaw * (1 - k), pitch: r.recenter.from.pitch * (1 - k) };
        if (k >= 1) r.recenter = null;
        invalidate();
      }
      apply(camera, {
        ...r.base,
        yaw: r.base.yaw + r.look.yaw,
        pitch: r.base.pitch + r.look.pitch,
        fov: r.fov,
      });
    }
    onFrame({
      z: camera.position.z,
      lookYaw: r.look.yaw / DEG,
      lookPitch: r.look.pitch / DEG,
      fov: camera.fov,
    });
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={false}
      enableDamping={false}
      enablePan={false}
      rotateSpeed={0.6}
      minDistance={4}
      maxDistance={Math.max(b.depth, b.halfWidth * 2) * 2.2}
      minPolarAngle={0.25}
      maxPolarAngle={Math.PI / 2 - 0.08}
      onStart={() => {
        switchMode('free');
      }}
    />
  );
}

/** Draw calls of the last frame, for the performance report (data-draw-calls on the canvas). */
function Stats() {
  useFrame(({ gl }) => {
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
  });
  return null;
}

const LOOK_STEP = { yaw: 5 * DEG, pitch: 4 * DEG };
const KEY_LOOK: Partial<Record<string, [number, number]>> = {
  ArrowLeft: [LOOK_STEP.yaw, 0],
  ArrowRight: [-LOOK_STEP.yaw, 0],
  ArrowUp: [0, LOOK_STEP.pitch],
  ArrowDown: [0, -LOOK_STEP.pitch],
};

export interface HallSceneProps extends Pick<
  Hall3DProps,
  | 'map'
  | 'selected'
  | 'viewSeat'
  | 'onView'
  | 'onArrive'
  | 'resetSignal'
  | 'recenterSignal'
  | 'reducedMotion'
  | 'tooltip'
> {
  mode: Mode;
  /** Software renderer: a lighter hall. */
  lite: boolean;
  setMode: (mode: Mode) => void;
  setFade: (on: boolean) => void;
  onReady: (api: RigApi) => void;
  onFrame: (report: CameraReport) => void;
}

/** Everything inside the canvas: lights, screen, room, seats, tooltip and the camera rig. */
export function HallScene(props: HallSceneProps) {
  const { map, selected, viewSeat, onView, onArrive, reducedMotion, tooltip, mode, lite } = props;
  const [hovered, setHovered] = useState<SeatMapSeat | null>(null);
  // The hall itself never changes for a showtime; only seat statuses do (every refresh).
  const [layout, setLayout] = useState(map);
  if (layout.showtime.id !== map.showtime.id) setLayout(map);
  const b = useMemo(() => hallBounds(layout), [layout]);
  // The spot light aims at this point; it must be in the scene to follow its position.
  const spillTarget = useMemo(() => new THREE.Object3D(), []);
  const interactive = mode === 'front' || mode === 'free';
  const suite = layout.hall.wholeHallOnly;

  return (
    <>
      <color attach="background" args={['#050405']} />
      <fog attach="fog" args={['#050405', b.depth * 1.3, b.depth * 4]} />
      <ambientLight intensity={lite ? 0.8 : 0.5} color="#ffe2cc" />
      <hemisphereLight args={['#ffd9b8', '#1a0d0f', 0.45]} />
      <pointLight
        position={[0, b.height - 0.6, b.depth * 0.55]}
        intensity={suite ? 18 : 34}
        distance={b.depth * 2}
        color={WARM}
        decay={1.5}
      />
      {/* The light of the screen falling on the front rows */}
      <spotLight
        visible={!lite}
        position={[layout.hall.screen.x, layout.hall.screen.z, 0.6]}
        intensity={suite ? 10 : 28}
        distance={b.depth * 1.2}
        angle={1.05}
        penumbra={1}
        decay={1.3}
        color="#dfe2ff"
        target={spillTarget}
      />
      <primitive object={spillTarget} position={[0, 0, (b.rows[0]?.y ?? 4) + 3]} />
      {/* Warm fill from the back, so the seat backs read from the seat view */}
      <pointLight
        visible={!lite}
        position={[0, b.height - 1.4, b.depth - 0.6]}
        intensity={suite ? 8 : 22}
        distance={b.depth * 1.6}
        color={WARM}
        decay={1.4}
      />
      {suite && (
        <pointLight
          position={[0, 1.8, b.depth - 0.8]}
          intensity={6}
          distance={6}
          color="#ffb070"
          decay={1.4}
        />
      )}
      <Suspense fallback={null}>
        <Screen map={layout} />
      </Suspense>
      <Room map={layout} bounds={b} lite={lite} />
      <Seats
        map={map}
        selected={selected}
        hovered={interactive ? (hovered?.id ?? null) : null}
        interactive={interactive}
        lite={lite}
        onHover={setHovered}
        onPick={(seat) => {
          setHovered(null);
          onView(seat);
        }}
      />
      {hovered && interactive && (
        <Html position={[hovered.x, hovered.z + 1.35, hovered.y]} center className={styles.tooltip}>
          {tooltip(hovered)}
        </Html>
      )}
      <CameraRig
        layout={layout}
        bounds={b}
        viewSeat={viewSeat}
        resetSignal={props.resetSignal}
        recenterSignal={props.recenterSignal}
        reducedMotion={reducedMotion}
        setMode={props.setMode}
        setFade={props.setFade}
        onArrive={onArrive}
        onReady={props.onReady}
        onFrame={props.onFrame}
      />
      <Stats />
    </>
  );
}

export default function Hall3D(props: Hall3DProps) {
  const { map, onView, onStep, onLook } = props;
  const [mode, setMode] = useState<Mode>('flight');
  const [fade, setFade] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const rigApi = useRef<RigApi | null>(null);
  const seated = mode === 'seat';
  const [lite] = useState(softwareRenderer);

  const onReady = useCallback((api: RigApi) => {
    rigApi.current = api;
  }, []);
  const onFrame = useCallback((report: CameraReport) => {
    const data = wrapper.current?.dataset;
    if (!data) return;
    data.cameraZ = report.z.toFixed(1);
    data.lookYaw = String(Math.round(report.lookYaw));
    data.lookPitch = String(Math.round(report.lookPitch));
    data.fov = String(Math.round(report.fov));
  }, []);

  // Keys work anywhere in the hall area (the 3D view and its overlay): arrows look around,
  // "[" and "]" move to the neighbouring seat. The wheel only nudges the field of view a
  // little; it never moves the camera away from the seat.
  useEffect(() => {
    const el = wrapper.current;
    const scope = el?.parentElement;
    if (!el || !scope || !seated) return;
    const onKey = (event: KeyboardEvent) => {
      const move = KEY_LOOK[event.key];
      if (move) {
        rigApi.current?.look(...move);
        onLook();
      } else if (event.key === '[') onStep(-1);
      else if (event.key === ']') onStep(1);
      else return;
      event.preventDefault();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      rigApi.current?.zoom(event.deltaY * 0.01);
    };
    scope.addEventListener('keydown', onKey);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      scope.removeEventListener('keydown', onKey);
      el.removeEventListener('wheel', onWheel);
    };
  }, [seated, onStep, onLook]);

  // One finger or the mouse turns the head (like grabbing the view); a second finger is
  // ignored, so there is no pinch zoom in the seat.
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  // A test hook for automated browsers only: open a seat without aiming at it on the canvas.
  useEffect(() => {
    if (!navigator.webdriver) return;
    const w = window as unknown as { __kinemaxHall?: unknown };
    w.__kinemaxHall = {
      viewSeat: (id: string) => {
        onView(map.seats.find((s) => s.id === id) ?? null);
      },
    };
    return () => {
      delete w.__kinemaxHall;
    };
  }, [map.seats, onView]);

  return (
    <div
      ref={wrapper}
      className={styles.wrap}
      data-camera={mode}
      data-seated={seated ? 'true' : undefined}
      // In the seat the view itself takes the keys (arrows); its name says how.
      tabIndex={seated ? 0 : undefined}
      role={seated ? 'application' : undefined}
      aria-label={seated ? props.lookLabel : undefined}
      onPointerDown={(event) => {
        if (!seated || !event.isPrimary) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (!d || d.id !== event.pointerId) return;
        rigApi.current?.look((event.clientX - d.x) * 0.0045, (event.clientY - d.y) * 0.0045);
        onLook();
        drag.current = { id: d.id, x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <Canvas
        className={styles.canvas}
        frameloop="demand"
        dpr={lite ? 0.75 : [1, 1.5]}
        camera={{ fov: 60, near: 0.1, far: 300 }}
        gl={{ antialias: !lite, powerPreference: 'high-performance' }}
        aria-label={props.label}
        role="img"
      >
        <HallScene
          map={map}
          selected={props.selected}
          viewSeat={props.viewSeat}
          onView={onView}
          onArrive={props.onArrive}
          resetSignal={props.resetSignal}
          recenterSignal={props.recenterSignal}
          reducedMotion={props.reducedMotion}
          tooltip={props.tooltip}
          mode={mode}
          lite={lite}
          setMode={setMode}
          setFade={setFade}
          onReady={onReady}
          onFrame={onFrame}
        />
      </Canvas>
      <div className={styles.fade} data-on={fade ? 'true' : undefined} aria-hidden="true" />
    </div>
  );
}
