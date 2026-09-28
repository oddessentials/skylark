import { publicGet } from '$lib/server/http/routes';
import { computeStatus } from '$lib/server/read/status';

export const GET = publicGet(async (_event, db) => computeStatus(db));
