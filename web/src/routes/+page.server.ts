import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  const { features } = await parent();
  const { api } = serverApi(fetch, url);
  const showMap = features ? features.positions || features.bases : true;
  const [online, activity, map, leaderboards, history] = await Promise.all([
    attempt(api.getOnline()),
    attempt(api.listActivity({ limit: 14 })),
    showMap ? attempt(api.getMap()) : Promise.resolve(null),
    attempt(api.getLeaderboards()),
    attempt(api.getStatusHistory('24h'))
  ]);
  return { online, activity, map, leaderboards, history };
};
