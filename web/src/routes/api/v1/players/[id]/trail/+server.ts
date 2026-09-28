import { parseIntegerParam, parsePathId } from '$lib/server/http/respond';
import { publicGet, requireFeature } from '$lib/server/http/routes';
import { getTrail } from '$lib/server/read/players';

export const GET = publicGet(async ({ params, url }, db) => {
  await requireFeature('positions', db);
  return getTrail(db, parsePathId(params.id, 'id'), parseIntegerParam(url, 'session'));
});
