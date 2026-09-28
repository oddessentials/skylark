export function pickEnum<T extends string>(
  params: URLSearchParams,
  name: string,
  values: readonly T[],
  fallback: T
): T {
  const value = params.get(name);
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function pickOptionalEnum<T extends string>(
  params: URLSearchParams,
  name: string,
  values: readonly T[]
): T | undefined {
  const value = params.get(name);
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function pickInt(params: URLSearchParams, name: string): number | undefined {
  const value = params.get(name);
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function pickText(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  return value ? value : undefined;
}

export function pickInstant(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name)?.trim();
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

export function pickBoolean(params: URLSearchParams, name: string): boolean {
  const value = params.get(name);
  return value === 'true' || value === '1';
}

export function pickList<T extends string>(
  params: URLSearchParams,
  name: string,
  isValid: (value: unknown) => value is T
): T[] {
  const raw = params.getAll(name).flatMap((entry) => entry.split(','));
  const seen = new Set<T>();
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (isValid(trimmed)) seen.add(trimmed);
  }
  return [...seen];
}

export function withParams(
  url: URL,
  patch: Record<string, string | number | boolean | null | undefined>
): string {
  const next = new URLSearchParams(url.searchParams);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '' || value === false) next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

export function dateInputValue(iso: string | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}
