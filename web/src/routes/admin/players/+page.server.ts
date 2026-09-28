import { attempt } from '$lib/ui/load';
import { pickText } from '$lib/ui/query';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const q = pickText(url.searchParams, 'q') ?? '';
  const cursor = pickText(url.searchParams, 'cursor');
  return {
    players: await attempt(api.listAdminPlayers({ q: q || undefined, cursor, limit: 100 })),
    q
  };
};
