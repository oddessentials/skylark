import breeding from '$lib/world/breeding.json';

export type Gender = 'male' | 'female';

export interface BreedingSpecies {
  id: string;
  rank: number;
  priority: number;
  ignoreCombi: boolean;
  inPool: boolean;
  maleProbability: number;
  egg: string | null;
  alphaEgg: string | null;
}

export interface UniquePair {
  parentA: string;
  genderA: Gender | null;
  parentB: string;
  genderB: Gender | null;
  child: string;
}

export interface PassiveFact {
  id: string;
  name: string;
  rank: number;
  randomAdd: boolean;
  weight: number;
}

export interface EggKind {
  id: string;
  name: string;
  family: string;
  size: number | null;
}

export interface BreedingFacts {
  gameVersion: string;
  fallbackChild: string;
  meanOffset: number;
  maxRankBonus: number;
  species: BreedingSpecies[];
  unique: UniquePair[];
  passives: PassiveFact[];
  eggKinds: EggKind[];
  inheritance: typeof breeding.inheritance;
  cakes: typeof breeding.cakes;
}

function asGender(value: string | null): Gender | null {
  return value === 'male' || value === 'female' ? value : null;
}

export const facts: BreedingFacts = {
  gameVersion: breeding.game_version,
  fallbackChild: breeding.child_rule.fallback,
  meanOffset: breeding.child_rule.mean_offset,
  maxRankBonus: breeding.child_rule.max_rank_bonus,
  species: breeding.species.map((entry) => ({
    id: entry.id,
    rank: entry.rank,
    priority: entry.priority,
    ignoreCombi: entry.ignore_combi,
    inPool: entry.in_pool,
    maleProbability: entry.male_probability,
    egg: entry.egg,
    alphaEgg: entry.alpha_egg
  })),
  unique: breeding.unique.map((row) => ({
    parentA: row.parent_a,
    genderA: asGender(row.gender_a),
    parentB: row.parent_b,
    genderB: asGender(row.gender_b),
    child: row.child
  })),
  passives: breeding.passives.map((row) => ({
    id: row.id,
    name: row.name,
    rank: row.rank,
    randomAdd: row.random_add,
    weight: row.weight
  })),
  eggKinds: breeding.eggs.kinds,
  inheritance: breeding.inheritance,
  cakes: breeding.cakes
};

const speciesByKey = new Map(facts.species.map((entry) => [entry.id.toLowerCase(), entry]));
const passiveByKey = new Map(facts.passives.map((row) => [row.id.toLowerCase(), row]));
const eggKindByKey = new Map(facts.eggKinds.map((kind) => [kind.id.toLowerCase(), kind]));

export function breedingSpecies(id: string | null | undefined): BreedingSpecies | null {
  return id ? (speciesByKey.get(id.toLowerCase()) ?? null) : null;
}

export function passiveFact(id: string): PassiveFact | null {
  return passiveByKey.get(id.toLowerCase()) ?? null;
}

export function eggKind(id: string | null | undefined): EggKind | null {
  return id ? (eggKindByKey.get(id.toLowerCase()) ?? null) : null;
}
