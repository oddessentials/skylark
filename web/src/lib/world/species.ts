import { elements } from './elements.json';
import { pals } from './pals.json';

export interface Element {
  id: string;
  name: string;
  color: string;
}

export interface Species {
  id: string;
  name: string;
  number: number;
  suffix: string;
  elements: Element[];
}

export const elementList: Element[] = elements.map((entry) => ({
  id: entry.id,
  name: entry.name,
  color: entry.color
}));

const elementById = new Map(elementList.map((entry) => [entry.id, entry]));

const speciesById = new Map<string, Species>(
  pals.map((entry) => [
    entry.id.toLowerCase(),
    {
      id: entry.id,
      name: entry.name,
      number: entry.number,
      suffix: entry.suffix,
      elements: entry.elements.flatMap((id) => {
        const element = elementById.get(id);
        return element ? [element] : [];
      })
    }
  ])
);

export function speciesInfo(id: string | null | undefined): Species | null {
  if (!id) return null;
  return speciesById.get(id.toLowerCase()) ?? null;
}

export function palpediaNumber(species: Species): string {
  return `#${String(species.number).padStart(3, '0')}${species.suffix}`;
}

export function primaryColor(id: string | null | undefined): string {
  return speciesInfo(id)?.elements[0]?.color ?? 'var(--color-steel)';
}
