// The 3D hall (three.js via @react-three/fiber + drei). Lazy-loaded: only the booking page pulls
// this chunk in. Built from the real seat coordinates: x = left/right of the center line, y =
// distance from the screen wall, z = tier height. In three.js: X = x, Y (up) = z, Z = y.
import type { SeatMapResponse, SeatMapSeat } from '@kinemax/shared';
import { Html, OrbitControls, useTexture } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import styles from './Hall3D.module.css';

export interface Hall3DProps {
  map: SeatMapResponse;
  selected: readonly string[];
  /** The seat to look from (the camera flies there); null for the overview. */
  viewSeat: SeatMapSeat | null;
  onView: (seat: SeatMapSeat | null) => void;
  /** Increment to fly back to the overview ("Rikthe pamjen"). */
  resetSignal: number;
  reducedMotion: boolean;
  tooltip: (seat: SeatMapSeat) => string;
  label: string;
}

type Look = {
  seat: string;
  seatSelected: string;
  seatTaken: string;
  width: number;
  depth: number;
  back: number;
  wall: string;
  curvedScreen: boolean;
  sideTables: boolean;
};

/** The look of each hall type. */
const LOOKS: Partial<Record<string, Look>> = {
  STANDARD: {
    seat: '#7a1124',
    seatSelected: '#f3eee8',
    seatTaken: '#2a2427',
    width: 0.5,
    depth: 0.5,
    back: 0.55,
    wall: '#141113',
    curvedScreen: false,
    sideTables: false,
  },
  VIP_RECLINER: {
    seat: '#4a0d18',
    seatSelected: '#f3eee8',
    seatTaken: '#2a2427',
    width: 0.82,
    depth: 0.85,
    back: 0.7,
    wall: '#161012',
    curvedScreen: false,
    sideTables: true,
  },
  PREMIUM_LARGE_FORMAT: {
    seat: '#6e0f20',
    seatSelected: '#f3eee8',
    seatTaken: '#2a2427',
    width: 0.52,
    depth: 0.52,
    back: 0.6,
    wall: '#100e10',
    curvedScreen: true,
    sideTables: false,
  },
  PRIVATE_SUITE: {
    seat: '#3d1a20',
    seatSelected: '#f3eee8',
    seatTaken: '#2a2427',
    width: 0.95,
    depth: 0.95,
    back: 0.6,
    wall: '#1a1316',
    curvedScreen: false,
    sideTables: true,
  },
};
/** Unknown hall types look like a standard hall. */
const DEFAULT_LOOK: Look = {
  seat: '#7a1124',
  seatSelected: '#f3eee8',
  seatTaken: '#2a2427',
  width: 0.5,
  depth: 0.5,
  back: 0.55,
  wall: '#141113',
  curvedScreen: false,
  sideTables: false,
};
const EYE_HEIGHT = 1.15;
const tmp = new THREE.Object3D();
const color = new THREE.Color();

function hallBounds(map: SeatMapResponse) {
  const xs = map.seats.map((s) => s.x);
  const ys = map.seats.map((s) => s.y);
  const halfWidth = Math.max(map.hall.screen.widthM / 2 + 2, ...xs.map((x) => Math.abs(x) + 1.5));
  const depth = Math.max(...ys, 6) + 2.5;
  const height = Math.max(
    map.hall.screen.z + map.hall.screen.heightM / 2 + 1.5,
    Math.max(...map.seats.map((s) => s.z)) + 3.5,
  );
  return { halfWidth, depth, height };
}

