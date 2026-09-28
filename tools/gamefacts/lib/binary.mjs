export class Reader {
  constructor(buffer, position = 0) {
    this.buffer = buffer;
    this.position = position;
  }

  u8() {
    const value = this.buffer.readUInt8(this.position);
    this.position += 1;
    return value;
  }

  i8() {
    const value = this.buffer.readInt8(this.position);
    this.position += 1;
    return value;
  }

  u16() {
    const value = this.buffer.readUInt16LE(this.position);
    this.position += 2;
    return value;
  }

  i16() {
    const value = this.buffer.readInt16LE(this.position);
    this.position += 2;
    return value;
  }

  u32() {
    const value = this.buffer.readUInt32LE(this.position);
    this.position += 4;
    return value;
  }

  i32() {
    const value = this.buffer.readInt32LE(this.position);
    this.position += 4;
    return value;
  }

  u64() {
    const value = this.buffer.readBigUInt64LE(this.position);
    this.position += 8;
    return toSafeNumber(value);
  }

  i64() {
    const value = this.buffer.readBigInt64LE(this.position);
    this.position += 8;
    return toSafeNumber(value);
  }

  f32() {
    const value = this.buffer.readFloatLE(this.position);
    this.position += 4;
    return value;
  }

  f64() {
    const value = this.buffer.readDoubleLE(this.position);
    this.position += 8;
    return value;
  }

  bytes(length) {
    const value = this.buffer.subarray(this.position, this.position + length);
    this.position += length;
    return value;
  }

  guid() {
    return this.bytes(16).toString('hex');
  }

  fstring() {
    const length = this.i32();
    if (length === 0) return '';
    if (length < 0) {
      const text = this.bytes(-length * 2).toString('utf16le');
      return text.replace(/\0+$/, '');
    }
    const text = this.bytes(length).toString('utf8');
    return text.replace(/\0+$/, '');
  }
}

function toSafeNumber(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`64-bit value ${value} is outside the safe integer range`);
  }
  return Number(value);
}
