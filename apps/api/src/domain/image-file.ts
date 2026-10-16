// Upload validation for movie images, from the bytes only (never the file name or the MIME type the
// client sends). Each format is walked structurally from its signature to its end marker: a file
// with bytes after the end (an appended script or archive, a "polyglot") is rejected. Accepted
// images are then decoded and re-encoded to WebP with sharp, which drops every metadata block
// (EXIF with GPS positions, XMP, comments) and anything hidden in the pixel data's container.
import sharp from 'sharp';

export type ImageType = 'jpeg' | 'png' | 'webp';

export interface ProbedImage {
  type: ImageType;
  width: number;
  height: number;
}

export type ImageRejection = 'type' | 'structure';

export class ImageRejectedError extends Error {
  override name = 'ImageRejectedError';
  constructor(readonly reason: ImageRejection) {
    super(`Image rejected: ${reason}`);
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const bad = (): never => {
  throw new ImageRejectedError('structure');
};

/** The image type from its signature, or undefined (SVG, GIF, HTML, anything else). */
export function sniffImageType(bytes: Buffer): ImageType | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return undefined;
}

interface Part {
  start: number;
  end: number;
}

// --- PNG: signature, then chunks (length, type, data, CRC) from IHDR to IEND ------------------

function walkPng(bytes: Buffer): { image: ProbedImage; parts: Part[] } {
  const parts: Part[] = [{ start: 0, end: 8 }];
  let pos = 8;
  let image: ProbedImage | undefined;
  for (;;) {
    if (pos + 12 > bytes.length) bad();
    const length = bytes.readUInt32BE(pos);
    const type = bytes.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type)) bad();
    if (parts.length === 1) {
      if (type !== 'IHDR' || length !== 13) bad();
      image = {
        type: 'png',
        width: bytes.readUInt32BE(pos + 8),
        height: bytes.readUInt32BE(pos + 12),
      };
    }
    parts.push({ start: pos, end });
    pos = end;
    if (type === 'IEND') break;
  }
  if (pos !== bytes.length || !image) bad();
  return { image: image as ProbedImage, parts };
}

// --- JPEG: SOI, marker segments, entropy-coded scans, EOI --------------------------------------

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function walkJpeg(bytes: Buffer): { image: ProbedImage; parts: Part[] } {
  const parts: Part[] = [{ start: 0, end: 2 }];
  let pos = 2;
  let image: ProbedImage | undefined;
  for (;;) {
    if (pos + 2 > bytes.length || bytes[pos] !== 0xff) bad();
    const marker = bytes[pos + 1] ?? 0;
    if (marker === 0xd9) {
      parts.push({ start: pos, end: pos + 2 });
      pos += 2;
      break;
    }
    if (marker === 0xff) {
      pos += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push({ start: pos, end: pos + 2 });
      pos += 2;
      continue;
    }
    if (pos + 4 > bytes.length) bad();
    const length = bytes.readUInt16BE(pos + 2);
    let end = pos + 2 + length;
    if (length < 2 || end > bytes.length) bad();
    if (SOF.has(marker)) {
      if (length < 8) bad();
      image = {
        type: 'jpeg',
        height: bytes.readUInt16BE(pos + 5),
        width: bytes.readUInt16BE(pos + 7),
      };
    }
    if (marker === 0xda) {
      // Entropy-coded data runs to the next marker that is neither a stuffed 0xFF00 nor a restart.
      while (end + 1 < bytes.length) {
        if (bytes[end] === 0xff) {
          const next = bytes[end + 1] ?? 0;
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        }
        end += 1;
      }
      if (end + 1 >= bytes.length) bad();
    }
    parts.push({ start: pos, end });
    pos = end;
  }
  if (pos !== bytes.length || !image) bad();
  return { image: image as ProbedImage, parts };
}

// --- WebP: RIFF container with even-padded chunks ---------------------------------------------

function walkWebp(bytes: Buffer): { image: ProbedImage; parts: Part[] } {
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) bad();
  const parts: Part[] = [];
  let pos = 12;
  let image: ProbedImage | undefined;
  while (pos < bytes.length) {
    if (pos + 8 > bytes.length) bad();
    const type = bytes.toString('latin1', pos, pos + 4);
    const size = bytes.readUInt32LE(pos + 4);
    const data = pos + 8;
    const end = data + size + (size % 2);
    if (end > bytes.length) bad();
    if (parts.length === 0) {
      if (type === 'VP8X' && size >= 10) {
        image = {
          type: 'webp',
          width: (bytes.readUIntLE(data + 4, 3) & 0xffffff) + 1,
          height: (bytes.readUIntLE(data + 7, 3) & 0xffffff) + 1,
        };
      } else if (type === 'VP8 ' && size >= 10) {
        if (bytes[data + 3] !== 0x9d || bytes[data + 4] !== 0x01 || bytes[data + 5] !== 0x2a) bad();
        image = {
          type: 'webp',
          width: bytes.readUInt16LE(data + 6) & 0x3fff,
          height: bytes.readUInt16LE(data + 8) & 0x3fff,
        };
      } else if (type === 'VP8L' && size >= 5) {
        if (bytes[data] !== 0x2f) bad();
        const bits = bytes.readUInt32LE(data + 1);
        image = { type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      } else {
        bad();
      }
    }
    parts.push({ start: pos, end });
    pos = end;
  }
  if (!image) bad();
  return { image: image as ProbedImage, parts };
}

function walk(bytes: Buffer) {
  const type = sniffImageType(bytes);
  if (!type) throw new ImageRejectedError('type');
  try {
    if (type === 'png') return walkPng(bytes);
    if (type === 'jpeg') return walkJpeg(bytes);
    return walkWebp(bytes);
  } catch (error) {
    // Reads past the end of a truncated file throw RangeError: the file is malformed.
    if (error instanceof RangeError) throw new ImageRejectedError('structure');
    throw error;
  }
}

/** Type and size of a JPEG, PNG or WebP file; throws ImageRejectedError for anything else. */
export function probeImage(bytes: Buffer): ProbedImage {
  const { image } = walk(bytes);
  if (image.width < 1 || image.height < 1) throw new ImageRejectedError('structure');
  return image;
}

/**
 * Decodes the (already checked) image and re-encodes it as WebP: EXIF orientation applied, no
 * metadata kept. Pixel data that cannot be decoded is rejected like a broken structure.
 */
export async function reencodeToWebp(bytes: Buffer, maxSide: number): Promise<Buffer> {
  try {
    return await sharp(bytes, { failOn: 'error', limitInputPixels: maxSide * maxSide })
      .rotate()
      .webp({ quality: 86 })
      .toBuffer();
  } catch {
    throw new ImageRejectedError('structure');
  }
}