/** Seats as instanced cushions + backrests: two draw calls for the whole hall. */
function Seats({
  map,
  look,
  selected,
  hovered,
  onHover,
  onPick,
}: {
  map: SeatMapResponse;
  look: Look;
  selected: readonly string[];
  hovered: string | null;
  onHover: (seat: SeatMapSeat | null) => void;
  onPick: (seat: SeatMapSeat) => void;
}) {
  const seats = useMemo(() => map.seats.filter((s) => s.type !== 'WHEELCHAIR'), [map.seats]);
  const cushions = useRef<THREE.InstancedMesh>(null);
  const backs = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    seats.forEach((seat, i) => {
      const w = look.width * seat.widthUnits + (seat.widthUnits - 1) * 0.08;
      const rotation = THREE.MathUtils.degToRad(seat.rotationDeg);
      tmp.position.set(seat.x, seat.z + 0.22, seat.y);
      tmp.rotation.set(0, rotation, 0);
      tmp.scale.set(w, 0.18, look.depth);
      tmp.updateMatrix();
      cushions.current?.setMatrixAt(i, tmp.matrix);
      tmp.position.set(seat.x, seat.z + 0.22 + look.back / 2, seat.y + look.depth / 2 - 0.06);
      tmp.scale.set(w, look.back, 0.12);
      tmp.updateMatrix();
      backs.current?.setMatrixAt(i, tmp.matrix);
    });
    for (const mesh of [cushions.current, backs.current]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  }, [seats, look]);

  useLayoutEffect(() => {
    seats.forEach((seat, i) => {
      const isSelected = selected.includes(seat.id);
      const base = isSelected
        ? look.seatSelected
        : seat.status === 'TAKEN'
          ? look.seatTaken
          : look.seat;
      color.set(base);
      if (seat.type === 'COMPANION' && !isSelected && seat.status !== 'TAKEN')
        color.lerp(new THREE.Color('#8a7a7e'), 0.35);
      if (hovered === seat.id && seat.status !== 'TAKEN')
        color.lerp(new THREE.Color('#e6566a'), 0.45);
      cushions.current?.setColorAt(i, color);
      backs.current?.setColorAt(i, color);
    });
    for (const mesh of [cushions.current, backs.current]) {
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  }, [seats, look, selected, hovered, invalidate]);

  const seatAt = (event: ThreeEvent<PointerEvent | MouseEvent>) =>
    event.instanceId === undefined ? undefined : seats[event.instanceId];

  const handlers = {
    onPointerMove: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const seat = seatAt(event);
      onHover(seat && seat.status === 'AVAILABLE' ? seat : null);
    },
    onPointerOut: () => {
      onHover(null);
    },
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const seat = seatAt(event);
      if (seat && (seat.status === 'AVAILABLE' || selected.includes(seat.id))) onPick(seat);
    },
  };

  return (
    <>
      <instancedMesh ref={cushions} args={[undefined, undefined, seats.length]} {...handlers}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.85} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={backs} args={[undefined, undefined, seats.length]} {...handlers}>
        <boxGeometry />
        <meshStandardMaterial roughness={0.8} metalness={0.05} />
      </instancedMesh>
    </>
  );
}

