import { describe, expect, it } from 'vitest';
import { generateSeats, spacingFor, ticketsPerSeat, type HallLayoutSpec } from './seat-layout.js';

const spec = (rows: HallLayoutSpec['rows']): HallLayoutSpec => ({
  ...spacingFor('STANDARD'),
  rows,
});

describe('generateSeats', () => {
  it('numbers seats left to right, centres each row and leaves aisles between blocks', () => {
    const seats = generateSeats(
      spec([
        {
          label: 'A',
          blocks: [[{ type: 'STANDARD' }, { type: 'STANDARD' }], [{ type: 'COUPLE' }]],
        },
        { label: 'B', blocks: [[{ type: 'VIP' }]], extraGapM: 1 },
      ]),
    );
    expect(seats.map((s) => `${s.rowLabel}${String(s.number)}:${String(s.widthUnits)}`)).toEqual([
      'A1:1',
      'A2:1',
      'A3:2',
      'B1:1',
    ]);
    const [a1, a2, a3, b1] = seats;
    // Row A is centred: its left and right edges are equally far from the centre line.
    expect((a1?.x ?? 0) - 0.275 + ((a3?.x ?? 0) + 0.55)).toBeCloseTo(0);
    expect((a3?.x ?? 0) - (a2?.x ?? 0)).toBeGreaterThan(1.2);
    // Row B: row spacing plus the extra gap; still flat (tiers start at row 4).
    expect((b1?.y ?? 0) - (a1?.y ?? 0)).toBeCloseTo(0.95 + 1);
    expect(b1?.z).toBe(0);
    expect(b1?.x).toBe(0);
    expect(b1?.rotationDeg).toBe(0);
  });

  it('raises later rows in tiers and turns side seats towards the screen', () => {
    const rows = ['A', 'B', 'C', 'D'].map((label) => ({
      label,
      blocks: [[{ type: 'STANDARD' as const }, { type: 'STANDARD' as const }]],
    }));
    const seats = generateSeats(spec(rows));
    expect(seats.filter((s) => s.rowLabel === 'D').every((s) => s.z === 0.35)).toBe(true);
    expect(seats[0]?.rotationDeg).toBeGreaterThan(0);
    expect(seats[1]?.rotationDeg).toBeLessThan(0);
  });

  it('refuses duplicate row labels and rows without seats', () => {
    const row = { label: 'A', blocks: [[{ type: 'STANDARD' as const }]] };
    expect(() => generateSeats(spec([row, row]))).toThrow(/Duplicate/);
    expect(() => generateSeats(spec([{ label: 'B', blocks: [[]] }]))).toThrow(/no seats/);
  });
});

describe('hall type rules', () => {
  it('falls back to the standard spacing for new hall types', () => {
    expect(spacingFor('IMAX_LIKE')).toEqual(spacingFor('STANDARD'));
    expect(spacingFor('VIP_RECLINER').seatWidthM).toBe(0.95);
  });

  it('sells two tickets on a couple sofa and one elsewhere', () => {
    expect(ticketsPerSeat('COUPLE')).toBe(2);
    expect(ticketsPerSeat('WHEELCHAIR')).toBe(1);
  });
});
