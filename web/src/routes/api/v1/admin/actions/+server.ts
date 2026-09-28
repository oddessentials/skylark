import { privateJson } from '$lib/server/http/respond';
import { adminGet, adminMutation, readJsonBody } from '$lib/server/http/routes';
import { createAction, listActions, parseActionCreate } from '$lib/server/read/admin';

export const GET = adminGet(async (_event, db) => ({ items: await listActions(db) }));

export const POST = adminMutation(async (event, db) =>
  privateJson(await createAction(db, parseActionCreate(await readJsonBody(event))), 201)
);
