import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  boxes,
  companionPiping,
  curtains,
  floorPlane,
  loveseat,
  planes,
  recliner,
  screenFrame,
  sideTable,
  sofaArm,
  sofaSegment,
  standardSeat,
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

const size = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  return (g.boundingBox ?? new THREE.Box3()).getSize(new THREE.Vector3());
};

describe('seat models', () => {
  it('are single merged geometries with a shade per vertex', () => {
    for (const g of [standardSeat(0.55), recliner(0.95), loveseat(1.1), sofaSegment(0.95)]) {
      expect(g.getAttribute('position').count).toBeGreaterThan(100);
      expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    }
  });

  it('fit their seat width and stand at seated height', () => {
    const seat = size(standardSeat(0.55));
    // Armrests end exactly at the seat edge: neighbours touch but never overlap (no z-fighting).
    expect(seat.x).toBeCloseTo(0.55);
    expect(seat.y).toBeGreaterThan(0.9);
    expect(seat.y).toBeLessThan(1.3);
    // A recliner is wider and deeper (footrest), a loveseat is double width.
    expect(size(recliner(0.95)).x).toBeGreaterThan(seat.x);
    expect(size(recliner(0.95)).z).toBeGreaterThan(seat.z);
    expect(size(loveseat(1.1)).x).toBeGreaterThan(seat.x * 1.8);
    // Sofa segments touch their neighbours, so a row reads as one sofa.
    expect(size(sofaSegment(0.95)).x).toBeCloseTo(0.95);
  });

  it('builds the extras: piping, side table, sofa arm, floor plane', () => {
    expect(size(companionPiping(0.55)).x).toBeLessThan(0.55);
    expect(size(sideTable(0.95)).y).toBeLessThan(0.1);
    expect(size(sofaArm()).y).toBeGreaterThan(0.5);
    const plane = floorPlane();
    expect(size(plane).y).toBeCloseTo(0);
  });
});

describe('room geometry', () => {
  it('drapes curtains beside the screen, standing forward beside a curved screen', () => {
    const flat = size(curtains(12, 5, 3.5, 8));
    expect(flat.x).toBeGreaterThan(12 + 2 * 1.4);
    expect(flat.y).toBeCloseTo(8 - (3.5 - 2.5 - 0.4), 1);
    const curved = curtains(22, 9.5, 5.5, 12, 1.4);
    curved.computeBoundingBox();
    expect(curved.boundingBox?.max.z).toBeGreaterThan(1.4);
  });

  it('frames a flat screen', () => {
    const frame = size(screenFrame(12, 5));
    expect(frame.x).toBeGreaterThan(12);
    expect(frame.y).toBeGreaterThan(5);
  });

  it('gives merged boxes metric UVs (one carpet tile per meter)', () => {
    const floor = worldUVs(boxes([{ size: [10, 0.02, 4], at: [0, 0, 2] }]));
    const uv = floor.getAttribute('uv');
    let maxU = -Infinity;
    for (let i = 0; i < uv.count; i++) maxU = Math.max(maxU, uv.getX(i));
    expect(maxU).toBeCloseTo(5);
    const shaded = boxes([{ size: [1, 1, 1], at: [0, 0, 0], shade: 0.3 }]);
    expect(shaded.getAttribute('color').getX(0)).toBeCloseTo(0.3);
  });

  it('merges the walls into one geometry, shaded per surface', () => {
    const walls = planes([
      { size: [10, 5], at: [-5, 2.5, 5], rotation: [0, Math.PI / 2, 0], shade: 1 },
      { size: [10, 5], at: [0, 5, 5], rotation: [Math.PI / 2, 0, 0], shade: 0.4 },
    ]);
    expect(walls.getAttribute('position').count).toBe(8);
    expect(walls.getAttribute('color').getX(7)).toBeCloseTo(0.4);
  });
});

describe('textures drawn in code', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    const gradient = { addColorStop: () => undefined };
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, key: string) =>
          (...args: unknown[]) => {
            calls.push(key);
            return key.startsWith('create') ? gradient : args[0];
          },
        set: () => true,
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
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

  it('are small canvases, in sRGB, tiling where they repeat', () => {
    const carpet = carpetTexture('#141012', '#7a1d2c');
    expect(carpet.wrapS).toBe(THREE.RepeatWrapping);
    expect(carpet.colorSpace).toBe(THREE.SRGBColorSpace);
    const image = carpet.image;
    expect(image.width * image.height).toBeLessThanOrEqual(128 * 128);
    for (const texture of [fabricTexture(), glowTexture(), beamTexture()]) {
      expect(texture).toBeInstanceOf(THREE.CanvasTexture);
    }
    expect(calls).toContain('createRadialGradient');
    expect(calls).toContain('createLinearGradient');
  });

  it('draws the wheelchair icon and the KX monogram from the design system', () => {
    iconDecalTexture('wheelchair', '#f3eee8');
    monogramTexture('#f3eee8', '#b3132f');
    expect(calls.filter((c) => c === 'stroke').length).toBeGreaterThanOrEqual(2);
    expect(calls.filter((c) => c === 'fill').length).toBe(2);
  });

  it('read colors from the design tokens, with a fallback', () => {
    document.documentElement.style.setProperty('--color-seat-vip', '#5a1a24');
    expect(token('--color-seat-vip', '#000000')).toBe('#5a1a24');
    expect(token('--color-missing', '#123456')).toBe('#123456');
    document.documentElement.style.removeProperty('--color-seat-vip');
  });
});
