import type { RequestEvent } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { getContract } from '../openapi';
import { cloneFixture, getFixture, hasFixture } from './fixtures';
import { cookieName, hasAdminSession } from './session';
import { rebaseTimes } from './clock';
import { mockStream } from './sse';

interface MockRoute {
  template: string;
  pattern: RegExp;
  params: string[];
  fixture: string;
  listFixture: string | null;
  idField: string | null;
  detail: boolean;
}

interface ListDocument {
  items?: unknown[];
  next_cursor?: string | null;
}

const realRoutes = new Set(['/api/v1/health', '/api/v1/openapi.json']);
const sessionPath = '/api/v1/admin/session';

function idFieldFor(param: string): string | null {
  return param === 'id' ? 'id' : null;
}

let routes: MockRoute[] | null = null;
function getRoutes(): MockRoute[] {
  if (routes) return routes;
  routes = [];
  for (const [template, item] of Object.entries(getContract().paths)) {
    if (!item.get || !template.startsWith('/api/v1/') || realRoutes.has(template)) continue;
    if (template === '/api/v1/stream') continue;
    const params: string[] = [];
    const source = template
      .split('/')
      .map((segment) => {
        const match = /^\{(\w+)\}$/.exec(segment);
        if (!match) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        params.push(match[1] as string);
        return '([^/]+)';
      })
      .join('/');
    const firstParam = template.indexOf('/{');
    const listFixture = firstParam === -1 ? null : template.slice('/api/v1/'.length, firstParam);
    const lastSegment = template.slice(template.lastIndexOf('/') + 1);
    routes.push({
      template,
      pattern: new RegExp(`^${source}$`),
      params,
      fixture: template.slice('/api/v1/'.length).replace(/\.png$/, ''),
      listFixture,
      idField: params.length > 0 ? idFieldFor(params[0] as string) : null,
      detail: /^\{\w+\}$/.test(lastSegment)
    });
  }
  return routes;
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'cache-control': 'no-store' } }
  );
}

function jsonResponse(document: unknown, isPublic: boolean): Response {
  const body = JSON.stringify(rebaseTimes(document));
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': isPublic ? 'public, max-age=15' : 'no-store',
      etag
    }
  });
}

function listItems(fixture: string | null): Record<string, unknown>[] {
  if (!fixture) return [];
  const document = getFixture(fixture) as ListDocument | undefined;
  return Array.isArray(document?.items) ? (document.items as Record<string, unknown>[]) : [];
}

function knownIds(route: MockRoute): Set<string> {
  const ids = new Set<string>();
  if (!route.idField) return ids;
  const lists = [route.listFixture];
  if (route.listFixture === 'players') lists.push('admin/players');
  if (route.listFixture === 'admin/players') lists.push('players');
  for (const list of lists) {
    for (const item of listItems(list)) {
      const value = item[route.idField];
      if (value !== undefined) ids.add(String(value));
    }
  }
  const own = getFixture(route.fixture) as Record<string, unknown> | undefined;
  if (own && own[route.idField] !== undefined) ids.add(String(own[route.idField]));
  return ids;
}

function findListItem(route: MockRoute, id: string): Record<string, unknown> | undefined {
  if (!route.idField) return undefined;
  const lists = [route.listFixture];
  if (route.listFixture === 'players') lists.push('admin/players');
  for (const list of lists) {
    const found = listItems(list).find((item) => String(item[route.idField as string]) === id);
    if (found) return found;
  }
  return undefined;
}

function mergeScalars(
  document: Record<string, unknown>,
  item: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...document };
  for (const [key, value] of Object.entries(item)) {
    if (value === null || typeof value !== 'object') merged[key] = value;
  }
  return merged;
}

function decodeCursor(cursor: string | null): number | null {
  if (cursor === null || cursor === '') return 0;
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const offset = Number(decoded);
  if (!/^\d+$/.test(decoded) || !Number.isSafeInteger(offset)) return null;
  return offset;
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset)).toString('base64url');
}

