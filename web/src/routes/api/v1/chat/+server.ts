import { keysetResult, parseKeysetPage } from '$lib/server/http/respond';
import { publicGet, requireFeature } from '$lib/server/http/routes';
import { listChat } from '$lib/server/read/community';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async ({ url }, db) => {
  await requireFeature('chat', db);
  const page = parseKeysetPage(url);
  const items = await listChat(db, await siteFeatures(db), page);
  return keysetResult(items, page, (item) => ({ ts: new Date(item.ts), id: item.id }));
});
