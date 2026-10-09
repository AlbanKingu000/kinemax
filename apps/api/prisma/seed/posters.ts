// Abstract placeholder posters and backdrops (black/red, our own). Deterministic per movie slug.

import { createHash } from 'node:crypto';

const escapeXml = (text: string) =>
  text.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c,
  );

/** Deterministic pseudo-random numbers 0..1 from a seed string. */
function randoms(seed: string, count: number): number[] {
  const bytes = createHash('sha256').update(seed).digest();
  return Array.from({ length: count }, (_, i) => (bytes[i % bytes.length] ?? 0) / 255);
}

const REDS = ['#e50914', '#b0060f', '#ff2a2a', '#7a0008', '#ff5a4f'];

function shapes(seed: string, width: number, height: number): string {
  const r = randoms(seed, 24);
  const at = (i: number) => r[i] ?? 0.5;
  const red = (i: number) => REDS[Math.floor(at(i) * REDS.length) % REDS.length] ?? '#e50914';
  const circles = [0, 1, 2]
    .map((i) => {
      const cx = Math.round(at(i * 3) * width);
      const cy = Math.round((0.15 + at(i * 3 + 1) * 0.55) * height);
      const radius = Math.round((0.12 + at(i * 3 + 2) * 0.3) * Math.min(width, height));
      return `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(radius)}" fill="${red(i + 10)}" opacity="${(0.25 + at(i + 12) * 0.5).toFixed(2)}"/>`;
    })
    .join('');
  const angle = Math.round(-30 + at(20) * 60);
  const band = `<rect x="${String(-width)}" y="${String(Math.round(height * (0.35 + at(21) * 0.2)))}" width="${String(width * 3)}" height="${String(Math.round(height * 0.06))}" fill="${red(22)}" opacity="0.85" transform="rotate(${String(angle)} ${String(width / 2)} ${String(height / 2)})"/>`;
  return circles + band;
}

function svg(width: number, height: number, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}" role="img">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140204"/><stop offset="1" stop-color="#000000"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#bg)"/>
${body}
</svg>
`;
}

export function posterSvg(movie: { slug: string; titleSq: string }): string {
  const width = 600;
  const height = 900;
  const words = movie.titleSq.toUpperCase().split(' ');
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && (last + ' ' + word).length <= 14)
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const title = lines
    .map(
      (line, i) =>
        `<text x="40" y="${String(640 + i * 62 - (lines.length - 1) * 31)}" font-family="'Bebas Neue', 'Arial Narrow', sans-serif" font-size="60" fill="#ffffff" letter-spacing="2">${escapeXml(line)}</text>`,
    )
    .join('');
  return svg(
    width,
    height,
    `${shapes(movie.slug, width, height)}<rect y="560" width="${String(width)}" height="340" fill="#000000" opacity="0.55"/>${title}<text x="40" y="860" font-family="'Inter', Arial, sans-serif" font-size="20" fill="#e50914" letter-spacing="6">KINEMAX</text>`,
  );
}

export function backdropSvg(movie: { slug: string }): string {
  const width = 1600;
  const height = 900;
  return svg(width, height, shapes(`${movie.slug}-backdrop`, width, height));
}
