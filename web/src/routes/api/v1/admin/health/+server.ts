import { getScheduler } from '../../../../../hooks.server';
import { adminGet } from '$lib/server/http/routes';
import { adminHealth } from '$lib/server/read/admin';

export const GET = adminGet(async (_event, db) => adminHealth(db, getScheduler()?.status() ?? []));
