import {
  badRequest,
  keysetResult,
  parseBooleanParam,
  parseIntegerParam,
  parseKeysetPage
} from '$lib/server/http/respond';
import { adminGet } from '$lib/server/http/routes';
import { listAdminEvents } from '$lib/server/read/admin';

export const GET = adminGet(async ({ url }, db) => {
  const page = parseKeysetPage(url);
  const type = url.searchParams.get('type')?.trim() || null;
  if (type !== null && type.length > 64) throw badRequest('type must be at most 64 characters');
  const items = await listAdminEvents(db, {
    type,
    invalid: parseBooleanParam(url, 'invalid'),
    playerId: parseIntegerParam(url, 'player'),
    page
  });
  return keysetResult(items, page, (item) => ({ ts: new Date(item.ts), id: item.id }));
});
