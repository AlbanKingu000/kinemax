import type { HealthResponse } from '@kinemax/shared';
import { Router } from 'express';
import { describeError, type Logger } from '../logger.js';

export interface HealthDeps {
  checkDatabase: () => Promise<void>;
  logger: Logger;
}

export function createHealthRouter({ checkDatabase, logger }: HealthDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await checkDatabase();
      res.json({ status: 'ok', db: 'up' } satisfies HealthResponse);
    } catch (error) {
      logger.error('Database health check failed', describeError(error));
      res.status(503).json({ status: 'error', db: 'down' } satisfies HealthResponse);
    }
  });

  return router;
}
