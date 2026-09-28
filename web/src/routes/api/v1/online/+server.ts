import { publicGet } from '$lib/server/http/routes';
import { computeOnline } from '$lib/server/read/status';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async (_event, db) => computeOnline(db, await siteFeatures(db)));
