import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { getDb } from '../db/client';
import { adminSessions } from '../db/schema';
import { env } from '../env';
import { forbidden, unauthorized } from '../http/respond';
import { secrets } from './secrets';

export const cookieName = 'admin_session';
export const sessionLifetimeMs = 12 * 60 * 60 * 1000;

async function sign(id: string): Promise<string> {
  return createHmac('sha256', await secrets.sessionSecret())
    .update(id)
    .digest('base64url');
}

async function cookieValue(id: string): Promise<string> {
  return `${id}.${await sign(id)}`;
}

async function parseCookie(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = await sign(id);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

type OriginEvent = Pick<RequestEvent, 'url' | 'request'>;

export function siteOrigin(event: Pick<RequestEvent, 'url'>): string {
  return env.origin || event.url.origin;
}

export function isSecureSite(event: OriginEvent, configured = env.origin): boolean {
  if (configured) return configured.startsWith('https://');
  const origin = event.request.headers.get('origin');
  if (origin) return origin.startsWith('https://');
  return event.url.protocol === 'https:';
}

export function fromThisSite(origin: string, event: OriginEvent, configured = env.origin): boolean {
  if (configured) return origin === configured;
  try {
    return new URL(origin).host === event.url.host;
  } catch {
    return false;
  }
}

function cookieAttributes(maxAgeSeconds: number, secure: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}

export async function createSession(
  secure = false
): Promise<{ setCookie: string; expiresAt: Date }> {
  const id = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  await getDb().insert(adminSessions).values({ id, expiresAt });
  return {
    setCookie: `${cookieName}=${await cookieValue(id)}; ${cookieAttributes(Math.floor(sessionLifetimeMs / 1000), secure)}`,
    expiresAt
  };
}

export function clearedCookie(secure = false): string {
  return `${cookieName}=; ${cookieAttributes(0, secure)}`;
}

export interface AdminSessionState {
  authenticated: boolean;
  expiresAt: Date | null;
  id: string | null;
}

export async function readSession(event: RequestEvent): Promise<AdminSessionState> {
  const id = await parseCookie(event.cookies.get(cookieName));
  if (!id) return { authenticated: false, expiresAt: null, id: null };
  const rows = await getDb()
    .select({ expiresAt: adminSessions.expiresAt })
    .from(adminSessions)
    .where(and(eq(adminSessions.id, id), gt(adminSessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return { authenticated: false, expiresAt: null, id: null };
  return { authenticated: true, expiresAt: row.expiresAt, id };
}

export async function requireAdmin(event: RequestEvent): Promise<AdminSessionState> {
  const state = await readSession(event);
  if (!state.authenticated) throw unauthorized('an admin session is required');
  return state;
}

export function requireSameOrigin(event: RequestEvent): void {
  const origin = event.request.headers.get('origin');
  if (origin === null || !fromThisSite(origin, event)) {
    throw forbidden('the Origin header must match the site origin');
  }
}

export async function destroySession(id: string | null): Promise<void> {
  if (!id) return;
  await getDb().delete(adminSessions).where(eq(adminSessions.id, id));
}

export async function pruneSessions(): Promise<number> {
  const deleted = await getDb()
    .delete(adminSessions)
    .where(lt(adminSessions.expiresAt, new Date()))
    .returning({ id: adminSessions.id });
  return deleted.length;
}
