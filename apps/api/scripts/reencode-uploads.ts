// Development: re-encodes movie images uploaded before WebP re-encoding existed (task 10) into
// WebP without metadata, points the movies at the new files and deletes the old ones. Idempotent:
// files that are already .webp are skipped. Usage: npm run media:reencode -w @kinemax/api
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { MOVIE_IMAGE_RULES } from '@kinemax/shared';
import { loadDotEnv, rootEnvPath } from '../src/config/load-dotenv.js';
import { createPrismaClient } from '../src/db/prisma.js';
import { probeImage, reencodeToWebp } from '../src/domain/image-file.js';
import { MEDIA_URL_PREFIX, mediaFileOf } from '../src/routes/media.js';

loadDotEnv(rootEnvPath);
const uploadsDir = resolve(process.env.UPLOADS_DIR ?? resolve(dirname(rootEnvPath), 'uploads'));
const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');
let done = 0;
try {
  const movies = await prisma.movie.findMany({
    select: { id: true, posterPath: true, backdropPath: true },
  });
  for (const movie of movies) {
    for (const column of ['posterPath', 'backdropPath'] as const) {
      const file = movie[column] ? mediaFileOf(movie[column]) : undefined;
      if (!file || file.endsWith('.webp')) continue;
      const original = await readFile(join(uploadsDir, file));
      probeImage(original);
      const next = `${randomUUID()}.webp`;
      await writeFile(
        join(uploadsDir, next),
        await reencodeToWebp(original, MOVIE_IMAGE_RULES.maxSide),
        { flag: 'wx' },
      );
      await prisma.movie.update({
        where: { id: movie.id },
        data: { [column]: `${MEDIA_URL_PREFIX}${next}` },
      });
      await unlink(join(uploadsDir, file));
      done += 1;
    }
  }
  console.info(`Re-encoded ${String(done)} uploaded image(s) to WebP.`);
} finally {
  await prisma.$disconnect();
}
