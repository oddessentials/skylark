import { publicGet } from '$lib/server/http/routes';
import { getProgression } from '$lib/server/read/progression';

export const GET = publicGet(async (_event, db) => getProgression(db));
