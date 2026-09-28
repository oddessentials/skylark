import { attempt } from '$lib/ui/load';
import { pickEnum } from '$lib/ui/query';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

const ranges = ['24h', '7d', '30d'] as const;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const range = pickEnum(url.searchParams, 'range', ranges, '7d');
  const [world, history] = await Promise.all([
    attempt(api.getWorld()),
    attempt(api.getStatusHistory(range))
  ]);
  return { world, history, range };
};
