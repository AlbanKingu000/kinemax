// The one upload pipeline for admin images (movie posters and backdrops, menu items): the type is
// decided by the bytes (never the name or the client's MIME type), the structure is walked to its
// end, the size is checked, then sharp re-encodes it to WebP without metadata under a random name
// in UPLOADS_DIR (served by GET /api/media/:file).
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MOVIE_IMAGE_RULES } from '@kinemax/shared';
import express from 'express';
import { ImageRejectedError, probeImage, reencodeToWebp } from '../../domain/image-file.js';
import { HttpError } from '../../http/errors.js';
import type { Logger } from '../../logger.js';
import { MEDIA_URL_PREFIX, mediaFileOf } from '../media.js';

/** Raw body of an image upload: any content type (the bytes decide), at most 5 MB (413). */
export const imageBody = express.raw({ type: () => true, limit: MOVIE_IMAGE_RULES.maxBytes });

export function unprocessableImage(reason: string): HttpError {
  return new HttpError(422, 'unprocessable', 'The image was not accepted.', {
    fields: [{ path: 'file', code: reason }],
  });
}

/**
 * Checks and stores an uploaded image; returns its media path, the stored size and the uploaded
 * type (for the audit log). Throws 422 with the reason (empty, type, structure, dimensions).
 */
export async function storeUploadedImage(
  body: unknown,
  rules: { minWidth: number; minHeight: number },
  uploadsDir: string,
): Promise<{ path: string; bytes: number; type: string }> {
  if (!Buffer.isBuffer(body) || body.length === 0) throw unprocessableImage('empty');
  let bytes: Buffer;
  let type: string;
  try {
    const image = probeImage(body);
    if (
      image.width < rules.minWidth ||
      image.height < rules.minHeight ||
      image.width > MOVIE_IMAGE_RULES.maxSide ||
      image.height > MOVIE_IMAGE_RULES.maxSide
    ) {
      throw unprocessableImage('dimensions');
    }
    bytes = await reencodeToWebp(body, MOVIE_IMAGE_RULES.maxSide);
    type = image.type;
  } catch (error) {
    if (error instanceof ImageRejectedError) throw unprocessableImage(error.reason);
    throw error;
  }
  const file = `${randomUUID()}.webp`;
  await writeFile(join(uploadsDir, file), bytes, { flag: 'wx' });
  return { path: `${MEDIA_URL_PREFIX}${file}`, bytes: bytes.length, type };
}

/** Deletes our uploaded files behind these paths (others, e.g. /seed/..., are ignored). */
export async function removeMedia(uploadsDir: string, logger: Logger, paths: (string | null)[]) {
  for (const path of paths) {
    const file = path ? mediaFileOf(path) : undefined;
    if (!file) continue;
    await unlink(join(uploadsDir, file)).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('media.unlink_failed', { file });
      }
    });
  }
}
