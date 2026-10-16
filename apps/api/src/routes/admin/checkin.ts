// POST /api/admin/checkin: scanning a ticket at the entrance of one cinema. Only staff of that
// cinema; only paid bookings for today's shows of that cinema, from 90 minutes before the start
// to 30 minutes after it (the cinema's time zone). Scanning twice answers the first scan again.
import {
  CHECKIN_WINDOW,
  checkinInputSchema,
  normalizeTicketCode,
  type CheckinRejection,
  type CheckinResponse,
} from '@kinemax/shared';
import { Router, type Request } from 'express';
import { BOOKING_CODE_PATTERN } from '../../domain/booking-code.js';
import { toLocalDateTime } from '../../domain/time-zone.js';
import { canAccessLocation } from '../../http/auth-middleware.js';
import { forbidden, parseInput } from '../../http/errors.js';
import { audit, staffUser, type AdminDeps } from './common.js';

type Limit = (req: Request, kind: 'write' | 'sensitive', event: string) => void;
const MINUTE = 60_000;

export function createCheckinRouter({
  prisma,
  now,
  limit,
}: Pick<AdminDeps, 'prisma' | 'now'> & { limit: Limit }): Router {
  const router = Router();

  router.post('/checkin', async (req, res) => {
    limit(req, 'write', 'admin_checkin');
    const input = parseInput(checkinInputSchema, req.body);
    const user = staffUser(req);
    if (!(await canAccessLocation(prisma, user, input.locationId))) throw forbidden();
    const at = now();
    const reject = (reason: CheckinRejection, show?: { startsAt: Date; timeZone: string }) => {
      const body: CheckinResponse = {
        result: 'rejected',
        reason,
        startsAt: show?.startsAt.toISOString() ?? null,
        timeZone: show?.timeZone ?? null,
      };
      res.json(body);
    };

    const code = normalizeTicketCode(input.code);
    if (!BOOKING_CODE_PATTERN.test(code)) {
      reject('not_found');
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serializes two scanners scanning the same ticket at once.
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Booking" WHERE "code" = ${code} FOR UPDATE`;
      if (!locked) return { kind: 'rejected' as const, reason: 'not_found' as const };
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: locked.id },
        select: {
          id: true,
          code: true,
          status: true,
          isWholeHall: true,
          checkedInAt: true,
          showtime: {
            select: {
              startsAt: true,
              movie: { select: { titleSq: true, titleEn: true, ageRating: true } },
              hall: {
                select: {
                  name: true,
                  locationId: true,
                  location: { select: { timeZone: true } },
                },
              },
            },
          },
          seats: {
            select: { seat: { select: { rowLabel: true, number: true, y: true } } },
            distinct: ['seatId'],
          },
          foodItems: {
            where: { fulfillment: 'PICKUP_AT_COUNTER' },
            select: { nameSq: true, quantity: true, menuItem: { select: { nameEn: true } } },
          },
        },
      });
      const { showtime } = booking;
      const show = { startsAt: showtime.startsAt, timeZone: showtime.hall.location.timeZone };
      // A ticket of another cinema says so, without any detail of it.
      if (showtime.hall.locationId !== input.locationId)
        return { kind: 'rejected' as const, reason: 'wrong_location' as const };
      if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
        return { kind: 'rejected' as const, reason: 'cancelled' as const, show };
      }
      if (booking.status !== 'CONFIRMED')
        return { kind: 'rejected' as const, reason: 'not_paid' as const, show };
      const ticket = {
        code: booking.code,
        movieTitleSq: showtime.movie.titleSq,
        movieTitleEn: showtime.movie.titleEn,
        ageRating: showtime.movie.ageRating,
        hallName: showtime.hall.name,
        startsAt: showtime.startsAt.toISOString(),
        timeZone: show.timeZone,
        wholeHall: booking.isWholeHall,
        seats: [...booking.seats]
          .sort((a, b) => a.seat.y - b.seat.y || a.seat.number - b.seat.number)
          .map((s) => `${s.seat.rowLabel}${String(s.seat.number)}`),
        food: booking.foodItems.map((f) => ({
          nameSq: f.nameSq,
          nameEn: f.menuItem.nameEn,
          quantity: f.quantity,
        })),
      };
      if (booking.checkedInAt) {
        return { kind: 'ok' as const, ticket, already: true, checkedInAt: booking.checkedInAt };
      }
      if (
        toLocalDateTime(showtime.startsAt, show.timeZone).date !==
        toLocalDateTime(at, show.timeZone).date
      ) {
        return { kind: 'rejected' as const, reason: 'not_today' as const, show };
      }
      const start = showtime.startsAt.getTime();
      if (at.getTime() < start - CHECKIN_WINDOW.beforeMinutes * MINUTE) {
        return { kind: 'rejected' as const, reason: 'too_early' as const, show };
      }
      if (at.getTime() > start + CHECKIN_WINDOW.afterMinutes * MINUTE) {
        return { kind: 'rejected' as const, reason: 'too_late' as const, show };
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: { checkedInAt: at, checkedInById: user.id },
      });
      await audit(tx, req, {
        action: 'booking.checkin',
        entityType: 'Booking',
        entityId: booking.id,
        after: { checkedInAt: at.toISOString(), locationId: input.locationId },
      });
      return { kind: 'ok' as const, ticket, already: false, checkedInAt: at };
    });

    if (result.kind === 'rejected') {
      reject(result.reason, 'show' in result ? result.show : undefined);
      return;
    }
    const body: CheckinResponse = {
      result: 'ok',
      already: result.already,
      checkedInAt: result.checkedInAt.toISOString(),
      ticket: result.ticket,
    };
    res.json(body);
  });

  return router;
}
