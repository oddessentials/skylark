import { publicGet } from '$lib/server/http/routes';
import { listGuilds } from '$lib/server/read/community';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async (_event, db) => ({
  items: await listGuilds(db, await siteFeatures(db))
}));
