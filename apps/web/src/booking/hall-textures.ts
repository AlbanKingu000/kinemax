// Tiny textures drawn in code for the 3D hall (no image assets to download). Part of the lazy 3D
// chunk. Each is a small canvas; repeat and filtering do the rest.
import * as THREE from 'three';
import { LOGO_SHAPES } from '../assets/brand/logo-data';
import { ICON_PATHS } from '../components/Icon/icon-paths';

/** A design token's value (the 3D hall uses the same seat colors as the legend and the 2D map). */
export function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  { repeat = false, srgb = true } = {},
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Deterministic noise, so the hall looks the same on every visit. */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** A soft round glow (white; tinted by the material or instance color). */
export const glowTexture = () =>
  canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });

/** Dark warm carpet with a faint diamond weave (one tile = 1 m). */
export const carpetTexture = (base: string, motif: string) =>
  canvasTexture(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, 128, 128);
      const rnd = random(7);
      for (let i = 0; i < 2200; i++) {
        ctx.fillStyle = `rgba(${rnd() > 0.5 ? '255,235,220' : '0,0,0'},${String(0.04 + rnd() * 0.05)})`;
        ctx.fillRect(rnd() * 128, rnd() * 128, 1, 1);
      }
      ctx.strokeStyle = motif;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      for (let x = 0; x <= 128; x += 32) {
        for (let y = 0; y <= 128; y += 32) {
          ctx.beginPath();
          ctx.moveTo(x, y - 6);
          ctx.lineTo(x + 6, y);
          ctx.lineTo(x, y + 6);
          ctx.lineTo(x - 6, y);
          ctx.closePath();
          ctx.stroke();
        }
      }
    },
    { repeat: true },
  );

/** Vertical fabric ribs for the acoustic wall panels (grey, tinted by the material). */
export const fabricTexture = () =>
  canvasTexture(
    64,
    64,
    (ctx) => {
      const rnd = random(11);
      for (let x = 0; x < 64; x++) {
        const v = 150 + Math.round(Math.sin(x * 0.8) * 30 + rnd() * 25);
        ctx.fillStyle = `rgb(${String(v)},${String(v)},${String(v)})`;
        ctx.fillRect(x, 0, 1, 64);
      }
    },
    { repeat: true },
  );

/** Fades the projector beam from the booth (bright) to the screen (almost gone). */
export const beamTexture = () =>
  canvasTexture(4, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 128);
  });

/** A design-system icon as a floor decal: ivory outline square with the icon inside. */
export const iconDecalTexture = (icon: keyof typeof ICON_PATHS, color: string) =>
  canvasTexture(128, 128, (ctx) => {
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.roundRect(8, 8, 112, 112, 18);
    ctx.stroke();
    ctx.save();
    ctx.translate(20, 20);
    ctx.scale(88 / 24, 88 / 24);
    ctx.lineWidth = 1.6;
    ctx.stroke(new Path2D(ICON_PATHS[icon]));
    ctx.restore();
  });

/** The KX monogram from the generated logo data (ring + ivory K + crimson X). */
export const monogramTexture = (ivory: string, crimson: string) =>
  canvasTexture(256, 256, (ctx) => {
    const shape = LOGO_SHAPES.monogram;
    const size = Number(shape.viewBox.split(' ')[2]);
    ctx.scale(256 / size, 256 / size);
    ctx.strokeStyle = ivory;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = shape.ring.stroke * 1.5;
    ctx.beginPath();
    ctx.arc(shape.ring.cx, shape.ring.cy, shape.ring.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ivory;
    ctx.fill(new Path2D(shape.ivory));
    ctx.fillStyle = crimson;
    ctx.fill(new Path2D(shape.crimson));
  });
