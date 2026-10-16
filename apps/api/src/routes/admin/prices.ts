// Prices and settings (SUPER_ADMIN only). Price rules are versioned: a change closes the version in
// effect (validTo = now) and adds a new one from now, so bookings priced earlier keep their exact
// rule history. G14 (database) refuses overlapping active versions of one key (23P01 -> 409).
import {
  adjustmentInputSchema,
  appSettingsSchema,
  basePriceInputSchema,
  discountInputSchema,
  priceKindSchema,
  surchargeInputSchema,
  suitePriceInputSchema,
  type AdminPricesResponse,
} from '@kinemax/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { requireRole } from '../../http/auth-middleware.js';
import { HttpError, parseInput } from '../../http/errors.js';
import { idParams, notFound, type Db } from '../booking-common.js';
import { audit, staffUser, type AdminDeps } from './common.js';

type Limit = (req: Request, kind: 'write' | 'sensitive', event: string) => void;

/** A version in effect at `at`: active, started, not yet ended. */
const inEffect = (at: Date) => ({
  isActive: true,
  validFrom: { lte: at },
  OR: [{ validTo: null }, { validTo: { gt: at } }],
});

const iso = <T extends { validFrom: Date }>(row: T) => ({
  ...row,
  validFrom: row.validFrom.toISOString(),
});

/** Ends a version at `at`; one that never took effect (started at `at`) is switched off instead. */
async function closeVersion(
  close: (data: { validTo: Date } | { isActive: false }) => Promise<unknown>,
  validFrom: Date,
  at: Date,
) {
  await close(validFrom.getTime() >= at.getTime() ? { isActive: false } : { validTo: at });
}

