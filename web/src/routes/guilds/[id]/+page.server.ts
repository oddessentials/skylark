import { error } from '@sveltejs/kit';
import { attempt } from '$lib/ui/load';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url, params }) => {
  const { api } = serverApi(fetch, url);
  const [guild, palpedia, pals] = await Promise.all([
    attempt(api.getGuild(params.id)),
    attempt(api.getGuildPalpedia(params.id)),
    attempt(api.getGuildPals(params.id))
  ]);
  if (!guild.ok && guild.error.status === 404) error(404, 'No such guild');
  return { guild, palpedia, pals };
};
