import { getFixture } from './fixtures';

const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function fixtureNow(): number | null {
  const status = getFixture('status') as { updated_at?: unknown } | undefined;
  const value = typeof status?.updated_at === 'string' ? Date.parse(status.updated_at) : NaN;
  return Number.isNaN(value) ? null : value;
}

function shift(value: unknown, delta: number): unknown {
  if (typeof value === 'string') {
    return instant.test(value) ? new Date(Date.parse(value) + delta).toISOString() : value;
  }
  if (Array.isArray(value)) return value.map((entry) => shift(entry, delta));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = shift(entry, delta);
    }
    return out;
  }
  return value;
}

export function rebaseTimes<T>(document: T, now = Date.now()): T {
  const anchor = fixtureNow();
  if (anchor === null) return document;
  return shift(document, now - anchor) as T;
}
