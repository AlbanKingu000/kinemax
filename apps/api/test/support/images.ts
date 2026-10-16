// Small image files built in memory for upload tests. PNGs are real (decodable) images; the JPEG
// and WebP builders produce the structure the validator walks (markers, chunks, sizes).
import { crc32, deflateSync } from 'node:zlib';

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A real width × height PNG (crimson pixels), optionally with a text chunk (metadata). */
export function makePng(width: number, height: number, options: { text?: string } = {}): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set([0xb3, 0x13, 0x2f], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const text = options.text
    ? [
        pngChunk(
          'tEXt',
          Buffer.concat([Buffer.from('Comment'), Buffer.alloc(1), Buffer.from(options.text)]),
        ),
      ]
    : [];
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    ...text,
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const segment = (marker: number, data: Buffer) => {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([head, data]);
};

/** A JPEG structure: SOI, APP0, optional EXIF (APP1), SOF0 with the size, SOS + data, EOI. */
export function makeJpeg(width: number, height: number, options: { exif?: string } = {}) {
  const sof = Buffer.alloc(6);
  sof[0] = 8;
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  const jfif = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const exif = options.exif
    ? [
        segment(
          0xe1,
          Buffer.concat([Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0]), Buffer.from(options.exif)]),
        ),
      ]
    : [];
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, jfif),
    ...exif,
    segment(0xc0, sof),
    segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    // Scan data with a stuffed 0xFF00 and a restart marker inside.
    Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function riffChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, Buffer.alloc(data.length % 2)]);
}

/** A WebP structure: VP8X (with the EXIF flag when given), VP8L, optional EXIF chunk. */
export function makeWebp(width: number, height: number, options: { exif?: string } = {}) {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = options.exif ? 0x08 : 0;
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);
  const vp8l = Buffer.alloc(5);
  vp8l[0] = 0x2f;
  vp8l.writeUInt32LE((((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)) >>> 0, 1);
  const body = Buffer.concat([
    riffChunk('VP8X', vp8x),
    riffChunk('VP8L', vp8l),
    ...(options.exif ? [riffChunk('EXIF', Buffer.from(options.exif))] : []),
  ]);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}
