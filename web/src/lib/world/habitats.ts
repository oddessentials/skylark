import { decodeRanges, runsOf, type CellRun, type HabitatCells } from './cells';
import { grid, species, ways } from './habitats.json';
import type { MapId } from './map';

export { decodeRanges, runsOf, type CellRun, type HabitatCells };

export type HabitatWay = 'wild' | 'alpha' | 'boss' | 'egg' | 'fished' | 'caged' | 'raid' | 'bred';

export interface Habitat {
  id: string;
  ways: HabitatWay[];
  levels: [number, number] | null;
  maps: Partial<Record<MapId, HabitatCells>>;
  nightOnly: boolean;
}

export const habitatGrid: number = grid;
export const habitatWays = ways as HabitatWay[];

export const wayLabels: Record<HabitatWay, string> = {
  wild: 'in the wild',
  alpha: 'as an alpha only',
  boss: 'a field boss',
  egg: 'from wild eggs',
  fished: 'by fishing',
  caged: 'caged at camps',
  raid: 'from raid eggs',
  bred: 'by breeding'
};

function decodeMaps(entry: (typeof species)[number]): Partial<Record<MapId, HabitatCells>> {
  const maps: Partial<Record<MapId, HabitatCells>> = {};
  for (const [id, cells] of Object.entries(entry.maps)) {
    maps[id as MapId] = {
      both: decodeRanges(cells.both),
      day: decodeRanges(cells.day),
      night: decodeRanges(cells.night)
    };
  }
  return maps;
}

const habitats = new Map<string, Habitat>(
  species.map((entry) => {
    const maps = decodeMaps(entry);
    const periods = Object.values(maps);
    const nightOnly =
      periods.length > 0 &&
      periods.every((cells) => cells.both.length === 0 && cells.day.length === 0);
    return [
      entry.id.toLowerCase(),
      {
        id: entry.id,
        ways: entry.ways as HabitatWay[],
        levels: entry.levels ? [entry.levels[0]!, entry.levels[1]!] : null,
        maps,
        nightOnly
      }
    ];
  })
);

export function habitatOf(id: string | null | undefined): Habitat | null {
  if (!id) return null;
  return habitats.get(id.toLowerCase()) ?? null;
}

export function describeWays(habitat: Habitat): string {
  const parts = habitat.ways.map((way) => wayLabels[way]);
  if (habitat.nightOnly && habitat.ways.includes('wild')) parts[0] = 'in the wild at night';
  return parts.join(', ');
}
