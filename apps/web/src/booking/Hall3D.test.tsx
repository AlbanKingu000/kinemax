import type { SeatMapResponse, SeatMapSeat } from '@kinemax/shared';
import ReactThreeTestRenderer, { act, type ReactThreeTest } from '@react-three/test-renderer';
import { useState } from 'react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seat, standardMap, suiteMap } from '../test/seatmap';
import { HallScene, type HallSceneProps } from './Hall3D';

type Renderer = ReactThreeTest.Renderer;
type ReactThreeTestInstance = ReactThreeTest.ReactThreeTestInstance;

// The 3D scene without WebGL (@react-three/test-renderer). Time is driven by hand: the camera
// flights run on performance.now(), each test frame moves it on by FRAME_MS.

vi.mock('@react-three/drei', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-three/drei')>();
  return {
    ...actual,
    // No image loading in jsdom: an empty texture stands in for the movie artwork.
    useTexture: () => new THREE.Texture(),
    // The tooltip is DOM; the stand-in only says which seat it would show.
    Html: ({ children }: { children: string }) => <group name={`tooltip:${children}`} />,
  };
});

const FRAME_MS = 50;
let now = 0;

/** A canvas 2D context that accepts every drawing call (jsdom has none). */
function fake2d() {
  const gradient = { addColorStop: () => undefined };
  return new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'createRadialGradient' || key === 'createLinearGradient'
          ? () => gradient
          : () => undefined,
      set: () => true,
    },
  );
}

beforeEach(() => {
  now = 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  // Called below with the canvas as this.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = HTMLCanvasElement.prototype.getContext;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    id: string,
    ...rest: unknown[]
  ) {
    return id === '2d'
      ? (fake2d() as CanvasRenderingContext2D)
      : (original as (...args: unknown[]) => RenderingContext | null).call(this, id, ...rest);
  } as typeof HTMLCanvasElement.prototype.getContext);
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(public d?: string) {}
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface Log {
  modes: string[];
  arrived: string[];
  fades: boolean[];
  reports: { z: number; lookYaw: number; lookPitch: number; fov: number }[];
  apis: { look: (y: number, p: number) => void; zoom: (d: number) => void }[];
}

type SceneInput = Partial<Omit<HallSceneProps, 'mode' | 'setMode'>> & { map: SeatMapResponse };

/** Holds the camera mode like Hall3D does, and records what the scene reports. */
function Harness({ log, ...props }: SceneInput & { log: Log }) {
  const [mode, setMode] = useState<HallSceneProps['mode']>('flight');
  return (
    <HallScene
      selected={[]}
      viewSeat={null}
      onView={() => undefined}
      resetSignal={0}
      recenterSignal={0}
      reducedMotion={false}
      tooltip={(s) => `${s.row}${String(s.number)}`}
      lite={false}
      onArrive={(id) => log.arrived.push(id)}
      setFade={(on) => log.fades.push(on)}
      onReady={(api) => log.apis.push(api)}
      onFrame={(report) => log.reports.push(report)}
      {...props}
      mode={mode}
      setMode={(m) => {
        log.modes.push(m);
        setMode(m);
      }}
    />
  );
}

const newLog = (): Log => ({ modes: [], arrived: [], fades: [], reports: [], apis: [] });
const last = <T,>(items: T[]) => items[items.length - 1];

async function mount(props: SceneInput) {
  const log = newLog();
  const renderer = await ReactThreeTestRenderer.create(<Harness log={log} {...props} />, {
    width: 1280,
    height: 800,
  });
  const update = (next: Partial<SceneInput>) =>
    renderer.update(<Harness log={log} {...props} {...next} />);
  return { renderer, log, update };
}

async function play(renderer: Renderer, ms: number) {
  for (let t = 0; t < ms; t += FRAME_MS) {
    now += FRAME_MS;
    await renderer.advanceFrames(1, FRAME_MS / 1000);
  }
}

// The test renderer loads its own (CommonJS) copy of three: compare by flags, not instanceof.
const isInstanced = (o: THREE.Object3D) => 'isInstancedMesh' in o;
const isPlainMesh = (o: THREE.Object3D) => 'isMesh' in o && !isInstanced(o);
const tooltips = (renderer: Renderer) =>
  renderer.scene
    .findAll((n) => String((n.instance as { name?: string }).name).startsWith('tooltip:'))
    .map((n) => n.instance.name);
const meshesOf = (renderer: Renderer) => renderer.scene.findAll((n) => isInstanced(n.instance));

/** Calls a pointer handler the way r3f does: its latest version (the props snapshot can lag). */
async function fire(node: ReactThreeTestInstance, name: string, data: object = {}) {
  const { handlers } = node.fiber as unknown as {
    handlers: Partial<Record<string, (event: object) => void>>;
  };
  await act(async () => {
    handlers[name]?.({ stopPropagation: () => undefined, ...data });
    await Promise.resolve();
  });
}

