const SEPARATE_FILE = 0x100;
const SIZE_64_BIT = 0x2000;
const FORMATS = new Set(['PF_DXT5', 'PF_DXT1', 'PF_B8G8R8A8']);

function findFormat(uexp) {
  let at = uexp.indexOf('PF_', 0, 'latin1');
  while (at !== -1) {
    const end = uexp.indexOf(0, at);
    const name = uexp.subarray(at, end).toString('latin1');
    if (at >= 4 && uexp.readInt32LE(at - 4) === name.length + 1 && FORMATS.has(name)) {
      return { name, next: end + 1 };
    }
    at = uexp.indexOf('PF_', at + 1, 'latin1');
  }
  throw new Error('no supported pixel format in the texture');
}

function expand565(value) {
  return [
    ((value >> 11) & 31) * (255 / 31),
    ((value >> 5) & 63) * (255 / 63),
    (value & 31) * (255 / 31)
  ];
}

function decodeBlocks(data, width, height, alpha) {
  const out = Buffer.alloc(width * height * 4);
  const blockSize = alpha ? 16 : 8;
  const columns = Math.max(1, width / 4);
  const rows = Math.max(1, height / 4);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < columns; bx++) {
      const at = (by * columns + bx) * blockSize;
      let alphas = null;
      let alphaBits = 0n;
      if (alpha) {
        const a0 = data[at];
        const a1 = data[at + 1];
        alphas = [a0, a1];
        if (a0 > a1) {
          for (let i = 1; i <= 6; i++) alphas.push(Math.round(((7 - i) * a0 + i * a1) / 7));
        } else {
          for (let i = 1; i <= 4; i++) alphas.push(Math.round(((5 - i) * a0 + i * a1) / 5));
          alphas.push(0, 255);
        }
        for (let i = 0; i < 6; i++) alphaBits |= BigInt(data[at + 2 + i]) << BigInt(8 * i);
      }
      const colorAt = alpha ? at + 8 : at;
      const c0 = data.readUInt16LE(colorAt);
      const c1 = data.readUInt16LE(colorAt + 2);
      const p0 = expand565(c0);
      const p1 = expand565(c1);
      const colors = [p0, p1];
      if (alpha || c0 > c1) {
        colors.push(p0.map((v, i) => (2 * v + p1[i]) / 3));
        colors.push(p0.map((v, i) => (v + 2 * p1[i]) / 3));
      } else {
        colors.push(p0.map((v, i) => (v + p1[i]) / 2));
        colors.push([0, 0, 0]);
      }
      const colorBits = data.readUInt32LE(colorAt + 4);
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          const y = by * 4 + py;
          if (x >= width || y >= height) continue;
          const i = py * 4 + px;
          const index = (colorBits >>> (2 * i)) & 3;
          const color = colors[index];
          const offset = (y * width + x) * 4;
          out[offset] = Math.round(color[0]);
          out[offset + 1] = Math.round(color[1]);
          out[offset + 2] = Math.round(color[2]);
          out[offset + 3] = alpha
            ? alphas[Number((alphaBits >> BigInt(3 * i)) & 7n)]
            : !alpha && c0 <= c1 && index === 3
              ? 0
              : 255;
        }
      }
    }
  }
  return out;
}

function decode(format, data, width, height) {
  if (format === 'PF_DXT5') return decodeBlocks(data, width, height, true);
  if (format === 'PF_DXT1') return decodeBlocks(data, width, height, false);
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = data[i * 4 + 2];
    out[i * 4 + 1] = data[i * 4 + 1];
    out[i * 4 + 2] = data[i * 4];
    out[i * 4 + 3] = data[i * 4 + 3];
  }
  return out;
}

export function readTexture(pak, pakPathWithoutExtension) {
  const uexp = pak.read(`${pakPathWithoutExtension}.uexp`);
  const bulkPath = `${pakPathWithoutExtension}.ubulk`;
  const bulk = pak.has(bulkPath) ? pak.read(bulkPath) : null;
  const format = findFormat(uexp);
  let at = format.next + 4;
  const count = uexp.readInt32LE(at);
  at += 4;
  const mips = [];
  for (let m = 0; m < count; m++) {
    const flags = uexp.readUInt32LE(at);
    at += 4;
    const wide = (flags & SIZE_64_BIT) !== 0;
    at += wide ? 8 : 4;
    const size = wide ? Number(uexp.readBigInt64LE(at)) : uexp.readInt32LE(at);
    at += wide ? 8 : 4;
    const offset = Number(uexp.readBigInt64LE(at));
    at += 8;
    let data;
    if (flags & SEPARATE_FILE) {
      if (!bulk) throw new Error(`${pakPathWithoutExtension} keeps a mip in a missing .ubulk`);
      data = bulk.subarray(offset, offset + size);
    } else {
      data = uexp.subarray(at, at + size);
      at += size;
    }
    const width = uexp.readInt32LE(at);
    const height = uexp.readInt32LE(at + 4);
    at += 12;
    mips.push({ width, height, decode: () => decode(format.name, data, width, height) });
  }
  return { format: format.name, mips };
}

export function mipNoWiderThan(texture, size) {
  const fitting = texture.mips.filter((mip) => mip.width <= size && mip.height <= size);
  if (fitting.length === 0) throw new Error(`no mip fits ${size} pixels`);
  return fitting.reduce((best, mip) => (mip.width > best.width ? mip : best));
}
