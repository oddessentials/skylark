import { parsePathId } from '$lib/server/http/respond';
import { publicGet } from '$lib/server/http/routes';
import { getPlayer } from '$lib/server/read/players';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async ({ params }, db) =>
  getPlayer(db, parsePathId(params.id, 'id'), await siteFeatures(db))
);
