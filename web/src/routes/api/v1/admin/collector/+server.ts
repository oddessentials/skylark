import { adminGet } from '$lib/server/http/routes';
import { collectorAdmin } from '$lib/server/read/admin';

export const GET = adminGet(async (_event, db) => collectorAdmin(db));
