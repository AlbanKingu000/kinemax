// Seat selection rules in the browser (the server re-checks everything when the seats are held).
import { MAX_TICKETS_PER_BOOKING, type SeatMapSeat } from '@kinemax/shared';

/** At most this many tickets per booking; a COUPLE sofa counts as two (the server's limit). */
export const MAX_TICKETS = MAX_TICKETS_PER_BOOKING;

export const ticketsOf = (seat: Pick<SeatMapSeat, 'type'>): number =>
  seat.type === 'COUPLE' ? 2 : 1;

export function ticketCount(seats: readonly Pick<SeatMapSeat, 'type'>[]): number {
  return seats.reduce((sum, seat) => sum + ticketsOf(seat), 0);
}

export type ToggleResult =
  { ok: true; selected: string[] } | { ok: false; reason: 'taken' | 'limit' };

/** Adds or removes a seat; refuses taken seats and anything above MAX_TICKETS. */
export function toggleSeat(
  selected: readonly string[],
  seat: SeatMapSeat,
  seatsById: ReadonlyMap<string, SeatMapSeat>,
): ToggleResult {
  if (selected.includes(seat.id)) {
    return { ok: true, selected: selected.filter((id) => id !== seat.id) };
  }
  if (seat.status === 'TAKEN') return { ok: false, reason: 'taken' };
  const current = selected.map((id) => seatsById.get(id)).filter((s) => s !== undefined);
  if (ticketCount(current) + ticketsOf(seat) > MAX_TICKETS) return { ok: false, reason: 'limit' };
  return { ok: true, selected: [...selected, seat.id] };
}

/** Keeps the seats that still exist and are free; reports the ones that were dropped. */
export function keepAvailable(
  selected: readonly string[],
  seatsById: ReadonlyMap<string, SeatMapSeat>,
): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const id of selected) {
    if (seatsById.get(id)?.status === 'AVAILABLE') kept.push(id);
    else dropped.push(id);
  }
  return { kept, dropped };
}

// The selection survives the login redirect: sessionStorage, per showtime, never shared.
const key = (showtimeId: string) => `kinemax.selection.${showtimeId}`;
const WHOLE = 'WHOLE_HALL';

export interface StoredSelection {
  seatIds: string[];
  wholeHall: boolean;
}

export function readSelection(showtimeId: string): StoredSelection {
  try {
    const raw: unknown = JSON.parse(window.sessionStorage.getItem(key(showtimeId)) ?? '[]');
    const ids = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
    return {
      seatIds: ids.filter((id) => id !== WHOLE).slice(0, MAX_TICKETS),
      wholeHall: ids.includes(WHOLE),
    };
  } catch {
    return { seatIds: [], wholeHall: false };
  }
}

export function storeSelection(showtimeId: string, selection: StoredSelection): void {
  try {
    const value = selection.wholeHall ? [WHOLE] : selection.seatIds;
    if (value.length === 0) window.sessionStorage.removeItem(key(showtimeId));
    else window.sessionStorage.setItem(key(showtimeId), JSON.stringify(value));
  } catch {
    // Storage unavailable: the selection is lost on reload, nothing else.
  }
}

// The 2D/3D choice survives it too (and the next show in this session): coming back from the
// login, a visitor who picked 2D gets the 2D map again, not a freshly loaded 3D hall.
const VIEW_KEY = 'kinemax.seatView';

export function readViewMode(): '2d' | '3d' | null {
  try {
    const value = window.sessionStorage.getItem(VIEW_KEY);
    return value === '2d' || value === '3d' ? value : null;
  } catch {
    return null;
  }
}

export function storeViewMode(mode: '2d' | '3d'): void {
  try {
    window.sessionStorage.setItem(VIEW_KEY, mode);
  } catch {
    // Storage unavailable: the page opens in its default view next time.
  }
}

/** Seats grouped by row in screen order (front first), each row sorted left to right. */
export function rowsOf(seats: readonly SeatMapSeat[]): SeatMapSeat[][] {
  const rows = new Map<string, SeatMapSeat[]>();
  for (const seat of seats) rows.set(seat.row, [...(rows.get(seat.row) ?? []), seat]);
  return [...rows.values()]
    .map((row) => [...row].sort((a, b) => a.x - b.x))
    .sort((a, b) => (a[0]?.y ?? 0) - (b[0]?.y ?? 0));
}

/** The seat a keyboard arrow moves to: along the row, or the nearest seat in the next/previous row. */
export function neighbour(
  rows: readonly SeatMapSeat[][],
  current: SeatMapSeat,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
): SeatMapSeat | undefined {
  const r = rows.findIndex((row) => row.some((s) => s.id === current.id));
  const row = rows[r] ?? [];
  const i = row.findIndex((s) => s.id === current.id);
  if (key === 'ArrowLeft') return row[i - 1];
  if (key === 'ArrowRight') return row[i + 1];
  if (key === 'Home') return row[0];
  if (key === 'End') return row[row.length - 1];
  const target = rows[key === 'ArrowUp' ? r - 1 : r + 1];
  if (!target || target.length === 0) return undefined;
  return target.reduce((best, s) =>
    Math.abs(s.x - current.x) < Math.abs(best.x - current.x) ? s : best,
  );
}
