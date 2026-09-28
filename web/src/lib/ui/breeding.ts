import type { GuildEgg, GuildPal, GuildPals } from '$lib/api/types';
import {
  breedableTargets,
  breedingSpecies,
  eggKind,
  facts,
  pairingsFor,
  shortestChains,
  type Chain,
  type Gender,
  type OwnedPal,
  type Pairing
} from '$lib/breeding';
import { species as iconSpecies } from '$lib/world/icons.json';
import { palpediaNumber, speciesInfo, speciesList } from '$lib/world/species';

export interface KeptPal extends OwnedPal {
  pal: GuildPal;
  speciesName: string;
  label: string;
  keeper: string;
  gender: Gender | null;
  alpha: boolean;
  lucky: boolean;
  level: number;
  member: number;
}

export type GenderFilter = 'all' | 'male' | 'female';

export interface PalFilter {
  text: string;
  gender: GenderFilter;
  member: number | null;
  lucky: boolean;
  alpha: boolean;
}

export interface TargetOption {
  id: string;
  name: string;
  number: string;
  pairs: number;
  owned: boolean;
}

export interface Wanted {
  id: string;
  name: string;
  number: string;
  chain: Chain | null;
}

export interface EggGroup {
  kind: string;
  kindName: string;
  eggs: GuildEgg[];
}

const icons = new Set(iconSpecies.map((id) => id.toLowerCase()));

export const emptyFilter: PalFilter = {
  text: '',
  gender: 'all',
  member: null,
  lucky: false,
  alpha: false
};

export const ruleNotes = [
  'The child comes from a unique pairing when the game lists one, otherwise it is the breedable species whose rank is nearest the mean of the parents’ ranks, and a tie goes to the higher rank: read from the server’s own code, build 25247047.',
  'Not seen live: how many passives and talents a child inherits (the game weighs 4:3:2:1 and 3:2:1), the 5% alpha and 1% mutation rolls, and when an incubator rolls its Pal.'
];

export function iconHref(species: string): string | null {
  const info = speciesInfo(species);
  return info && icons.has(info.id.toLowerCase()) ? `/pals/${info.id}.png` : null;
}

export function speciesName(species: string): string {
  return speciesInfo(species)?.name ?? species;
}

export function genderMark(gender: Gender | null): string {
  return gender === 'female' ? '♀' : gender === 'male' ? '♂' : '';
}

export function keptPals(data: GuildPals): KeptPal[] {
  return data.pals.map((pal) => {
    const name = speciesName(pal.species);
    return {
      id: pal.id,
      species: pal.species,
      gender: pal.gender,
      passives: pal.passives.map((passive) => passive.id),
      alpha: pal.alpha,
      lucky: pal.lucky,
      level: pal.level,
      member: pal.member,
      pal,
      speciesName: name,
      label: pal.name ? `${pal.name} the ${name}` : name,
      keeper: data.members[pal.member]?.name ?? ''
    };
  });
}

