import { Reader } from './binary.mjs';
import { AssetPackage } from './package.mjs';
import { Pak } from './pak.mjs';
import { readProperties, Unreadable } from './properties.mjs';

const CONTENT_ROOT = 'Pal/Content/';

export function assetToPakPath(assetPath, culture = null) {
  const match = /^\/Game\/(.+)$/.exec(assetPath.split('.')[0]);
  if (!match) throw new Error(`${assetPath} is not a /Game asset path`);
  return culture ? `${CONTENT_ROOT}L10N/${culture}/${match[1]}` : `${CONTENT_ROOT}${match[1]}`;
}

export function need(value, what) {
  if (value === undefined || value === null) throw new Error(`missing ${what}`);
  if (value instanceof Unreadable) throw new Error(`could not read ${what}: ${value.reason}`);
  return value;
}

export function enumValue(value) {
  const text = need(value, 'enum value');
  const at = text.indexOf('::');
  return at === -1 ? text : text.slice(at + 2);
}

export class Game {
  constructor(pakPath) {
    this.pak = new Pak(pakPath);
    this.packages = new Map();
    this.tables = new Map();
    this.texts = new Map();
  }

  close() {
    this.pak.close();
  }

  gameVersion() {
    const ini = this.pak.read('Pal/Config/DefaultGame.ini').toString('utf8');
    const match = /^ProjectVersion=(.+)$/m.exec(ini);
    if (!match) throw new Error('DefaultGame.ini has no ProjectVersion');
    return match[1].trim();
  }

  packageAt(pakPathWithoutExtension, { withData = true } = {}) {
    const key = `${pakPathWithoutExtension}|${withData}`;
    if (this.packages.has(key)) return this.packages.get(key);
    const headerPath = this.pak.has(`${pakPathWithoutExtension}.uasset`)
      ? `${pakPathWithoutExtension}.uasset`
      : `${pakPathWithoutExtension}.umap`;
    const header = this.pak.read(headerPath);
    const data = withData ? this.pak.read(`${pakPathWithoutExtension}.uexp`) : null;
    const pkg = new AssetPackage(headerPath, header, data);
    this.packages.set(key, pkg);
    return pkg;
  }

  asset(assetPath, culture = null) {
    return this.packageAt(assetToPakPath(assetPath, culture));
  }

  dataTable(assetPath, culture = null) {
    const key = `${assetPath}|${culture}`;
    if (this.tables.has(key)) return this.tables.get(key);
    const pkg = this.asset(assetPath, culture);
    let tableIndex = 0;
    for (let i = 1; i <= pkg.exports.length; i++) {
      const className = pkg.className(i) ?? '';
      if (className === 'DataTable' || className === 'CompositeDataTable') {
        tableIndex = i;
        break;
      }
    }
    if (!tableIndex) throw new Error(`${assetPath} contains no DataTable`);
    const { start, end } = pkg.exportRange(tableIndex);
    const reader = new Reader(pkg.data, start);
    const header = readProperties(pkg, reader, end);
    if (reader.i32() !== 0) reader.bytes(16);
    const count = reader.i32();
    const rows = new Map();
    for (let i = 0; i < count; i++) {
      const rowName = pkg.readName(reader);
      rows.set(rowName, readProperties(pkg, reader, end));
    }
    if (reader.position !== end) {
      throw new Error(`${assetPath}: DataTable ended at ${reader.position}, expected ${end}`);
    }
    const folded = new Map();
    for (const name of rows.keys()) folded.set(name.toLowerCase(), name);
    const table = {
      assetPath,
      rowStruct: header.RowStruct,
      rows,
      row(name) {
        const exact = rows.get(name);
        if (exact) return exact;
        const other = folded.get(String(name).toLowerCase());
        return other ? rows.get(other) : undefined;
      },
      rowName(name) {
        return rows.has(name) ? name : (folded.get(String(name).toLowerCase()) ?? null);
      }
    };
    this.tables.set(key, table);
    return table;
  }

  text(assetPath) {
    if (this.texts.has(assetPath)) return this.texts.get(assetPath);
    const table = this.dataTable(assetPath, 'en');
    const texts = new Map();
    for (const [key, row] of table.rows) {
      const value = row.TextData;
      if (typeof value === 'string') texts.set(key.toLowerCase(), value);
    }
    this.texts.set(assetPath, texts);
    return texts;
  }

  lookupText(assetPaths, key) {
    if (key === undefined || key === null || key === 'None') return null;
    for (const assetPath of assetPaths) {
      const value = this.text(assetPath).get(String(key).toLowerCase());
      if (value !== undefined) return value.trim();
    }
    return null;
  }
}
