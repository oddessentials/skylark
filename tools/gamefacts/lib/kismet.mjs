import { Reader } from './binary.mjs';

const VARIABLE_TOKENS = new Set([0x00, 0x01, 0x02, 0x48, 0x6c]);
const SIMPLE_TOKENS = new Map([
  [0x0b, 'nothing'],
  [0x15, 'endParameter'],
  [0x17, 'self'],
  [0x25, 'zero'],
  [0x26, 'one'],
  [0x27, 'true'],
  [0x28, 'false'],
  [0x2a, 'none'],
  [0x2d, 'noInterface'],
  [0x4d, 'popFlow'],
  [0x50, 'breakpoint'],
  [0x53, 'end'],
  [0x5a, 'wireTracepoint'],
  [0x5e, 'tracepoint']
]);
const LET_TOKENS = new Set([0x14, 0x5f, 0x60, 0x43, 0x44]);
const CAST_TOKENS = new Set([0x13, 0x2e, 0x52, 0x54, 0x55]);
const CONTEXT_TOKENS = new Set([0x12, 0x19, 0x1a]);
const END_OF_SCRIPT = 0x53;
const END_FUNCTION_PARAMETERS = 0x16;

export function readFunction(pkg, functionName) {
  const index = pkg.exports.findIndex(
    (record, i) => record.objectName === functionName && pkg.className(i + 1) === 'Function'
  );
  if (index === -1) throw new Error(`${pkg.path} has no function ${functionName}`);
  const { start, end } = pkg.exportRange(index + 1);
  for (const trailer of [12, 14, 16, 8]) {
    const scriptEnd = end - trailer;
    if (scriptEnd <= start || pkg.data[scriptEnd - 1] !== END_OF_SCRIPT) continue;
    for (let position = start; position + 4 < scriptEnd; position++) {
      const size = pkg.data.readInt32LE(position);
      if (size <= 0 || position + 4 + size !== scriptEnd) continue;
      try {
        return new ScriptReader(pkg, position + 4, scriptEnd).statements();
      } catch {
        continue;
      }
    }
  }
  throw new Error(`${pkg.path}: bytecode of ${functionName} not found`);
}

class ScriptReader {
  constructor(pkg, start, end) {
    this.pkg = pkg;
    this.reader = new Reader(pkg.data, start);
    this.end = end;
  }

  statements() {
    const statements = [];
    while (this.reader.position < this.end) statements.push(this.expression());
    if (this.reader.position !== this.end || statements.at(-1)?.kind !== 'end') {
      throw new Error('bytecode did not end cleanly');
    }
    return statements;
  }

  name() {
    return this.pkg.readName(this.reader);
  }

  object() {
    const index = this.reader.i32();
    return { index, name: this.pkg.objectName(index) };
  }

  propertyPointer() {
    const count = this.reader.i32();
    const path = [];
    for (let i = 0; i < count; i++) path.push(this.name());
    this.reader.i32();
    return path.join('.');
  }

  nullTerminated(wide) {
    const buffer = this.reader.buffer;
    let position = this.reader.position;
    if (wide) {
      while (buffer.readUInt16LE(position) !== 0) position += 2;
      const text = buffer.toString('utf16le', this.reader.position, position);
      this.reader.position = position + 2;
      return text;
    }
    while (buffer[position] !== 0) position++;
    const text = buffer.toString('latin1', this.reader.position, position);
    this.reader.position = position + 1;
    return text;
  }

  parameters() {
    const values = [];
    while (this.reader.buffer[this.reader.position] !== END_FUNCTION_PARAMETERS) {
      values.push(this.expression());
    }
    this.reader.position++;
    return values;
  }

  until(token) {
    const values = [];
    while (this.reader.buffer[this.reader.position] !== token) values.push(this.expression());
    this.reader.position++;
    return values;
  }

