import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.js';
import { SESSION_CLEANUP_INTERVAL_MS } from './auth/auth-config.js';
import { createSessionService, startSessionCleanup } from './auth/sessions.js';
import { HOLD_CLEANUP_INTERVAL_MS, startHoldCleanup } from './db/holds.js';
import { EnvError, readEnv } from './config/env.js';
import { loadDotEnv, rootEnvPath } from './config/load-dotenv.js';
import { createDatabaseCheck, createPrismaClient } from './db/prisma.js';
import { consoleLogger as logger } from './logger.js';

loadDotEnv(rootEnvPath);

let env;
try {
  env = readEnv(process.env);
} catch (error) {
  if (error instanceof EnvError) {
    console.error(`Kinemax API failed to start.\n${error.message}`);
    process.exit(1);
  }
  throw error;
}

let csrfSecret = env.CSRF_SECRET;
if (csrfSecret === undefined) {
  // Development/test only (required in production): CSRF tokens stop working after a restart,
  // the web app simply fetches a new one.
  csrfSecret = randomBytes(32).toString('base64url');
  logger.info('CSRF_SECRET not set: using a random key for this process');
}

// Uploaded images live outside the web build and outside the repository's tracked files.
const uploadsDir = resolve(env.UPLOADS_DIR ?? resolve(dirname(rootEnvPath), 'uploads'));
mkdirSync(uploadsDir, { recursive: true });

const prisma = createPrismaClient(env.DATABASE_URL);
const sessions = createSessionService(prisma);
const app = createApp({
  prisma,
  checkDatabase: createDatabaseCheck(prisma),
  logger,
  corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
  uploadsDir,
  auth: {
    sessions,
    cookieSecure: env.COOKIE_SECURE,
    csrfSecret,
    appOrigin: env.APP_ORIGIN,
    trustProxy: env.TRUST_PROXY,
  },
});
const stopSessionCleanup = startSessionCleanup(sessions, logger, SESSION_CLEANUP_INTERVAL_MS);
const stopHoldCleanup = startHoldCleanup(prisma, logger, HOLD_CLEANUP_INTERVAL_MS);

const server = app.listen(env.PORT, env.HOST, (error?: Error) => {
  if (error) {
    console.error(
      `Kinemax API could not listen on ${env.HOST}:${String(env.PORT)}: ${error.message}`,
    );
    process.exit(1);
  }
  logger.info(
    `Kinemax API listening on http://${env.HOST}:${String(env.PORT)} (${env.NODE_ENV}, app origin ${env.APP_ORIGIN})`,
  );
});

function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down`);
  stopSessionCleanup();
  stopHoldCleanup();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
