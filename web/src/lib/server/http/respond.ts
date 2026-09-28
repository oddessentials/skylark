import { createHash } from 'node:crypto';
import type { components } from '$lib/api/types';

export type ErrorCode = components['schemas']['Error']['error']['code'];

export class ApiHttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string) => new ApiHttpError(400, 'bad_request', message);
export const notFound = (message: string) => new ApiHttpError(404, 'not_found', message);
export const conflict = (message: string) => new ApiHttpError(409, 'conflict', message);
export const unauthorized = (message: string) => new ApiHttpError(401, 'unauthorized', message);
export const forbidden = (message: string) => new ApiHttpError(403, 'forbidden', message);
export const unprocessable = (message: string) => new ApiHttpError(422, 'unprocessable', message);
export const payloadTooLarge = (message: string) =>
  new ApiHttpError(413, 'payload_too_large', message);

export const noStore = { 'cache-control': 'no-store' } as const;

export function errorResponse(status: number, code: ErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: noStore });
}

export function etagOf(body: string | Uint8Array): string {
  return `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
}

export function publicJson(document: unknown, request?: Request): Response {
  const body = JSON.stringify(document);
  const etag = etagOf(body);
  if (request?.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'cache-control': 'public, max-age=15' }
    });
  }
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=15',
      etag
    }
  });
}

export function privateJson(document: unknown, status = 200): Response {
  return new Response(JSON.stringify(document), {
    status,
    headers: { 'content-type': 'application/json', ...noStore }
  });
}

export function empty(status = 204, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...noStore, ...headers } });
}

const databaseErrorCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'CONNECT_TIMEOUT',
  '57P01',
  '57P03',
  '08006',
  '08001',
  '08003',
  '08004'
]);

function isDatabaseFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: string }).code;
  if (code && databaseErrorCodes.has(code)) return true;
  return /ECONNREFUSED|connect_timeout|terminating connection|the database system is|Connection terminated|password authentication/i.test(
    error.message
  );
}

export async function guarded(handler: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof ApiHttpError)
      return errorResponse(error.status, error.code, error.message);
    if (isDatabaseFailure(error)) {
      console.error('database unavailable', error instanceof Error ? error.message : error);
      return errorResponse(503, 'unavailable', 'the database cannot be reached');
    }
    console.error('request failed', error);
    return errorResponse(503, 'unavailable', 'the request could not be served');
  }
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url');
}

export function decodeCursor(cursor: string | null): number {
  if (cursor === null || cursor === '') return 0;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const offset = Number(decoded);
  if (!/^\d+$/.test(decoded) || !Number.isSafeInteger(offset)) {
    throw badRequest('cursor is not valid');
  }
  return offset;
}

export interface Page {
  limit: number;
  offset: number;
}

export function parsePage(url: URL, defaultLimit = 50, maxLimit = 200): Page {
  const raw = url.searchParams.get('limit');
  const limit = raw === null ? defaultLimit : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw badRequest(`limit must be an integer between 1 and ${maxLimit}`);
  }
  return { limit, offset: decodeCursor(url.searchParams.get('cursor')) };
}

export function pageResult<T>(items: T[], page: Page): { items: T[]; next_cursor: string | null } {
  const slice = items.slice(0, page.limit);
  const hasMore = items.length > page.limit;
  return { items: slice, next_cursor: hasMore ? encodeCursor(page.offset + page.limit) : null };
}

export interface Keyset {
  ts: Date;
  id: string;
}

export interface KeysetPage {
  limit: number;
  after: Keyset | null;
}

export function encodeKeyset(key: Keyset): string {
  return Buffer.from(`${key.ts.getTime()}|${key.id}`).toString('base64url');
}

export function decodeKeyset(cursor: string | null): Keyset | null {
  if (cursor === null || cursor === '') return null;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = /^(\d{1,15})\|([0-9a-zA-Z-]{1,64})$/.exec(decoded);
  if (!match) throw badRequest('cursor is not valid');
  return { ts: new Date(Number(match[1])), id: match[2]! };
}

export function parseKeysetPage(url: URL, defaultLimit = 50, maxLimit = 200): KeysetPage {
  const raw = url.searchParams.get('limit');
  const limit = raw === null ? defaultLimit : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw badRequest(`limit must be an integer between 1 and ${maxLimit}`);
  }
  return { limit, after: decodeKeyset(url.searchParams.get('cursor')) };
}

export function keysetResult<T>(
  items: T[],
  page: KeysetPage,
  keyOf: (item: T) => Keyset
): { items: T[]; next_cursor: string | null } {
  const slice = items.slice(0, page.limit);
  const last = slice[slice.length - 1];
  const hasMore = items.length > page.limit && last !== undefined;
  return { items: slice, next_cursor: hasMore ? encodeKeyset(keyOf(last)) : null };
}

export function parseInstant(url: URL, name: string): Date | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw badRequest(`${name} must be an ISO 8601 timestamp`);
  return value;
}

export function parseEnum<T extends string>(
  url: URL,
  name: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw badRequest(`${name} must be one of ${allowed.join(', ')}`);
  }
  return raw as T;
}

export function parseOptionalEnum<T extends string>(
  url: URL,
  name: string,
  allowed: readonly T[]
): T | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return null;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw badRequest(`${name} must be one of ${allowed.join(', ')}`);
  }
  return raw as T;
}

export function parseIntegerParam(url: URL, name: string): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw badRequest(`${name} must be a non-negative integer`);
  }
  return value;
}

export function parseBooleanParam(url: URL, name: string): boolean | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return null;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw badRequest(`${name} must be true or false`);
}

export function parsePathId(value: string | undefined, name: string): number {
  const id = Number(value);
  if (value === undefined || !/^\d+$/.test(value) || !Number.isSafeInteger(id)) {
    throw badRequest(`${name} must be an integer`);
  }
  return id;
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