function paginate(
  document: Record<string, unknown>,
  url: URL,
  defaultLimit: number,
  maxLimit: number
): Record<string, unknown> | Response {
  if (!Array.isArray(document.items)) return document;
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw === null ? defaultLimit : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    return errorResponse(400, 'bad_request', `limit must be an integer between 1 and ${maxLimit}`);
  }
  const paged = 'next_cursor' in document;
  const offset = paged ? decodeCursor(url.searchParams.get('cursor')) : 0;
  if (offset === null) return errorResponse(400, 'bad_request', 'cursor is not valid');
  const items = document.items as unknown[];
  const slice = items.slice(offset, offset + limit);
  const result: Record<string, unknown> = { ...document, items: slice };
  if (paged)
    result.next_cursor = offset + limit < items.length ? encodeCursor(offset + limit) : null;
  return result;
}

function matchesPlayer(item: Record<string, unknown>, url: URL): boolean {
  const player = url.searchParams.get('player');
  if (!player) return true;
  const ref = item.player as { id?: number } | null | undefined;
  return String(ref?.id ?? '') === player;
}

function filterItems(
  route: MockRoute,
  document: Record<string, unknown>,
  url: URL
): Record<string, unknown> {
  if (!Array.isArray(document.items) || route.template !== '/api/v1/activity') return document;
  const items = document.items as Record<string, unknown>[];
  const requested = url.searchParams.get('types');
  const wanted = requested
    ? new Set(
        requested
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    : null;
  return {
    ...document,
    items: items.filter(
      (item) => (!wanted || wanted.has(String(item.type))) && matchesPlayer(item, url)
    )
  };
}

function answerGet(route: MockRoute, match: RegExpExecArray, url: URL): Response {
  const id = route.params.length > 0 ? decodeURIComponent(match[1] as string) : null;
  if (id !== null && route.idField && !knownIds(route).has(id)) {
    return errorResponse(
      404,
      'not_found',
      `${route.listFixture ?? 'resource'} ${id} does not exist`
    );
  }
  let document = cloneFixture<Record<string, unknown>>(route.fixture);
  if (!document) return errorResponse(404, 'not_found', `no fixture for ${route.template}`);
  if (id !== null && route.detail && route.idField && String(document[route.idField]) !== id) {
    const item = findListItem(route, id);
    if (item) document = mergeScalars(document, item);
  }
  document = filterItems(route, document, url);
  const paged = paginate(document, url, 50, 200);
  if (paged instanceof Response) return paged;
  return jsonResponse(paged, !route.template.startsWith('/api/v1/admin/'));
}

async function readJson(event: RequestEvent): Promise<Record<string, unknown> | null> {
  try {
    const body = (await event.request.json()) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function answerAdminMutation(event: RequestEvent): Promise<Response | null> {
  const { pathname } = event.url;
  const method = event.request.method;
  const noStore = { 'cache-control': 'no-store' };

  if (pathname === '/api/v1/admin/login' && method === 'POST') {
    const body = await readJson(event);
    if (!body || typeof body.password !== 'string')
      return errorResponse(400, 'bad_request', 'password is required');
    if (body.password === '') return errorResponse(401, 'unauthorized', 'wrong password');
    return new Response(null, {
      status: 204,
      headers: { ...noStore, 'set-cookie': `${cookieName}=mock; Path=/; HttpOnly; SameSite=Lax` }
    });
  }
  if (pathname === '/api/v1/admin/logout' && method === 'POST') {
    return new Response(null, {
      status: 204,
      headers: {
        ...noStore,
        'set-cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
      }
    });
  }
  if (pathname === '/api/v1/admin/setup' && method === 'POST') {
    return errorResponse(409, 'conflict', 'the admin password is already set');
  }
  if (pathname === '/api/v1/admin/collector/secret' && method === 'POST') {
    return Response.json(
      {
        secret: `mock-${createHash('sha1').update(String(Date.now())).digest('hex').slice(0, 24)}`
      },
      { headers: noStore }
    );
  }
  if (pathname === '/api/v1/admin/settings' && method === 'PUT') {
    const body = await readJson(event);
    if (!body) return errorResponse(400, 'bad_request', 'body must be a JSON object');
    const current = cloneFixture<Record<string, unknown>>('admin/settings') ?? {};
    const features = {
      ...(current.features as Record<string, boolean>),
      ...((body.features as Record<string, boolean> | undefined) ?? {})
    };
    return Response.json({ ...current, ...body, features }, { headers: noStore });
  }
  const players = listItems('admin/players');
  const patch = /^\/api\/v1\/admin\/players\/(\d+)$/.exec(pathname);
  if (patch && method === 'PATCH') {
    const player = players.find((item) => String(item.id) === patch[1]);
    if (!player) return errorResponse(404, 'not_found', `player ${patch[1]} does not exist`);
    const body = await readJson(event);
    if (!body) return errorResponse(400, 'bad_request', 'body must be a JSON object');
    const updated = structuredClone(player);
    if ('name_override' in body) {
      if (body.name_override !== null && typeof body.name_override !== 'string') {
        return errorResponse(400, 'bad_request', 'name_override must be null or a string');
      }
      updated.name_override = body.name_override;
      updated.name = body.name_override ?? updated.game_name;
    }
    if ('hidden' in body) {
      if (typeof body.hidden !== 'boolean') {
        return errorResponse(400, 'bad_request', 'hidden must be true or false');
      }
      updated.hidden = body.hidden;
    }
    return Response.json(updated, { headers: noStore });
  }
  if (
    (pathname === '/api/v1/admin/projections/rebuild' ||
      pathname === '/api/v1/admin/backups/run') &&
    method === 'POST'
  ) {
    const job = getFixture('admin/jobs/{id}') as { id?: number } | undefined;
    return Response.json({ job_id: job?.id ?? 1 }, { status: 202, headers: noStore });
  }
  const queued = listItems('admin/actions');
  if (pathname === '/api/v1/admin/actions' && method === 'POST') {
    const body = await readJson(event);
    if (!body) return errorResponse(400, 'bad_request', 'body must be a JSON object');
    const kinds = ['announce', 'kick', 'ban', 'unban', 'save', 'shutdown'];
    if (typeof body.kind !== 'string' || !kinds.includes(body.kind)) {
      return errorResponse(400, 'bad_request', `kind must be one of ${kinds.join(', ')}`);
    }
    const nextId = queued.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1;
    const target = players.find((item) => item.id === body.player_id);
    return Response.json(
      {
        id: nextId,
        kind: body.kind,
        state: 'queued',
        message: typeof body.message === 'string' ? body.message : null,
        player: target ? { id: target.id, name: target.name } : null,
        user_id: target ? target.user_id : typeof body.user_id === 'string' ? body.user_id : null,
        waittime_s: typeof body.waittime_s === 'number' ? body.waittime_s : null,
        not_before:
          typeof body.delay_s === 'number' && body.delay_s > 0
            ? new Date(Date.now() + body.delay_s * 1000).toISOString()
            : null,
        created_at: new Date().toISOString(),
        delivered_at: null,
        finished_at: null,
        error: null
      },
      { status: 201, headers: noStore }
    );
  }
  const cancel = /^\/api\/v1\/admin\/actions\/(\d+)$/.exec(pathname);
  if (cancel && method === 'DELETE') {
    const item = queued.find((entry) => String(entry.id) === cancel[1]);
    if (!item) return errorResponse(404, 'not_found', `action ${cancel[1]} does not exist`);
    if (item.state !== 'queued') {
      return errorResponse(409, 'conflict', 'the collector has already picked this action up');
    }
    return Response.json(
      { ...item, state: 'cancelled', finished_at: new Date().toISOString() },
      { headers: noStore }
    );
  }
  return null;
}

export async function answerFromFixtures(event: RequestEvent): Promise<Response | null> {
  const { pathname } = event.url;
  if (!pathname.startsWith('/api/v1/') || realRoutes.has(pathname)) return null;
  if (pathname === '/api/v1/stream') {
    return event.request.method === 'GET' ? mockStream(event.request) : null;
  }
  if (event.request.method === 'GET' || event.request.method === 'HEAD') {
    if (pathname === sessionPath && !hasAdminSession(event.request)) {
      return jsonResponse({ authenticated: false, expires_at: null, setup_required: false }, false);
    }
    for (const route of getRoutes()) {
      const match = route.pattern.exec(pathname);
      if (!match || !hasFixture(route.fixture)) continue;
      return answerGet(route, match, event.url);
    }
    return null;
  }
  return answerAdminMutation(event);
}