/** Floor tiers under each row, wheelchair markers, aisle step lights and side tables. */
function Room({ map, look }: { map: SeatMapResponse; look: Look }) {
  const { halfWidth, depth, height } = hallBounds(map);
  const rows = useMemo(() => {
    const byRow = new Map<string, SeatMapSeat[]>();
    for (const s of map.seats) byRow.set(s.row, [...(byRow.get(s.row) ?? []), s]);
    return [...byRow.values()];
  }, [map.seats]);
  const wheelchairs = map.seats.filter((s) => s.type === 'WHEELCHAIR');
  const panels = Array.from({ length: Math.max(3, Math.floor(depth / 3)) }, (_, i) => 2 + i * 3);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, depth / 2]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, depth]} />
        <meshStandardMaterial color="#0d0b0c" roughness={0.95} />
      </mesh>
      {rows.map((row) => {
        const first = row[0];
        if (!first || first.z <= 0.01) return null;
        return (
          <mesh key={first.row} position={[0, first.z / 2, first.y]}>
            <boxGeometry args={[halfWidth * 2, first.z, 1.1]} />
            <meshStandardMaterial color="#120f11" roughness={0.9} />
          </mesh>
        );
      })}
      {rows.map((row) => {
        const first = row[0];
        if (!first) return null;
        const minX = Math.min(...row.map((s) => s.x));
        return (
          <mesh key={`light-${first.row}`} position={[minX - 0.7, first.z + 0.03, first.y - 0.35]}>
            <boxGeometry args={[0.12, 0.03, 0.04]} />
            <meshBasicMaterial color="#ffb37a" toneMapped={false} />
          </mesh>
        );
      })}
      {look.sideTables &&
        map.seats
          .filter((s) => s.type !== 'WHEELCHAIR')
          .map((s) => (
            <mesh
              key={`table-${s.id}`}
              position={[s.x + (look.width * s.widthUnits) / 2 + 0.12, s.z + 0.45, s.y]}
            >
              <cylinderGeometry args={[0.1, 0.1, 0.04, 16]} />
              <meshStandardMaterial color="#2a1d14" roughness={0.6} />
            </mesh>
          ))}
      {wheelchairs.map((s) => (
        <mesh key={`wc-${s.id}`} rotation={[-Math.PI / 2, 0, 0]} position={[s.x, s.z + 0.02, s.y]}>
          <ringGeometry args={[0.28, 0.34, 32]} />
          <meshBasicMaterial color="#f3eee8" />
        </mesh>
      ))}
      {/* Side walls with subtle acoustic panels, back wall, ceiling */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[side * halfWidth, height / 2, depth / 2]}
            rotation={[0, -side * (Math.PI / 2), 0]}
          >
            <planeGeometry args={[depth, height]} />
            <meshStandardMaterial color={look.wall} roughness={0.95} />
          </mesh>
          {panels.map((z) => (
            <mesh
              key={z}
              position={[side * (halfWidth - 0.04), height * 0.55, z]}
              rotation={[0, -side * (Math.PI / 2), 0]}
            >
              <boxGeometry args={[2.2, height * 0.45, 0.06]} />
              <meshStandardMaterial color="#1f1a1c" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, height / 2, depth]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[halfWidth * 2, height]} />
        <meshStandardMaterial color={look.wall} roughness={0.95} />
      </mesh>
      <mesh position={[0, height / 2, -0.05]}>
        <planeGeometry args={[halfWidth * 2, height]} />
        <meshStandardMaterial color="#070607" roughness={1} />
      </mesh>
      <mesh position={[0, height, depth / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[halfWidth * 2, depth]} />
        <meshStandardMaterial color="#080708" roughness={1} />
      </mesh>
    </group>
  );
}

