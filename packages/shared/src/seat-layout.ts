// Seat-layout generator: turns a compact hall description into seats with 3D coordinates for the
// interactive seat map and "view from this seat" camera. Shared: the seed and the API save what
// it computes, and the admin seat editor previews exactly the same coordinates.
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

/** The spacing rules of a hall type (everything in a HallLayoutSpec except the rows). */
export type HallSpacing = Omit<HallLayoutSpec, 'rows'>;

/**
 * Spacing per hall type, used whenever seats are (re)generated: the seed templates and the admin
 * seat editor. Unknown (new) hall types use the STANDARD rules.
 */
export const HALL_TYPE_SPACING: Record<string, HallSpacing> = {
  STANDARD: {
    seatWidthM: 0.55,
    rowSpacingM: 0.95,
    aisleWidthM: 1.2,
    firstRowDistanceM: 4.5,
    tierStartRow: 3,
    tierRiseM: 0.35,
  },
  PREMIUM_LARGE_FORMAT: {
    seatWidthM: 0.55,
    rowSpacingM: 0.95,
    aisleWidthM: 1.2,
    firstRowDistanceM: 7,
    tierStartRow: 2,
    tierRiseM: 0.45,
  },
  VIP_RECLINER: {
    seatWidthM: 0.95,
    rowSpacingM: 1.7,
    aisleWidthM: 1.4,
    firstRowDistanceM: 5,
    tierStartRow: 1,
    tierRiseM: 0.45,
  },
  PRIVATE_SUITE: {
    seatWidthM: 0.95,
    rowSpacingM: 1.9,
    aisleWidthM: 1.2,
    firstRowDistanceM: 3.5,
    tierStartRow: 1,
    tierRiseM: 0.5,
  },
};

export function spacingFor(hallTypeCode: string): HallSpacing {
  return HALL_TYPE_SPACING[hallTypeCode] ?? (HALL_TYPE_SPACING.STANDARD as HallSpacing);
}

/** Tickets a seat sells: a COUPLE sofa is one seat for two people (database rule G12). */
export function ticketsPerSeat(seatType: SeatTypeCode): number {
  return seatType === 'COUPLE' ? 2 : 1;
}
