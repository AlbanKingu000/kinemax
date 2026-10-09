// Seat-layout generator: turns a compact hall description into seats with 3D coordinates for the
// future interactive seat map and "view from this seat" camera.
//
// Coordinate system (meters): x = left/right of the hall center line (negative = left, seen from
// the audience), y = distance from the screen wall, z = elevation above the front floor.
// rotationDeg is the seat's yaw so it faces the center of the screen (0 = straight ahead).

export type SeatTypeCode = 'STANDARD' | 'VIP' | 'COUPLE' | 'WHEELCHAIR' | 'COMPANION';

export interface SeatSpec {
  type: SeatTypeCode;
  /** Width in seat units; defaults to 2 for COUPLE and 1 otherwise. */
  widthUnits?: number;
}

export interface RowSpec {
  label: string;
  /** Seat blocks from left to right, separated by aisles. */
  blocks: SeatSpec[][];
  /** Extra gap in front of this row (cross aisle, wheelchair turning space). */
  extraGapM?: number;
}

export interface HallLayoutSpec {
  rows: RowSpec[];
  /** Physical width of one seat unit. */
  seatWidthM: number;
  rowSpacingM: number;
  aisleWidthM: number;
  /** Distance from the screen wall to the first row. */
  firstRowDistanceM: number;
  /** Rows before this index are flat; each later row is raised by tierRiseM. */
  tierStartRow: number;
  tierRiseM: number;
}

export interface GeneratedSeat {
  rowLabel: string;
  number: number;
  seatType: SeatTypeCode;
  x: number;
  y: number;
  z: number;
  rotationDeg: number;
  widthUnits: number;
}

const round = (value: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(value * f) / f || 0;
};

function widthOf(seat: SeatSpec): number {
  return seat.widthUnits ?? (seat.type === 'COUPLE' ? 2 : 1);
}

/** Generates all seats of a hall. Seats are numbered 1..n from left to right in every row. */
export function generateSeats(spec: HallLayoutSpec): GeneratedSeat[] {
  const seen = new Set<string>();
  const seats: GeneratedSeat[] = [];
  let y = spec.firstRowDistanceM;

  spec.rows.forEach((row, rowIndex) => {
    if (seen.has(row.label)) throw new Error(`Duplicate row label ${row.label}`);
    seen.add(row.label);
    const blocks = row.blocks.filter((block) => block.length > 0);
    if (blocks.length === 0) throw new Error(`Row ${row.label} has no seats`);

    if (rowIndex > 0) y += spec.rowSpacingM;
    y += row.extraGapM ?? 0;
    const z =
      rowIndex >= spec.tierStartRow ? (rowIndex - spec.tierStartRow + 1) * spec.tierRiseM : 0;

    const blockWidths = blocks.map((block) =>
      block.reduce((sum, seat) => sum + widthOf(seat) * spec.seatWidthM, 0),
    );
    const totalWidth =
      blockWidths.reduce((sum, w) => sum + w, 0) + (blocks.length - 1) * spec.aisleWidthM;

    let cursor = -totalWidth / 2;
    let number = 1;
    blocks.forEach((block, blockIndex) => {
      if (blockIndex > 0) cursor += spec.aisleWidthM;
      for (const seat of block) {
        const widthUnits = widthOf(seat);
        const width = widthUnits * spec.seatWidthM;
        const x = cursor + width / 2;
        cursor += width;
        seats.push({
          rowLabel: row.label,
          number: number++,
          seatType: seat.type,
          x: round(x, 3),
          y: round(y, 3),
          z: round(z, 3),
          rotationDeg: round((-Math.atan2(x, y) * 180) / Math.PI, 1),
          widthUnits,
        });
      }
    });
  });

  return seats;
}

// ---------------------------------------------------------------------------------------------
// Hall templates used by the seed. Each returns a HallLayoutSpec for generateSeats.
// ---------------------------------------------------------------------------------------------

