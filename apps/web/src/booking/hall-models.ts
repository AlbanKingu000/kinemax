// Low-poly geometry for the 3D hall, built once per hall and merged: every seat model is ONE
// geometry (drawn as one InstancedMesh), and the room is a handful of merged meshes. Vertex colors
// shade the parts of a model (dark frame, lighter cushions); the instance color tints the whole.
// Local model space: origin on the floor under the seat's middle, the seat faces -Z (the screen).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type V3 = readonly [number, number, number];
interface Part {
  geometry: THREE.BufferGeometry;
  at: V3;
  /** Tilt around X (radians): positive leans the top backwards. */
  tilt?: number;
  /** Vertex color (grey level) of this part. */
  shade?: number;
}

/** A soft-edged box; the radius is kept inside the box. */
function box(w: number, h: number, d: number, radius = 0.03) {
  const r = Math.max(0.001, Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  return new RoundedBoxGeometry(w, h, d, 1, r);
}

const matrix = new THREE.Matrix4();
const rotation = new THREE.Quaternion();
const euler = new THREE.Euler();
const one = new THREE.Vector3(1, 1, 1);

function merge(parts: Part[]): THREE.BufferGeometry {
  const prepared = parts.map(({ geometry: g, at, tilt = 0, shade = 1 }) => {
    rotation.setFromEuler(euler.set(tilt, 0, 0));
    g.applyMatrix4(matrix.compose(new THREE.Vector3(...at), rotation, one));
    const count = g.getAttribute('position').count;
    g.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(new Array<number>(count * 3).fill(shade), 3),
    );
    return g;
  });
  const merged = mergeGeometries(prepared);
  for (const g of prepared) g.dispose();
  return merged;
}

const mirror = (x: number): [number, number] => [-x, x];

/** Crimson velvet cinema seat: pedestal, cushion, reclined back, armrests. */
export function standardSeat(w: number): THREE.BufferGeometry {
  return merge([
    { geometry: box(w * 0.45, 0.34, 0.3, 0.02), at: [0, 0.17, 0.06], shade: 0.16 },
    { geometry: box(w - 0.13, 0.13, 0.5, 0.05), at: [0, 0.45, -0.04] },
    { geometry: box(w - 0.11, 0.66, 0.12, 0.05), at: [0, 0.82, 0.25], tilt: 0.18, shade: 0.9 },
    ...mirror(w / 2 - 0.035).flatMap((x): Part[] => [
      { geometry: box(0.06, 0.62, 0.52, 0.02), at: [x, 0.31, 0.02], shade: 0.2 },
      { geometry: box(0.07, 0.045, 0.5, 0.02), at: [x, 0.64, -0.02], shade: 0.32 },
    ]),
  ]);
}

/** The thin ivory piping of a companion seat (drawn over the standard shape). */
export function companionPiping(w: number): THREE.BufferGeometry {
  return merge([
    { geometry: box(w - 0.1, 0.025, 0.13, 0.01), at: [0, 1.15, 0.31], tilt: 0.18 },
    { geometry: box(w - 0.12, 0.025, 0.025, 0.01), at: [0, 0.52, -0.29] },
  ]);
}

/**
 * Burgundy leather recliner with a raised footrest. The armrests narrow with the seat width, so a
 * recliner in a standard hall's row keeps a wide cushion and back.
 */
export function recliner(w: number): THREE.BufferGeometry {
  const { arm, cushion, back, head } = reclinerParts(w);
  return merge([
    { geometry: box(w - 0.08, 0.3, 0.78, 0.04), at: [0, 0.15, 0.02], shade: 0.45 },
    { geometry: box(cushion, 0.16, 0.62, 0.07), at: [0, 0.38, -0.02] },
    { geometry: box(back, 0.78, 0.2, 0.08), at: [0, 0.83, 0.38], tilt: 0.32, shade: 0.94 },
    { geometry: box(head, 0.18, 0.12, 0.05), at: [0, 1.22, 0.55], tilt: 0.32 },
    {
      geometry: box(cushion - 0.02, 0.09, 0.46, 0.04),
      at: [0, 0.28, -0.58],
      tilt: -0.3,
      shade: 0.88,
    },
    ...mirror(w / 2 - arm / 2 - 0.015).map((x): Part => ({
      geometry: box(arm, 0.26, 0.86, Math.min(0.06, arm / 2 - 0.005)),
      at: [x, 0.5, 0.02],
      shade: 0.7,
    })),
  ]);
}

function reclinerParts(w: number) {
  const arm = Math.min(0.15, w * 0.16);
  const cushion = w - 2 * arm - 0.02;
  return { arm, cushion, back: cushion + 0.04, head: cushion - 0.08 };
}

/** The recliner's thin gold piping: along the headrest and the front of the cushion. */
export function reclinerPiping(w: number): THREE.BufferGeometry {
  const { cushion, head } = reclinerParts(w);
  return merge([
    { geometry: box(head + 0.02, 0.025, 0.14, 0.01), at: [0, 1.31, 0.58], tilt: 0.32 },
    { geometry: box(cushion - 0.02, 0.025, 0.025, 0.01), at: [0, 0.46, -0.33] },
  ]);
}

/** A small round side table on the recliner's right armrest (wood). */
export function sideTable(w: number): THREE.BufferGeometry {
  return merge([
    {
      geometry: new THREE.CylinderGeometry(0.13, 0.13, 0.025, 18),
      at: [w / 2 - 0.09, 0.66, -0.36],
    },
    {
      geometry: new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8),
      at: [w / 2 - 0.09, 0.64, -0.36],
      shade: 0.6,
    },
  ]);
}

