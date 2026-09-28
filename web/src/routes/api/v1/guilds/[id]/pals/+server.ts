import { badRequest } from '$lib/server/http/respond';
import { publicGet, requireFeature } from '$lib/server/http/routes';
import { getGuildPals } from '$lib/server/read/pals';

export const GET = publicGet(async ({ params }, db) => {
  await requireFeature('pals', db);
  const id = params.id ?? '';
  if (id.length === 0 || id.length > 64) throw badRequest('id must be 1 to 64 characters');
  return getGuildPals(db, id);
});
