export class ObjectRef {
  constructor(index) {
    this.index = index;
  }
}

export class Unreadable {
  constructor(type, reason) {
    this.type = type;
    this.reason = reason;
  }
}

const NATIVE_STRUCTS = new Set([
  'Vector',
  'Vector2D',
  'Vector4',
  'Rotator',
  'Quat',
  'LinearColor',
  'Color',
  'Guid',
  'DateTime',
  'Timespan',
  'IntPoint',
  'IntVector',
  'Box',
  'Box2D',
  'SoftObjectPath',
  'SoftClassPath',
  'GameplayTagContainer',
  'GameplayTag',
  'PerPlatformFloat',
  'PerPlatformInt',
  'FrameNumber'
]);

export function readProperties(pkg, reader, end) {
  const result = {};
  while (reader.position < end) {
    const name = pkg.readName(reader);
    if (name === 'None') break;
    const type = pkg.readName(reader);
    const size = reader.i32();
    const arrayIndex = reader.i32();
    const tag = { type, size };
    if (type === 'StructProperty') {
      tag.struct = pkg.readName(reader);
      reader.bytes(16);
    } else if (type === 'BoolProperty') {
      tag.bool = reader.u8();
    } else if (type === 'ByteProperty' || type === 'EnumProperty') {
      tag.enum = pkg.readName(reader);
    } else if (type === 'ArrayProperty' || type === 'SetProperty') {
      tag.inner = pkg.readName(reader);
    } else if (type === 'MapProperty') {
      tag.inner = pkg.readName(reader);
      tag.value = pkg.readName(reader);
    }
    if (reader.u8() !== 0) reader.bytes(16);
    const start = reader.position;
    let value;
    if (type === 'BoolProperty') {
      value = tag.bool !== 0;
    } else {
      try {
        value = readValue(pkg, reader, tag, start + size);
      } catch (error) {
        value = new Unreadable(type, error.message);
      }
      reader.position = start + size;
    }
    result[arrayIndex === 0 ? name : `${name}[${arrayIndex}]`] = value;
  }
  return result;
}

function readValue(pkg, reader, tag, end) {
  switch (tag.type) {
    case 'StructProperty':
      return readStruct(pkg, reader, tag.struct, tag.size, end);
    case 'ArrayProperty':
      return readArray(pkg, reader, tag, end);
    case 'SetProperty':
      return readSet(pkg, reader, tag, end);
    case 'MapProperty':
      return readMap(pkg, reader, tag, end);
    case 'ByteProperty':
      return tag.enum && tag.enum !== 'None' ? pkg.readName(reader) : reader.u8();
    default:
      return readScalar(pkg, reader, tag.type, tag.size);
  }
}

function readStruct(pkg, reader, struct, size, end) {
  if (NATIVE_STRUCTS.has(struct)) return readNative(pkg, reader, struct, size);
  return readProperties(pkg, reader, end);
}

function readArray(pkg, reader, tag, end) {
  const count = reader.i32();
  const items = [];
  if (tag.inner === 'StructProperty') {
    pkg.readName(reader);
    pkg.readName(reader);
    const innerSize = reader.i32();
    reader.i32();
    const struct = pkg.readName(reader);
    reader.bytes(16);
    if (reader.u8() !== 0) reader.bytes(16);
    const elementSize = count > 0 ? innerSize / count : 0;
    for (let i = 0; i < count; i++) {
      items.push(
        NATIVE_STRUCTS.has(struct)
          ? readNative(pkg, reader, struct, elementSize)
          : readProperties(pkg, reader, end)
      );
    }
    return items;
  }
  const elementSize = count > 0 ? (end - reader.position) / count : 0;
  for (let i = 0; i < count; i++) items.push(readScalar(pkg, reader, tag.inner, elementSize));
  return items;
}

function readSet(pkg, reader, tag, end) {
  const removed = reader.i32();
  for (let i = 0; i < removed; i++) readElement(pkg, reader, tag.inner, end);
  const count = reader.i32();
  const items = [];
  for (let i = 0; i < count; i++) items.push(readElement(pkg, reader, tag.inner, end));
  return items;
}

function readMap(pkg, reader, tag, end) {
  const removed = reader.i32();
  for (let i = 0; i < removed; i++) readElement(pkg, reader, tag.inner, end);
  const count = reader.i32();
  const entries = [];
  for (let i = 0; i < count; i++) {
    const key = readElement(pkg, reader, tag.inner, end);
    const value = readElement(pkg, reader, tag.value, end);
    entries.push([key, value]);
  }
  return entries;
}

