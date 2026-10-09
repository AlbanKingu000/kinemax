import { describe, expect, it, vi } from 'vitest';
import {
  BEAM,
  beamStrength,
  createDustAnimation,
  createParticles,
  createRandom,
  drawDust,
  MAX_PARTICLES,
  MIN_PARTICLES,
  particleCount,
  stepParticles,
  type DustContext,
} from './dust';

function fakeContext(): DustContext & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    globalAlpha: 1,
    fillStyle: '#000',
    clearRect: vi.fn(() => calls.push('clear')),
    beginPath: vi.fn(),
    arc: vi.fn(() => calls.push('arc')),
    fill: vi.fn(),
    fillRect: vi.fn(() => calls.push('rect')),
  };
}

/** Manual requestAnimationFrame. */
function frames() {
  let callback: FrameRequestCallback | undefined;
  let nextHandle = 1;
  return {
    requestFrame: (cb: FrameRequestCallback) => {
      callback = cb;
      return nextHandle++;
    },
    cancelFrame: vi.fn(() => {
      callback = undefined;
    }),
    run(timestamp: number) {
      const cb = callback;
      callback = undefined;
      cb?.(timestamp);
    },
    get pending() {
      return callback !== undefined;
    },
  };
}

describe('dust helpers', () => {
  it('is deterministic for a seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const values = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(values);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('scales the particle count with the area within limits', () => {
    expect(particleCount(100, 100)).toBe(MIN_PARTICLES);
    expect(particleCount(1280, 720)).toBe(92);
    expect(particleCount(4000, 3000)).toBe(MAX_PARTICLES);
  });

  it('is brightest on the beam axis and dark outside it', () => {
    const axisX = (BEAM.left.x + BEAM.right.x) / 2;
    const near = beamStrength(BEAM.apex.x + (axisX - BEAM.apex.x) * 0.2, 0.1);
    expect(near).toBeGreaterThan(0.5);
    expect(beamStrength(0.98, 0.9)).toBe(0);
    expect(beamStrength(0.5, -0.5)).toBe(0);
    expect(beamStrength(0.5, 2)).toBe(0);
  });

  it('drifts particles up and wraps them around the edges', () => {
    const particles = createParticles(3, createRandom(1));
    const first = particles[0];
    expect(first).toBeDefined();
    if (!first) return;
    const startY = first.y;
    stepParticles(particles, 1, 0);
    expect(first.y).toBeLessThan(startY);

    first.y = -0.05;
    first.x = -0.05;
    stepParticles(particles, 0, 0);
    expect(first.y).toBeGreaterThan(0.9);
    expect(first.x).toBeGreaterThan(0.9);
    first.x = 1.05;
    stepParticles(particles, 0, 0);
    expect(first.x).toBeLessThan(0.1);
  });

  it('draws small particles as rects, large ones as circles, and skips invisible ones', () => {
    const ctx = fakeContext();
    drawDust(
      ctx,
      [
        { x: 0.45, y: 0.3, r: 0.3, vx: 0, vy: 0, phase: Math.PI / 2, twinkle: 1 },
        { x: 0.45, y: 0.3, r: 2, vx: 0, vy: 0, phase: Math.PI / 2, twinkle: 1 },
        { x: 0.99, y: 0.95, r: 2, vx: 0, vy: 0, phase: -Math.PI / 2, twinkle: 1 },
      ],
      800,
      600,
      1,
      0,
    );
    expect(ctx.calls).toEqual(['clear', 'rect', 'arc']);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('createDustAnimation', () => {
  it('runs at the frame cap and stops cleanly', () => {
    const ctx = fakeContext();
    const raf = frames();
    const dust = createDustAnimation(ctx, { ...raf, now: () => 0 });
    dust.setSize(1280, 720, 1);
    expect(dust.particleCount).toBe(92);

    dust.setRunning(true);
    expect(dust.running).toBe(true);
    dust.setRunning(true); // no second loop
    raf.run(1000); // first frame only sets the clock
    raf.run(1010); // too early for 30 fps
    expect(ctx.clearRect).not.toHaveBeenCalled();
    raf.run(1034);
    expect(ctx.clearRect).toHaveBeenCalledOnce();

    dust.setRunning(false);
    expect(dust.running).toBe(false);
    expect(raf.cancelFrame).toHaveBeenCalled();
    expect(raf.pending).toBe(false);
    dust.destroy();
  });

  it('draws a still frame on demand', () => {
    const ctx = fakeContext();
    const dust = createDustAnimation(ctx, frames());
    dust.setSize(400, 300, 2);
    dust.renderStatic();
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it('sheds particles when frames cost more than the budget, and keeps the lower cap', () => {
    const ctx = fakeContext();
    const raf = frames();
    let clock = 0;
    const dust = createDustAnimation(ctx, {
      ...raf,
      budgetMs: 4,
      now: () => (clock += 10), // every frame "costs" 10 ms
    });
    dust.setSize(1920, 1080, 1);
    const initial = dust.particleCount;
    dust.setRunning(true);
    for (let i = 0; i <= 40; i += 1) raf.run(i * 40);
    expect(dust.particleCount).toBeLessThan(initial);
    expect(dust.particleCount).toBeGreaterThanOrEqual(MIN_PARTICLES);

    const reduced = dust.particleCount;
    dust.setSize(2560, 1440, 1);
    expect(dust.particleCount).toBeLessThanOrEqual(reduced);
    dust.destroy();
  });

  it('uses requestAnimationFrame by default', () => {
    const request = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(5);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const dust = createDustAnimation(fakeContext());
    dust.setRunning(true);
    expect(request).toHaveBeenCalledOnce();
    dust.setRunning(false);
    expect(cancel).toHaveBeenCalledWith(5);
  });
});
