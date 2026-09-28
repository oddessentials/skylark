import { Reader } from './binary.mjs';
import { readProperties } from './properties.mjs';

const PACKAGE_TAG = 0x9e2a83c1;
const LEGACY_FILE_VERSION = -8;
const FILTER_EDITOR_ONLY = 0x80000000;
const UNVERSIONED_PROPERTIES = 0x2000;
const EXPORT_RECORD_SIZE = 96;
const IMPORT_RECORD_SIZE = 32;

export class AssetPackage {
  constructor(path, header, data = null) {
    this.path = path;
    this.header = header;
    this.data = data;
    this.propertyCache = new Map();
    this.children = null;
    const reader = new Reader(header);
    if (reader.u32() !== PACKAGE_TAG) throw new Error(`${path} is not an Unreal package`);
    if (reader.i32() !== LEGACY_FILE_VERSION)
      throw new Error(`${path} has an unexpected file version`);
    reader.i32();
    reader.i32();
    reader.i32();
    reader.i32();
    reader.bytes(reader.i32() * 20);
    this.totalHeaderSize = reader.i32();
    this.folderName = reader.fstring();
    this.flags = reader.u32();
    if (this.flags & UNVERSIONED_PROPERTIES) {
      throw new Error(`${path} uses unversioned properties, which this reader does not support`);
    }
    const nameCount = reader.i32();
    const nameOffset = reader.i32();
    const softPathCount = reader.i32();
    const softPathOffset = reader.i32();
    if (!(this.flags & FILTER_EDITOR_ONLY)) reader.fstring();
    reader.i32();
    reader.i32();
    const exportCount = reader.i32();
    const exportOffset = reader.i32();
    const importCount = reader.i32();
    const importOffset = reader.i32();

    this.names = new Array(nameCount);
    const names = new Reader(header, nameOffset);
    for (let i = 0; i < nameCount; i++) {
      this.names[i] = names.fstring();
      names.position += 4;
    }

    this.softPaths = [];
    const softPaths = new Reader(header, softPathOffset);
    for (let i = 0; i < softPathCount; i++) {
      const packageName = this.readName(softPaths);
      const assetName = this.readName(softPaths);
      const subPath = softPaths.fstring();
      let text = assetName === 'None' ? packageName : `${packageName}.${assetName}`;
      if (subPath) text += `:${subPath}`;
      this.softPaths.push(text);
    }

    this.imports = new Array(importCount);
    for (let i = 0; i < importCount; i++) {
      const record = new Reader(header, importOffset + i * IMPORT_RECORD_SIZE);
      const classPackage = this.readName(record);
      const className = this.readName(record);
      const outer = record.i32();
      const objectName = this.readName(record);
      this.imports[i] = { classPackage, className, outer, objectName };
    }

    this.exports = new Array(exportCount);
    for (let i = 0; i < exportCount; i++) {
      const record = new Reader(header, exportOffset + i * EXPORT_RECORD_SIZE);
      const classIndex = record.i32();
      const superIndex = record.i32();
      const templateIndex = record.i32();
      const outer = record.i32();
      const objectName = this.readName(record);
      const objectFlags = record.u32();
      const serialSize = record.i64();
      const serialOffset = record.i64();
      this.exports[i] = {
        classIndex,
        superIndex,
        templateIndex,
        outer,
        objectName,
        objectFlags,
        serialSize,
        serialOffset
      };
    }
  }

  readName(reader) {
    const index = reader.i32();
    const number = reader.i32();
    const base = this.names[index];
    if (base === undefined) throw new Error(`${this.path}: name index ${index} is out of range`);
    return number === 0 ? base : `${base}_${number - 1}`;
  }

  object(index) {
    if (index === 0) return null;
    if (index < 0) return this.imports[-index - 1] ?? null;
    return this.exports[index - 1] ?? null;
  }

  objectName(index) {
    const object = this.object(index);
    return object ? object.objectName : null;
  }

  outerOf(index) {
    const object = this.object(index);
    return object ? object.outer : 0;
  }

  importChain(index) {
    const chain = [];
    let current = index;
    while (current < 0) {
      const record = this.imports[-current - 1];
      chain.unshift(record.objectName);
      current = record.outer;
    }
    return chain;
  }

  className(exportIndex) {
    const record = this.exports[exportIndex - 1];
    return this.objectName(record.classIndex);
  }

  childrenOf(exportIndex) {
    if (!this.children) {
      this.children = new Map();
      this.exports.forEach((record, i) => {
        if (!this.children.has(record.outer)) this.children.set(record.outer, []);
        this.children.get(record.outer).push(i + 1);
      });
    }
    return this.children.get(exportIndex) ?? [];
  }

  findExport(name, outerName = undefined) {
    for (let i = 0; i < this.exports.length; i++) {
      const record = this.exports[i];
      if (record.objectName !== name) continue;
      if (outerName !== undefined && this.objectName(record.outer) !== outerName) continue;
      return i + 1;
    }
    return 0;
  }

  exportRange(exportIndex) {
    if (!this.data) throw new Error(`${this.path} was loaded without export data`);
    const record = this.exports[exportIndex - 1];
    const start = record.serialOffset - this.totalHeaderSize;
    return { start, end: start + record.serialSize };
  }

  properties(exportIndex) {
    if (this.propertyCache.has(exportIndex)) return this.propertyCache.get(exportIndex);
    const { start, end } = this.exportRange(exportIndex);
    const reader = new Reader(this.data, start);
    const properties = readProperties(this, reader, end);
    this.propertyCache.set(exportIndex, properties);
    return properties;
  }
}