const ROW_LABELS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'; // no "I" (looks like 1)

function repeat(type: SeatTypeCode, count: number): SeatSpec[] {
  return Array.from({ length: count }, () => ({ type }));
}

/** Row with a wheelchair space + companion seat at the outer end of each block. */
function accessibleBlocks(blockSizes: number[], fill: SeatTypeCode): SeatSpec[][] {
  const last = blockSizes.length - 1;
  return blockSizes.map((size, index) => {
    if (index === 0) {
      return [{ type: 'WHEELCHAIR' }, { type: 'COMPANION' }, ...repeat(fill, size - 2)];
    }
    if (index === last) {
      return [...repeat(fill, size - 2), { type: 'COMPANION' }, { type: 'WHEELCHAIR' }];
    }
    return repeat(fill, size);
  });
}

function vipRowIndexes(rowCount: number): Set<number> {
  const middle = Math.floor(rowCount / 2);
  return new Set([middle - 1, middle]);
}

/**
 * Classic hall: blocks separated by aisles, accessible front row, two VIP rows in the middle,
 * couple sofas in the back row, stadium tiers after the first rows.
 */
export function stadiumHallSpec(options: {
  rows: number;
  blockSizes: number[];
  tierStartRow?: number;
  tierRiseM?: number;
  firstRowDistanceM?: number;
}): HallLayoutSpec {
  const { rows, blockSizes } = options;
  if (rows < 4) throw new Error('A stadium hall needs at least 4 rows');
  const vip = vipRowIndexes(rows);
  const specs: RowSpec[] = Array.from({ length: rows }, (_, index) => {
    const label = ROW_LABELS.charAt(index);
    if (index === 0) return { label, blocks: accessibleBlocks(blockSizes, 'STANDARD') };
    if (index === rows - 1) {
      // Couple sofas take two units each; odd blocks keep one standard seat.
      return {
        label,
        blocks: blockSizes.map((size) => [
          ...repeat('COUPLE', Math.floor(size / 2)),
          ...repeat('STANDARD', size % 2),
        ]),
      };
    }
    return {
      label,
      blocks: blockSizes.map((size) => repeat(vip.has(index) ? 'VIP' : 'STANDARD', size)),
    };
  });
  return {
    rows: specs,
    seatWidthM: 0.55,
    rowSpacingM: 0.95,
    aisleWidthM: 1.2,
    firstRowDistanceM: options.firstRowDistanceM ?? 4.5,
    tierStartRow: options.tierStartRow ?? 3,
    tierRiseM: options.tierRiseM ?? 0.35,
  };
}

/** VIP hall: wide recliners (all VIP) with generous spacing; accessible spaces in the front row. */
export function reclinerHallSpec(options: { rows: number; blockSizes: number[] }): HallLayoutSpec {
  const specs: RowSpec[] = Array.from({ length: options.rows }, (_, index) => ({
    label: ROW_LABELS.charAt(index),
    blocks:
      index === 0
        ? accessibleBlocks(options.blockSizes, 'VIP')
        : options.blockSizes.map((size) => repeat('VIP', size)),
  }));
  return {
    rows: specs,
    seatWidthM: 0.95,
    rowSpacingM: 1.7,
    aisleWidthM: 1.4,
    firstRowDistanceM: 5,
    tierStartRow: 1,
    tierRiseM: 0.45,
  };
}

/** Private suite: two rows of recliners booked as a whole. */
export function suiteHallSpec(options: { seatsPerRow: number }): HallLayoutSpec {
  return {
    rows: [
      { label: 'A', blocks: [repeat('VIP', options.seatsPerRow)] },
      { label: 'B', blocks: [repeat('VIP', options.seatsPerRow)] },
    ],
    seatWidthM: 0.95,
    rowSpacingM: 1.9,
    aisleWidthM: 1.2,
    firstRowDistanceM: 3.5,
    tierStartRow: 1,
    tierRiseM: 0.5,
  };
}
