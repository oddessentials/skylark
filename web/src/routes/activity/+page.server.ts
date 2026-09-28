import { attempt } from '$lib/ui/load';
import { pickText } from '$lib/ui/query';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const types = pickText(url.searchParams, 'types');
  const cursor = pickText(url.searchParams, 'cursor');
  return {
    activity: await attempt(api.listActivity({ types, cursor, limit: 60 })),
    types: types ?? '',
    paged: cursor !== undefined
  };
};
