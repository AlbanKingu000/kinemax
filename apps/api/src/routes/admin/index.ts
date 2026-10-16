// The admin panel API. Everything under /api/admin needs a staff role (SUPER_ADMIN or
// LOCATION_MANAGER); location-scoped routes check the location on top (common.ts). CSRF runs
// globally for writes (app.ts).
import type { AdminLocationsResponse } from '@kinemax/shared';
import { Router } from 'express';
import { requireRole } from '../../http/auth-middleware.js';
import { type AdminDeps, createAdminLimiters, locationScope, staffUser } from './common.js';
import { createCheckinRouter } from './checkin.js';
import { createFoodRouter } from './food.js';
import { createHallsRouter } from './halls.js';
import { createMoviesRouter } from './movies.js';
import { createPricesRouter } from './prices.js';
import { createShowtimesRouter } from './showtimes.js';
import { createStatsHandler } from './stats.js';
import { createUsersRouter } from './users.js';

export function createAdminRouter(deps: AdminDeps): Router {
  const { prisma, now } = deps;
  const limit = createAdminLimiters(deps.rateLimits, deps.logger);
  const router = Router();
  router.use(requireRole('SUPER_ADMIN', 'LOCATION_MANAGER'));

  router.get('/locations', async (req, res) => {
    const scope = await locationScope(prisma, staffUser(req), undefined);
    const locations = await prisma.location.findMany({
      where: scope === null ? {} : { id: { in: scope } },
      select: { id: true, slug: true, name: true, city: true, timeZone: true },
      orderBy: { name: 'asc' },
    });
    const body: AdminLocationsResponse = { locations };
    res.json(body);
  });

  router.get('/stats', createStatsHandler(prisma, now));
  router.use(createMoviesRouter({ ...deps, limit }));
  router.use(createShowtimesRouter({ ...deps, limit }));
  router.use(createHallsRouter({ ...deps, limit }));
  router.use(createPricesRouter({ ...deps, limit }));
  router.use(createFoodRouter({ ...deps, limit }));
  router.use(createCheckinRouter({ ...deps, limit }));
  router.use(createUsersRouter({ ...deps, limit }));

  return router;
}
