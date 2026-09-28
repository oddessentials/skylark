import { facts, type BreedingFacts, type BreedingSpecies, type Gender } from './facts';

export interface Parent {
  species: string;
  gender: Gender | null;
}

export type ChildVia = 'unique' | 'rank' | 'fallback';

export interface ChildResult {
  child: string;
  via: ChildVia;
  target: number | null;
  tied: string[];
}

function sameKey(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

const lookups = new WeakMap<BreedingFacts, Map<string, BreedingSpecies>>();

function speciesIn(rules: BreedingFacts, id: string): BreedingSpecies | null {
  let lookup = lookups.get(rules);
  if (!lookup) {
    lookup = new Map(rules.species.map((entry) => [entry.id.toLowerCase(), entry]));
    lookups.set(rules, lookup);
  }
  return lookup.get(id.toLowerCase()) ?? null;
}

function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function targetRank(
  rankA: number,
  rankB: number,
  bonus = 0,
  rules: Pick<BreedingFacts, 'meanOffset' | 'maxRankBonus'> = facts
): number {
  const clamped = Math.min(Math.max(bonus, 0), rules.maxRankBonus);
  const rounded = roundHalfEven(rules.meanOffset - (rankA + rankB));
  return clamped - (rounded >> 1);
}

function slotMatches(rowSpecies: string, rowGender: Gender | null, a: Parent, b: Parent): boolean {
  if (sameKey(rowSpecies, a.species)) return rowGender === null || rowGender === a.gender;
  if (sameKey(rowSpecies, b.species)) return rowGender === null || rowGender === b.gender;
  return false;
}

export function uniqueChild(a: Parent, b: Parent, rules: BreedingFacts = facts): string | null {
  let genderless: string | null = null;
  for (const row of rules.unique) {
    const straight = sameKey(row.parentA, a.species) && sameKey(row.parentB, b.species);
    const crossed = sameKey(row.parentA, b.species) && sameKey(row.parentB, a.species);
    if (!straight && !crossed) continue;
    if (row.genderA === null && row.genderB === null) genderless = row.child;
    if (
      slotMatches(row.parentA, row.genderA, a, b) &&
      slotMatches(row.parentB, row.genderB, a, b)
    ) {
      return row.child;
    }
  }
  return genderless;
}

export function nearestInPool(
  target: number,
  rules: BreedingFacts = facts
): { child: string | null; tied: string[] } {
  let best = Number.POSITIVE_INFINITY;
  let candidates: typeof rules.species = [];
  for (const entry of rules.species) {
    if (!entry.inPool) continue;
    const distance = Math.abs(entry.rank - target);
    if (distance < best) {
      best = distance;
      candidates = [entry];
    } else if (distance === best) {
      candidates.push(entry);
    }
  }
  if (candidates.length === 0) return { child: null, tied: [] };
  let winner = candidates[0]!;
  for (const entry of candidates.slice(1)) {
    if (entry.priority > winner.priority) winner = entry;
  }
  return { child: winner.id, tied: candidates.length > 1 ? candidates.map((c) => c.id) : [] };
}

export function childOf(
  a: Parent,
  b: Parent,
  bonus = 0,
  rules: BreedingFacts = facts
): ChildResult {
  const unique = uniqueChild(a, b, rules);
  if (unique) return { child: unique, via: 'unique', target: null, tied: [] };
  const rankA = speciesIn(rules, a.species)?.rank ?? 0;
  const rankB = speciesIn(rules, b.species)?.rank ?? 0;
  const target = targetRank(rankA, rankB, bonus, rules);
  const nearest = nearestInPool(target, rules);
  if (nearest.child) return { child: nearest.child, via: 'rank', target, tied: nearest.tied };
  return { child: rules.fallbackChild, via: 'fallback', target, tied: [] };
}

export function canPair(a: Parent, b: Parent): boolean {
  return a.gender !== null && b.gender !== null && a.gender !== b.gender;
}
