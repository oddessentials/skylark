import { badRequest } from '$lib/server/http/respond';
import { publicGet } from '$lib/server/http/routes';
import { getGuild } from '$lib/server/read/community';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async ({ params }, db) => {
  const id = params.id ?? '';
  if (id.length === 0 || id.length > 64) throw badRequest('id must be 1 to 64 characters');
  return getGuild(db, id, await siteFeatures(db));
});
