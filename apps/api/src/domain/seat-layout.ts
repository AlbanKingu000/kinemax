// Hall templates of the seed. The generator itself (generateSeats, the spacing per hall type)
// lives in @kinemax/shared, so the admin seat editor previews exactly what is saved.
import {
  generateSeats,
  HALL_TYPE_SPACING,
  type GeneratedSeat,
  type HallLayoutSpec,
  type HallSpacing,
  type RowSpec,
  type SeatSpec,
  type SeatTypeCode,
} from '@kinemax/shared';

export { generateSeats, HALL_TYPE_SPACING };
export type { GeneratedSeat, HallLayoutSpec, HallSpacing, RowSpec, SeatSpec, SeatTypeCode };
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
  const spacing = HALL_TYPE_SPACING.STANDARD as HallSpacing;
  return {
    rows: specs,
    ...spacing,
    firstRowDistanceM: options.firstRowDistanceM ?? spacing.firstRowDistanceM,
    tierStartRow: options.tierStartRow ?? spacing.tierStartRow,
    tierRiseM: options.tierRiseM ?? spacing.tierRiseM,
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
  return { rows: specs, ...(HALL_TYPE_SPACING.VIP_RECLINER as HallSpacing) };
}

/** Private suite: two rows of recliners booked as a whole. */
export function suiteHallSpec(options: { seatsPerRow: number }): HallLayoutSpec {
  return {
    rows: [
      { label: 'A', blocks: [repeat('VIP', options.seatsPerRow)] },
      { label: 'B', blocks: [repeat('VIP', options.seatsPerRow)] },
    ],
    ...(HALL_TYPE_SPACING.PRIVATE_SUITE as HallSpacing),
  };
}
