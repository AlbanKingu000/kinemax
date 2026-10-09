import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createErrorHandler, notFoundHandler } from './http/errors.js';
import type { Logger } from './logger.js';
import { createHealthRouter } from './routes/health.js';

export const JSON_BODY_LIMIT = '100kb';

export interface AppDeps {
  checkDatabase: () => Promise<void>;
  logger: Logger;
  /** Exact extra origins allowed to call the API cross-origin. Empty: same-origin only. */
  corsAllowedOrigins: readonly string[];
}

export function createApp({ checkDatabase, logger, corsAllowedOrigins }: AppDeps): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  // The web app talks to the API through the Vite proxy (same origin), so no CORS headers are sent
  // unless an exact origin is allowlisted. Never a wildcard.
  app.use(cors({ origin: [...corsAllowedOrigins], credentials: true }));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api', createHealthRouter({ checkDatabase, logger }));

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
