import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url }) => {
  const { api } = serverApi(fetch, url);
  const [health, backups] = await Promise.all([
    attempt(api.getAdminHealth()),
    attempt(api.listBackups())
  ]);
  return { health, backups };
};
