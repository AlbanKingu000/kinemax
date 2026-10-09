import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 });
  return new PrismaClient({ adapter });
}

/** Returns a check that resolves when the database answers a trivial query, and rejects otherwise. */
export function createDatabaseCheck(prisma: PrismaClient): () => Promise<void> {
  return async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
}