/** The screen, glowing with the movie's artwork; curved for Kinemax Grand. */
function Screen({ map, look }: { map: SeatMapResponse; look: Look }) {
  const texture = useTexture(
    map.movie.backdropPath ?? map.movie.posterPath ?? '/favicon.svg',
    (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
    },
  );

  const { widthM, heightM, x, y, z } = map.hall.screen;
  if (look.curvedScreen) {
    const radius = widthM * 1.4;
    const angle = widthM / radius;
    return (
      // The middle of the arc sits just in front of the screen wall; the edges curve towards the seats.
      <mesh position={[x, z, y + radius + 0.15]} rotation={[0, Math.PI, 0]}>
        <cylinderGeometry args={[radius, radius, heightM, 48, 1, true, -angle / 2, angle]} />
        <meshBasicMaterial map={texture} side={THREE.BackSide} toneMapped={false} />
      </mesh>
    );
  }
  return (
    <mesh position={[x, z, y + 0.1]}>
      <planeGeometry args={[widthM, heightM]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** Flies the camera (eased, ~1 s) to the overview or to eye height above a seat. */
function CameraRig({
  map,
  viewSeat,
  resetSignal,
  reducedMotion,
  controls,
}: {
  map: SeatMapResponse;
  viewSeat: SeatMapSeat | null;
  resetSignal: number;
  reducedMotion: boolean;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, invalidate } = useThree();
  const flight = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromT: THREE.Vector3;
    toT: THREE.Vector3;
    t: number;
  } | null>(null);
  const { depth, height } = hallBounds(map);
  const screenCenter = useMemo(
    () => new THREE.Vector3(map.hall.screen.x, map.hall.screen.z, map.hall.screen.y),
    [map.hall.screen],
  );

  useEffect(() => {
    const to = viewSeat
      ? new THREE.Vector3(viewSeat.x, viewSeat.z + EYE_HEIGHT, viewSeat.y)
      : new THREE.Vector3(0, height * 0.85, depth + 1.5);
    const toT = viewSeat
      ? screenCenter.clone()
      : new THREE.Vector3(0, screenCenter.y * 0.6, depth * 0.35);
    const target = controls.current?.target ?? new THREE.Vector3();
    flight.current = {
      from: camera.position.clone(),
      to,
      fromT: target.clone(),
      toT,
      t: reducedMotion ? 1 : 0,
    };
    invalidate();
  }, [
    viewSeat,
    resetSignal,
    camera,
    controls,
    depth,
    height,
    screenCenter,
    reducedMotion,
    invalidate,
  ]);

  useFrame((_, delta) => {
    const f = flight.current;
    if (!f) return;
    f.t = Math.min(1, f.t + delta);
    const k = 1 - Math.pow(1 - f.t, 3); // ease out
    camera.position.lerpVectors(f.from, f.to, k);
    controls.current?.target.lerpVectors(f.fromT, f.toT, k);
    controls.current?.update();
    if (f.t >= 1) flight.current = null;
    else invalidate();
  });
  return null;
}

/** Draw calls of the last frame, for the performance report (data-draw-calls on the canvas). */
function Stats() {
  useFrame(({ gl }) => {
    gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
  });
  return null;
}

export default function Hall3D(props: Hall3DProps) {
  const { map, selected, viewSeat, onView, resetSignal, reducedMotion, tooltip, label } = props;
  const look = LOOKS[map.hall.hallType.code] ?? DEFAULT_LOOK;
  const [hovered, setHovered] = useState<SeatMapSeat | null>(null);
  const controls = useRef<OrbitControlsImpl>(null);
  const { depth, halfWidth, height } = hallBounds(map);

  return (
    <div className={styles.wrap}>
      <Canvas
        className={styles.canvas}
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [0, height * 0.85, depth + 1.5], fov: 50, near: 0.1, far: 200 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        aria-label={label}
        role="img"
        onPointerMissed={() => {
          setHovered(null);
        }}
      >
        <color attach="background" args={['#050405']} />
        <fog attach="fog" args={['#050405', depth * 0.9, depth * 2.2]} />
        <ambientLight intensity={0.6} color="#ffe6d0" />
        <pointLight
          position={[0, height - 0.5, depth * 0.6]}
          intensity={40}
          distance={depth * 2}
          color="#ffcf9e"
          decay={1.6}
        />
        <pointLight
          position={[0, map.hall.screen.z, 2]}
          intensity={10}
          distance={depth}
          color="#c8d6ff"
          decay={1.8}
        />
        <Suspense fallback={null}>
          <Screen map={map} look={look} />
        </Suspense>
        <Room map={map} look={look} />
        <Seats
          map={map}
          look={look}
          selected={selected}
          hovered={hovered?.id ?? null}
          onHover={setHovered}
          onPick={(seat) => {
            onView(seat);
          }}
        />
        {hovered && (
          <Html
            position={[hovered.x, hovered.z + 1.2, hovered.y]}
            center
            className={styles.tooltip}
          >
            {tooltip(hovered)}
          </Html>
        )}
        <OrbitControls
          ref={controls}
          makeDefault
          enablePan={false}
          minDistance={2}
          maxDistance={Math.max(depth, halfWidth * 2) * 1.6}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2 - 0.05}
          minAzimuthAngle={-Math.PI / 2.4}
          maxAzimuthAngle={Math.PI / 2.4}
        />
        <CameraRig
          map={map}
          viewSeat={viewSeat}
          resetSignal={resetSignal}
          reducedMotion={reducedMotion}
          controls={controls}
        />
        <Stats />
      </Canvas>
    </div>
  );
}
