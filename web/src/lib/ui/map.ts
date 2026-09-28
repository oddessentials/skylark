import { runsOf, type HabitatCells } from '$lib/world/cells';
import { fast_travel, towers } from '$lib/world/landmarks.json';
import { mainMap, mapOf, toImage, treeMap, type MapId, type MapRect } from '$lib/world/map';
import { regions } from '$lib/world/regions.json';

export const mapSize = 1000;

export interface HabitatLayer {
  species: string;
  name: string;
  note: string;
  grid: number;
  maps: Partial<Record<MapId, HabitatCells>>;
}

export interface HabitatRun {
  x: number;
  y: number;
  w: number;
  h: number;
  period: 'both' | 'day' | 'night';
}

export function habitatRuns(cells: HabitatCells | undefined, grid: number): HabitatRun[] {
  if (!cells || grid <= 0) return [];
  const size = mapSize / grid;
  const runs: HabitatRun[] = [];
  for (const period of ['both', 'day', 'night'] as const) {
    for (const run of runsOf(cells[period], grid)) {
      runs.push({
        x: run.from * size,
        y: run.row * size,
        w: (run.to - run.from + 1) * size,
        h: size,
        period
      });
    }
  }
  return runs;
}

export interface Projected {
  x: number;
  y: number;
}

export function rectOf(id: MapId): MapRect {
  return id === 'Tree' ? treeMap : mainMap;
}

export function project(x: number, y: number, rect: MapRect): Projected {
  const point = toImage(x, y, rect);
  return { x: point.u * mapSize, y: point.v * mapSize };
}

export function onMap(x: number, y: number, id: MapId): boolean {
  return (mapOf(x, y)?.id ?? 'MainMap') === id;
}

export interface RegionShape {
  id: string;
  name: string;
  label: Projected | null;
  paths: string[];
  area: number;
}

function regionShapes(id: MapId): RegionShape[] {
  const rect = rectOf(id);
  return regions.flatMap((region) => {
    const label = region.label ? { x: region.label[0]!, y: region.label[1]! } : null;
    if (label && !onMap(label.x, label.y, id)) return [];
    const paths = region.shapes.flatMap((shape) => {
      if (!('footprint' in shape) || shape.footprint.length < 3) return [];
      const points = shape.footprint.map((corner: number[]) =>
        project(corner[0]!, corner[1]!, rect)
      );
      return [
        `M ${points.map((point: Projected) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')} Z`
      ];
    });
    const area = region.shapes.reduce((total, shape) => total + (shape.area ?? 0), 0);
    return [
      {
        id: region.id,
        name: region.name,
        label: label ? project(label.x, label.y, rect) : null,
        paths,
        area
      }
    ];
  });
}

export interface Landmark {
  id: string;
  name: string;
  kind: 'statue' | 'tower';
  at: Projected;
}

function landmarkList(id: MapId): Landmark[] {
  const rect = rectOf(id);
  const statues = fast_travel
    .filter((entry) => entry.map === id)
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind: 'statue' as const,
      at: project(entry.position[0]!, entry.position[1]!, rect)
    }));
  const spires = towers
    .filter((entry) => entry.map === id)
    .map((entry) => ({
      id: `${entry.boss_type}-${entry.class}`,
      name: entry.name,
      kind: 'tower' as const,
      at: project(entry.position[0]!, entry.position[1]!, rect)
    }));
  return [...statues, ...spires];
}

export interface Chart {
  regions: RegionShape[];
  landmarks: Landmark[];
  majorAreas: Set<string>;
}

const cache = new Map<MapId, Chart>();

export function chartOf(id: MapId): Chart {
  let chart = cache.get(id);
  if (!chart) {
    const regions = regionShapes(id);
    const major = [...regions]
      .filter((region) => region.label)
      .sort((a, b) => b.area - a.area)
      .slice(0, 22)
      .map((region) => region.id);
    chart = { regions, landmarks: landmarkList(id), majorAreas: new Set(major) };
    cache.set(id, chart);
  }
  return chart;
}

const guildPalette = ['#0d6e86', '#9a4b07', '#6a3fa0', '#2c6e2a', '#b02f26', '#1e7fc4', '#8a5200'];

export function guildColor(id: string | null | undefined): string {
  if (!id) return 'var(--color-steel)';
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return guildPalette[hash % guildPalette.length]!;
}

export function initialOf(name: string): string {
  const letter = [...name.trim()][0];
  return letter ? letter.toUpperCase() : '?';
}
