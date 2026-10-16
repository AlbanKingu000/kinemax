// Food in the admin panel: the global menu (SUPER_ADMIN), each cinema's offer and prices
// (managers for their cinemas) and today's seat-delivery list with "Dorëzuar" (delivered).
import {
  adminMenuResponseSchema,
  deliveredInputSchema,
  MENU_IMAGE_RULES,
  menuItemInputSchema,
  menuOfferInputSchema,
  type AdminMenuItem,
  type DeliveriesResponse,
} from '@kinemax/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { DURING_SHOW_DELAY_MINUTES } from '../../domain/fulfillment.js';
import { addDays, toLocalDateTime, zonedTimeToUtc } from '../../domain/time-zone.js';
import { canAccessLocation, requireRole } from '../../http/auth-middleware.js';
import { forbidden, HttpError, parseInput } from '../../http/errors.js';
import { idParams, notFound } from '../booking-common.js';
import { assertResourceScope, audit, locationScope, staffUser, type AdminDeps } from './common.js';
import { imageBody, removeMedia, storeUploadedImage } from './uploads.js';

type Limit = (req: Request, kind: 'write' | 'sensitive', event: string) => void;

const itemSelect = {
  id: true,
  slug: true,
  nameSq: true,
  nameEn: true,
  descriptionSq: true,
  descriptionEn: true,
  category: true,
  imagePath: true,
  isCombo: true,
  isActive: true,
  components: {
    select: { componentId: true, quantity: true, component: { select: { nameSq: true } } },
  },
} as const;