  expression() {
    const r = this.reader;
    if (r.position >= this.end) throw new Error('bytecode overrun');
    const token = r.u8();
    if (VARIABLE_TOKENS.has(token)) return { kind: 'variable', name: this.propertyPointer() };
    if (SIMPLE_TOKENS.has(token)) return { kind: SIMPLE_TOKENS.get(token) };
    if (LET_TOKENS.has(token)) {
      const target = this.expression();
      return { kind: 'let', target, value: this.expression() };
    }
    if (CAST_TOKENS.has(token)) {
      const target = this.object();
      return { kind: 'cast', target, value: this.expression() };
    }
    if (CONTEXT_TOKENS.has(token)) {
      const object = this.expression();
      r.u32();
      this.propertyPointer();
      return { kind: 'context', object, member: this.expression() };
    }
    switch (token) {
      case 0x04:
        return { kind: 'return', value: this.expression() };
      case 0x06:
        return { kind: 'jump', offset: r.u32() };
      case 0x07: {
        const offset = r.u32();
        return { kind: 'jumpIfNot', offset, condition: this.expression() };
      }
      case 0x09:
        r.u16();
        r.u8();
        return { kind: 'assert', condition: this.expression() };
      case 0x0c:
        return { kind: 'nothing', value: r.i32() };
      case 0x0f: {
        this.propertyPointer();
        const target = this.expression();
        return { kind: 'let', target, value: this.expression() };
      }
      case 0x11:
        this.propertyPointer();
        return { kind: 'bitfield', value: r.u8() };
      case 0x18:
        r.u32();
        return { kind: 'skip', value: this.expression() };
      case 0x1b:
      case 0x45: {
        const name = this.name();
        return { kind: 'call', function: name, owner: null, arguments: this.parameters() };
      }
      case 0x1c:
      case 0x46:
      case 0x68: {
        const target = this.object();
        const owner = this.pkg.objectName(this.pkg.outerOf(target.index));
        return { kind: 'call', function: target.name, owner, arguments: this.parameters() };
      }
      case 0x1d:
        return { kind: 'number', value: r.i32() };
      case 0x1e:
        return { kind: 'number', value: r.f32() };
      case 0x1f:
        return { kind: 'string', value: this.nullTerminated(false) };
      case 0x20:
        return { kind: 'object', value: this.object() };
      case 0x21:
        return { kind: 'name', value: this.name() };
      case 0x22:
      case 0x23:
        return { kind: 'vector', value: [r.f64(), r.f64(), r.f64()] };
      case 0x24:
      case 0x2c:
        return { kind: 'number', value: r.u8() };
      case 0x29:
        return this.textConstant();
      case 0x2b: {
        const values = [];
        for (let i = 0; i < 10; i++) values.push(r.f64());
        return { kind: 'transform', value: values };
      }
      case 0x2f: {
        const struct = this.object();
        r.i32();
        return { kind: 'struct', struct: struct.name, fields: this.until(0x30) };
      }
      case 0x31: {
        const array = this.expression();
        return { kind: 'setArray', array, items: this.until(0x32) };
      }
      case 0x33:
        return { kind: 'propertyConstant', value: this.propertyPointer() };
      case 0x34:
        return { kind: 'string', value: this.nullTerminated(true) };
      case 0x35:
        return { kind: 'number', value: r.i64() };
      case 0x36:
        return { kind: 'number', value: r.u64() };
      case 0x37:
        return { kind: 'number', value: r.f64() };
      case 0x38: {
        const conversion = r.u8();
        return { kind: 'conversion', conversion, value: this.expression() };
      }
      case 0x39: {
        const set = this.expression();
        r.i32();
        return { kind: 'setSet', set, items: this.until(0x3a) };
      }
      case 0x3b: {
        const map = this.expression();
        r.i32();
        return { kind: 'setMap', map, items: this.until(0x3c) };
      }
      case 0x3d:
        this.propertyPointer();
        r.i32();
        return { kind: 'setConstant', items: this.until(0x3e) };
      case 0x3f:
        this.propertyPointer();
        this.propertyPointer();
        r.i32();
        return { kind: 'mapConstant', items: this.until(0x40) };
      case 0x41:
        return { kind: 'vector', value: [r.f32(), r.f32(), r.f32()] };
      case 0x42: {
        const property = this.propertyPointer();
        return { kind: 'member', property, object: this.expression() };
      }
      case 0x4b:
        return { kind: 'delegate', value: this.name() };
      case 0x4c:
        return { kind: 'pushFlow', offset: r.u32() };
      case 0x4e:
        return { kind: 'computedJump', value: this.expression() };
      case 0x4f:
        return { kind: 'popFlowIfNot', condition: this.expression() };
      case 0x51:
        return { kind: 'interfaceContext', value: this.expression() };
      case 0x5b:
        return { kind: 'skipOffset', value: r.u32() };
      case 0x5c:
      case 0x62: {
        const delegate = this.expression();
        return { kind: 'multicast', delegate, value: this.expression() };
      }
      case 0x5d:
        return { kind: 'multicastClear', delegate: this.expression() };
      case 0x61: {
        const name = this.name();
        const delegate = this.expression();
        return { kind: 'bind', name, delegate, object: this.expression() };
      }
      case 0x63: {
        const target = this.object();
        return { kind: 'callMulticast', function: target.name, arguments: this.parameters() };
      }
      case 0x64:
        this.propertyPointer();
        return { kind: 'letPersistent', value: this.expression() };
      case 0x65:
        this.propertyPointer();
        r.i32();
        return { kind: 'arrayConstant', items: this.until(0x66) };
      case 0x67:
        return { kind: 'softObject', value: this.expression() };
      case 0x69: {
        const count = r.u16();
        r.u32();
        const index = this.expression();
        const cases = [];
        for (let i = 0; i < count; i++) {
          const match = this.expression();
          r.u32();
          cases.push({ match, value: this.expression() });
        }
        return { kind: 'switch', index, cases, fallback: this.expression() };
      }
      case 0x6a: {
        const event = r.u8();
        if (event === 4) this.name();
        return { kind: 'instrumentation', event };
      }
      case 0x6b: {
        const array = this.expression();
        return { kind: 'arrayGet', array, index: this.expression() };
      }
      case 0x6d:
        return { kind: 'fieldPath', value: this.expression() };
      case 0xa2:
        return { kind: 'palWazaConstant', value: r.u16() };
      default:
        throw new Error(`unknown bytecode token 0x${token.toString(16)}`);
    }
  }

  textConstant() {
    const type = this.reader.u8();
    if (type === 0) return { kind: 'text', value: '' };
    if (type === 1) {
      const source = this.expression();
      this.expression();
      this.expression();
      return { kind: 'text', value: source.value };
    }
    if (type === 2 || type === 3) return { kind: 'text', value: this.expression().value };
    if (type === 4) {
      this.object();
      const table = this.expression();
      const key = this.expression();
      return { kind: 'text', value: null, table: table.value, key: key.value };
    }
    throw new Error(`unknown text constant type ${type}`);
  }
}
