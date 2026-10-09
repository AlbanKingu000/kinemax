// Dust in a projector beam, drawn on a 2D canvas. Pure logic, no React, so it can be tested with a
// fake context. Kept light on purpose: at most 120 tiny particles, 30 fps, DPR capped at 1.5, and
// the particle count shrinks if a frame costs more than its budget. The beam, glow and vignette
// are static CSS layers (see HeroBackground.module.css); only the dust moves.

/** Beam triangle in normalized coordinates (0-1 of the hero box). Also used for the CSS clip-path. */
export const BEAM = {
  apex: { x: 0.8, y: -0.1 },
  left: { x: 0.04, y: 1.05 },
  right: { x: 0.56, y: 1.05 },
} as const;

export const MIN_PARTICLES = 12;
export const MAX_PARTICLES = 120;

export interface Particle {
  x: number;
  y: number;
  /** Radius in CSS px. */
  r: number;
  /** Drift in normalized units per second. */
  vx: number;
  vy: number;
  phase: number;
  twinkle: number;
}

/** Small deterministic PRNG (mulberry32), so the static frame always looks the same. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** About one particle per 10,000 px², within the limits. */
export function particleCount(width: number, height: number): number {
  return Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.round((width * height) / 10_000)));
}

export function createParticles(count: number, random: () => number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    r: 0.7 + random() * random() * 2.3,
    vx: (random() - 0.5) * 0.012,
    vy: -0.004 - random() * 0.01,
    phase: random() * Math.PI * 2,
    twinkle: 0.4 + random() * 1.2,
  }));
}

/** Moves particles (slow upward drift with a small sway) and wraps them around the edges. */
export function stepParticles(particles: Particle[], dtSeconds: number, timeSeconds: number): void {
  for (const p of particles) {
    p.x += (p.vx + Math.sin(timeSeconds * 0.3 + p.phase) * 0.002) * dtSeconds;
    p.y += p.vy * dtSeconds;
    if (p.y < -0.02) p.y += 1.04;
    if (p.x < -0.02) p.x += 1.04;
    else if (p.x > 1.02) p.x -= 1.04;
  }
}

/** 0 outside the beam, up to 1 on its axis near the projector. */
export function beamStrength(x: number, y: number): number {
  const { apex, left, right } = BEAM;
  const depth = (y - apex.y) / (left.y - apex.y);
  if (depth <= 0 || depth > 1) return 0;
  const edgeLeft = apex.x + (left.x - apex.x) * depth;
  const edgeRight = apex.x + (right.x - apex.x) * depth;
  const center = (edgeLeft + edgeRight) / 2;
  const halfWidth = (edgeRight - edgeLeft) / 2;
  const offset = Math.abs(x - center) / halfWidth;
  if (offset >= 1) return 0;
  return (1 - offset) ** 1.5 * (1 - depth * 0.55);
}

/** The subset of CanvasRenderingContext2D the dust needs (easy to fake in tests). */
export type DustContext = Pick<
  CanvasRenderingContext2D,
  'clearRect' | 'beginPath' | 'arc' | 'fill' | 'fillRect' | 'globalAlpha' | 'fillStyle'
>;

const DUST_COLOR = '#f3eee8';

export function drawDust(
  ctx: DustContext,
  particles: readonly Particle[],
  width: number,
  height: number,
  dpr: number,
  timeSeconds: number,
): void {
  ctx.clearRect(0, 0, width * dpr, height * dpr);
  ctx.fillStyle = DUST_COLOR;
  for (const p of particles) {
    const flicker = 0.65 + 0.35 * Math.sin(timeSeconds * p.twinkle + p.phase);
    const alpha = (0.14 + 0.86 * Math.sqrt(beamStrength(p.x, p.y))) * flicker;
    if (alpha < 0.05) continue;
    ctx.globalAlpha = Math.min(1, alpha);
    const x = p.x * width * dpr;
    const y = p.y * height * dpr;
    const r = p.r * dpr;
    if (r < 0.9) {
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export interface DustAnimationOptions {
  seed?: number;
  fps?: number;
  /** Frame cost budget in ms; above it (on average) the particle count is reduced. */
  budgetMs?: number;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

export interface DustAnimation {
  setSize: (width: number, height: number, dpr: number) => void;
  setRunning: (running: boolean) => void;
  /** Draws one still frame (used for reduced motion). */
  renderStatic: () => void;
  readonly particleCount: number;
  readonly running: boolean;
  destroy: () => void;
}

export function createDustAnimation(
  ctx: DustContext,
  {
    seed = 7,
    fps = 30,
    budgetMs = 4,
    now = () => performance.now(),
    requestFrame = (callback) => window.requestAnimationFrame(callback),
    cancelFrame = (handle) => {
      window.cancelAnimationFrame(handle);
    },
  }: DustAnimationOptions = {},
): DustAnimation {
  const random = createRandom(seed);
  const frameInterval = 1000 / fps;
  let particles: Particle[] = [];
  let size = { width: 0, height: 0, dpr: 1 };
  let handle: number | undefined;
  let last = 0;
  let elapsed = 0;
  let averageCost = 0;
  // Lowered for good when frames are too expensive, so a resize does not undo it.
  let cap = MAX_PARTICLES;

  function tick(timestamp: number) {
    handle = requestFrame(tick);
    if (last === 0) last = timestamp;
    const delta = timestamp - last;
    if (delta < frameInterval - 1) return;
    last = timestamp;
    const dt = Math.min(delta, 100) / 1000;
    elapsed += dt;

    const start = now();
    stepParticles(particles, dt, elapsed);
    drawDust(ctx, particles, size.width, size.height, size.dpr, elapsed);
    const cost = now() - start;
    averageCost = averageCost === 0 ? cost : averageCost * 0.9 + cost * 0.1;
    if (averageCost > budgetMs && particles.length > MIN_PARTICLES) {
      cap = Math.max(MIN_PARTICLES, Math.floor(particles.length * 0.75));
      particles = particles.slice(0, cap);
      averageCost = 0;
    }
  }

  function stop() {
    if (handle !== undefined) cancelFrame(handle);
    handle = undefined;
    last = 0;
  }

  return {
    setSize(width, height, dpr) {
      size = { width, height, dpr };
      const count = Math.min(cap, particleCount(width, height));
      if (particles.length !== count) particles = createParticles(count, random);
    },
    setRunning(running) {
      if (running && handle === undefined) handle = requestFrame(tick);
      else if (!running) stop();
    },
    renderStatic() {
      drawDust(ctx, particles, size.width, size.height, size.dpr, 0);
    },
    get particleCount() {
      return particles.length;
    },
    get running() {
      return handle !== undefined;
    },
    destroy: stop,
  };
}
