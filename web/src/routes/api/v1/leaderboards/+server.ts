import { publicGet } from '$lib/server/http/routes';
import { getLeaderboards } from '$lib/server/read/community';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async (_event, db) => getLeaderboards(db, await siteFeatures(db)));
