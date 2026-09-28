import { adminGet } from '$lib/server/http/routes';
import { listBackups } from '$lib/server/jobs/backup';

export const GET = adminGet(async (_event, db) => ({ items: await listBackups(db) }));
