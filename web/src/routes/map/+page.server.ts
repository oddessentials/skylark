import { error } from '@sveltejs/kit';
import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  const { features } = await parent();
  if (features && !features.positions && !features.bases) {
    error(404, 'The map is switched off on this site');
  }
  const { api } = serverApi(fetch, url);
  return { map: await attempt(api.getMap()) };
};