/** Serializes changes of one rule key (the G14 constraint is the backstop). */
const lockKey = (tx: Db, key: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

export function createPricesRouter({
  prisma,
  now,
  limit,
}: Pick<AdminDeps, 'prisma' | 'now'> & { limit: Limit }): Router {
  const router = Router();
  router.use(['/prices', '/settings'], requireRole('SUPER_ADMIN'));

  router.get('/prices', async (_req, res) => {
    const at = now();
    const [
      hallTypes,
      locations,
      categories,
      suites,
      base,
      surchargeRows,
      discount,
      suite,
      adjustment,
    ] = await Promise.all([
      prisma.hallType.findMany({
        select: { id: true, code: true, nameSq: true, nameEn: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.location.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.ticketCategory.findMany({
        select: { id: true, code: true, nameSq: true, nameEn: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.hall.findMany({
        where: { wholeHallOnly: true },
        select: { id: true, name: true, location: { select: { name: true } } },
        orderBy: [{ location: { name: 'asc' } }, { name: 'asc' }],
      }),
      prisma.hallTypePrice.findMany({
        where: inEffect(at),
        select: { id: true, validFrom: true, hallTypeId: true, locationId: true, priceCents: true },
      }),
      prisma.seatTypeSurcharge.findMany({
        where: inEffect(at),
        select: { id: true, validFrom: true, seatType: true, amountCents: true },
      }),
      prisma.ticketCategoryDiscount.findMany({
        where: inEffect(at),
        select: { id: true, validFrom: true, ticketCategoryId: true, kind: true, value: true },
      }),
      prisma.wholeHallPrice.findMany({
        where: inEffect(at),
        select: { id: true, validFrom: true, hallId: true, priceCents: true },
      }),
      prisma.timePriceAdjustment.findMany({
        where: inEffect(at),
        select: {
          id: true,
          validFrom: true,
          locationId: true,
          nameSq: true,
          nameEn: true,
          daysOfWeek: true,
          startMinute: true,
          endMinute: true,
          kind: true,
          value: true,
          priority: true,
        },
        orderBy: [{ priority: 'desc' }, { startMinute: 'asc' }],
      }),
    ]);
    const body: AdminPricesResponse = {
      hallTypes,
      locations,
      categories,
      suites: suites.map((h) => ({ id: h.id, name: h.name, locationName: h.location.name })),
      base: base.map(iso),
      surcharge: surchargeRows.map(iso),
      discount: discount.map(iso),
      suite: suite.map(iso),
      adjustment: adjustment.map(iso),
    };
    res.json(body);
  });

  /**
   * Sets the price of a keyed rule (base price, seat surcharge, category discount, suite price):
   * the version in effect for that key is closed and a new one starts now.
   */
  router.post('/prices/:kind', async (req, res) => {
    limit(req, 'write', 'admin_price_write');
    const kind = parseInput(z.object({ kind: priceKindSchema }), req.params).kind;
    const at = now();
    const entity = await prisma.$transaction(async (tx) => {
      const apply = async () => {
        switch (kind) {
          case 'base': {
            const input = parseInput(basePriceInputSchema, req.body);
            const key = { hallTypeId: input.hallTypeId, locationId: input.locationId };
            await lockKey(tx, `base:${input.hallTypeId}:${input.locationId ?? 'global'}`);
            const current = await tx.hallTypePrice.findFirst({
              where: { ...key, ...inEffect(at) },
            });
            if (current) {
              await closeVersion(
                (data) => tx.hallTypePrice.update({ where: { id: current.id }, data }),
                current.validFrom,
                at,
              );
            }
            const created = await tx.hallTypePrice.create({ data: { ...input, validFrom: at } });
            return { created, before: current };
          }
          case 'surcharge': {
            const input = parseInput(surchargeInputSchema, req.body);
            await lockKey(tx, `surcharge:${input.seatType}`);
            const current = await tx.seatTypeSurcharge.findFirst({
              where: { seatType: input.seatType, ...inEffect(at) },
            });
            if (current) {
              await closeVersion(
                (data) => tx.seatTypeSurcharge.update({ where: { id: current.id }, data }),
                current.validFrom,
                at,
              );
            }
            const created = await tx.seatTypeSurcharge.create({
              data: { ...input, validFrom: at },
            });
            return { created, before: current };
          }
          case 'discount': {
            const input = parseInput(discountInputSchema, req.body);
            await lockKey(tx, `discount:${input.ticketCategoryId}`);
            const current = await tx.ticketCategoryDiscount.findFirst({
              where: { ticketCategoryId: input.ticketCategoryId, ...inEffect(at) },
            });
            if (current) {
              await closeVersion(
                (data) => tx.ticketCategoryDiscount.update({ where: { id: current.id }, data }),
                current.validFrom,
                at,
              );
            }
            const created = await tx.ticketCategoryDiscount.create({
              data: { ...input, validFrom: at },
            });
            return { created, before: current };
          }
          case 'suite': {
            const input = parseInput(suitePriceInputSchema, req.body);
            const hall = await tx.hall.findUnique({
              where: { id: input.hallId },
              select: { wholeHallOnly: true },
            });
            if (!hall?.wholeHallOnly) {
              throw new HttpError(422, 'unprocessable', 'Only suites have a whole-hall price.', {
                fields: [{ path: 'hallId', code: 'not_suite' }],
              });
            }
            await lockKey(tx, `suite:${input.hallId}`);
            const current = await tx.wholeHallPrice.findFirst({
              where: { hallId: input.hallId, ...inEffect(at) },
            });
            if (current) {
              await closeVersion(
                (data) => tx.wholeHallPrice.update({ where: { id: current.id }, data }),
                current.validFrom,
                at,
              );
            }
            const created = await tx.wholeHallPrice.create({ data: { ...input, validFrom: at } });
            return { created, before: current };
          }
          case 'adjustment': {
            const input = parseInput(adjustmentInputSchema, req.body);
            const created = await tx.timePriceAdjustment.create({
              data: { ...input, validFrom: at },
            });
            return { created, before: null };
          }
        }
      };
      const result = await apply();
      await audit(tx, req, {
        action: `price.${kind}.set`,
        entityType: 'PriceRule',
        entityId: result.created.id,
        before: result.before ? (snapshot(result.before) as Prisma.InputJsonObject) : null,
        after: snapshot(result.created) as Prisma.InputJsonObject,
      });
      return result.created;
    });
    res.status(201).json({ id: entity.id });
  });

  /** Replaces a time adjustment: the old version ends now, the new one starts now. */
  router.put('/prices/adjustment/:id', async (req, res) => {
    limit(req, 'write', 'admin_price_write');
    const { id } = parseInput(idParams, req.params);
    const input = parseInput(adjustmentInputSchema, req.body);
    const at = now();
    const created = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `adjustment:${id}`);
      const current = await tx.timePriceAdjustment.findFirst({ where: { id, ...inEffect(at) } });
      if (!current) throw notFound();
      await closeVersion(
        (data) => tx.timePriceAdjustment.update({ where: { id }, data }),
        current.validFrom,
        at,
      );
      const row = await tx.timePriceAdjustment.create({ data: { ...input, validFrom: at } });
      await audit(tx, req, {
        action: 'price.adjustment.set',
        entityType: 'PriceRule',
        entityId: row.id,
        before: snapshot(current) as Prisma.InputJsonObject,
        after: snapshot(row) as Prisma.InputJsonObject,
      });
      return row;
    });
    res.json({ id: created.id });
  });

  /** Ends a rule now (its history stays). */
  router.post('/prices/:kind/:id/end', async (req, res) => {
    limit(req, 'sensitive', 'admin_price_end');
    const { kind, id } = parseInput(z.object({ kind: priceKindSchema, id: z.uuid() }), req.params);
    const at = now();
    await prisma.$transaction(async (tx) => {
      const table = {
        base: tx.hallTypePrice,
        surcharge: tx.seatTypeSurcharge,
        adjustment: tx.timePriceAdjustment,
        discount: tx.ticketCategoryDiscount,
        suite: tx.wholeHallPrice,
      }[kind] as unknown as {
        findFirst: (args: object) => Promise<{ validFrom: Date } | null>;
        update: (args: object) => Promise<unknown>;
      };
      const current = await table.findFirst({ where: { id, ...inEffect(at) } });
      if (!current) throw notFound();
      await closeVersion((data) => table.update({ where: { id }, data }), current.validFrom, at);
      await audit(tx, req, {
        action: `price.${kind}.end`,
        entityType: 'PriceRule',
        entityId: id,
        before: snapshot(current) as Prisma.InputJsonObject,
        after: { validTo: at.toISOString() },
      });
    });
    res.status(204).end();
  });

  router.get('/settings', async (_req, res) => {
    const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } });
    res.json({
      seatHoldMinutes: settings.seatHoldMinutes,
      cancellationCutoffMinutes: settings.cancellationCutoffMinutes,
    });
  });

  router.put('/settings', async (req, res) => {
    limit(req, 'sensitive', 'admin_settings');
    const input = parseInput(appSettingsSchema, req.body);
    const saved = await prisma.$transaction(async (tx) => {
      const before = await tx.appSettings.findUniqueOrThrow({ where: { id: 1 } });
      const after = await tx.appSettings.update({
        where: { id: 1 },
        data: { ...input, updatedById: staffUser(req).id },
      });
      await audit(tx, req, {
        action: 'settings.update',
        entityType: 'AppSettings',
        entityId: '1',
        before: {
          seatHoldMinutes: before.seatHoldMinutes,
          cancellationCutoffMinutes: before.cancellationCutoffMinutes,
        },
        after: input,
      });
      return after;
    });
    res.json({
      seatHoldMinutes: saved.seatHoldMinutes,
      cancellationCutoffMinutes: saved.cancellationCutoffMinutes,
    });
  });

  return router;
}

/** A rule row for the audit log (dates as ISO strings). */
function snapshot(row: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]),
  );
}
