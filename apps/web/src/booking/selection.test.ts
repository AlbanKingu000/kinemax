import { afterEach, describe, expect, it, vi } from 'vitest';
import { standardMap } from '../test/seatmap';
import {
  keepAvailable,
  MAX_TICKETS,
  neighbour,
  readSelection,
  rowsOf,
  storeSelection,
  ticketCount,
  toggleSeat,
} from './selection';

const map = standardMap();
const byId = new Map(map.seats.map((s) => [s.id, s]));
const find = (row: string, number: number) => {
  const found = map.seats.find((s) => s.row === row && s.number === number);
  if (!found) throw new Error(`seat ${row}${String(number)} missing`);
  return found;
};

afterEach(() => {
  window.sessionStorage.clear();
});

describe('toggleSeat and the 10-ticket limit', () => {
  it('adds and removes seats, refuses taken seats', () => {
    const a1 = find('A', 1);
    const added = toggleSeat([], a1, byId);
    expect(added).toEqual({ ok: true, selected: [a1.id] });
    expect(toggleSeat([a1.id], a1, byId)).toEqual({ ok: true, selected: [] });
    expect(toggleSeat([], find('B', 5), byId)).toEqual({ ok: false, reason: 'taken' });
  });

  it('counts a sofa as two tickets and stops at 10', () => {
    const sofa = find('B', 1);
    expect(ticketCount([sofa, find('A', 1)])).toBe(3);
    // 6 single seats + sofa (2) + wheelchair + companion = 10 tickets.
    let selected: string[] = [];
    for (const s of [
      ...[1, 2, 3, 4, 5, 6].map((i) => find('A', i)),
      sofa,
      find('B', 3),
      find('B', 4),
    ]) {
      const result = toggleSeat(selected, s, byId);
      if (!result.ok) throw new Error('unexpected refusal');
      selected = result.selected;
    }
    expect(ticketCount(selected.map((id) => byId.get(id) ?? find('A', 1)))).toBe(MAX_TICKETS);
    // One more single seat would make 11.
    const extra = { ...find('A', 1), id: 'extra-seat' };
    expect(toggleSeat(selected, extra, new Map([...byId, [extra.id, extra]]))).toEqual({
      ok: false,
      reason: 'limit',
    });
    // A sofa that would cross the limit is refused even with 9 tickets.
    const nine = selected.filter((id) => id !== find('A', 1).id);
    expect(
      toggleSeat(
        nine.filter((id) => id !== sofa.id),
        sofa,
        byId,
      ),
    ).toMatchObject({ ok: true });
    expect(ticketCount(nine.map((id) => byId.get(id) ?? sofa))).toBe(9);
    const withoutSofa = nine.filter((id) => id !== sofa.id); // 7 tickets
    const plusTwo = [...withoutSofa, find('A', 1).id, 'x2'];
    const big = new Map([...byId, ['x2', { ...find('A', 2), id: 'x2' }]]);
    expect(toggleSeat(plusTwo, sofa, big)).toEqual({ ok: false, reason: 'limit' });
  });
});

describe('keepAvailable', () => {
  it('drops seats that were taken or no longer exist', () => {
    expect(keepAvailable([find('A', 1).id, find('B', 5).id, 'gone'], byId)).toEqual({
      kept: [find('A', 1).id],
      dropped: [find('B', 5).id, 'gone'],
    });
  });
});

describe('sessionStorage', () => {
  it('stores the selection per showtime and reads it back', () => {
    storeSelection('show-1', { seatIds: ['a', 'b'], wholeHall: false });
    storeSelection('show-2', { seatIds: [], wholeHall: true });
    expect(readSelection('show-1')).toEqual({ seatIds: ['a', 'b'], wholeHall: false });
    expect(readSelection('show-2')).toEqual({ seatIds: [], wholeHall: true });
    storeSelection('show-1', { seatIds: [], wholeHall: false });
    expect(window.sessionStorage.getItem('kinemax.selection.show-1')).toBeNull();
  });

  it('survives garbage and blocked storage', () => {
    window.sessionStorage.setItem('kinemax.selection.x', '{not json');
    expect(readSelection('x')).toEqual({ seatIds: [], wholeHall: false });
    window.sessionStorage.setItem('kinemax.selection.y', JSON.stringify([1, 'a', null]));
    expect(readSelection('y')).toEqual({ seatIds: ['a'], wholeHall: false });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readSelection('z')).toEqual({ seatIds: [], wholeHall: false });
    expect(() => {
      storeSelection('z', { seatIds: ['a'], wholeHall: false });
    }).not.toThrow();
  });
});

describe('keyboard neighbours', () => {
  const rows = rowsOf(map.seats);

  it('orders rows front to back and seats left to right', () => {
    expect(rows.map((row) => row[0]?.row)).toEqual(['A', 'B']);
    expect(rows[0]?.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('moves along a row, to its ends, and to the nearest seat of the next row', () => {
    const a3 = find('A', 3);
    expect(neighbour(rows, a3, 'ArrowRight')?.number).toBe(4);
    expect(neighbour(rows, a3, 'ArrowLeft')?.number).toBe(2);
    expect(neighbour(rows, a3, 'Home')?.number).toBe(1);
    expect(neighbour(rows, a3, 'End')?.number).toBe(6);
    expect(neighbour(rows, a3, 'ArrowDown')).toMatchObject({ row: 'B', number: 3 });
    expect(neighbour(rows, find('B', 4), 'ArrowUp')).toMatchObject({ row: 'A', number: 4 });
    expect(neighbour(rows, a3, 'ArrowUp')).toBeUndefined();
    expect(neighbour(rows, find('A', 6), 'ArrowRight')).toBeUndefined();
  });
});
