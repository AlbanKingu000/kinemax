// Halls and their seat layout (managers for their cinemas, super admins everywhere). A layout is
// saved as one validated batch: the server numbers the seats left to right and computes every
// coordinate from the order and the hall type's spacing (generateSeats, shared with the editor).
//
// Safety rules: a seat that was ever booked is never deleted (only deactivated) and never changes
// its ticket count (G12); a seat with a booking for a show that has not ended stays exactly as it
// is (active, same label, same ticket count); a suite with such a booking cannot change at all.
import {
  adminHallsQuerySchema,
  generateSeats,
  hallLayoutInputSchema,
  spacingFor,
  ticketsPerSeat,
  type AdminHallsResponse,
  type HallLayoutResponse,
  type LayoutBlocker,
  type LayoutSeat,
} from '@kinemax/shared';
import { Router, type Request } from 'express';
import { Prisma, type SeatType } from '../../generated/prisma/client.js';
import { HttpError, parseInput } from '../../http/errors.js';
import { idParams, notFound, type Db } from '../booking-common.js';
import { assertResourceScope, audit, locationScope, staffUser, type AdminDeps } from './common.js';

interface SeatRow {
  id: string;
  rowLabel: string;
  number: number;
  seatType: SeatType;
  x: number;
  y: number;
  z: number;
  widthUnits: number;
  isActive: boolean;
}

const seatSelect = {
  id: true,
  rowLabel: true,
  number: true,
  seatType: true,
  x: true,
  y: true,
  z: true,
  widthUnits: true,
  isActive: true,
} as const;

const refused = (status: 409 | 422, message: string, fields: { path: string; code: string }[]) =>
  new HttpError(status, status === 409 ? 'conflict' : 'unprocessable', message, { fields });

/**
 * The stored seats as rows of blocks: rows front to back, seats left to right, a new block where
 * the gap to the previous seat is wider than half a seat (an aisle).
 */
export function rowsOfSeats<T extends SeatRow>(seats: readonly T[], seatWidthM: number) {
  const byRow = new Map<string, T[]>();
  for (const seat of seats) byRow.set(seat.rowLabel, [...(byRow.get(seat.rowLabel) ?? []), seat]);
  return [...byRow.entries()]
    .map(([label, row]) => ({ label, seats: [...row].sort((a, b) => a.x - b.x) }))
    .sort(
      (a, b) =>
        Math.min(...a.seats.map((s) => s.y)) - Math.min(...b.seats.map((s) => s.y)) ||
        a.label.localeCompare(b.label),
    )
    .map(({ label, seats: row }) => {
      const blocks: T[][] = [];
      row.forEach((seat, index) => {
        const previous = row[index - 1];
        const gap = previous
          ? seat.x -
            (seat.widthUnits * seatWidthM) / 2 -
            (previous.x + (previous.widthUnits * seatWidthM) / 2)
          : 0;
        if (!previous || gap > seatWidthM / 2) blocks.push([seat]);
        else blocks[blocks.length - 1]?.push(seat);
      });
      return { label, blocks };
    });
}

