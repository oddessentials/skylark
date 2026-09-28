import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { decompress } from 'ooz-wasm';
import { Reader } from './binary.mjs';

const MAGIC = 0x5a6f12e1;
const SUPPORTED_VERSION = 11;
const ENTRY_HEADER = 53;

export class Pak {
  constructor(path) {
    this.path = path;
    this.fd = openSync(path, 'r');
    this.size = fstatSync(this.fd).size;
    this.readFooter();
    this.readIndex();
  }

  close() {
    closeSync(this.fd);
  }

  readAt(offset, length) {
    const buffer = Buffer.alloc(length);
    let done = 0;
    while (done < length) {
      const count = readSync(this.fd, buffer, done, length - done, offset + done);
      if (count === 0) throw new Error(`unexpected end of pak at byte ${offset + done}`);
      done += count;
    }
    return buffer;
  }

  readFooter() {
    const tailLength = Math.min(1024, this.size);
    const tail = this.readAt(this.size - tailLength, tailLength);
    let at = -1;
    for (let i = tail.length - 4; i >= 17; i--) {
      if (tail.readUInt32LE(i) === MAGIC) {
        at = i;
        break;
      }
    }
    if (at === -1) throw new Error('pak footer magic not found');
    const reader = new Reader(tail, at + 4);
    this.version = reader.u32();
    if (this.version !== SUPPORTED_VERSION) {
      throw new Error(
        `pak version ${this.version} is not supported, expected ${SUPPORTED_VERSION}`
      );
    }
    this.indexOffset = reader.u64();
    this.indexSize = reader.u64();
    reader.bytes(20);
    this.compressionMethods = ['None'];
    for (let i = 0; i < 5; i++) {
      const raw = reader.bytes(32);
      const end = raw.indexOf(0);
      this.compressionMethods.push(raw.subarray(0, end === -1 ? 32 : end).toString('latin1'));
    }
    const encryptedIndex = tail[at - 1];
    const keyGuid = tail.subarray(at - 17, at - 1);
    if (encryptedIndex !== 0 || keyGuid.some((byte) => byte !== 0)) {
      throw new Error('encrypted paks are not supported');
    }
  }

  readIndex() {
    const reader = new Reader(this.readAt(this.indexOffset, this.indexSize));
    this.mountPoint = reader.fstring();
    const entryCount = reader.i32();
    reader.u64();
    if (reader.i32() !== 0) {
      reader.i64();
      reader.i64();
      reader.bytes(20);
    }
    if (reader.i32() === 0) throw new Error('pak has no full directory index');
    const directoryOffset = reader.i64();
    const directorySize = reader.i64();
    reader.bytes(20);
    this.encoded = reader.bytes(reader.i32());
    if (reader.i32() !== 0)
      throw new Error('pak entries outside the encoded index are not supported');
    const directory = new Reader(this.readAt(directoryOffset, directorySize));
    const directoryCount = directory.i32();
    const mount = this.mountPoint.replace(/^(\.\.\/)+/, '');
    this.entries = new Map();
    this.folded = new Map();
    for (let d = 0; d < directoryCount; d++) {
      const directoryName = directory.fstring();
      const fileCount = directory.i32();
      for (let f = 0; f < fileCount; f++) {
        const fileName = directory.fstring();
        const encodedOffset = directory.i32();
        if (encodedOffset < 0) throw new Error('unencoded pak entries are not supported');
        const path = (mount + directoryName + fileName).replace(/^\/+/, '');
        this.entries.set(path, encodedOffset);
        this.folded.set(path.toLowerCase(), path);
      }
    }
    if (this.entries.size !== entryCount) {
      throw new Error(`pak index lists ${this.entries.size} files, footer says ${entryCount}`);
    }
  }

  resolve(path) {
    if (this.entries.has(path)) return path;
    return this.folded.get(path.toLowerCase()) ?? null;
  }

  has(path) {
    return this.resolve(path) !== null;
  }

  paths() {
    return [...this.entries.keys()];
  }

  entry(path) {
    const resolved = this.resolve(path);
    if (resolved === null) throw new Error(`pak has no file ${path}`);
    return decodeEntry(this.encoded, this.entries.get(resolved), this.compressionMethods);
  }

  read(path) {
    const entry = this.entry(path);
    if (entry.encrypted) throw new Error(`${path} is encrypted`);
    if (entry.method === 'None')
      return this.readAt(entry.offset + ENTRY_HEADER, entry.uncompressedSize);
    if (entry.method !== 'Oodle')
      throw new Error(`${path} uses unsupported compression ${entry.method}`);
    const headerSize = ENTRY_HEADER + 4 + 16 * entry.blockCount;
    const sizes = entry.blockCount === 1 ? [entry.size] : entry.blockSizes;
    const blockRaw =
      entry.blockCount <= 1 || entry.blockSize === 0 ? entry.uncompressedSize : entry.blockSize;
    const output = Buffer.alloc(entry.uncompressedSize);
    let position = entry.offset + headerSize;
    let written = 0;
    for (const size of sizes) {
      const compressed = this.readAt(position, size);
      position += size;
      const rawSize = Math.min(blockRaw, entry.uncompressedSize - written);
      output.set(decompress(compressed, rawSize), written);
      written += rawSize;
    }
    if (written !== entry.uncompressedSize)
      throw new Error(`${path} decompressed to ${written} bytes`);
    return output;
  }
}

function decodeEntry(encoded, offset, methods) {
  const reader = new Reader(encoded, offset);
  const value = reader.u32();
  const blockSize = (value & 0x3f) === 0x3f ? reader.u32() : (value & 0x3f) << 11;
  const methodIndex = (value >>> 23) & 0x3f;
  const entryOffset = value >>> 31 ? reader.u32() : reader.u64();
  const uncompressedSize = (value >>> 30) & 1 ? reader.u32() : reader.u64();
  let size = uncompressedSize;
  if (methodIndex !== 0) size = (value >>> 29) & 1 ? reader.u32() : reader.u64();
  const encrypted = ((value >>> 22) & 1) === 1;
  const blockCount = (value >>> 6) & 0xffff;
  const blockSizes = [];
  if (blockCount > 0 && (blockCount !== 1 || encrypted)) {
    for (let i = 0; i < blockCount; i++) blockSizes.push(reader.u32());
  }
  return {
    offset: entryOffset,
    size,
    uncompressedSize,
    method: methods[methodIndex],
    encrypted,
    blockCount,
    blockSize,
    blockSizes
  };
}
