import type { GuildPalpediaEntry, PalpediaEntry } from '$lib/api/types';
import { wayLabels, type HabitatWay } from '$lib/world/habitats';
import { palpediaNumber, primaryColor, speciesInfo } from '$lib/world/species';

export type AnyEntry = PalpediaEntry | GuildPalpediaEntry;

export interface Tile {
  species: string;
  number: string;
  name: string;
  color: string;
  caught: boolean;
  captures: number;
  holders: number[];
  how: string;
  mapHref: string | null;
}

export const noSource = 'no source in the game’s tables';

export function howToGet(entry: Pick<AnyEntry, 'ways' | 'night_only' | 'levels'>): string {
  if (entry.ways.length === 0) return noSource;
  const parts = entry.ways.map((way) =>
    way === 'wild' && entry.night_only ? 'in the wild at night' : wayLabels[way as HabitatWay]
  );
  const text = parts.join(', ');
  return entry.levels ? `${text}, level ${entry.levels[0]} to ${entry.levels[1]}` : text;
}

export function onTheMap(entry: Pick<AnyEntry, 'ways'>): boolean {
  return entry.ways.includes('wild') || entry.ways.includes('alpha');
}

export function tileOf(entry: AnyEntry): Tile {
  const info = speciesInfo(entry.species);
  return {
    species: entry.species,
    number: info ? palpediaNumber(info) : '',
    name: info?.name ?? entry.species,
    color: primaryColor(entry.species),
    caught: entry.caught,
    captures: entry.captures,
    holders: 'holders' in entry ? entry.holders : [],
    how: howToGet(entry),
    mapHref: onTheMap(entry) ? `/map?species=${encodeURIComponent(entry.species)}` : null
  };
}

export function tilesOf(entries: AnyEntry[]): Tile[] {
  return entries.map(tileOf);
}

export function describeTile(tile: Tile, holderNames: string[] = []): string {
  const head = `${tile.number} ${tile.name}`.trim();
  if (!tile.caught) return `${head}: missing, ${tile.how}`;
  const who = holderNames.length > 0 ? ` by ${holderNames.join(', ')}` : '';
  const count = tile.captures > 0 ? `, ${tile.captures} captured` : '';
  return `${head}: caught${who}${count}`;
}
