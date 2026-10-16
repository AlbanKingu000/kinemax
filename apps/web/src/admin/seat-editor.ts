// The seat editor's model: rows of blocks of cells, edited in memory and saved as one batch. The
// preview positions come from the same generator the server uses (generateSeats + the hall
// type's spacing), so what is shown is what is saved. The server re-checks every rule.
import {
  generateSeats,
  ROW_LABEL_PATTERN,
  ticketsPerSeat,
  type HallLayoutInput,
  type HallLayoutResponse,
  type LayoutBlocker,
  type SeatMapSeat,
  type SeatTypeCode,
} from '@kinemax/shared';

export interface Cell {
  /** Stable key in the editor (the seat id, or a new key). */
  key: string;
  id?: string;
  type: SeatTypeCode;
  isActive: boolean;
  hasHistory: boolean;
  blockedBy: LayoutBlocker[];
}

export interface EditorRow {
  label: string;
  blocks: Cell[][];
}

export type Refusal = 'blocked' | 'capacity_history';

let counter = 0;
const newCell = (type: SeatTypeCode = 'STANDARD'): Cell => {
  counter += 1;
  return {
    key: `new-${String(counter)}`,
    type,
    isActive: true,
    hasHistory: false,
    blockedBy: [],
  };
};

export function fromLayout(layout: HallLayoutResponse): EditorRow[] {
  return layout.rows.map((row) => ({
    label: row.label,
    blocks: row.blocks.map((block) =>
      block.map((seat) => ({
        key: seat.id,
        id: seat.id,
        type: seat.type,
        isActive: seat.isActive,
        hasHistory: seat.hasHistory,
        blockedBy: seat.blockedBy,
      })),
    ),
  }));
}

export function toInput(rows: readonly EditorRow[]): HallLayoutInput {
  return {
    rows: rows.map((row) => ({
      label: row.label,
      blocks: row.blocks.map((block) =>
        block.map((cell) => ({
          ...(cell.id ? { id: cell.id } : {}),
          type: cell.type,
          isActive: cell.isActive,
        })),
      ),
    })),
  };
}

const mapCells = (rows: readonly EditorRow[], fn: (cell: Cell) => Cell | null): EditorRow[] =>
  rows
    .map((row) => ({
      ...row,
      blocks: row.blocks
        .map((block) => block.flatMap((cell) => fn(cell) ?? []))
        .filter((block) => block.length > 0),
    }))
    .filter((row) => row.blocks.length > 0);

/** Why a cell may not take this type (a sold seat, or a ticket count that has history). */
export function typeRefusal(cell: Cell, type: SeatTypeCode): Refusal | null {
  const capacityChanges = ticketsPerSeat(cell.type) !== ticketsPerSeat(type);
  if (!capacityChanges) return null;
  if (cell.blockedBy.length > 0) return 'blocked';
  return cell.hasHistory ? 'capacity_history' : null;
}

export function setType(rows: readonly EditorRow[], keys: ReadonlySet<string>, type: SeatTypeCode) {
  const refused: Cell[] = [];
  const next = mapCells(rows, (cell) => {
    if (!keys.has(cell.key)) return cell;
    if (typeRefusal(cell, type)) {
      refused.push(cell);
      return cell;
    }
    return { ...cell, type };
  });
  return { rows: next, refused };
}

/**
 * Removes the selected seats: never booked → gone; booked before → deactivated (kept in place,
 * greyed); booked for a future show → refused.
 */
export function remove(rows: readonly EditorRow[], keys: ReadonlySet<string>) {
  const refused: Cell[] = [];
  const next = mapCells(rows, (cell) => {
    if (!keys.has(cell.key)) return cell;
    if (cell.blockedBy.length > 0) {
      refused.push(cell);
      return cell;
    }
    return cell.hasHistory ? { ...cell, isActive: false } : null;
  });
  return { rows: next, refused };
}

export function activate(rows: readonly EditorRow[], keys: ReadonlySet<string>): EditorRow[] {
  return mapCells(rows, (cell) => (keys.has(cell.key) ? { ...cell, isActive: true } : cell));
}

