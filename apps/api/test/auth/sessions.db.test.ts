import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_IDLE_TIMEOUT_MS } from '../../src/auth/auth-config.js';
import { createSessionService, startSessionCleanup } from '../../src/auth/sessions.js';
import { resetDatabase } from '../db/helpers.js';
import { testLogger, testPrisma } from '../support/app.js';

const prisma = testPrisma();
const DAY = 24 * 3_600_000;

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function user() {
  return prisma.user.create({
    data: { email: 'cleanup@kinemax.test', name: 'C', passwordHash: 'x' },
  });
}

describe('session cleanup', () => {
  it('deletes idle and absolutely expired sessions only, and is idempotent', async () => {
    const { id: userId } = await user();
    const sessions = createSessionService(prisma);
    const fresh = await sessions.create(userId, 'ua');
    const idle = await sessions.create(userId, undefined);
    const old = await sessions.create(userId, 'x'.repeat(500));
    await prisma.session.update({
      where: { id: idle.sessionId },
      data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS - 1000) },
    });
    await prisma.session.update({
      where: { id: old.sessionId },
      data: { createdAt: new Date(Date.now() - 31 * DAY), expiresAt: new Date(Date.now() - DAY) },
    });
    expect(
      (await prisma.session.findUniqueOrThrow({ where: { id: old.sessionId } })).userAgent,
    ).toHaveLength(256);

    expect(await sessions.cleanupExpired()).toBe(2);
    expect(await sessions.cleanupExpired()).toBe(0);
    expect((await prisma.session.findMany()).map((s) => s.id)).toEqual([fresh.sessionId]);
  });

  it('runs on start and on an interval, logs deletions and failures, and can be stopped', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const logger = testLogger();
      let calls = 0;
      const service = {
        ...createSessionService(prisma),
        cleanupExpired: () => {
          calls++;
          return calls === 2 ? Promise.reject(new Error('db down')) : Promise.resolve(calls);
        },
      };
      const stop = startSessionCleanup(service, logger, 1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toBe(2);
      expect(logger.info).toHaveBeenCalledWith('auth.sessions.cleanup', { deleted: 1 });
      expect(logger.error).toHaveBeenCalledWith('auth.sessions.cleanup_failed', {
        message: 'db down',
      });
      stop();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('revokeAllForUser can keep one session', async () => {
    const { id: userId } = await user();
    const sessions = createSessionService(prisma);
    const keep = await sessions.create(userId, undefined);
    await sessions.create(userId, undefined);
    expect(await sessions.revokeAllForUser(userId, keep.sessionId)).toBe(1);
    expect(await sessions.revokeAllForUser(userId)).toBe(1);
  });
});
