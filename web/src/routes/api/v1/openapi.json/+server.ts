import type { RequestHandler } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { getContractJson } from '$lib/server/openapi';

export const GET: RequestHandler = async ({ request }) => {
  const body = getContractJson();
  const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }
  return new Response(body, {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=15',
      etag
    }
  });
};
