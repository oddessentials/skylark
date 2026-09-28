import { battles, raids } from '$lib/world/bosses.json';
import { humans, structures, technologies } from '$lib/world/names.json';
import { classes } from '$lib/world/pals.json';
import { speciesInfo } from '$lib/world/species';
import type { Schemas } from './common';

type KillerKind = NonNullable<Schemas['KillerKind']>;

const folded = (value: string) => value.toLowerCase();

const speciesByCharacter = new Map<string, string>();
for (const entry of Object.values(classes)) {
  if (!entry.species) continue;
  for (const character of entry.characters) {
    speciesByCharacter.set(folded(character), entry.species);
  }
}

const humanNames = new Map(humans.map((entry) => [folded(entry.id), entry.name]));
const technologyNames = new Map(technologies.map((entry) => [folded(entry.id), entry.name]));
const structureNames = new Map(structures.map((entry) => [folded(entry.id), entry.name]));

export function speciesOfCharacter(characterId: string): { id: string; name: string } | null {
  const info = speciesInfo(characterId) ?? speciesInfo(speciesByCharacter.get(folded(characterId)));
  return info ? { id: info.id, name: info.name } : null;
}

export function characterName(characterId: string): { kind: 'pal' | 'human'; name: string } | null {
  const species = speciesOfCharacter(characterId);
  if (species) return { kind: 'pal', name: species.name };
  const human = humanNames.get(folded(characterId));
  return human ? { kind: 'human', name: human } : null;
}

export function technologyName(id: string): string | null {
  return technologyNames.get(folded(id)) ?? null;
}

export function structureName(id: string): string | null {
  return structureNames.get(folded(id)) ?? null;
}

export function bossName(
  kind: 'tower' | 'raid',
  boss: string,
  species: string | null
): string | null {
  if (kind === 'tower') {
    const battle = battles.find((entry) => entry.boss_type === boss);
    return battle?.difficulties[0]?.name ?? battle?.name ?? null;
  }
  const ids = [boss, species].filter((id): id is string => Boolean(id)).map(folded);
  const raid = raids.find(
    (entry) => ids.includes(folded(entry.id)) || ids.includes(folded(entry.character))
  );
  if (raid) return raid.name;
  return speciesOfCharacter(species ?? boss)?.name ?? null;
}

export function killerOf(
  killer: string | null,
  kind: string | null
): { killer: string | null; killer_kind: KillerKind | null } {
  if (kind === 'player') return { killer, killer_kind: 'player' };
  if (kind === 'character' && killer) {
    const character = characterName(killer);
    return character
      ? { killer: character.name, killer_kind: character.kind }
      : { killer: null, killer_kind: null };
  }
  return { killer, killer_kind: null };
}
