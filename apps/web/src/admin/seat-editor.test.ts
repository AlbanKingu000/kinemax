import type { HallLayoutResponse, LayoutSeat } from '@kinemax/shared';
import { HALL_TYPE_SPACING } from '@kinemax/shared';
import { describe, expect, it } from 'vitest';
import { must } from '../test/admin';
import {
  activate,
  addRow,
  addSeatsAfter,
  cellsOf,
  fromLayout,
  nextLabel,
  previewSeats,
  rangeKeys,
  remove,
  renameRow,
  setType,
  toInput,
  typeRefusal,
} from './seat-editor';

const seat = (id: string, extra: Partial<LayoutSeat> = {}): LayoutSeat => ({
  id: `0190f0a0-0000-7000-8000-0000000000${id}`,
  type: 'STANDARD',
  isActive: true,
  hasHistory: false,
  blockedBy: [],
  ...extra,
});
const blocker = {
  showtimeId: '0190f0a0-0000-7000-8000-00000000aaaa',
  startsAt: '2026-10-22T11:00:00.000Z',
  movieTitleSq: 'Film',
  movieTitleEn: null,
};

const layout: HallLayoutResponse = {
  hall: {
    id: '0190f0a0-0000-7000-8000-0000000000ff',
    name: 'Salla 1',
    locationId: '0190f0a0-0000-7000-8000-0000000000fe',
    wholeHallOnly: false,
    hallType: { code: 'STANDARD', nameSq: 'Standard', nameEn: null },
    screen: { widthM: 12, heightM: 5, x: 0, y: 0, z: 3.5 },
  },
  spacing: must(HALL_TYPE_SPACING.STANDARD),
  rows: [
    // A: 1 2 | 3 4 (3 is booked for a future show, 4 was booked before)
    {
      label: 'A',
      blocks: [
        [seat('a1'), seat('a2')],
        [seat('a3', { blockedBy: [blocker] }), seat('a4', { hasHistory: true })],
      ],
    },
    { label: 'B', blocks: [[seat('b1'), seat('b2', { type: 'COUPLE' })]] },
  ],
};

const key = (id: string) => `0190f0a0-0000-7000-8000-0000000000${id}`;

describe('the seat editor model', () => {
  it('round-trips a layout into the save request', () => {
    const rows = fromLayout(layout);
    expect(toInput(rows)).toEqual({
      rows: [
        {
          label: 'A',
          blocks: [
            [
              { id: key('a1'), type: 'STANDARD', isActive: true },
              { id: key('a2'), type: 'STANDARD', isActive: true },
            ],
            [
              { id: key('a3'), type: 'STANDARD', isActive: true },
              { id: key('a4'), type: 'STANDARD', isActive: true },
            ],
          ],
        },
        {
          label: 'B',
          blocks: [
            [
              { id: key('b1'), type: 'STANDARD', isActive: true },
              { id: key('b2'), type: 'COUPLE', isActive: true },
            ],
          ],
        },
      ],
    });
  });

  it('removes never-booked seats, deactivates booked ones and refuses sold ones', () => {
    const { rows, refused } = remove(
      fromLayout(layout),
      new Set([key('a1'), key('a3'), key('a4')]),
    );
    expect(refused.map((c) => c.key)).toEqual([key('a3')]);
    expect(cellsOf(rows).map((c) => [c.key.slice(-2), c.isActive])).toEqual([
      ['a2', true],
      ['a3', true],
      ['a4', false],
      ['b1', true],
      ['b2', true],
    ]);
    expect(
      cellsOf(activate(rows, new Set([key('a4')]))).find((c) => c.key === key('a4'))?.isActive,
    ).toBe(true);
    // An emptied block and row disappear.
    const emptied = remove(fromLayout(layout), new Set([key('b1'), key('b2')])).rows;
    expect(emptied.map((r) => r.label)).toEqual(['A']);
  });

  it('changes types unless the ticket count of a sold or booked seat would change', () => {
    const rows = fromLayout(layout);
    const vip = setType(rows, new Set([key('a3'), key('a4')]), 'VIP');
    expect(vip.refused).toEqual([]);
    const sofa = setType(rows, new Set([key('a1'), key('a3'), key('a4')]), 'COUPLE');
    expect(sofa.refused.map((c) => c.key)).toEqual([key('a3'), key('a4')]);
    expect(cellsOf(sofa.rows).find((c) => c.key === key('a1'))?.type).toBe('COUPLE');
    const [, , a3, a4] = cellsOf(rows);
    expect(typeRefusal(must(a3), 'COUPLE')).toBe('blocked');
    expect(typeRefusal(must(a4), 'COUPLE')).toBe('capacity_history');
    expect(typeRefusal(must(a4), 'VIP')).toBeNull();
  });

  it('adds seats and rows, and names new rows after the last free label', () => {
    const rows = addSeatsAfter(fromLayout(layout), new Set([key('a1')]));
    expect(rows[0]?.blocks[0]?.map((c) => c.id ?? 'new')).toEqual([key('a1'), 'new', key('a2')]);
    const more = addRow(rows);
    expect(more.map((r) => r.label)).toEqual(['A', 'B', 'C']);
    expect(more[2]?.blocks.map((b) => b.length)).toEqual([2]);
    expect(addRow([])[0]).toMatchObject({ label: 'A' });
    const many = Array.from({ length: 25 }, (_, i) => ({
      label: 'ABCDEFGHJKLMNOPQRSTUVWXYZ'[i] ?? '',
      blocks: [],
    }));
    expect(nextLabel(many)).toBe('AA');
  });

  it('renames rows, but not into another row, a bad label or over sold seats', () => {
    const rows = fromLayout(layout);
    expect(renameRow(rows, 'B', 'k').rows.map((r) => r.label)).toEqual(['A', 'K']);
    expect(renameRow(rows, 'B', 'A').problem).toBe('duplicate');
    expect(renameRow(rows, 'B', '1').problem).toBe('pattern');
    expect(renameRow(rows, 'A', 'Z').problem).toBe('blocked');
  });

  it('selects ranges inside a row only', () => {
    const rows = fromLayout(layout);
    expect(rangeKeys(rows, key('a4'), key('a2'))).toEqual([key('a2'), key('a3'), key('a4')]);
    expect(rangeKeys(rows, key('a1'), key('b2'))).toEqual([key('b2')]);
  });

  it('previews the positions the server will save, greying inactive seats', () => {
    const rows = remove(fromLayout(layout), new Set([key('a4')])).rows;
    const seats = previewSeats(rows, layout.spacing);
    expect(seats.map((s) => `${s.row}${String(s.number)}`)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'B1',
      'B2',
    ]);
    expect(seats.find((s) => s.id === key('a4'))?.status).toBe('TAKEN');
    expect(seats.find((s) => s.id === key('b2'))?.widthUnits).toBe(2);
    // The aisle between the two blocks of row A is wider than the gap between seats.
    const [a1, a2, a3] = seats;
    expect((a3?.x ?? 0) - (a2?.x ?? 0)).toBeGreaterThan((a2?.x ?? 0) - (a1?.x ?? 0));
    expect(previewSeats([], layout.spacing)).toEqual([]);
  });
});
