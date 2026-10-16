import { describe, expect, it } from 'vitest';
import {
  ImageRejectedError,
  probeImage,
  sniffImageType,
  stripImageMetadata,
} from '../../src/domain/image-file.js';
import { makeJpeg, makePng, makeWebp } from '../support/images.js';

const reason = (bytes: Buffer) => {
  try {
    probeImage(bytes);
  } catch (error) {
    if (error instanceof ImageRejectedError) return error.reason;
    throw error;
  }
  return 'accepted';
};

describe('probeImage', () => {
  it('reads type and size of PNG, JPEG and WebP from the bytes', () => {
    expect(probeImage(makePng(300, 450))).toEqual({ type: 'png', width: 300, height: 450 });
    expect(probeImage(makeJpeg(1920, 1080))).toEqual({ type: 'jpeg', width: 1920, height: 1080 });
    expect(probeImage(makeWebp(640, 960))).toEqual({ type: 'webp', width: 640, height: 960 });
  });

  it('rejects SVG, HTML, GIF and empty files by their signature', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(reason(svg)).toBe('type');
    expect(reason(Buffer.from('<!doctype html><script>alert(1)</script>'))).toBe('type');
    expect(reason(Buffer.from('GIF89a'))).toBe('type');
    expect(reason(Buffer.alloc(0))).toBe('type');
    expect(sniffImageType(Buffer.from('RIFF0000WAVE'))).toBeUndefined();
  });

  it('rejects polyglots: anything after the end of the image', () => {
    const tail = Buffer.from('<script>alert(1)</script>');
    expect(reason(Buffer.concat([makePng(300, 450), tail]))).toBe('structure');
    expect(reason(Buffer.concat([makeJpeg(300, 450), tail]))).toBe('structure');
    expect(reason(Buffer.concat([makeWebp(300, 450), tail]))).toBe('structure');
  });

  it('rejects truncated and malformed files', () => {
    const png = makePng(300, 450);
    expect(reason(png.subarray(0, png.length - 6))).toBe('structure');
    expect(reason(makeJpeg(300, 450).subarray(0, 20))).toBe('structure');
    expect(reason(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe(
      'structure',
    );
    const webp = makeWebp(300, 450);
    expect(reason(webp.subarray(0, webp.length - 2))).toBe('structure');
  });
});

describe('stripImageMetadata', () => {
  it('removes EXIF and text metadata and keeps a valid image of the same size', () => {
    const secret = 'GPS 42.66 21.16';
    for (const original of [
      makePng(300, 450, { text: secret }),
      makeJpeg(300, 450, { exif: secret }),
      makeWebp(300, 450, { exif: secret }),
    ]) {
      expect(original.toString('latin1')).toContain(secret);
      const stripped = stripImageMetadata(original);
      expect(stripped.toString('latin1')).not.toContain(secret);
      expect(probeImage(stripped)).toEqual(probeImage(original));
      expect(stripped.length).toBeLessThan(original.length);
    }
    // WebP: the header no longer announces an EXIF chunk.
    const webp = stripImageMetadata(makeWebp(300, 450, { exif: secret }));
    expect((webp[20] ?? 0) & 0x08).toBe(0);
  });

  it('keeps a file without metadata byte for byte', () => {
    const png = makePng(10, 10);
    expect(stripImageMetadata(png).equals(png)).toBe(true);
  });
});
