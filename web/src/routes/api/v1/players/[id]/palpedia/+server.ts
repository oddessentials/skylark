import { parsePathId } from '$lib/server/http/respond';
import { publicGet } from '$lib/server/http/routes';
import { getPlayerPalpedia } from '$lib/server/read/palpedia';

export const GET = publicGet(async ({ params }, db) =>
  getPlayerPalpedia(db, parsePathId(params.id, 'id'))
);