export function createFoodRouter({
  prisma,
  logger,
  now,
  uploadsDir,
  limit,
}: Pick<AdminDeps, 'prisma' | 'logger' | 'now' | 'uploadsDir'> & { limit: Limit }): Router {
  const router = Router();
  const superAdmin = requireRole('SUPER_ADMIN');

  async function items(where: object, locationId: string | undefined): Promise<AdminMenuItem[]> {
    const rows = await prisma.menuItem.findMany({
      where,
      select: {
        ...itemSelect,
        _count: { select: { orderItems: true } },
        locations: locationId
          ? { where: { locationId }, select: { priceCents: true, isAvailable: true } }
          : { take: 0, select: { priceCents: true, isAvailable: true } },
      },
      orderBy: [{ category: 'asc' }, { nameSq: 'asc' }],
    });
    return rows.map(({ _count, locations, components, ...row }) => ({
      ...row,
      components: components.map((c) => ({
        componentId: c.componentId,
        nameSq: c.component.nameSq,
        quantity: c.quantity,
      })),
      hasOrders: _count.orderItems > 0,
      offer: locations[0] ?? null,
    }));
  }

  /**
   * The menu: every item for a super admin; with ?location (any staff member of that cinema) the
   * cinema's price and availability too. Managers see active items only.
   */
  router.get('/menu', async (req, res) => {
    const { location } = parseInput(
      z.object({ location: z.uuid().optional() }).strict(),
      req.query,
    );
    const user = staffUser(req);
    if (user.role !== 'SUPER_ADMIN' && !location) throw forbidden();
    if (location) await locationScope(prisma, user, location);
    const where = user.role === 'SUPER_ADMIN' ? {} : { isActive: true };
    res.json(adminMenuResponseSchema.parse({ items: await items(where, location) }));
  });

  async function checkComponents(components: { componentId: string }[], selfId?: string) {
    if (components.length === 0) return;
    const found = await prisma.menuItem.findMany({
      where: { id: { in: components.map((c) => c.componentId) }, isCombo: false },
      select: { id: true },
    });
    if (found.length !== components.length || components.some((c) => c.componentId === selfId)) {
      throw new HttpError(422, 'unprocessable', 'A combo can only contain single items.', {
        fields: [{ path: 'components', code: 'invalid' }],
      });
    }
  }

  router.post('/menu', superAdmin, async (req, res) => {
    limit(req, 'write', 'admin_menu_write');
    const { components, ...input } = parseInput(menuItemInputSchema, req.body);
    await checkComponents(components);
    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.create({
        data: { ...input, isCombo: components.length > 0, components: { create: components } },
        select: { id: true },
      });
      await audit(tx, req, {
        action: 'menu.create',
        entityType: 'MenuItem',
        entityId: item.id,
        after: { ...input, components },
      });
      return item;
    });
    const [item] = await items({ id: created.id }, undefined);
    res.status(201).json({ item });
  });

  router.patch('/menu/:id', superAdmin, async (req, res) => {
    limit(req, 'write', 'admin_menu_write');
    const { id } = parseInput(idParams, req.params);
    const { components, ...input } = parseInput(menuItemInputSchema, req.body);
    await checkComponents(components, id);
    await prisma.$transaction(async (tx) => {
      const before = await tx.menuItem.findUnique({ where: { id }, select: itemSelect });
      if (!before) throw notFound();
      if (before.isCombo !== components.length > 0) {
        // An item that is part of combos cannot become a combo itself (and the other way round
        // would orphan the contents): create a new item instead.
        const usedIn = await tx.comboComponent.count({ where: { componentId: id } });
        if (usedIn > 0) {
          throw new HttpError(409, 'conflict', 'This item is part of a combo.', {
            fields: [{ path: 'components', code: 'in_combo' }],
          });
        }
      }
      await tx.comboComponent.deleteMany({ where: { comboId: id } });
      await tx.menuItem.update({
        where: { id },
        data: { ...input, isCombo: components.length > 0, components: { create: components } },
      });
      await audit(tx, req, {
        action: input.isActive || !before.isActive ? 'menu.update' : 'menu.deactivate',
        entityType: 'MenuItem',
        entityId: id,
        before: {
          ...before,
          components: before.components.map((c) => ({
            componentId: c.componentId,
            quantity: c.quantity,
          })),
        },
        after: { ...input, components },
      });
    });
    const [item] = await items({ id }, undefined);
    res.json({ item });
  });

  /** Only an item that was never ordered and is in no combo can be deleted; otherwise deactivate. */
  router.delete('/menu/:id', superAdmin, async (req, res) => {
    limit(req, 'sensitive', 'admin_menu_delete');
    const { id } = parseInput(idParams, req.params);
    const removed = await prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.findUnique({ where: { id }, select: itemSelect });
      if (!item) throw notFound();
      const [orders, usedIn] = await Promise.all([
        tx.bookingFoodItem.count({ where: { menuItemId: id } }),
        tx.comboComponent.count({ where: { componentId: id } }),
      ]);
      if (orders > 0 || usedIn > 0) {
        throw new HttpError(409, 'conflict', 'Deactivate this item instead.', {
          fields: [{ path: 'id', code: orders > 0 ? 'has_orders' : 'in_combo' }],
        });
      }
      await tx.menuItem.delete({ where: { id } });
      await audit(tx, req, {
        action: 'menu.delete',
        entityType: 'MenuItem',
        entityId: id,
        before: { slug: item.slug, nameSq: item.nameSq },
      });
      return item;
    });
    await removeMedia(uploadsDir, logger, [removed.imagePath]);
    res.status(204).end();
  });

  router.post(
    '/menu/:id/image',
    superAdmin,
    (req, _res, next) => {
      limit(req, 'sensitive', 'admin_menu_image');
      next();
    },
    imageBody,
    async (req, res) => {
      const { id } = parseInput(idParams, req.params);
      const exists = await prisma.menuItem.findUnique({
        where: { id },
        select: { imagePath: true },
      });
      if (!exists) throw notFound();
      const stored = await storeUploadedImage(req.body, MENU_IMAGE_RULES, uploadsDir);
      try {
        await prisma.$transaction(async (tx) => {
          await tx.menuItem.update({ where: { id }, data: { imagePath: stored.path } });
          await audit(tx, req, {
            action: 'menu.image',
            entityType: 'MenuItem',
            entityId: id,
            before: { imagePath: exists.imagePath },
            after: { imagePath: stored.path, bytes: stored.bytes, type: stored.type },
          });
        });
      } catch (error) {
        await removeMedia(uploadsDir, logger, [stored.path]);
        throw error;
      }
      await removeMedia(uploadsDir, logger, [exists.imagePath]);
      const [item] = await items({ id }, undefined);
      res.json({ item });
    },
  );

  /** A cinema's offer of one item: available or not, at its price (managers of that cinema). */
  router.put('/menu/:id/locations/:locationId', async (req, res) => {
    limit(req, 'write', 'admin_menu_offer');
    const { id, locationId } = parseInput(
      z.object({ id: z.uuid(), locationId: z.uuid() }),
      req.params,
    );
    if (!(await canAccessLocation(prisma, staffUser(req), locationId))) throw forbidden();
    const input = parseInput(menuOfferInputSchema, req.body);
    await prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.findUnique({ where: { id }, select: { isActive: true } });
      if (!item?.isActive) throw notFound();
      const before = await tx.locationMenuItem.findUnique({
        where: { locationId_menuItemId: { locationId, menuItemId: id } },
        select: { priceCents: true, isAvailable: true },
      });
      await tx.locationMenuItem.upsert({
        where: { locationId_menuItemId: { locationId, menuItemId: id } },
        create: { locationId, menuItemId: id, ...input },
        update: input,
      });
      await audit(tx, req, {
        action: 'menu.offer',
        entityType: 'LocationMenuItem',
        entityId: `${locationId}:${id}`,
        before,
        after: input,
      });
    });
    const [item] = await items({ id }, locationId);
    res.json({ item });
  });

  /**
   * Today's seat deliveries of one cinema (paid bookings only; refunded and cancelled ones are
   * gone), one order per booking and serve time, sorted by when it is due.
   */
  router.get('/deliveries', async (req, res) => {
    const { location } = parseInput(z.object({ location: z.uuid() }).strict(), req.query);
    await locationScope(prisma, staffUser(req), location);
    const place = await prisma.location.findUnique({
      where: { id: location },
      select: { timeZone: true },
    });
    if (!place) throw notFound();
    const today = toLocalDateTime(now(), place.timeZone).date;
    const rows = await prisma.bookingFoodItem.findMany({
      where: {
        fulfillment: 'DELIVER_TO_SEAT',
        booking: {
          status: 'CONFIRMED',
          showtime: {
            hall: { locationId: location },
            startsAt: {
              gte: zonedTimeToUtc(today, 0, place.timeZone),
              lt: zonedTimeToUtc(addDays(today, 1), 0, place.timeZone),
            },
          },
        },
      },
      select: {
        quantity: true,
        nameSq: true,
        serveTiming: true,
        deliveredAt: true,
        menuItem: { select: { nameEn: true } },
        booking: {
          select: {
            id: true,
            code: true,
            seats: {
              select: { seat: { select: { rowLabel: true, number: true } } },
              distinct: ['seatId'],
            },
            showtime: {
              select: {
                startsAt: true,
                hall: { select: { name: true } },
                movie: { select: { titleSq: true, titleEn: true } },
              },
            },
          },
        },
      },
    });
    const orders = new Map<string, DeliveriesResponse['orders'][number]>();
    for (const row of rows) {
      const timing = row.serveTiming ?? 'BEFORE_SHOW';
      const key = `${row.booking.id}:${timing}`;
      const start = row.booking.showtime.startsAt;
      const order = orders.get(key) ?? {
        bookingId: row.booking.id,
        code: row.booking.code,
        serveTiming: timing,
        dueAt: new Date(
          start.getTime() + (timing === 'DURING_SHOW' ? DURING_SHOW_DELAY_MINUTES * 60_000 : 0),
        ).toISOString(),
        startsAt: start.toISOString(),
        movieTitleSq: row.booking.showtime.movie.titleSq,
        movieTitleEn: row.booking.showtime.movie.titleEn,
        hallName: row.booking.showtime.hall.name,
        seats: row.booking.seats.map((s) => `${s.seat.rowLabel}${String(s.seat.number)}`),
        items: [],
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
      };
      order.items.push({ nameSq: row.nameSq, nameEn: row.menuItem.nameEn, quantity: row.quantity });
      if (!row.deliveredAt) order.deliveredAt = null;
      orders.set(key, order);
    }
    const body: DeliveriesResponse = {
      timeZone: place.timeZone,
      orders: [...orders.values()].sort(
        (a, b) => a.dueAt.localeCompare(b.dueAt) || a.hallName.localeCompare(b.hallName),
      ),
    };
    res.json(body);
  });

  /** Marks one order (a booking's seat delivery for one serve time) as delivered. Idempotent. */
  router.post('/deliveries/:id/delivered', async (req, res) => {
    limit(req, 'write', 'admin_delivery');
    const { id } = parseInput(idParams, req.params);
    const { serveTiming } = parseInput(deliveredInputSchema, req.body);
    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { status: true, showtime: { select: { hall: { select: { locationId: true } } } } },
    });
    await assertResourceScope(prisma, staffUser(req), booking?.showtime.hall.locationId);
    if (booking?.status !== 'CONFIRMED') throw notFound();
    const at = now();
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.bookingFoodItem.updateMany({
        where: { bookingId: id, fulfillment: 'DELIVER_TO_SEAT', serveTiming, deliveredAt: null },
        data: { deliveredAt: at, deliveredById: staffUser(req).id },
      });
      if (result.count > 0) {
        await audit(tx, req, {
          action: 'food.delivered',
          entityType: 'Booking',
          entityId: id,
          after: { serveTiming, items: result.count, deliveredAt: at.toISOString() },
        });
      }
      return result.count;
    });
    res.json({ delivered: updated });
  });

  return router;
}
