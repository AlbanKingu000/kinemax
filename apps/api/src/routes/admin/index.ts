// The admin panel API. Everything under /api/admin needs a staff role (SUPER_ADMIN or
// LOCATION_MANAGER); location-scoped routes check the location on top (common.ts). CSRF runs
// globally for writes (app.ts).
import type { AdminLocationsResponse } from '@kinemax/shared';
import { Router } from 'express';
import { requireRole } from '../../http/auth-middleware.js';
import { type AdminDeps, locationScope, staffUser } from './common.js';

export function createAdminRouter(deps: AdminDeps): Router {
  const { prisma } = deps;
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

  return router;
}