function readElement(pkg, reader, type, end) {
  if (type === 'StructProperty') return readProperties(pkg, reader, end);
  if (type === 'ByteProperty') return reader.u8();
  return readScalar(pkg, reader, type, 0);
}

function readScalar(pkg, reader, type, size) {
  switch (type) {
    case 'IntProperty':
      return reader.i32();
    case 'Int8Property':
      return reader.i8();
    case 'Int16Property':
      return reader.i16();
    case 'Int64Property':
      return reader.i64();
    case 'UInt16Property':
      return reader.u16();
    case 'UInt32Property':
      return reader.u32();
    case 'UInt64Property':
      return reader.u64();
    case 'FloatProperty':
      return reader.f32();
    case 'DoubleProperty':
      return reader.f64();
    case 'BoolProperty':
      return reader.u8() !== 0;
    case 'NameProperty':
    case 'EnumProperty':
      return pkg.readName(reader);
    case 'ByteProperty':
      return size === 8 ? pkg.readName(reader) : reader.u8();
    case 'StrProperty':
      return reader.fstring();
    case 'TextProperty':
      return readText(pkg, reader);
    case 'ObjectProperty':
    case 'ClassProperty':
    case 'WeakObjectProperty':
    case 'LazyObjectProperty':
    case 'InterfaceProperty':
      return new ObjectRef(reader.i32());
    case 'SoftObjectProperty':
    case 'SoftClassProperty':
      return readSoftPath(pkg, reader);
    default:
      throw new Error(`unsupported property type ${type}`);
  }
}

function readText(pkg, reader) {
  reader.u32();
  const history = reader.i8();
  if (history === -1) return reader.i32() !== 0 ? reader.fstring() : null;
  if (history === 0) {
    reader.fstring();
    reader.fstring();
    return reader.fstring();
  }
  if (history === 11) {
    const table = pkg.readName(reader);
    const key = reader.fstring();
    return { table, key };
  }
  throw new Error(`unsupported text history ${history}`);
}

function readSoftPath(pkg, reader) {
  if (pkg.softPaths.length > 0) {
    const index = reader.i32();
    if (index < 0 || index >= pkg.softPaths.length)
      throw new Error(`soft path ${index} out of range`);
    return pkg.softPaths[index];
  }
  const packageName = pkg.readName(reader);
  const assetName = pkg.readName(reader);
  const subPath = reader.fstring();
  let text = assetName === 'None' ? packageName : `${packageName}.${assetName}`;
  if (subPath) text += `:${subPath}`;
  return text;
}

function readNative(pkg, reader, struct, size) {
  const wide = (floats) => size >= floats * 8;
  const numbers = (count, doubles) => {
    const values = [];
    for (let i = 0; i < count; i++) values.push(doubles ? reader.f64() : reader.f32());
    return values;
  };
  switch (struct) {
    case 'Vector':
    case 'Rotator':
      return numbers(3, wide(3));
    case 'Vector2D':
      return numbers(2, wide(2));
    case 'Vector4':
    case 'Quat':
      return numbers(4, wide(4));
    case 'LinearColor':
      return numbers(4, false);
    case 'Color': {
      const [b, g, r, a] = reader.bytes(4);
      return [r, g, b, a];
    }
    case 'Guid':
      return reader.guid();
    case 'DateTime':
    case 'Timespan':
      return reader.i64();
    case 'IntPoint':
      return [reader.i32(), reader.i32()];
    case 'IntVector':
      return [reader.i32(), reader.i32(), reader.i32()];
    case 'Box': {
      const values = numbers(6, size >= 49);
      return { min: values.slice(0, 3), max: values.slice(3), valid: reader.u8() !== 0 };
    }
    case 'Box2D': {
      const values = numbers(4, size >= 33);
      return { min: values.slice(0, 2), max: values.slice(2), valid: reader.u8() !== 0 };
    }
    case 'SoftObjectPath':
    case 'SoftClassPath':
      return readSoftPath(pkg, reader);
    case 'GameplayTagContainer': {
      const count = reader.i32();
      const tags = [];
      for (let i = 0; i < count; i++) tags.push(pkg.readName(reader));
      return tags;
    }
    case 'GameplayTag':
      return pkg.readName(reader);
    case 'PerPlatformFloat':
      reader.i32();
      return reader.f32();
    case 'PerPlatformInt':
      reader.i32();
      return reader.i32();
    case 'FrameNumber':
      return reader.i32();
    default:
      throw new Error(`unsupported native struct ${struct}`);
  }
}
