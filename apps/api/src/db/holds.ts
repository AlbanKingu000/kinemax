// Stale seat holds: HELD bookings whose holdExpiresAt has passed. Marking them EXPIRED releases
// their seat locks in the same statement (trigger G11), so the seats are free again at once.
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { Logger } from '../logger.js';

/** How many stale holds one cleanup statement expires at most. */
export const HOLD_CLEANUP_BATCH = 500;
export const HOLD_CLEANUP_INTERVAL_MS = 60_000;

/** Expires the stale holds matching `where` (e.g. one showtime). Idempotent. */
export async function expireStaleHolds(
  db: PrismaClient | Prisma.TransactionClient,
  at: Date,
  where: Prisma.BookingWhereInput = {},
): Promise<number> {
  const result = await db.booking.updateMany({
    where: { ...where, status: 'HELD', holdExpiresAt: { lte: at } },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

/** Expires every stale hold in batches of HOLD_CLEANUP_BATCH; returns how many it expired. */
export async function expireAllStaleHolds(prisma: PrismaClient, at: Date): Promise<number> {
  let total = 0;
  for (;;) {
    const batch = await prisma.booking.findMany({
      where: { status: 'HELD', holdExpiresAt: { lte: at } },
      select: { id: true },
      take: HOLD_CLEANUP_BATCH,
    });
    if (batch.length === 0) return total;
    total += await expireStaleHolds(prisma, at, { id: { in: batch.map((b) => b.id) } });
    if (batch.length < HOLD_CLEANUP_BATCH) return total;
  }
}

/**
 * Runs the stale-hold cleanup now and then every `intervalMs` inside the API process. Safe with
 * several processes (expiring is idempotent and only touches stale HELD rows). Returns a stop
 * function.
 */
export function startHoldCleanup(
  prisma: PrismaClient,
  logger: Logger,
  intervalMs: number,
  now: () => Date = () => new Date(),
): () => void {
  const run = () => {
    expireAllStaleHolds(prisma, now()).then(
      (expired) => {
        if (expired > 0) logger.info('booking.holds.cleanup', { expired });
      },
      (error: unknown) => {
        logger.error('booking.holds.cleanup_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
