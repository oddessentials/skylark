import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function filterRow(row, previous, type) {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i++) {
    const left = i >= 4 ? row[i - 4] : 0;
    const up = previous ? previous[i] : 0;
    const upLeft = previous && i >= 4 ? previous[i - 4] : 0;
    let predicted = 0;
    if (type === 1) predicted = left;
    else if (type === 2) predicted = up;
    else if (type === 3) predicted = (left + up) >> 1;
    else if (type === 4) predicted = paeth(left, up, upLeft);
    out[i] = (row[i] - predicted) & 0xff;
  }
  return out;
}

function cost(filtered) {
  let sum = 0;
  for (const byte of filtered) sum += byte < 128 ? byte : 256 - byte;
  return sum;
}

export function encodePng(width, height, rgba) {
  const stride = width * 4;
  const rows = [];
  let previous = null;
  for (let y = 0; y < height; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    let best = null;
    let bestType = 0;
    for (let type = 0; type <= 4; type++) {
      const filtered = filterRow(row, previous, type);
      const score = cost(filtered);
      if (best === null || score < best.score) {
        best = { filtered, score };
        bestType = type;
      }
    }
    rows.push(Buffer.from([bestType]), best.filtered);
    previous = row;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

export function pngSize(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE) || buffer.toString('latin1', 12, 16) !== 'IHDR') {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
