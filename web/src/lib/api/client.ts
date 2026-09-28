import createClient from 'openapi-fetch';
import { endpoints, resolvePath } from './endpoints';
import type { components, paths } from './types';

export type ErrorCode = components['schemas']['Error']['error']['code'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  static async fromResponse(response: Response, body: unknown): Promise<ApiError> {
    const fallback = codeForStatus(response.status);
    const parsed = body ?? (await response.text().catch(() => ''));
    const record =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { error?: { code?: string; message?: string } })
        : undefined;
    const code = (record?.error?.code as ErrorCode | undefined) ?? fallback;
    const message =
      record?.error?.message ??
      (typeof parsed === 'string' && parsed ? parsed : `${response.status} ${response.statusText}`);
    return new ApiError(response.status, code, message);
  }
}

function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 413:
      return 'payload_too_large';
    case 422:
      return 'unprocessable';
    case 429:
      return 'rate_limited';
    case 501:
      return 'not_implemented';
    default:
      return 'unavailable';
  }
}

type Get<P extends keyof paths> = paths[P] extends { get: infer O } ? O : never;
type QueryOf<O> = O extends { parameters: { query?: infer Q } } ? Q : never;

export type ActivityQuery = QueryOf<Get<'/api/v1/activity'>>;
export type PlayersQuery = QueryOf<Get<'/api/v1/players'>>;
export type AdminEventsQuery = QueryOf<Get<'/api/v1/admin/events'>>;
export type AdminPlayersQuery = QueryOf<Get<'/api/v1/admin/players'>>;
export type StatusHistoryRange = NonNullable<QueryOf<Get<'/api/v1/status/history'>>>['range'];
export type Pagination = { limit?: number; cursor?: string };

export interface ApiOptions {
  fetch?: typeof globalThis.fetch;
  baseUrl?: string;
}

interface Outcome<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

async function unwrap<T>(outcome: Promise<Outcome<T>>): Promise<T> {
  const { data, error, response } = await outcome;
  if (!response.ok || error !== undefined) throw await ApiError.fromResponse(response, error);
  return data as T;
}

async function unwrapVoid(outcome: Promise<Outcome<unknown>>): Promise<void> {
  const { error, response } = await outcome;
  if (!response.ok || (error !== undefined && response.status >= 400)) {
    throw await ApiError.fromResponse(response, error);
  }
}

type Schemas = components['schemas'];

export function createApi(options: ApiOptions = {}) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? '',
    fetch: options.fetch ?? globalThis.fetch
  });

  return {
    getStatus: () => unwrap(client.GET('/api/v1/status')),
    getStatusHistory: (range?: StatusHistoryRange) =>
      unwrap(client.GET('/api/v1/status/history', { params: { query: { range } } })),
    getOnline: () => unwrap(client.GET('/api/v1/online')),
    listActivity: (query: ActivityQuery = {}) =>
      unwrap(client.GET('/api/v1/activity', { params: { query } })),
    listPlayers: (query: PlayersQuery = {}) =>
      unwrap(client.GET('/api/v1/players', { params: { query } })),
    getPlayer: (id: number) =>
      unwrap(client.GET('/api/v1/players/{id}', { params: { path: { id } } })),
    listPlayerSessions: (id: number, page: Pagination = {}) =>
      unwrap(
        client.GET('/api/v1/players/{id}/sessions', { params: { path: { id }, query: page } })
      ),
    getPlayerTrail: (id: number, session?: number) =>
      unwrap(
        client.GET('/api/v1/players/{id}/trail', {
          params: { path: { id }, query: session ? { session } : {} }
        })
      ),
    getPlayerPalpedia: (id: number) =>
      unwrap(client.GET('/api/v1/players/{id}/palpedia', { params: { path: { id } } })),
    getGuildPalpedia: (id: string) =>
      unwrap(client.GET('/api/v1/guilds/{id}/palpedia', { params: { path: { id } } })),
    listChat: (page: Pagination = {}) =>
      unwrap(client.GET('/api/v1/chat', { params: { query: page } })),
    listGuilds: () => unwrap(client.GET('/api/v1/guilds')),
    getGuild: (id: string) =>
      unwrap(client.GET('/api/v1/guilds/{id}', { params: { path: { id } } })),
    getMap: () => unwrap(client.GET('/api/v1/map')),
    getLeaderboards: () => unwrap(client.GET('/api/v1/leaderboards')),
    getWorld: () => unwrap(client.GET('/api/v1/world')),
    getHealth: () => unwrap(client.GET('/api/v1/health')),
    getSite: () => unwrap(client.GET('/api/v1/site')),
    adminLogin: (password: string) =>
      unwrapVoid(client.POST('/api/v1/admin/login', { body: { password } })),
    adminLogout: () => unwrapVoid(client.POST('/api/v1/admin/logout')),
    getAdminSession: () => unwrap(client.GET('/api/v1/admin/session')),
    adminSetup: (password: string) =>
      unwrapVoid(client.POST('/api/v1/admin/setup', { body: { password } })),
    getAdminSettings: () => unwrap(client.GET('/api/v1/admin/settings')),
    updateAdminSettings: (update: Schemas['AdminSettingsUpdate']) =>
      unwrap(client.PUT('/api/v1/admin/settings', { body: update })),
    getAdminCollector: () => unwrap(client.GET('/api/v1/admin/collector')),
    regenerateCollectorSecret: () => unwrap(client.POST('/api/v1/admin/collector/secret')),
    listAdminPlayers: (query: AdminPlayersQuery = {}) =>
      unwrap(client.GET('/api/v1/admin/players', { params: { query } })),
    updateAdminPlayer: (id: number, patch: Schemas['PlayerPatch']) =>
      unwrap(client.PATCH('/api/v1/admin/players/{id}', { params: { path: { id } }, body: patch })),
    listActions: () => unwrap(client.GET('/api/v1/admin/actions')),
    createAction: (body: Schemas['ActionCreate']) =>
      unwrap(client.POST('/api/v1/admin/actions', { body })),
    cancelAction: (id: number) =>
      unwrap(client.DELETE('/api/v1/admin/actions/{id}', { params: { path: { id } } })),
    listAdminEvents: (query: AdminEventsQuery = {}) =>
      unwrap(client.GET('/api/v1/admin/events', { params: { query } })),
    rebuildProjections: () => unwrap(client.POST('/api/v1/admin/projections/rebuild')),
    runBackup: () => unwrap(client.POST('/api/v1/admin/backups/run')),
    listBackups: () => unwrap(client.GET('/api/v1/admin/backups')),
    getJob: (id: number) =>
      unwrap(client.GET('/api/v1/admin/jobs/{id}', { params: { path: { id } } })),
    getAdminHealth: () => unwrap(client.GET('/api/v1/admin/health')),
    streamUrl: endpoints.stream,
    pathFor: resolvePath
  };
}

export type Api = ReturnType<typeof createApi>;

export const api: Api = createApi();
