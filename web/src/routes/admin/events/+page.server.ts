import { attempt } from '$lib/ui/load';
import { pickBoolean, pickText } from '$lib/ui/query';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const type = pickText(url.searchParams, 'type') ?? '';
  const invalid = pickBoolean(url.searchParams, 'invalid');
  const cursor = pickText(url.searchParams, 'cursor');
  return {
    events: await attempt(
      api.listAdminEvents({
        type: type || undefined,
        invalid: invalid ? true : undefined,
        cursor,
        limit: 100
      })
    ),
    type,
    invalid
  };
};
