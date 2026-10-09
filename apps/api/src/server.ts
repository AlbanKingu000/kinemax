import { createApp } from './app.js';
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

const prisma = createPrismaClient(env.DATABASE_URL);
const app = createApp({
  checkDatabase: createDatabaseCheck(prisma),
  logger,
  corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
});

const server = app.listen(env.PORT, env.HOST, (error?: Error) => {
  if (error) {
    console.error(
      `Kinemax API could not listen on ${env.HOST}:${String(env.PORT)}: ${error.message}`,
    );
    process.exit(1);
  }
  logger.info(`Kinemax API listening on http://${env.HOST}:${String(env.PORT)} (${env.NODE_ENV})`);
});

function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down`);
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
