import { badRequest, pageResult, parsePage } from '$lib/server/http/respond';
import { adminGet } from '$lib/server/http/routes';
import { listAdminPlayers } from '$lib/server/read/admin';

export const GET = adminGet(async ({ url }, db) => {
  const page = parsePage(url);
  const search = url.searchParams.get('q')?.trim() || null;
  if (search !== null && search.length > 128) throw badRequest('q must be at most 128 characters');
  return pageResult(await listAdminPlayers(db, search, page), page);
});
