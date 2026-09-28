import { error } from '@sveltejs/kit';
import { attempt } from '$lib/ui/load';
import { pickInt } from '$lib/ui/query';
import { serverApi } from '$lib/ui/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, url, params, parent }) => {
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) error(404, 'No such player');
  const { features } = await parent();
  const { api } = serverApi(fetch, url);
  const session = pickInt(url.searchParams, 'session');
  const [player, sessions, trail, palpedia] = await Promise.all([
    attempt(api.getPlayer(id)),
    attempt(api.listPlayerSessions(id, { limit: 20 })),
    features && !features.positions
      ? Promise.resolve(null)
      : attempt(api.getPlayerTrail(id, session)),
    attempt(api.getPlayerPalpedia(id))
  ]);
  if (!player.ok && player.error.status === 404) error(404, 'No such player');
  return { player, sessions, trail, palpedia, session: session ?? null };
};
