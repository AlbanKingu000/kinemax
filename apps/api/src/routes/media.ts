// GET /api/media/:file: uploaded movie images, stored outside the web build (UPLOADS_DIR). Only
// names the upload created (random UUID + our own extension) are served, with the Content-Type
// of that extension, nosniff and a CSP that allows nothing, so a file can never run as a page.
import { Router } from 'express';

export const MEDIA_URL_PREFIX = '/api/media/';
const MEDIA_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** The stored file name behind a media URL, or undefined for any other path. */
export function mediaFileOf(path: string): string | undefined {
  if (!path.startsWith(MEDIA_URL_PREFIX)) return undefined;
  const file = path.slice(MEDIA_URL_PREFIX.length);
  return MEDIA_FILE.test(file) ? file : undefined;
}

export function createMediaRouter(uploadsDir: string): Router {
  const router = Router();
  router.get('/media/:file', (req, res, next) => {
    const file = req.params.file;
    const match = MEDIA_FILE.exec(file);
    if (!match?.[1]) {
      next();
      return;
    }
    res.set({
      'Content-Type': CONTENT_TYPE[match[1]] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // Random names never change content: cache for a year.
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.sendFile(file, { root: uploadsDir, dotfiles: 'deny', headers: {} }, (error) => {
      if (!error) return;
      res.set('Cache-Control', 'no-store');
      res.removeHeader('Content-Type');
      next();
    });
  });
  return router;
}
