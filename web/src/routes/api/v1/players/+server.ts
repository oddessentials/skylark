import { badRequest, pageResult, parseEnum, parsePage } from '$lib/server/http/respond';
import { publicGet } from '$lib/server/http/routes';
import { listPlayers, playerSorts } from '$lib/server/read/players';

export const GET = publicGet(async ({ url }, db) => {
  const page = parsePage(url);
  const search = url.searchParams.get('q')?.trim() || null;
  if (search !== null && search.length > 64) throw badRequest('q must be at most 64 characters');
  const items = await listPlayers(
    db,
    parseEnum(url, 'sort', playerSorts, 'last_seen'),
    search,
    page
  );
  return pageResult(items, page);
});