export function filterPals(pals: KeptPal[], filter: PalFilter): KeptPal[] {
  const text = filter.text.trim().toLowerCase();
  return pals.filter((kept) => {
    if (filter.gender !== 'all' && kept.gender !== filter.gender) return false;
    if (filter.member !== null && kept.member !== filter.member) return false;
    if (filter.lucky && !kept.lucky) return false;
    if (filter.alpha && !kept.alpha) return false;
    if (text === '') return true;
    const haystack = [
      kept.speciesName,
      kept.species,
      kept.pal.name ?? '',
      kept.keeper,
      ...kept.pal.passives.map((passive) => passive.name)
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(text);
  });
}

export function describePal(kept: KeptPal): string {
  const parts = [
    `${kept.alpha ? 'alpha ' : ''}${kept.label}`,
    kept.gender ?? 'no gender',
    `level ${kept.level}`,
    `talents ${kept.pal.talents.hp}/${kept.pal.talents.shot}/${kept.pal.talents.defense}`
  ];
  if (kept.pal.rank > 1) parts.push(`rank ${kept.pal.rank}`);
  if (kept.lucky) parts.push('lucky');
  if (kept.pal.passives.length > 0) {
    parts.push(kept.pal.passives.map((passive) => passive.name).join(', '));
  }
  parts.push(`kept by ${kept.keeper} in the ${kept.pal.where}`);
  return parts.join(', ');
}

export function ownedSpecies(pals: KeptPal[]): Set<string> {
  return new Set(pals.map((kept) => kept.species.toLowerCase()));
}

export function targetOptions(pals: KeptPal[]): TargetOption[] {
  const counts = breedableTargets(pals);
  const owned = ownedSpecies(pals);
  return speciesList.map((entry) => ({
    id: entry.id,
    name: entry.name,
    number: palpediaNumber(entry),
    pairs: counts.get(entry.id) ?? 0,
    owned: owned.has(entry.id.toLowerCase())
  }));
}

export function defaultTarget(options: TargetOption[]): string | null {
  const unowned = options.filter((option) => option.pairs > 0 && !option.owned);
  const pool = unowned.length > 0 ? unowned : options.filter((option) => option.pairs > 0);
  if (pool.length === 0) return null;
  return pool.reduce((best, option) => (option.pairs > best.pairs ? option : best)).id;
}

export function pairsFor(target: string, pals: KeptPal[]): Pairing<KeptPal>[] {
  return pairingsFor(target, pals);
}

export function describePairing(pair: Pairing<KeptPal>): string {
  const how =
    pair.result.via === 'unique'
      ? 'a unique pairing'
      : pair.result.tied.length > 0
        ? `nearest rank ${pair.result.target}, tie with ${pair.result.tied
            .filter((id) => id !== pair.result.child)
            .map(speciesName)
            .join(', ')} given to the higher rank`
        : `nearest rank ${pair.result.target}`;
  const shared =
    pair.shared.length > 0
      ? `, both carry ${pair.shared.map((id) => passiveName(pair, id)).join(', ')}`
      : '';
  return `${pair.mother.label} with ${pair.father.label}: ${how}${shared}`;
}

function passiveName(pair: Pairing<KeptPal>, id: string): string {
  const found = [...pair.mother.pal.passives, ...pair.father.pal.passives].find(
    (passive) => passive.id.toLowerCase() === id.toLowerCase()
  );
  return found?.name ?? id;
}

export function eggFor(species: string, alpha = false): string | null {
  const entry = breedingSpecies(species);
  if (!entry) return null;
  const kind = eggKind(alpha ? (entry.alphaEgg ?? entry.egg) : entry.egg);
  return kind?.name ?? null;
}

export function wantedList(pals: KeptPal[], limit = 4): Wanted[] {
  const owned = ownedSpecies(pals);
  const stock = new Map<string, { species: string; genders: Set<Gender> }>();
  for (const kept of pals) {
    if (!kept.gender) continue;
    const key = kept.species.toLowerCase();
    const known = stock.get(key) ?? { species: kept.species, genders: new Set<Gender>() };
    known.genders.add(kept.gender);
    stock.set(key, known);
  }
  const chains = shortestChains([...stock.values()], limit);
  return speciesList
    .filter((entry) => !owned.has(entry.id.toLowerCase()))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      number: palpediaNumber(entry),
      chain: chains.get(entry.id) ?? null
    }));
}

export function describeChain(chain: Chain): string {
  return chain.steps
    .map(
      (step) =>
        `${speciesName(step.mother)} × ${speciesName(step.father)} → ${speciesName(step.child)}`
    )
    .join('; ');
}

export function eggGroups(eggs: GuildEgg[]): EggGroup[] {
  const groups = new Map<string, EggGroup>();
  for (const egg of eggs) {
    const group = groups.get(egg.kind) ?? { kind: egg.kind, kindName: egg.kind_name, eggs: [] };
    group.eggs.push(egg);
    groups.set(egg.kind, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.eggs.length - a.eggs.length || a.kindName.localeCompare(b.kindName)
  );
}

export function describeEgg(egg: GuildEgg, members: GuildPals['members']): string {
  const where =
    egg.where === 'inventory'
      ? `with ${members[egg.member ?? -1]?.name ?? 'a member'}`
      : egg.where === 'incubator'
        ? `in an incubator${egg.base ? ` at ${egg.base.name ?? `base ${egg.base.id}`}` : ''}`
        : `in a chest${egg.base ? ` at ${egg.base.name ?? `base ${egg.base.id}`}` : ''}`;
  const hatched = egg.hatched
    ? `, rolled ${egg.hatched.alpha ? 'an alpha ' : 'a '}${speciesName(egg.hatched.species)}`
    : '';
  return `${egg.kind_name}: ${egg.alpha ? 'alpha ' : ''}${speciesName(egg.species)} ${where}${hatched}`;
}

export const gameVersion = facts.gameVersion;