/** The instanced mesh drawing these seats (found by instance count and seat position). */
function seatMesh(renderer: Renderer, seats: SeatMapSeat[]) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const found = meshesOf(renderer).find((node) => {
    const mesh = node.instance as THREE.InstancedMesh;
    if (mesh.count !== seats.length || !node.props.onClick) return false;
    mesh.getMatrixAt(0, matrix);
    position.setFromMatrixPosition(matrix);
    return Math.abs(position.x - (seats[0]?.x ?? NaN)) < 1e-6;
  });
  if (!found) throw new Error('no mesh for these seats');
  return found;
}

describe('HallScene camera', () => {
  it('opens from the front with a short settle, then rests in the front view', async () => {
    const map = standardMap();
    const { renderer, log } = await mount({ map });
    expect(log.modes[0]).toBe('flight');
    await play(renderer, 1800);
    expect(last(log.modes)).toBe('front');
    // Nearer the screen than the first row (y = 5).
    expect(last(log.reports)?.z).toBeLessThan(5);
    await renderer.unmount();
  });

  it('opens at once with reduced motion', async () => {
    const { renderer, log } = await mount({ map: standardMap(), reducedMotion: true });
    expect(log.modes.length).toBeGreaterThan(0);
    expect(log.modes.every((m) => m === 'front')).toBe(true);
    await renderer.unmount();
  });

  it('glides to a seat, arrives, locks the view and glides back', async () => {
    const map = standardMap();
    const a2 = map.seats[1];
    const a3 = map.seats[2];
    if (!a2 || !a3) throw new Error('fixture');
    const { renderer, log, update } = await mount({ map });
    await play(renderer, 1800);

    await update({ viewSeat: a2 });
    expect(last(log.modes)).toBe('flight');
    await play(renderer, 1500);
    expect(log.arrived).toEqual([]); // still gliding: the overlay waits
    await play(renderer, 1000);
    expect(log.arrived).toEqual([a2.id]);
    expect(last(log.modes)).toBe('seat');
    expect(last(log.reports)?.z).toBeCloseTo(a2.y);

    // Only the head turns, within the limits; the wheel only nudges the field of view.
    last(log.apis)?.look(5, 5);
    await play(renderer, FRAME_MS);
    expect(last(log.reports)?.lookYaw).toBeCloseTo(70);
    expect(last(log.reports)?.lookPitch).toBeCloseTo(20);
    expect(last(log.reports)?.z).toBeCloseTo(a2.y);
    last(log.apis)?.zoom(100);
    await play(renderer, FRAME_MS);
    expect(last(log.reports)?.fov).toBeCloseTo(64);

    // "Shiko ekranin" turns the head back.
    await update({ viewSeat: a2, recenterSignal: 1 });
    await play(renderer, 800);
    expect(last(log.reports)?.lookYaw).toBeCloseTo(0);

    // The neighbouring seat is a short glide.
    await update({ viewSeat: a3, recenterSignal: 1 });
    await play(renderer, 1100);
    expect(log.arrived).toEqual([a2.id, a3.id]);

    // Back to the hall: the front view again.
    await update({ viewSeat: null, recenterSignal: 1 });
    await play(renderer, 2500);
    expect(last(log.modes)).toBe('front');

    // "Rikthe pamjen" glides to the front view.
    await update({ viewSeat: null, recenterSignal: 1, resetSignal: 1 });
    expect(last(log.modes)).toBe('flight');
    await play(renderer, 1400);
    expect(last(log.modes)).toBe('front');
    await renderer.unmount();
  });

  it('crossfades instead of flying with reduced motion', async () => {
    const map = standardMap();
    const a2 = map.seats[1];
    if (!a2) throw new Error('fixture');
    const { renderer, log, update } = await mount({ map, reducedMotion: true });
    await update({ viewSeat: a2, reducedMotion: true });
    expect(log.fades).toEqual([true]);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(log.fades).toEqual([true, false]);
    expect(log.arrived).toEqual([a2.id]);
    await update({ viewSeat: a2, reducedMotion: true, recenterSignal: 1 });
    await renderer.unmount();
  });
});

