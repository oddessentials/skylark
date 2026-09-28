import { attempt } from '$lib/ui/load';
import { pickEnum, pickText } from '$lib/ui/query';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

const sorts = ['last_seen', 'playtime', 'level', 'name'] as const;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const sort = pickEnum(url.searchParams, 'sort', sorts, 'last_seen');
  const q = pickText(url.searchParams, 'q') ?? '';
  const cursor = pickText(url.searchParams, 'cursor');
  const [players, leaderboards] = await Promise.all([
    attempt(api.listPlayers({ sort, q: q || undefined, cursor, limit: 50 })),
    attempt(api.getLeaderboards())
  ]);
  return { players, leaderboards, sort, q };
};
