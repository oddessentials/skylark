import { parsePathId, privateJson } from '$lib/server/http/respond';
import { adminMutation } from '$lib/server/http/routes';
import { cancelAction } from '$lib/server/read/admin';

export const DELETE = adminMutation(async (event, db) =>
  privateJson(await cancelAction(db, parsePathId(event.params.id, 'id')))
);
