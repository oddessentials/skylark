import { display, maps } from './map.json';

export type MapId = 'MainMap' | 'Tree';

export interface MapRect {
  id: MapId;
  name: string;
  priority: number;
  min: [number, number];
  max: [number, number];
}

export const mapRects: MapRect[] = maps.map((entry) => ({
  id: entry.id as MapId,
  name: entry.name,
  priority: entry.priority,
  min: [entry.min[0]!, entry.min[1]!],
  max: [entry.max[0]!, entry.max[1]!]
}));

export const mainMap: MapRect = mapRects.find((entry) => entry.id === 'MainMap')!;
export const treeMap: MapRect = mapRects.find((entry) => entry.id === 'Tree')!;

export interface ImagePoint {
  u: number;
  v: number;
}

export function toImage(x: number, y: number, rect: MapRect = mainMap): ImagePoint {
  return {
    u: (y - rect.min[1]) / (rect.max[1] - rect.min[1]),
    v: 1 - (x - rect.min[0]) / (rect.max[0] - rect.min[0])
  };
}

export function fromImage(u: number, v: number, rect: MapRect = mainMap): { x: number; y: number } {
  return {
    x: rect.min[0] + (1 - v) * (rect.max[0] - rect.min[0]),
    y: rect.min[1] + u * (rect.max[1] - rect.min[1])
  };
}

export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (Math.abs(fraction - 0.5) > 1e-9) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

export function toDisplay(x: number, y: number): { x: number; y: number } {
  return {
    x: roundHalfEven((y - display.x.origin) / display.x.scale),
    y: roundHalfEven((x - display.y.origin) / display.y.scale)
  };
}

export function formatDisplay(x: number | null | undefined, y: number | null | undefined): string {
  if (x === null || x === undefined || y === null || y === undefined) return '';
  const point = toDisplay(x, y);
  return `${point.x}, ${point.y}`;
}

function inside(rect: MapRect, x: number, y: number): boolean {
  return x >= rect.min[0] && x <= rect.max[0] && y >= rect.min[1] && y <= rect.max[1];
}

export function mapOf(x: number, y: number): MapRect | null {
  const candidates = mapRects
    .filter((rect) => inside(rect, x, y))
    .sort((a, b) => b.priority - a.priority);
  return candidates[0] ?? null;
}
