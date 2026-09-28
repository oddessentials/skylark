import { error } from '@sveltejs/kit';
import { attempt } from '$lib/ui/load';
import type { HabitatLayer } from '$lib/ui/map';
import { pickText } from '$lib/ui/query';
import { serverApi } from '$lib/ui/server';
import { describeWays, habitatGrid, habitatOf } from '$lib/world/habitats';
import { palpediaNumber, speciesInfo } from '$lib/world/species';
import type { PageServerLoad } from './$types';

function habitatLayerOf(species: string | undefined): HabitatLayer | null {
  if (!species) return null;
  const info = speciesInfo(species);
  const habitat = habitatOf(species);
  if (!info || !habitat) error(404, 'No such Pal');
  const ways = describeWays(habitat);
  const levels = habitat.levels ? `, level ${habitat.levels[0]} to ${habitat.levels[1]}` : '';
  return {
    species: info.id,
    name: info.name,
    note: `${info.name} ${palpediaNumber(info)}: ${ways || 'no source in the game’s tables'}${levels}`,
    grid: habitatGrid,
    maps: habitat.maps
  };
}

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  const { features } = await parent();
  const habitat = habitatLayerOf(pickText(url.searchParams, 'species'));
  if (!habitat && features && !features.positions && !features.bases) {
    error(404, 'The map is switched off on this site');
  }
  const { api } = serverApi(fetch, url);
  const [map, progression] = await Promise.all([
    attempt(api.getMap()),
    attempt(api.getProgression())
  ]);
  return { map, progression, habitat };
};
