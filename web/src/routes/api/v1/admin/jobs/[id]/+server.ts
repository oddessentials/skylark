import { parsePathId } from '$lib/server/http/respond';
import { adminGet } from '$lib/server/http/routes';
import { getJob } from '$lib/server/jobs/runner';

export const GET = adminGet(async ({ params }) => getJob(parsePathId(params.id, 'id')));
