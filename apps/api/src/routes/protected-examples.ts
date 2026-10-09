// Tiny protected routes that prove the authorization middleware (and serve as usage examples).

import { Router } from 'express';
import type { PrismaClient } from '../generated/prisma/client.js';
import { requireLocationAccess, requireRole } from '../http/auth-middleware.js';

export function createProtectedExamplesRouter(prisma: PrismaClient): Router {
  const router = Router();

  /** SUPER_ADMIN only. */
  router.get('/admin/ping', requireRole('SUPER_ADMIN'), (_req, res) => {
    res.json({ ok: true, scope: 'admin' });
  });

  /** Managers of this location, and super admins. */
  router.get(
    '/manage/locations/:locationId/ping',
    requireRole('LOCATION_MANAGER', 'SUPER_ADMIN'),
    requireLocationAccess(prisma, (req) => {
      const { locationId } = req.params;
      return typeof locationId === 'string' ? locationId : undefined;
    }),
    (req, res) => {
      res.json({ ok: true, scope: 'location', locationId: req.params.locationId });
    },
  );

  return router;
}
