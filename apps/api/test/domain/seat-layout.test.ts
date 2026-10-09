import { describe, expect, it } from 'vitest';
import {
  generateSeats,
  reclinerHallSpec,
  stadiumHallSpec,
  suiteHallSpec,
  type GeneratedSeat,
  type HallLayoutSpec,
} from '../../src/domain/seat-layout.js';
import { LOCATIONS } from '../../prisma/seed/data.js';

const EPS = 1e-6;

function byRow(seats: GeneratedSeat[]): Map<string, GeneratedSeat[]> {
  const rows = new Map<string, GeneratedSeat[]>();
  for (const seat of seats) rows.set(seat.rowLabel, [...(rows.get(seat.rowLabel) ?? []), seat]);
  return rows;
}

/** Structural checks every generated layout must pass. */
function expectSaneLayout(spec: HallLayoutSpec) {
  const seats = generateSeats(spec);
  const keys = seats.map((s) => `${s.rowLabel}-${String(s.number)}`);
  expect(new Set(keys).size, 'no duplicate seats').toBe(seats.length);

  let previousY = -Infinity;
  let previousZ = -Infinity;
  for (const [label, row] of byRow(seats)) {
    expect(
      row.map((s) => s.number),
      `row ${label} numbered 1..n`,
    ).toEqual(row.map((_, i) => i + 1));
    const y = row[0]?.y ?? 0;
    const z = row[0]?.z ?? 0;
    expect(
      row.every((s) => s.y === y && s.z === z),
      `row ${label} is straight`,
    ).toBe(true);
    expect(y, `row ${label} is behind the previous row`).toBeGreaterThan(previousY);
    expect(z, `row ${label} is not lower than the previous row`).toBeGreaterThanOrEqual(previousZ);
    previousY = y;
    previousZ = z;

    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1];
      const b = row[i];
      if (!a || !b) continue;
      const minGap = ((a.widthUnits + b.widthUnits) / 2) * spec.seatWidthM;
      expect(
        b.x - a.x,
        `seats ${a.rowLabel}${String(a.number)}/${String(b.number)} do not overlap`,
      ).toBeGreaterThanOrEqual(minGap - 0.001);
    }
    const first = row[0];
    const last = row.at(-1);
    if (first && last) {
      const left = first.x - (first.widthUnits * spec.seatWidthM) / 2;
      const right = last.x + (last.widthUnits * spec.seatWidthM) / 2;
      expect(Math.abs(left + right), `row ${label} is centered`).toBeLessThan(0.01);
    }
  }

  for (const seat of seats) {
    expect(seat.y).toBeGreaterThan(0);
    expect(seat.z).toBeGreaterThanOrEqual(0);
    // Every seat faces the screen center; front corner seats of wide halls turn the most.
    const yaw = (-Math.atan2(seat.x, seat.y) * 180) / Math.PI;
    expect(seat.rotationDeg).toBeCloseTo(yaw, 0);
    expect(Math.abs(seat.rotationDeg)).toBeLessThan(60);
    if (Math.abs(seat.x) > EPS) expect(Math.sign(seat.rotationDeg)).toBe(-Math.sign(seat.x));
  }

  // Every wheelchair space has a companion seat right next to it.
  for (const [, row] of byRow(seats)) {
    for (const seat of row.filter((s) => s.seatType === 'WHEELCHAIR')) {
      const neighbours = row.filter((s) => Math.abs(s.number - seat.number) === 1);
      expect(neighbours.some((s) => s.seatType === 'COMPANION')).toBe(true);
    }
  }
  return seats;
}

