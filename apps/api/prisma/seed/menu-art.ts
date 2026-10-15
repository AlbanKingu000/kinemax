// Original abstract illustrations of the menu items, in the Kinemax palette (black, crimson,
// ivory, a touch of gold). Flat shapes, no photos, no brands. Deterministic per item.

const C = {
  ink: '#0b0a0b',
  crimson: '#b3132f',
  deep: '#6e0c1d',
  ivory: '#f3eee8',
  cream: '#e9dcc8',
  gold: '#c9a46a',
  amber: '#d98a2b',
  brown: '#5a2e1c',
};

const W = 480;
const H = 360;

/** Popcorn puffs over the rim of a container whose top spans x0..x1 at height y. */
function puffs(x0: number, x1: number, y: number, color: string, rows = 2): string {
  const out: string[] = [];
  for (let row = 0; row < rows; row++) {
    const count = Math.round((x1 - x0) / 26) - row;
    for (let i = 0; i < count; i++) {
      const cx = x0 + 14 + row * 13 + i * 26;
      const cy = y - 8 - row * 18 - ((i * 7) % 5);
      out.push(
        `<circle cx="${String(cx)}" cy="${String(cy)}" r="${String(15 - row * 2)}" fill="${color}"/>`,
      );
    }
  }
  return out.join('');
}

/** A striped popcorn bucket (trapezoid) centered at cx, `scale` 0.8..1.2. */
function bucket(cx: number, scale: number, puffColor: string): string {
  const top = 150 - 30 * (scale - 1);
  const halfTop = 70 * scale;
  const halfBottom = 52 * scale;
  const bottom = 300;
  const stripes = [-2, -1, 0, 1, 2]
    .map((i) => {
      const t0 = cx + (i * 2 * halfTop) / 5 - halfTop / 10;
      const b0 = cx + (i * 2 * halfBottom) / 5 - halfBottom / 10;
      const wT = (2 * halfTop) / 10;
      const wB = (2 * halfBottom) / 10;
      return `<polygon points="${f(t0)},${f(top)} ${f(t0 + wT)},${f(top)} ${f(b0 + wB)},${f(bottom)} ${f(b0)},${f(bottom)}" fill="${C.crimson}"/>`;
    })
    .join('');
  return `${puffs(cx - halfTop, cx + halfTop, top, puffColor, 3)}
<polygon points="${f(cx - halfTop)},${f(top)} ${f(cx + halfTop)},${f(top)} ${f(cx + halfBottom)},${f(bottom)} ${f(cx - halfBottom)},${f(bottom)}" fill="${C.ivory}"/>${stripes}
<rect x="${f(cx - halfTop - 4)}" y="${f(top - 4)}" width="${f(2 * halfTop + 8)}" height="10" rx="4" fill="${C.cream}"/>`;
}

/** A lidded cup with a straw. */
function cup(cx: number, color: string): string {
  return `<rect x="${f(cx + 8)}" y="92" width="9" height="70" rx="4" fill="${C.ivory}" transform="rotate(12 ${f(cx + 12)} 130)"/>
<polygon points="${f(cx - 48)},150 ${f(cx + 48)},150 ${f(cx + 36)},300 ${f(cx - 36)},300" fill="${color}"/>
<rect x="${f(cx - 54)}" y="138" width="108" height="16" rx="7" fill="${C.ivory}"/>
<rect x="${f(cx - 40)}" y="205" width="80" height="34" rx="6" fill="${C.ivory}" opacity="0.92"/>
<circle cx="${f(cx)}" cy="222" r="9" fill="${C.crimson}"/>`;
}

function bottle(cx: number, color: string, liquid: number): string {
  return `<rect x="${f(cx - 14)}" y="88" width="28" height="22" rx="4" fill="${C.ivory}"/>
<path d="M${f(cx - 16)} 110 h32 l14 40 v142 a10 10 0 0 1 -10 10 h-40 a10 10 0 0 1 -10 -10 v-142 z" fill="${C.ivory}" opacity="0.18"/>
<path d="M${f(cx - 30)} ${f(300 - liquid)} h60 v-0 v${f(liquid - 8)} a10 10 0 0 1 -10 10 h-40 a10 10 0 0 1 -10 -10 z" fill="${color}"/>
<rect x="${f(cx - 30)}" y="190" width="60" height="30" fill="${C.ivory}" opacity="0.9"/>`;
}

