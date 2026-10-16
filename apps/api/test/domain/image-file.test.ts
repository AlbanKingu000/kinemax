import { describe, expect, it } from 'vitest';
import {
  ImageRejectedError,
  probeImage,
  reencodeToWebp,
  sniffImageType,
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

describe('reencodeToWebp', () => {
  it('re-encodes to WebP of the same size and drops text metadata', async () => {
    const webp = await reencodeToWebp(makePng(300, 450, { text: 'GPS 42.66 21.16' }), 8000);
    expect(probeImage(webp)).toEqual({ type: 'webp', width: 300, height: 450 });
    expect(webp.toString('latin1')).not.toContain('GPS');
  });

  it('rejects pixel data that cannot be decoded', async () => {
    await expect(reencodeToWebp(makeJpeg(300, 450), 8000)).rejects.toMatchObject({
      reason: 'structure',
    });
  });
});
