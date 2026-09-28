import { parsePathId, privateJson } from '$lib/server/http/respond';
import { adminMutation, readJsonBody } from '$lib/server/http/routes';
import { parsePlayerPatch, updateAdminPlayer } from '$lib/server/read/admin';
import { publishStatus } from '$lib/server/stream/publish';

export const PATCH = adminMutation(async (event, db) => {
  const id = parsePathId(event.params.id, 'id');
  const player = await updateAdminPlayer(db, id, parsePlayerPatch(await readJsonBody(event)));
  await publishStatus(true);
  return privateJson(player);
});
