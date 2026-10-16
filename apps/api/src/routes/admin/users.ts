// Users and the audit log (SUPER_ADMIN only). Safeguards: nobody changes their own role or
// deactivates themselves, and the last active super admin can be neither demoted nor deactivated
// (checked under an advisory lock, so two admins demoting each other cannot both succeed). A role
// change or a deactivation ends every session of that user.
import {
  ADMIN_PAGE_SIZE,
  adminUserUpdateSchema,
  adminUsersQuerySchema,
  auditQuerySchema,
  type AdminUser,
  type AdminUsersResponse,
  type AuditResponse,
} from '@kinemax/shared';
import { Router, type Request } from 'express';
import type { Prisma } from '../../generated/prisma/client.js';
import { addDays, zonedTimeToUtc } from '../../domain/time-zone.js';
import { requireRole } from '../../http/auth-middleware.js';
import { HttpError, parseInput } from '../../http/errors.js';
import { maskEmail } from '../../logger.js';
import { idParams, notFound } from '../booking-common.js';
import { audit, staffUser, type AdminDeps } from './common.js';

type Limit = (req: Request, kind: 'write' | 'sensitive', event: string) => void;
// shortcut: audit days use one time zone (every cinema is in Europe/Belgrade); per-cinema zones
// would need the filter to name one.
const TIME_ZONE = 'Europe/Belgrade';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  managedLocations: { select: { locationId: true }, orderBy: { locationId: 'asc' } },
} as const satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const toUser = ({ managedLocations, createdAt, ...row }: UserRow): AdminUser => ({
  ...row,
  createdAt: createdAt.toISOString(),
  locationIds: managedLocations.map((m) => m.locationId),
});

const refused = (path: string, code: string, message: string) =>
  new HttpError(409, 'conflict', message, { fields: [{ path, code }] });

const contains = (text: string) => ({ contains: text, mode: 'insensitive' as const });

export function createUsersRouter({
  prisma,
  logger,
  limit,
}: Pick<AdminDeps, 'prisma' | 'logger'> & { limit: Limit }): Router {
  const router = Router();
  router.use(['/users', '/audit'], requireRole('SUPER_ADMIN'));

  router.get('/users', async (req, res) => {
    const query = parseInput(adminUsersQuerySchema, req.query);
    const where: Prisma.UserWhereInput = {
      ...(query.q ? { OR: [{ name: contains(query.q) }, { email: contains(query.q) }] } : {}),
      ...(query.role ? { role: query.role } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
      prisma.user.count({ where }),
    ]);
    const body: AdminUsersResponse = { users: rows.map(toUser), total };
    res.json(body);
  });

  router.patch('/users/:id', async (req, res) => {
    limit(req, 'sensitive', 'admin_user_update');
    const { id } = parseInput(idParams, req.params);
    const input = parseInput(adminUserUpdateSchema, req.body);
    const actor = staffUser(req);

    const user = await prisma.$transaction(async (tx) => {
      // One super-admin change at a time: the "last super admin" count below stays true.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('admin.users.super_admin'))`;
      const before = await tx.user.findUnique({ where: { id }, select: USER_SELECT });
      if (!before) throw notFound();
      const role = input.role ?? before.role;
      const isActive = input.isActive ?? before.isActive;
      const roleChanged = role !== before.role;
      const deactivated = before.isActive && !isActive;

      if (id === actor.id && (roleChanged || isActive !== before.isActive)) {
        throw refused(
          roleChanged ? 'role' : 'isActive',
          'self',
          'You cannot change your own role or deactivate yourself.',
        );
      }
      if (
        before.role === 'SUPER_ADMIN' &&
        before.isActive &&
        (role !== 'SUPER_ADMIN' || !isActive)
      ) {
        const others = await tx.user.count({
          where: { role: 'SUPER_ADMIN', isActive: true, id: { not: id } },
        });
        if (others === 0) {
          throw refused(
            roleChanged ? 'role' : 'isActive',
            'last_super_admin',
            'The last active super admin cannot be demoted or deactivated.',
          );
        }
      }
      if (input.locationIds !== undefined && role !== 'LOCATION_MANAGER') {
        throw new HttpError(422, 'unprocessable', 'Only location managers manage cinemas.');
      }

      // Managers keep their cinemas unless new ones are given; other roles have none.
      const locationIds =
        role === 'LOCATION_MANAGER'
          ? [...new Set(input.locationIds ?? before.managedLocations.map((m) => m.locationId))]
          : [];
      await tx.managerLocation.deleteMany({ where: { userId: id } });
      if (locationIds.length > 0) {
        // An unknown location id is a foreign-key violation on insert (23503 -> 422).
        await tx.managerLocation.createMany({
          data: locationIds.map((locationId) => ({ userId: id, locationId })),
        });
      }
      const after = await tx.user.update({
        where: { id },
        data: { role, isActive },
        select: USER_SELECT,
      });
      const revoked =
        roleChanged || deactivated
          ? (await tx.session.deleteMany({ where: { userId: id } })).count
          : 0;
      const snapshot = (u: AdminUser) => ({
        role: u.role,
        isActive: u.isActive,
        locationIds: u.locationIds,
      });
      await audit(tx, req, {
        action: 'user.update',
        entityType: 'User',
        entityId: id,
        before: snapshot(toUser(before)),
        after: { ...snapshot(toUser(after)), sessionsRevoked: revoked },
      });
      return { after, revoked };
    });

    logger.info('admin.user.updated', {
      actorId: actor.id,
      userId: id,
      email: maskEmail(user.after.email),
      sessionsRevoked: user.revoked,
    });
    res.json({ user: toUser(user.after) });
  });

  router.get('/audit', async (req, res) => {
    const query = parseInput(auditQuerySchema, req.query);
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = zonedTimeToUtc(query.from, 0, TIME_ZONE);
    if (query.to) createdAt.lt = zonedTimeToUtc(addDays(query.to, 1), 0, TIME_ZONE);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.from || query.to ? { createdAt } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actor
        ? { actor: { OR: [{ name: contains(query.actor) }, { email: contains(query.actor) }] } }
        : {}),
    };
    const [rows, total, types] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          action: true,
          entityType: true,
          entityId: true,
          before: true,
          after: true,
          actor: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
    ]);
    const body: AuditResponse = {
      entries: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      total,
      entityTypes: types.map((t) => t.entityType),
    };
    res.json(body);
  });

  return router;
}