describe('generateSeats', () => {
  const spec: HallLayoutSpec = {
    rows: [
      {
        label: 'A',
        blocks: [[{ type: 'STANDARD' }, { type: 'STANDARD' }], [{ type: 'STANDARD' }]],
      },
      { label: 'B', blocks: [[{ type: 'COUPLE' }]], extraGapM: 0.5 },
    ],
    seatWidthM: 0.5,
    rowSpacingM: 1,
    aisleWidthM: 1,
    firstRowDistanceM: 4,
    tierStartRow: 1,
    tierRiseM: 0.3,
  };

  it('places seats with aisles, spacing, tiers and widths', () => {
    // Row A: 0.5 m seats, two blocks (2 + 1) with a 1 m aisle -> 2.5 m wide, centered on x = 0.
    // Row B: one couple sofa (2 units), 1 m row spacing + 0.5 m extra gap, first raised row.
    const yaw = (x: number, y: number) =>
      Math.round(((-Math.atan2(x, y) * 180) / Math.PI) * 10) / 10;
    expect(generateSeats(spec)).toEqual([
      {
        rowLabel: 'A',
        number: 1,
        seatType: 'STANDARD',
        x: -1,
        y: 4,
        z: 0,
        rotationDeg: yaw(-1, 4),
        widthUnits: 1,
      },
      {
        rowLabel: 'A',
        number: 2,
        seatType: 'STANDARD',
        x: -0.5,
        y: 4,
        z: 0,
        rotationDeg: yaw(-0.5, 4),
        widthUnits: 1,
      },
      {
        rowLabel: 'A',
        number: 3,
        seatType: 'STANDARD',
        x: 1,
        y: 4,
        z: 0,
        rotationDeg: yaw(1, 4),
        widthUnits: 1,
      },
      {
        rowLabel: 'B',
        number: 1,
        seatType: 'COUPLE',
        x: 0,
        y: 5.5,
        z: 0.3,
        rotationDeg: 0,
        widthUnits: 2,
      },
    ]);
    expect(yaw(-1, 4)).toBeCloseTo(14);
    expectSaneLayout(spec);
  });

  it('rejects duplicate row labels and empty rows', () => {
    const [firstRow] = spec.rows;
    if (!firstRow) throw new Error('spec has no rows');
    expect(() => generateSeats({ ...spec, rows: [firstRow, firstRow] })).toThrow(/Duplicate row/);
    expect(() => generateSeats({ ...spec, rows: [{ label: 'Z', blocks: [[]] }] })).toThrow(
      /no seats/,
    );
  });
});

describe('hall templates', () => {
  it('stadium hall: accessible front row, VIP middle rows, couple sofas at the back', () => {
    const seats = expectSaneLayout(stadiumHallSpec({ rows: 10, blockSizes: [8, 8] }));
    const rows = [...byRow(seats).entries()];
    const typesOf = (index: number) => new Set(rows[index]?.[1].map((s) => s.seatType));
    expect(typesOf(0)).toEqual(new Set(['WHEELCHAIR', 'COMPANION', 'STANDARD']));
    expect(typesOf(4)).toEqual(new Set(['VIP']));
    expect(typesOf(5)).toEqual(new Set(['VIP']));
    expect(typesOf(9)).toEqual(new Set(['COUPLE']));
    expect(seats.filter((s) => s.seatType === 'COUPLE').every((s) => s.widthUnits === 2)).toBe(
      true,
    );
    expect(seats.filter((s) => s.rowLabel === 'C').every((s) => s.z === 0)).toBe(true);
    expect(seats.find((s) => s.rowLabel === 'D')?.z).toBeCloseTo(0.35);
    expect(() => stadiumHallSpec({ rows: 3, blockSizes: [4] })).toThrow();
  });

  it('stadium hall with odd blocks keeps one standard seat next to the sofas', () => {
    const seats = expectSaneLayout(stadiumHallSpec({ rows: 6, blockSizes: [5, 5] }));
    const back = seats.filter((s) => s.rowLabel === 'F');
    expect(back.filter((s) => s.seatType === 'COUPLE')).toHaveLength(4);
    expect(back.filter((s) => s.seatType === 'STANDARD')).toHaveLength(2);
  });

  it('recliner hall: wide VIP recliners with more legroom', () => {
    const spec = reclinerHallSpec({ rows: 5, blockSizes: [4, 4] });
    const seats = expectSaneLayout(spec);
    expect(spec.rowSpacingM).toBeGreaterThan(
      stadiumHallSpec({ rows: 5, blockSizes: [4] }).rowSpacingM,
    );
    expect(seats.filter((s) => s.rowLabel !== 'A').every((s) => s.seatType === 'VIP')).toBe(true);
  });

  it('suite: 10-20 VIP recliners', () => {
    for (const seatsPerRow of [5, 7, 10]) {
      const seats = expectSaneLayout(suiteHallSpec({ seatsPerRow }));
      expect(seats.length).toBeGreaterThanOrEqual(10);
      expect(seats.length).toBeLessThanOrEqual(20);
      expect(seats.every((s) => s.seatType === 'VIP')).toBe(true);
    }
  });

  it('every seeded hall layout is sane', () => {
    for (const location of LOCATIONS) {
      for (const hall of location.halls) {
        const seats = expectSaneLayout(hall.layout);
        if (hall.type === 'PRIVATE_SUITE') expect(seats.length).toBeLessThanOrEqual(20);
        expect(
          seats.some((s) => s.seatType === 'WHEELCHAIR') || hall.type === 'PRIVATE_SUITE',
        ).toBe(true);
      }
    }
  });
});
