import { badRequest } from '$lib/server/http/respond';
import { publicGet } from '$lib/server/http/routes';
import { getGuildPalpedia } from '$lib/server/read/palpedia';

export const GET = publicGet(async ({ params }, db) => {
  const id = params.id ?? '';
  if (id.length === 0 || id.length > 64) throw badRequest('id must be 1 to 64 characters');
  return getGuildPalpedia(db, id);
});
