import { publicGet } from '$lib/server/http/routes';
import { getMap } from '$lib/server/read/community';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async (_event, db) => getMap(db, await siteFeatures(db)));
