import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'prettier';

export function round(value, digits = 1) {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundAll(values, digits = 1) {
  return values.map((value) => round(value, digits));
}

export function compareText(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export async function writeJson(directory, fileName, data) {
  mkdirSync(directory, { recursive: true });
  const text = await format(JSON.stringify(data), {
    parser: 'json',
    printWidth: 100,
    singleQuote: true,
    trailingComma: 'none'
  });
  writeFileSync(join(directory, fileName), text);
  return text.length;
}
