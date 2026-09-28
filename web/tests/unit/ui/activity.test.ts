import { describe, expect, it } from 'vitest';
import type { ActivityDetails, ActivityItem, ActivityType } from '$lib/api/types';
import { describeActivity, knockoutPhrase, mergeActivity, upsertActivity } from '$lib/ui/activity';
import { bossName, characterName, killerOf, technologyName } from '$lib/server/read/names';

const player = { id: 3, name: 'Moss', online: true, guild: null };

function line(type: ActivityType, details: ActivityDetails): string {
  const item: ActivityItem = { id: 'e', type, ts: '2026-09-28T15:00:00Z', player, details };
  return describeActivity(item)
    .parts.map((part) =>
      part.kind === 'player' ? part.player.name : 'text' in part ? part.text : ''
    )
    .join('');
}

describe('lines for the server mod', () => {
  it('names what knocked a player out', () => {
    expect(knockoutPhrase({ killer: 'Mammorest', killer_kind: 'pal', killer_level: 38 })).toBe(
      'was knocked out by a level 38 Mammorest'
    );
    expect(knockoutPhrase({ killer: 'Anubis', killer_kind: 'pal', killer_level: null })).toBe(
      'was knocked out by an Anubis'
    );
    expect(knockoutPhrase({ killer: 'Rook', killer_kind: 'player' })).toBe(
      'was knocked out by Rook'
    );
    expect(knockoutPhrase({ cause: 'drown' })).toBe('drowned');
    expect(knockoutPhrase({ cause: 'falling' })).toBe('fell and was knocked out');
    expect(knockoutPhrase({})).toBe('was knocked out');
  });

  it('describes catches, hatches, boss clears and unlocks', () => {
    expect(line('pal.captured', { species: 'SheepBall', species_name: 'Lamball', level: 12 })).toBe(
      'Moss caught a level 12 Lamball'
    );
    expect(
      line('pal.hatched', { species: 'ChickenPal', species_name: 'Chikipi', level: null })
    ).toBe('Moss hatched a Chikipi');
    expect(
      line('boss.defeated', {
        boss: 'GrassBoss',
        boss_kind: 'tower',
        boss_name: 'Zoe & Grizzbolt',
        difficulty: 'hard'
      })
    ).toBe('Moss beat Zoe & Grizzbolt on hard');
    expect(
      line('boss.defeated', {
        boss: 'PalSummon_NightLady',
        boss_kind: 'raid',
        boss_name: 'Bellanoir'
      })
    ).toBe('Moss won the raid against Bellanoir');
    expect(
      line('technology.unlocked', { technology: 'RepairBench', technology_name: 'Repair Bench' })
    ).toBe('Moss unlocked Repair Bench');
    expect(line('technology.unlocked', { technology: 'Unknown', technology_name: null })).toBe(
      'Moss unlocked a new technology'
    );
  });
});

describe('the live feed on an open page', () => {
  const knockout = (id: string, ts: string, killer: string | null = null): ActivityItem => ({
    id,
    type: 'player.died',
    ts,
    player,
    details: { killer, killer_kind: killer ? 'pal' : null }
  });
  const first = knockout('a', '2026-09-28T15:00:00Z');
  const merged = knockout('a', '2026-09-28T15:00:00Z', 'Mammorest');
  const later = knockout('b', '2026-09-28T15:01:00Z');

  it('replaces an item it already holds by id and puts new items first', () => {
    expect(upsertActivity([], first, 3)).toEqual([first]);
    expect(upsertActivity([later, first], merged, 3)).toEqual([later, merged]);
    expect(upsertActivity([first], later, 3)).toEqual([later, first]);
    expect(upsertActivity([later, first], knockout('c', '2026-09-28T15:02:00Z'), 2)).toEqual([
      knockout('c', '2026-09-28T15:02:00Z'),
      later
    ]);
  });

  it('keeps the live copy of an item over the loaded one', () => {
    expect(mergeActivity([merged], [later, first])).toEqual([later, merged]);
    expect(mergeActivity([], [later, first])).toEqual([later, first]);
  });
});

describe('names from the game facts', () => {
  it('resolves character ids of Pals, alphas, raid bosses and humans', () => {
    expect(characterName('SheepBall')).toEqual({ kind: 'pal', name: 'Lamball' });
    expect(characterName('BOSS_GrassMammoth')).toEqual({ kind: 'pal', name: 'Mammorest' });
    expect(characterName('RAID_NightLady')).toEqual({ kind: 'pal', name: 'Bellanoir' });
    expect(characterName('Hunter_Rifle')?.kind).toBe('human');
    expect(characterName('NoSuchCharacter')).toBeNull();
  });

  it('names killers without passing ids through', () => {
    expect(killerOf('BOSS_GrassMammoth', 'character')).toEqual({
      killer: 'Mammorest',
      killer_kind: 'pal'
    });
    expect(killerOf('NoSuchCharacter', 'character')).toEqual({ killer: null, killer_kind: null });
    expect(killerOf('Rook', 'player')).toEqual({ killer: 'Rook', killer_kind: 'player' });
    expect(killerOf(null, null)).toEqual({ killer: null, killer_kind: null });
  });

  it('names technologies and bosses', () => {
    expect(technologyName('RepairBench')).toBe('Repair Bench');
    expect(technologyName('nope')).toBeNull();
    expect(bossName('tower', 'GrassBoss', null)).toBe('Zoe & Grizzbolt');
    expect(bossName('raid', 'PalSummon_NightLady_Dark', null)).toBe('Bellanoir Libero');
    expect(bossName('raid', 'SomethingNew', 'RAID_NightLady')).toBe('Bellanoir');
  });
});