export function createHallsRouter({
  prisma,
  now,
  limit,
}: Pick<AdminDeps, 'prisma' | 'now'> & {
  limit: (req: Request, kind: 'write' | 'sensitive', event: string) => void;
}): Router {
  const router = Router();

  async function scopedHall(req: Request, id: string) {
    const hall = await prisma.hall.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        locationId: true,
        wholeHallOnly: true,
        screenWidthM: true,
        screenHeightM: true,
        screenX: true,
        screenY: true,
        screenZ: true,
        hallType: { select: { code: true, nameSq: true, nameEn: true } },
      },
    });
    await assertResourceScope(prisma, staffUser(req), hall?.locationId);
    if (!hall) throw notFound();
    return hall;
  }
  type Hall = Awaited<ReturnType<typeof scopedHall>>;

  /** Seats with booking history, and the future shows that block seats (all of them in a suite). */
  async function seatState(db: Db, hallId: string) {
    const at = now();
    const [history, reservations, wholeHall] = await Promise.all([
      db.bookingSeat.findMany({
        where: { seat: { hallId } },
        select: { seatId: true },
        distinct: ['seatId'],
      }),
      db.seatReservation.findMany({
        where: { hallId, showtime: { endsAt: { gt: at } } },
        select: { seatId: true, showtime: { select: blockerSelect } },
      }),
      db.wholeHallReservation.findMany({
        where: { hallId, showtime: { endsAt: { gt: at } } },
        select: { showtime: { select: blockerSelect } },
      }),
    ]);
    const blockers = new Map<string, LayoutBlocker[]>();
    for (const r of reservations) {
      blockers.set(r.seatId, [...(blockers.get(r.seatId) ?? []), toBlocker(r.showtime)]);
    }
    return {
      history: new Set(history.map((h) => h.seatId)),
      blockers,
      suiteBlockers: wholeHall.map((r) => toBlocker(r.showtime)),
    };
  }

  async function layoutOf(hall: Hall): Promise<HallLayoutResponse> {
    const spacing = spacingFor(hall.hallType.code);
    const [seats, state] = await Promise.all([
      prisma.seat.findMany({ where: { hallId: hall.id }, select: seatSelect }),
      seatState(prisma, hall.id),
    ]);
    const toSeat = (seat: SeatRow): LayoutSeat => ({
      id: seat.id,
      type: seat.seatType,
      isActive: seat.isActive,
      hasHistory: state.history.has(seat.id),
      blockedBy: [...(state.blockers.get(seat.id) ?? []), ...state.suiteBlockers],
    });
    return {
      hall: {
        id: hall.id,
        name: hall.name,
        locationId: hall.locationId,
        wholeHallOnly: hall.wholeHallOnly,
        hallType: hall.hallType,
        screen: {
          widthM: hall.screenWidthM,
          heightM: hall.screenHeightM,
          x: hall.screenX,
          y: hall.screenY,
          z: hall.screenZ,
        },
      },
      spacing,
      rows: rowsOfSeats(seats, spacing.seatWidthM).map((row) => ({
        label: row.label,
        blocks: row.blocks.map((block) => block.map(toSeat)),
      })),
    };
  }

  router.get('/halls', async (req, res) => {
    const query = parseInput(adminHallsQuerySchema, req.query);
    await locationScope(prisma, staffUser(req), query.location);
    const [halls, counts] = await Promise.all([
      prisma.hall.findMany({
        where: { locationId: query.location },
        select: {
          id: true,
          name: true,
          isActive: true,
          wholeHallOnly: true,
          hallType: { select: { code: true, nameSq: true, nameEn: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.seat.groupBy({
        by: ['hallId', 'isActive'],
        where: { hall: { locationId: query.location } },
        _count: true,
      }),
    ]);
    const count = (hallId: string, active: boolean) =>
      counts.find((c) => c.hallId === hallId && c.isActive === active)?._count ?? 0;
    const body: AdminHallsResponse = {
      halls: halls.map((hall) => ({
        id: hall.id,
        name: hall.name,
        isActive: hall.isActive,
        wholeHallOnly: hall.wholeHallOnly,
        hallTypeCode: hall.hallType.code,
        hallTypeNameSq: hall.hallType.nameSq,
        hallTypeNameEn: hall.hallType.nameEn,
        activeSeats: count(hall.id, true),
        inactiveSeats: count(hall.id, false),
      })),
    };
    res.json(body);
  });

  router.get('/halls/:id/layout', async (req, res) => {
    const { id } = parseInput(idParams, req.params);
    res.json(await layoutOf(await scopedHall(req, id)));
  });

  router.put('/halls/:id/layout', async (req, res) => {
    limit(req, 'sensitive', 'admin_hall_layout');
    const { id } = parseInput(idParams, req.params);
    const input = parseInput(hallLayoutInputSchema, req.body);
    const hall = await scopedHall(req, id);
    const spacing = spacingFor(hall.hallType.code);

    const labels = input.rows.map((row) => row.label);
    const duplicate = labels.findIndex((label, i) => labels.indexOf(label) !== i);
    if (duplicate >= 0) {
      throw refused(422, 'Row labels must be unique.', [
        { path: `rows.${String(duplicate)}.label`, code: 'duplicate' },
      ]);
    }
    const cells = input.rows.flatMap((row) => row.blocks.flat());
    const ids = cells.flatMap((cell) => (cell.id ? [cell.id] : []));
    if (new Set(ids).size !== ids.length) {
      throw refused(422, 'A seat appears twice.', [{ path: 'rows', code: 'duplicate_seat' }]);
    }
    // Numbers and coordinates, in the same order as the cells (rows, blocks, seats).
    const generated = generateSeats({
      ...spacing,
      rows: input.rows.map((row) => ({
        label: row.label,
        blocks: row.blocks.map((block) => block.map((cell) => ({ type: cell.type }))),
      })),
    });

    await prisma.$transaction(
      async (tx) => {
        // One editor at a time per hall; seat holds of the hall's future shows wait (they lock
        // the show FOR SHARE), so no booking can appear between these checks and the commit.
        await tx.$queryRaw`SELECT 1 FROM "Hall" WHERE "id" = ${id}::uuid FOR UPDATE`;
        await tx.$queryRaw`
          SELECT 1 FROM "Showtime" WHERE "hallId" = ${id}::uuid AND "endsAt" > ${now()} FOR UPDATE`;
        const current = await tx.seat.findMany({ where: { hallId: id }, select: seatSelect });
        const byId = new Map(current.map((seat) => [seat.id, seat]));
        const state = await seatState(tx, id);
        if (hall.wholeHallOnly && state.suiteBlockers.length > 0) {
          throw refused(409, 'This suite is booked for a show that has not ended.', [
            { path: 'rows', code: 'suite_booked' },
          ]);
        }

        const problems: { path: string; code: string }[] = [];
        const unknown = ids.filter((seatId) => !byId.has(seatId));
        for (const seatId of unknown) problems.push({ path: `seats.${seatId}`, code: 'unknown' });
        if (problems.length > 0) {
          throw refused(422, 'A seat does not belong to this hall.', problems);
        }

        const kept = new Set(ids);
        const removed = current.filter((seat) => !kept.has(seat.id));
        for (const seat of removed) {
          if (state.blockers.has(seat.id))
            problems.push({ path: `seats.${seat.id}`, code: 'blocked' });
          else if (state.history.has(seat.id)) {
            problems.push({ path: `seats.${seat.id}`, code: 'has_history' });
          }
        }
        const updates = cells.flatMap((cell, index) => {
          const target = generated[index];
          const seat = cell.id ? byId.get(cell.id) : undefined;
          if (!target || !seat) return [];
          const capacityChanges = ticketsPerSeat(seat.seatType) !== ticketsPerSeat(cell.type);
          if (state.blockers.has(seat.id)) {
            const same =
              cell.isActive &&
              !capacityChanges &&
              seat.rowLabel === target.rowLabel &&
              seat.number === target.number;
            if (!same) problems.push({ path: `seats.${seat.id}`, code: 'blocked' });
          } else if (capacityChanges && state.history.has(seat.id)) {
            problems.push({ path: `seats.${seat.id}`, code: 'capacity_history' });
          }
          return [{ ...target, id: seat.id, isActive: cell.isActive }];
        });
        if (problems.length > 0) {
          throw refused(409, 'Some seats cannot change.', problems);
        }
        const created = cells.flatMap((cell, index) => {
          const target = generated[index];
          return !cell.id && target ? [{ ...target, hallId: id, isActive: cell.isActive }] : [];
        });

        // Labels move between seats: park them first, so the unique (row, number) never collides.
        await tx.$executeRaw`
          UPDATE "Seat" SET "rowLabel" = 'tmp-' || "id"::text WHERE "hallId" = ${id}::uuid`;
        if (removed.length > 0) {
          await tx.seat.deleteMany({ where: { id: { in: removed.map((seat) => seat.id) } } });
        }
        if (updates.length > 0) {
          const values = Prisma.join(
            updates.map(
              (u) =>
                Prisma.sql`(${u.id}::uuid, ${u.rowLabel}, ${u.number}::int, ${u.seatType}::"SeatType",
                  ${u.x}::float8, ${u.y}::float8, ${u.z}::float8, ${u.rotationDeg}::float8,
                  ${u.widthUnits}::int, ${u.isActive}::boolean)`,
            ),
          );
          await tx.$executeRaw`
            UPDATE "Seat" AS s SET "rowLabel" = v.r, "number" = v.n, "seatType" = v.t, "x" = v.x,
              "y" = v.y, "z" = v.z, "rotationDeg" = v.rot, "widthUnits" = v.w, "isActive" = v.a
            FROM (VALUES ${values}) AS v(id, r, n, t, x, y, z, rot, w, a)
            WHERE s."id" = v.id`;
        }
        if (created.length > 0) await tx.seat.createMany({ data: created });

        const summary = (seats: { isActive: boolean }[]) => ({
          active: seats.filter((s) => s.isActive).length,
          inactive: seats.filter((s) => !s.isActive).length,
        });
        await audit(tx, req, {
          action: 'hall.layout',
          entityType: 'Hall',
          entityId: id,
          before: { ...summary(current), rows: rowsOfSeats(current, spacing.seatWidthM).length },
          after: {
            ...summary(cells),
            rows: input.rows.length,
            created: created.length,
            deletedSeatIds: removed.map((seat) => seat.id),
            deactivatedSeatIds: updates
              .filter((u) => !u.isActive && byId.get(u.id)?.isActive)
              .map((u) => u.id),
            retypedSeatIds: updates
              .filter((u) => byId.get(u.id)?.seatType !== u.seatType)
              .map((u) => u.id),
          },
        });
      },
      { timeout: 30_000 },
    );
    res.json(await layoutOf(hall));
  });

  return router;
}

const blockerSelect = {
  id: true,
  startsAt: true,
  movie: { select: { titleSq: true, titleEn: true } },
} as const;

function toBlocker(showtime: {
  id: string;
  startsAt: Date;
  movie: { titleSq: string; titleEn: string | null };
}): LayoutBlocker {
  return {
    showtimeId: showtime.id,
    startsAt: showtime.startsAt.toISOString(),
    movieTitleSq: showtime.movie.titleSq,
    movieTitleEn: showtime.movie.titleEn,
  };
}
