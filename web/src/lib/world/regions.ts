import { regions } from './regions.json';

interface Area {
  name: string;
  area: number;
  polygon: [number, number][];
}

const areas: Area[] = regions.flatMap((region) =>
  region.shapes.flatMap((shape) =>
    'footprint' in shape && shape.footprint.length >= 3
      ? [
          {
            name: region.name,
            area: shape.area ?? 0,
            polygon: shape.footprint.map(
              (corner: number[]) => [corner[0]!, corner[1]!] as [number, number]
            )
          }
        ]
      : []
  )
);

const labels = regions.flatMap((region) =>
  region.label ? [{ name: region.name, x: region.label[0]!, y: region.label[1]! }] : []
);

export const nearbyRegionCm = 60_000;

function contains(polygon: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function regionAt(x: number, y: number): string | null {
  let best: Area | null = null;
  for (const area of areas) {
    if (!contains(area.polygon, x, y)) continue;
    if (!best || area.area < best.area) best = area;
  }
  if (best) return best.name;
  let nearest: { name: string; distance: number } | null = null;
  for (const label of labels) {
    const distance = Math.hypot(label.x - x, label.y - y);
    if (distance <= nearbyRegionCm && (!nearest || distance < nearest.distance)) {
      nearest = { name: label.name, distance };
    }
  }
  return nearest?.name ?? null;
}

const placeholderName = /テンプレート名\d*\s*[（(]仮[）)]\s*$/;

export function baseNameOf(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (name === '' || placeholderName.test(name)) return null;
  return name;
}
