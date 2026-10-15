// The four hall types as the seed builds them (Prishtinë), for the camera framing tests. The seats
// come from the API's own layout generator, so these tests follow any change to the real halls.
import type { SeatMapResponse, SeatMapSeat } from '@kinemax/shared';
import {
  generateSeats,
  reclinerHallSpec,
  stadiumHallSpec,
  suiteHallSpec,
  type HallLayoutSpec,
} from '../../../api/src/domain/seat-layout';

type Screen = SeatMapResponse['hall']['screen'];
export interface TestHall {
  code: 'STANDARD' | 'VIP_RECLINER' | 'PREMIUM_LARGE_FORMAT' | 'PRIVATE_SUITE';
  screen: Screen;
  seats: SeatMapSeat[];
}

// Same values as apps/api/prisma/seed/data.ts (Grand 1, Salla 2, VIP 5, Suita 6).
const SPECS: [TestHall['code'], HallLayoutSpec, Omit<Screen, 'x' | 'y'>][] = [
  [
    'STANDARD',
    stadiumHallSpec({ rows: 12, blockSizes: [9, 9] }),
    { widthM: 12, heightM: 5, z: 3.5 },
  ],
  [
    'VIP_RECLINER',
    reclinerHallSpec({ rows: 5, blockSizes: [4, 4] }),
    { widthM: 10, heightM: 4.2, z: 3 },
  ],
  [
    'PREMIUM_LARGE_FORMAT',
    stadiumHallSpec({
      rows: 14,
      blockSizes: [6, 12, 6],
      tierStartRow: 2,
      tierRiseM: 0.45,
      firstRowDistanceM: 7,
    }),
    { widthM: 22, heightM: 9.5, z: 5.5 },
  ],
  ['PRIVATE_SUITE', suiteHallSpec({ seatsPerRow: 7 }), { widthM: 6, heightM: 2.6, z: 2 }],
];

export const HALLS: TestHall[] = SPECS.map(([code, spec, screen]) => ({
  code,
  screen: { ...screen, x: 0, y: 0 },
  seats: generateSeats(spec).map((s) => ({
    id: `${code}-${s.rowLabel}${s.number}`,
    row: s.rowLabel,
    number: s.number,
    type: s.seatType,
    x: s.x,
    y: s.y,
    z: s.z,
    rotationDeg: s.rotationDeg,
    widthUnits: s.widthUnits,
    status: 'AVAILABLE',
  })),
}));
