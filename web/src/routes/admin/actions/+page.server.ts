import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const [actions, players] = await Promise.all([
    attempt(api.listActions()),
    attempt(api.listAdminPlayers({ limit: 200 }))
  ]);
  return { actions, players };
};
