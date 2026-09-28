import { publicGet } from '$lib/server/http/routes';
import { getWorld } from '$lib/server/read/community';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async (_event, db) => getWorld(db, await siteFeatures(db)));
