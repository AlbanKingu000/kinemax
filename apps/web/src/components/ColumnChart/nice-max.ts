/** A clean upper bound for a chart axis (1, 2, 2.5 or 5 times a power of ten). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((f) => f * power >= value) ?? 10;
  return step * power;
}
