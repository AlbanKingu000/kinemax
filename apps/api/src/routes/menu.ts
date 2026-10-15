import { menuQuerySchema, slugSchema, type MenuResponse } from '@kinemax/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { HttpError, parseInput } from '../http/errors.js';
import { CATALOG_MAX_AGE_SECONDS } from './catalog.js';

const params = z.object({ slug: slugSchema });
const notFound = () => new HttpError(404, 'not_found', 'Not found.');

/** What a cinema offers right now: active items it lists as available, at its prices. */
export function availableMenuWhere(locationId: string) {
  return {
    locationId,
    isAvailable: true,
    menuItem: { isActive: true },
  } satisfies Prisma.LocationMenuItemWhereInput;
}

/**
 * GET /api/locations/:slug/menu: the food & drinks of one cinema with its prices. With
 * ?showtime=<id> (a show of that cinema) it also tells whether its hall brings food to the seat.
 */
export function createMenuRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get('/locations/:slug/menu', async (req, res) => {
    const { slug } = parseInput(params, req.params);
    const query = parseInput(menuQuerySchema, req.query);
    const location = await prisma.location.findFirst({
      where: { slug, isActive: true },
      select: { id: true, slug: true, name: true },
    });
    if (!location) throw notFound();

    let seatDelivery: boolean | null = null;
    if (query.showtime) {
      const show = await prisma.showtime.findFirst({
        where: { id: query.showtime, isActive: true, hall: { locationId: location.id } },
        select: { hall: { select: { hallType: { select: { allowsSeatDelivery: true } } } } },
      });
      if (!show) throw notFound();
      seatDelivery = show.hall.hallType.allowsSeatDelivery;
    }

    const rows = await prisma.locationMenuItem.findMany({
      where: availableMenuWhere(location.id),
      select: {
        priceCents: true,
        menuItem: {
          select: {
            id: true,
            slug: true,
            category: true,
            nameSq: true,
            nameEn: true,
            descriptionSq: true,
            descriptionEn: true,
            imagePath: true,
            isCombo: true,
            components: {
              select: {
                quantity: true,
                component: { select: { slug: true, nameSq: true, nameEn: true } },
              },
            },
          },
        },
      },
      // Categories in their declared (display) order, then cheaper first.
      orderBy: [{ menuItem: { category: 'asc' } }, { priceCents: 'asc' }],
    });
    const body: MenuResponse = {
      location: { slug: location.slug, name: location.name },
      items: rows.map(({ priceCents, menuItem: { components, ...item } }) => ({
        ...item,
        priceCents,
        components: components
          .map(({ quantity, component }) => ({ ...component, quantity }))
          .sort((a, b) => a.slug.localeCompare(b.slug)),
      })),
      seatDelivery,
    };
    // Prices and availability change rarely (admin edits): a short public cache, like the catalog.
    if (res.getHeader('Set-Cookie') === undefined) {
      res.set('Cache-Control', `public, max-age=${String(CATALOG_MAX_AGE_SECONDS)}`);
    }
    res.json(body);
  });

  return router;
}
