// The authorization harness of the admin API, reused by every admin test file: a second cinema
// (for IDOR checks), one signed-in client per role, and assertions that a request is refused for
// everyone who must not make it.
import { authSessionResponseSchema } from '@kinemax/shared';
import type request from 'supertest';
import { expect } from 'vitest';
import { hashPassword } from '../../src/auth/password.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { createFixture } from '../db/helpers.js';
import { browserClient, type makeTestApp } from './app.js';

export const STAFF_PASSWORD = 'Kinemax-staff-Passw0rd';
let passwordHash: string | undefined;

type App = ReturnType<typeof makeTestApp>['app'];
export type Client = Awaited<ReturnType<typeof browserClient>>;
export type Role = 'anonymous' | 'customer' | 'otherManager' | 'manager' | 'superAdmin';

/**
 * createFixture plus a second cinema ("Kinemax Tjetër" with one hall, seats and a show) and the
 * staff: a super admin, the manager of the fixture's cinema, the manager of the other cinema, and
 * a customer.
 */
export async function createAdminFixture(prisma: PrismaClient) {
  const fx = await createFixture(prisma);
  passwordHash ??= await hashPassword(STAFF_PASSWORD);
  const otherLocation = await prisma.location.create({
    data: {
      slug: 'other-city',
      name: 'Kinemax Tjetër',
      city: 'Tjetër',
      address: 'Rruga Tjetër 2',
      timeZone: 'Europe/Belgrade',
    },
  });
  const otherHall = await prisma.hall.create({
    data: {
      locationId: otherLocation.id,
      hallTypeId: fx.hall.hallTypeId,
      name: 'Salla 1',
      screenWidthM: 10,
      screenHeightM: 4,
      screenZ: 3,
    },
  });
  await prisma.seat.createMany({
    data: [1, 2].map((number) => ({
      hallId: otherHall.id,
      rowLabel: 'A',
      number,
      seatType: 'STANDARD' as const,
      x: number,
      y: 5,
      z: 0,
    })),
  });
  const otherShowtime = await prisma.showtime.create({
    data: {
      movieId: fx.movie.id,
      hallId: otherHall.id,
      startsAt: fx.showtime.startsAt,
      endsAt: fx.showtime.endsAt,
      languageVersion: 'DUBBED_SQ',
    },
  });
  const user = (email: string, role: 'CUSTOMER' | 'LOCATION_MANAGER' | 'SUPER_ADMIN') =>
    prisma.user.create({
      data: { email, name: `Staf ${role}`, role, passwordHash: passwordHash ?? '' },
    });
  const superAdmin = await user('admin@kinemax.test', 'SUPER_ADMIN');
  const manager = await user('menaxher@kinemax.test', 'LOCATION_MANAGER');
  const otherManager = await user('menaxher.tjeter@kinemax.test', 'LOCATION_MANAGER');
  const customer = await user('klient@kinemax.test', 'CUSTOMER');
  await prisma.managerLocation.createMany({
    data: [
      { userId: manager.id, locationId: fx.location.id },
      { userId: otherManager.id, locationId: otherLocation.id },
    ],
  });
  return {
    ...fx,
    other: { location: otherLocation, hall: otherHall, showtime: otherShowtime },
    staff: { superAdmin, manager, otherManager, customer },
  };
}

export type AdminFixture = Awaited<ReturnType<typeof createAdminFixture>>;

/** Signed-in clients (plus an anonymous one) for every role of the admin fixture. */
export async function staffClients(app: App, fx: AdminFixture): Promise<Record<Role, Client>> {
  const signIn = async (email: string) => {
    const client = await browserClient(app);
    const res = await client.post('/api/auth/login', { email, password: STAFF_PASSWORD });
    expect(res.status).toBe(200);
    client.token = authSessionResponseSchema.parse(res.body).csrfToken;
    return client;
  };
  return {
    anonymous: await browserClient(app),
    customer: await signIn(fx.staff.customer.email),
    otherManager: await signIn(fx.staff.otherManager.email),
    manager: await signIn(fx.staff.manager.email),
    superAdmin: await signIn(fx.staff.superAdmin.email),
  };
}

const REFUSED: Record<Role, number[]> = {
  anonymous: [401],
  customer: [403],
  // A manager of another cinema: 403 for a location id, 404 for a resource of that cinema.
  otherManager: [403, 404],
  manager: [403, 404],
  superAdmin: [403, 404],
};

/**
 * Asserts that `send` is refused for every role in `refused` (401 anonymous, 403 customer,
 * 403/404 for staff outside their scope). Pass `unchanged` to also prove nothing was written.
 */
export async function expectRefused(
  clients: Record<Role, Client>,
  refused: readonly Role[],
  send: (client: Client) => request.Test,
  unchanged?: () => Promise<unknown>,
): Promise<void> {
  const before = unchanged ? JSON.stringify(await unchanged()) : undefined;
  for (const role of refused) {
    const res = await send(clients[role]);
    expect(REFUSED[role], `${role} got ${String(res.status)}`).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|sql/i);
  }
  if (unchanged) expect(JSON.stringify(await unchanged())).toBe(before);
}

/** Generous limits so tests never hit them by accident (the rate-limit tests set their own). */
const MINUTE = 60_000;
const generous = { windowMs: MINUTE, max: 10_000 };
export const GENEROUS_LIMITS = {
  rateLimits: {
    loginPerIp: generous,
    loginPerEmailAndIp: generous,
    registerPerIp: generous,
    changePasswordPerUser: generous,
  },
  adminRateLimits: { writePerUser: generous, sensitivePerUser: generous },
};