function glass(cx: number, color: string): string {
  return `<path d="M${f(cx - 46)} 130 h92 l-12 168 a8 8 0 0 1 -8 7 h-52 a8 8 0 0 1 -8 -7 z" fill="${C.ivory}" opacity="0.2"/>
<path d="M${f(cx - 40)} 168 h80 l-9 128 a8 8 0 0 1 -8 7 h-46 a8 8 0 0 1 -8 -7 z" fill="${color}"/>
<circle cx="${f(cx + 40)}" cy="140" r="22" fill="${C.amber}"/><circle cx="${f(cx + 40)}" cy="140" r="14" fill="${C.gold}"/>`;
}

function chocolate(cx: number): string {
  const cells = [0, 1, 2]
    .flatMap((r) =>
      [0, 1, 2, 3].map(
        (c) =>
          `<rect x="${f(cx - 88 + c * 44 + 4)}" y="${f(150 + r * 40 + 4)}" width="36" height="32" rx="5" fill="${C.brown}" stroke="#3a1b10" stroke-width="2"/>`,
      ),
    )
    .join('');
  return `<rect x="${f(cx - 92)}" y="146" width="184" height="128" rx="10" fill="#3a1b10"/>${cells}
<polygon points="${f(cx - 96)},210 ${f(cx + 96)},180 ${f(cx + 96)},284 ${f(cx - 96)},284" fill="${C.crimson}"/>
<rect x="${f(cx - 96)}" y="236" width="192" height="8" fill="${C.gold}"/>`;
}

function gummies(cx: number): string {
  const colors = [C.crimson, C.gold, C.ivory, C.amber, C.deep, C.crimson, C.gold];
  return colors
    .map((color, i) => {
      const x = cx - 90 + ((i * 53) % 180);
      const y = 190 + ((i * 37) % 80);
      return `<rect x="${f(x)}" y="${f(y)}" width="46" height="34" rx="16" fill="${color}" transform="rotate(${String(((i * 29) % 60) - 30)} ${f(x + 23)} ${f(y + 17)})"/>`;
    })
    .join('');
}

function nachos(cx: number): string {
  const chips = [-70, -35, 0, 35, 70]
    .map(
      (dx, i) =>
        `<polygon points="${f(cx + dx - 30)},210 ${f(cx + dx + 30)},${f(200 + (i % 2) * 14)} ${f(cx + dx)},${f(140 + (i % 3) * 12)}" fill="${C.gold}" stroke="${C.amber}" stroke-width="3"/>`,
    )
    .join('');
  return `${chips}<ellipse cx="${f(cx)}" cy="214" rx="120" ry="20" fill="${C.cream}"/>
<path d="M${f(cx - 120)} 214 q120 120 240 0 z" fill="${C.crimson}"/>
<ellipse cx="${f(cx + 60)}" cy="200" rx="26" ry="10" fill="${C.amber}"/>`;
}

function hotDog(cx: number): string {
  return `<rect x="${f(cx - 120)}" y="196" width="240" height="56" rx="28" fill="${C.cream}"/>
<rect x="${f(cx - 132)}" y="184" width="264" height="34" rx="17" fill="${C.crimson}"/>
<path d="M${f(cx - 110)} 190 q20 -14 40 0 t40 0 t40 0 t40 0 t40 0" stroke="${C.gold}" stroke-width="6" fill="none" stroke-linecap="round"/>
<rect x="${f(cx - 116)}" y="214" width="232" height="44" rx="22" fill="${C.ivory}"/>`;
}

function plate(cx: number, dish: string): string {
  return `<ellipse cx="${f(cx)}" cy="250" rx="150" ry="42" fill="${C.ivory}"/>
<ellipse cx="${f(cx)}" cy="246" rx="118" ry="30" fill="${C.cream}"/>${dish}`;
}

