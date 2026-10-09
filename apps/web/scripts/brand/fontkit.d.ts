// Minimal types for the parts of fontkit (MIT, no bundled types) used by the font tests.
declare module 'fontkit' {
  interface Font {
    familyName: string;
    hasGlyphForCodePoint(codePoint: number): boolean;
    variationAxes: Record<string, { min: number; default: number; max: number }>;
  }
  export function openSync(path: string): Font;
}
