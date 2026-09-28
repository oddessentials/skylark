import { canPair, childOf, type ChildResult } from './rules';
import type { Gender } from './facts';

export interface OwnedPal {
  id: string;
  species: string;
  gender: Gender | null;
  passives: string[];
  alpha?: boolean;
  lucky?: boolean;
  level?: number;
  member?: number;
}

export interface Pairing<T extends OwnedPal = OwnedPal> {
  mother: T;
  father: T;
  result: ChildResult;
  shared: string[];
  distinct: string[];
}

function lower(values: string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

export function passiveSets<T extends OwnedPal>(
  a: T,
  b: T
): { shared: string[]; distinct: string[] } {
  const ofA = lower(a.passives);
  const ofB = lower(b.passives);
  const shared = a.passives.filter((id) => ofB.has(id.toLowerCase()));
  const distinct = [...a.passives];
  for (const id of b.passives) if (!ofA.has(id.toLowerCase())) distinct.push(id);
  return { shared, distinct };
}

export function comparePairings<T extends OwnedPal>(a: Pairing<T>, b: Pairing<T>): number {
  return (
    b.shared.length - a.shared.length ||
    b.distinct.length - a.distinct.length ||
    a.mother.species.localeCompare(b.mother.species) ||
    a.father.species.localeCompare(b.father.species) ||
    a.mother.id.localeCompare(b.mother.id) ||
    a.father.id.localeCompare(b.father.id)
  );
}

export function pairingsFor<T extends OwnedPal>(target: string, pals: T[]): Pairing<T>[] {
  const females = pals.filter((pal) => pal.gender === 'female');
  const males = pals.filter((pal) => pal.gender === 'male');
  const bySpecies = new Map<string, ChildResult>();
  const found: Pairing<T>[] = [];
  const wanted = target.toLowerCase();
  for (const mother of females) {
    for (const father of males) {
      if (!canPair(mother, father)) continue;
      const key = `${mother.species.toLowerCase()}|${father.species.toLowerCase()}`;
      let result = bySpecies.get(key);
      if (!result) {
        result = childOf(mother, father);
        bySpecies.set(key, result);
      }
      if (result.child.toLowerCase() !== wanted) continue;
      found.push({ mother, father, result, ...passiveSets(mother, father) });
    }
  }
  return found.sort(comparePairings);
}

export function breedableTargets<T extends OwnedPal>(pals: T[]): Map<string, number> {
  const females = pals.filter((pal) => pal.gender === 'female');
  const males = pals.filter((pal) => pal.gender === 'male');
  const seen = new Map<string, ChildResult>();
  const counts = new Map<string, number>();
  for (const mother of females) {
    for (const father of males) {
      const key = `${mother.species.toLowerCase()}|${father.species.toLowerCase()}`;
      let result = seen.get(key);
      if (!result) {
        result = childOf(mother, father);
        seen.set(key, result);
      }
      counts.set(result.child, (counts.get(result.child) ?? 0) + 1);
    }
  }
  return counts;
}
