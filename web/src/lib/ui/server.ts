import { env } from '$env/dynamic/private';
import { createApi, type Api } from '$lib/api/client';

export interface ServerApi {
  api: Api;
  base: string;
  external: boolean;
}

export function serverApi(fetch: typeof globalThis.fetch, url: URL): ServerApi {
  const configured = env.API_BASE_URL?.trim().replace(/\/+$/, '');
  const base = configured || url.origin;
  return { api: createApi({ fetch, baseUrl: base }), base, external: base !== url.origin };
}

export function assetUrl(server: ServerApi, path: string | null): string | null {
  if (!path) return null;
  return server.external ? `${server.base}${path}` : path;
}
