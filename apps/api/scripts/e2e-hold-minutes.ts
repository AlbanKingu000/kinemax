// Test-only: sets AppSettings.seatHoldMinutes in the TEST database (DATABASE_URL_TEST, name must
// end in "_test") for the e2e hold-expiry spec. Never touches DATABASE_URL.
// Usage: npm run e2e:hold-minutes -w @kinemax/api -- <1-60>
import { loadDotEnv, rootEnvPath } from '../src/config/load-dotenv.js';
import { assertTestDatabaseUrl } from '../src/db/database-url.js';
import { createPrismaClient } from '../src/db/prisma.js';

const minutes = Number(process.argv[2]);
if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
  console.error('Usage: e2e-hold-minutes <1-60>');
  process.exit(1);
}

loadDotEnv(rootEnvPath);
const prisma = createPrismaClient(assertTestDatabaseUrl(process.env.DATABASE_URL_TEST));
try {
  await prisma.appSettings.update({ where: { id: 1 }, data: { seatHoldMinutes: minutes } });
  console.log(`kinemax_test: seat holds last ${String(minutes)} minute(s).`);
} finally {
  await prisma.$disconnect();
}
