import { keysetResult, parseIntegerParam, parseKeysetPage } from '$lib/server/http/respond';
import { publicGet } from '$lib/server/http/routes';
import { buildActivityItems, listActivity, parseTypes } from '$lib/server/read/activity';
import { siteFeatures } from '$lib/server/settings';

export const GET = publicGet(async ({ url }, db) => {
  const features = await siteFeatures(db);
  const page = parseKeysetPage(url);
  const { rows } = await listActivity(db, features, {
    types: parseTypes(url.searchParams.get('types')),
    playerId: parseIntegerParam(url, 'player'),
    page
  });
  const items = await buildActivityItems(db, rows, features);
  return keysetResult(items, page, (item) => ({ ts: new Date(item.ts), id: item.id }));
});