function burger(cx: number): string {
  return plate(
    cx,
    `<path d="M${f(cx - 70)} 222 a70 52 0 0 1 140 0 z" fill="${C.amber}"/>
<rect x="${f(cx - 76)}" y="222" width="152" height="12" rx="6" fill="${C.crimson}"/>
<rect x="${f(cx - 72)}" y="232" width="144" height="16" rx="6" fill="${C.brown}"/>
<rect x="${f(cx - 70)}" y="246" width="140" height="12" rx="6" fill="${C.amber}"/>
${[0, 1, 2, 3].map((i) => `<rect x="${f(cx + 82 + i * 9)}" y="${f(198 + (i % 2) * 8)}" width="7" height="48" rx="3" fill="${C.gold}"/>`).join('')}`,
  );
}

function flatbread(cx: number): string {
  return plate(
    cx,
    `<ellipse cx="${f(cx)}" cy="240" rx="96" ry="24" fill="${C.gold}"/>
${[-50, -15, 22, 55].map((dx, i) => `<circle cx="${f(cx + dx)}" cy="${f(236 + (i % 2) * 8)}" r="9" fill="${i % 2 ? C.crimson : '#4f6b3a'}"/>`).join('')}`,
  );
}

function cheese(cx: number): string {
  return plate(
    cx,
    `<polygon points="${f(cx - 80)},246 ${f(cx - 20)},246 ${f(cx - 50)},204" fill="${C.gold}"/>
<rect x="${f(cx - 10)}" y="214" width="48" height="32" rx="4" fill="${C.cream}" stroke="${C.gold}" stroke-width="3"/>
<circle cx="${f(cx + 70)}" cy="232" r="16" fill="${C.crimson}"/><circle cx="${f(cx + 92)}" cy="240" r="12" fill="${C.deep}"/>`,
  );
}

const f = (n: number) => String(Math.round(n * 10) / 10);

const ART: Record<string, () => string> = {
  'popcorn-small': () => bucket(240, 0.82, C.cream),
  'popcorn-medium': () => bucket(240, 1, C.cream),
  'popcorn-large': () => bucket(240, 1.18, C.cream),
  'popcorn-caramel': () => bucket(240, 1, C.gold),
  'soft-drink': () => cup(240, C.crimson),
  water: () => bottle(240, '#9fb6c4', 150),
  'iced-tea': () => cup(240, C.amber),
  'orange-juice': () => glass(240, C.amber),
  'chocolate-bar': () => chocolate(240),
  'gummy-candy': () => gummies(240),
  'nachos-cheese': () => nachos(240),
  'hot-dog': () => hotDog(240),
  'vip-burger': () => burger(220),
  'vip-flatbread': () => flatbread(240),
  'vip-cheese-plate': () => cheese(240),
  'combo-classic': () => bucket(185, 1, C.cream) + cup(330, C.crimson),
  'combo-duo': () => bucket(140, 1.05, C.cream) + cup(290, C.crimson) + cup(400, C.crimson),
  'combo-family': () => bucket(100, 0.9, C.cream) + bucket(232, 0.9, C.cream) + cup(388, C.crimson),
  'combo-vip': () => burger(180) + cup(390, C.crimson),
};

/** The SVG illustration of a menu item (a generic tray for unknown slugs). */
export function menuArtSvg(slug: string): string {
  const art = ART[slug] ?? (() => plate(240, ''));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${String(W)}" height="${String(H)}" viewBox="0 0 ${String(W)} ${String(H)}">
<defs>
<radialGradient id="glow" cx="0.5" cy="0.62" r="0.6"><stop offset="0" stop-color="${C.deep}"/><stop offset="0.6" stop-color="#2a0710"/><stop offset="1" stop-color="${C.ink}"/></radialGradient>
</defs>
<rect width="100%" height="100%" fill="url(#glow)"/>
<ellipse cx="240" cy="304" rx="190" ry="18" fill="#000" opacity="0.45"/>
${art()}
</svg>
`;
}

export const MENU_ART_SLUGS = Object.keys(ART);