/** Double-width loveseat: one back, two cushions, armrests only at the outer ends. */
export function loveseat(w: number): THREE.BufferGeometry {
  return merge([
    { geometry: box(w - 0.1, 0.32, 0.6, 0.04), at: [0, 0.16, 0.02], shade: 0.4 },
    ...mirror(w / 4 - 0.025).map((x): Part => ({
      geometry: box(w / 2 - 0.11, 0.14, 0.54, 0.06),
      at: [x, 0.4, -0.04],
    })),
    { geometry: box(w - 0.14, 0.7, 0.16, 0.06), at: [0, 0.82, 0.27], tilt: 0.2, shade: 0.92 },
    ...mirror(w / 2 - 0.06).map((x): Part => ({
      geometry: box(0.12, 0.62, 0.62, 0.05),
      at: [x, 0.31, 0.02],
      shade: 0.62,
    })),
  ]);
}

/** One seat-wide piece of a lounge sofa; neighbours join into one long sofa (suites). */
export function sofaSegment(w: number): THREE.BufferGeometry {
  return merge([
    { geometry: box(w, 0.28, 0.88, 0.03), at: [0, 0.14, 0.05], shade: 0.5 },
    { geometry: box(w - 0.04, 0.17, 0.7, 0.07), at: [0, 0.36, -0.03] },
    { geometry: box(w - 0.06, 0.52, 0.22, 0.09), at: [0, 0.7, 0.34], tilt: 0.22, shade: 0.95 },
    { geometry: box(w, 0.62, 0.12, 0.03), at: [0, 0.5, 0.46], shade: 0.5 },
  ]);
}

/** The arm closing each end of a lounge sofa. */
export const sofaArm = () =>
  merge([{ geometry: box(0.18, 0.62, 0.92, 0.07), at: [0, 0.31, 0.05], shade: 0.6 }]);

/** A unit plane lying on the floor (decals and glows), facing up. */
export function floorPlane(): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
}

/**
 * Masking curtains beside the screen and a valance above it: vertical folds as a gently waved
 * plane. Faces +Z (the audience) only, so a camera behind the screen wall sees through it.
 */
export function curtains(
  screenW: number,
  screenH: number,
  screenZ: number,
  wallH: number,
  /** The side panels stand this far forward (beside the edges of a curved screen). */
  sideDepth = 0,
) {
  const panel = (width: number, height: number, x: number, y: number, z = 0) => {
    const g = new THREE.PlaneGeometry(width, height, Math.max(8, Math.round(width * 10)), 1);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.05 + 0.08);
    g.computeVertexNormals();
    return { geometry: g, at: [x, y, z] as V3 };
  };
  const side = 1.4;
  const bottom = Math.max(0, screenZ - screenH / 2 - 0.4);
  const top = screenZ + screenH / 2 + 0.2;
  const valance = Math.max(0.4, wallH - top);
  return merge([
    ...mirror(screenW / 2 + side / 2 + 0.12).map((x) =>
      panel(side, wallH - bottom, x, (wallH + bottom) / 2, sideDepth),
    ),
    panel(screenW + side * 2 + 0.4, valance, 0, wallH - valance / 2),
  ]);
}

/** Thin black frame around a flat screen (faces the audience only). */
export function screenFrame(w: number, h: number): THREE.BufferGeometry {
  const t = 0.16;
  const bar = (bw: number, bh: number, x: number, y: number): Part => ({
    geometry: new THREE.PlaneGeometry(bw, bh),
    at: [x, y, 0.09],
  });
  return merge([
    bar(w + t * 2, t, 0, h / 2 + t / 2),
    bar(w + t * 2, t, 0, -h / 2 - t / 2),
    bar(t, h, -w / 2 - t / 2, 0),
    bar(t, h, w / 2 + t / 2, 0),
  ]);
}

/** UVs from world position (1 unit = 1 m), so one carpet tile covers 1 m on every face. */
export function worldUVs(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i))];
    const [u, v] = ny > 0.5 ? [x, z] : nx > 0.5 ? [z, y] : [x, y];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Merges plain boxes { size, at } into one geometry (floor tiers, walls). */
export function boxes(items: { size: V3; at: V3; shade?: number }[]): THREE.BufferGeometry {
  return merge(
    items.map(({ size, at, shade }) => ({
      geometry: new THREE.BoxGeometry(...size),
      at,
      ...(shade === undefined ? {} : { shade }),
    })),
  );
}

/** Merges inward-facing planes (the walls and ceiling of the room), shaded per surface. */
export function planes(
  items: { size: [number, number]; at: V3; rotation: V3; shade: number }[],
): THREE.BufferGeometry {
  const prepared = items.map(({ size, at, rotation: r, shade }) => {
    const g = new THREE.PlaneGeometry(...size);
    g.applyMatrix4(
      matrix.compose(
        new THREE.Vector3(...at),
        rotation.setFromEuler(euler.set(r[0], r[1], r[2])),
        one,
      ),
    );
    const count = g.getAttribute('position').count;
    g.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(new Array<number>(count * 3).fill(shade), 3),
    );
    return g;
  });
  const merged = mergeGeometries(prepared);
  for (const g of prepared) g.dispose();
  return merged;
}