describe('HallScene seats', () => {
  it('draws one instanced mesh per seat model, a decal for wheelchair spaces', async () => {
    const map = standardMap();
    const { renderer } = await mount({ map });
    const standard = map.seats.filter((s) => s.type === 'STANDARD');
    const couple = map.seats.filter((s) => s.type === 'COUPLE');
    const companion = map.seats.filter((s) => s.type === 'COMPANION');
    expect(seatMesh(renderer, standard)).toBeTruthy();
    expect(seatMesh(renderer, couple)).toBeTruthy();
    expect(seatMesh(renderer, companion)).toBeTruthy();
    // Companion piping and the wheelchair decal are extra instanced meshes without clicks.
    const extras = meshesOf(renderer).filter((n) => !n.props.onClick);
    expect(extras.length).toBeGreaterThanOrEqual(3);
    await renderer.unmount();
  });

  it('colors the states: selected brightest, taken grey', async () => {
    const map = standardMap();
    const standard = map.seats.filter((s) => s.type === 'STANDARD');
    const selected = standard[0];
    const takenIndex = standard.findIndex((s) => s.status === 'TAKEN');
    if (!selected) throw new Error('fixture');
    const { renderer } = await mount({ map, selected: [selected.id] });
    const mesh = seatMesh(renderer, standard).instance as THREE.InstancedMesh;
    const color = new THREE.Color();
    mesh.getColorAt(0, color);
    expect(color.r).toBeGreaterThan(1); // HDR ivory: the most visible thing in the hall
    mesh.getColorAt(takenIndex, color);
    expect(Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)).toBeLessThan(
      0.02,
    );
    await renderer.unmount();
  });

  it('opens a seat on click and shows a tooltip on hover, only when the camera rests', async () => {
    const map = standardMap();
    const onView = vi.fn();
    const { renderer, log, update } = await mount({ map, onView });
    const standard = map.seats.filter((s) => s.type === 'STANDARD');
    const mesh = () => seatMesh(renderer, standard);
    // Still settling: clicks are ignored.
    await fire(mesh(), 'onClick', { instanceId: 1 });
    expect(onView).not.toHaveBeenCalled();
    await play(renderer, 1800);
    expect(last(log.modes)).toBe('front');
    // The test renderer only picks up the re-rendered pointer handlers after the next update.
    await update({});
    await fire(mesh(), 'onPointerMove', { instanceId: 1 });
    expect(tooltips(renderer)).toEqual(['tooltip:A2']);
    await fire(mesh(), 'onPointerOut');
    expect(tooltips(renderer)).toEqual([]);
    await fire(mesh(), 'onClick', { instanceId: 1 });
    expect(onView).toHaveBeenCalledWith(standard[1]);
    // Taken seats are not interactive.
    const taken = standard.findIndex((s) => s.status === 'TAKEN');
    await fire(mesh(), 'onClick', { instanceId: taken });
    expect(onView).toHaveBeenCalledTimes(1);
    await renderer.unmount();
  });

  it('draws recliners with side tables in a VIP hall, in the simple materials when lite', async () => {
    const seats = [1, 2, 3, 4].map((n) => seat('C', n, { type: 'VIP' }));
    const map = standardMap({
      seats,
      hall: {
        ...standardMap().hall,
        hallType: { code: 'VIP_RECLINER', nameSq: 'VIP', nameEn: null },
      },
    });
    const { renderer } = await mount({ map, lite: true });
    const recliners = seatMesh(renderer, seats).instance as THREE.InstancedMesh;
    expect((recliners.material as THREE.Material).type).toBe('MeshLambertMaterial');
    // The side tables share the seat placement.
    expect(
      meshesOf(renderer).filter((n) => (n.instance as THREE.InstancedMesh).count === 4),
    ).toHaveLength(2);
    await renderer.unmount();
  });
});

describe('HallScene room', () => {
  it('builds a suite as a lounge: sofa segments with arms, rug and tables', async () => {
    const map = suiteMap();
    const { renderer } = await mount({ map });
    const arms = meshesOf(renderer).filter(
      (n) => !n.props.onClick && (n.instance as THREE.InstancedMesh).count === 2,
    );
    expect(arms.length).toBeGreaterThanOrEqual(1);
    const plainMeshes = renderer.scene.findAll((n) => isPlainMesh(n.instance));
    // Floor, walls, panels, curtains, frame, beam, logo, screen, rug, tables.
    expect(plainMeshes.length).toBeGreaterThanOrEqual(10);
    await renderer.unmount();
  });

  it('curves the Kinemax Grand screen', async () => {
    const base = standardMap();
    const map = standardMap({
      hall: {
        ...base.hall,
        hallType: { code: 'PREMIUM_LARGE_FORMAT', nameSq: 'Kinemax Grand', nameEn: null },
        screen: { widthM: 22, heightM: 9.5, x: 0, y: 0, z: 5.5 },
      },
    });
    const { renderer } = await mount({ map });
    const curved = renderer.scene.findAll(
      (n) =>
        isPlainMesh(n.instance) && (n.instance as THREE.Mesh).geometry.type === 'CylinderGeometry',
    );
    expect(curved).toHaveLength(1);
    await renderer.unmount();
  });

  it('keeps the room when only the seat statuses change', async () => {
    const map = standardMap();
    const { renderer, update } = await mount({ map });
    const floor = renderer.scene.findAll((n) => isPlainMesh(n.instance))[0]?.instance;
    await update({ map: { ...map, seats: map.seats.map((s) => ({ ...s, status: 'TAKEN' })) } });
    expect(renderer.scene.findAll((n) => isPlainMesh(n.instance))[0]?.instance).toBe(floor);
    await renderer.unmount();
  });
});