/** A new standard seat right of each selected seat. */
export function addSeatsAfter(rows: readonly EditorRow[], keys: ReadonlySet<string>): EditorRow[] {
  return rows.map((row) => ({
    ...row,
    blocks: row.blocks.map((block) =>
      block.flatMap((cell) => (keys.has(cell.key) ? [cell, newCell()] : [cell])),
    ),
  }));
}

// No "I" (looks like 1), like the seed.
const LABELS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.split('');

/** The first free row label after the last row (A … Z, then AA, AB …). */
export function nextLabel(rows: readonly EditorRow[]): string {
  const used = new Set(rows.map((row) => row.label));
  const candidates = [...LABELS, ...LABELS.flatMap((a) => LABELS.map((b) => a + b))];
  return candidates.find((label) => !used.has(label)) ?? 'ZZ';
}

/** A new row behind the others with the block sizes of the last row, all standard seats. */
export function addRow(rows: readonly EditorRow[]): EditorRow[] {
  const last = rows[rows.length - 1];
  const sizes = last ? last.blocks.map((block) => block.length) : [8];
  return [
    ...rows,
    {
      label: nextLabel(rows),
      blocks: sizes.map((size) => Array.from({ length: size }, () => newCell())),
    },
  ];
}

export type RenameProblem = 'pattern' | 'duplicate' | 'blocked';

/** Renames a row (its seats keep their order; numbers stay 1..n left to right). */
export function renameRow(
  rows: readonly EditorRow[],
  label: string,
  next: string,
): { rows: EditorRow[]; problem: RenameProblem | null } {
  const value = next.trim().toUpperCase();
  if (!ROW_LABEL_PATTERN.test(value)) return { rows: [...rows], problem: 'pattern' };
  if (value !== label && rows.some((row) => row.label === value)) {
    return { rows: [...rows], problem: 'duplicate' };
  }
  const row = rows.find((r) => r.label === label);
  if (row?.blocks.flat().some((cell) => cell.blockedBy.length > 0)) {
    return { rows: [...rows], problem: 'blocked' };
  }
  return { rows: rows.map((r) => (r.label === label ? { ...r, label: value } : r)), problem: null };
}

/** Keys from `from` to `to` (inclusive) when both are in the same row; otherwise just `to`. */
export function rangeKeys(rows: readonly EditorRow[], from: string, to: string): string[] {
  for (const row of rows) {
    const keys = row.blocks.flat().map((cell) => cell.key);
    const a = keys.indexOf(from);
    const b = keys.indexOf(to);
    if (a >= 0 && b >= 0) return keys.slice(Math.min(a, b), Math.max(a, b) + 1);
  }
  return [to];
}

export function cellsOf(rows: readonly EditorRow[]): Cell[] {
  return rows.flatMap((row) => row.blocks.flat());
}

/** The seats as the 2D map and the 3D preview draw them (inactive seats greyed as TAKEN). */
export function previewSeats(
  rows: readonly EditorRow[],
  spacing: HallLayoutResponse['spacing'],
): (SeatMapSeat & { cell: Cell })[] {
  if (rows.length === 0) return [];
  const generated = generateSeats({
    ...spacing,
    rows: rows.map((row) => ({
      label: row.label,
      blocks: row.blocks.map((block) => block.map((cell) => ({ type: cell.type }))),
    })),
  });
  const cells = cellsOf(rows);
  return generated.flatMap((seat, index) => {
    const cell = cells[index];
    if (!cell) return [];
    return [
      {
        id: cell.key,
        row: seat.rowLabel,
        number: seat.number,
        type: seat.seatType,
        x: seat.x,
        y: seat.y,
        z: seat.z,
        rotationDeg: seat.rotationDeg,
        widthUnits: seat.widthUnits,
        status: cell.isActive ? ('AVAILABLE' as const) : ('TAKEN' as const),
        cell,
      },
    ];
  });
}
