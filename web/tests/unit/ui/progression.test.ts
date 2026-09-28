import { describe, expect, it } from 'vitest';
import type { Progression, ProgressionPlayer } from '$lib/api/types';
import {
  beatenCount,
  bossColor,
  bossLegend,
  bossMarkersOf,
  describeBoss,
  describeClear,
  levelPoints,
  nobodyColor,
  playerColor,
  storyLine,
  tierLine,
  towerRows
} from '$lib/ui/progression';

const grass = {
  id: 'GrassBoss',
  name: 'Rayne Syndicate Tower',
  category: 'faction_tower' as const,
  level: 10,
  hard: true
};
const whale = {
  id: 'KingWhaleBoss',
  name: 'Panthalus',
  category: 'king_whale' as const,
  level: 50,
  hard: false
};

function player(name: string, overrides: Partial<ProgressionPlayer> = {}): ProgressionPlayer {
  return {
    player: null,
    name,
    guild: null,
    level: 20,
    playtime_s: 7200,
    saved_at: '2026-09-28T05:30:00.000Z',
    towers: [],
    story: { completed: 0, total: 31, stage: null, current: [] },
    technology: {
      unlocked: 12,
      total: 588,
      tier: 6,
      boss_unlocked: 0,
      boss_total: 51,
      points: 0,
      boss_points: 0,
      last_unlocked: null
    },
    field_bosses: 0,
    raids: 0,
    fast_travel: 3,
    areas: 2,
    world_tree: false,
    ...overrides
  };
}

const wren = player('Wren', {
  level: 34,
  playtime_s: 36_000,
  towers: [
    { tower: 'GrassBoss', difficulty: 'normal', count: 2, first_seen_at: '2026-09-20T18:00:00Z' },
    { tower: 'GrassBoss', difficulty: 'hard', count: 1, first_seen_at: null }
  ],
  story: {
    completed: 16,
    total: 31,
    stage: { id: 'Main_DefeatForestBoss', title: 'Thou Shalt Not Harm Pals', stage: 16 },
    current: [{ id: 'Main_DefeatVolcanoBoss', title: 'Flawless Victory Fixation', stage: 17 }]
  },
  technology: {
    unlocked: 90,
    total: 588,
    tier: 34,
    boss_unlocked: 3,
    boss_total: 51,
    points: 4,
    boss_points: 1,
    last_unlocked: null
  }
});

const board: Progression = {
  saved_at: '2026-09-28T05:30:00.000Z',
  towers: [grass, whale],
  players: [wren, player('Orrin', { level: null, playtime_s: null })],
  field_bosses: [
    {
      spawner: 'a',
      name: 'Chillet',
      title: null,
      species: 'Serpent',
      kind: 'field_boss',
      level: 11,
      x: 0,
      y: 0,
      map: 'MainMap',
      beaten_by: [1, 0]
    },
    {
      spawner: 'b',
      name: 'Hunter',
      title: 'Wanted',
      species: null,
      kind: 'wanted',
      level: 9,
      x: 1,
      y: 1,
      map: 'MainMap',
      beaten_by: []
    }
  ],
  guilds: [],
  totals: {
    story: 31,
    technology: 588,
    boss_technology: 51,
    fast_travel: 174,
    areas: 123,
    field_bosses: 2,
    research: 168
  }
};

describe('the progression board', () => {
  it('lays the towers out per player', () => {
    const rows = towerRows(board);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.cleared).toBe(1);
    expect(rows[0]!.cells[0]!.normal?.count).toBe(2);
    expect(rows[0]!.cells[0]!.hard?.count).toBe(1);
    expect(rows[0]!.cells[1]!.normal).toBeNull();
    expect(rows[1]!.cleared).toBe(0);
  });

  it('describes clears with their first-seen date', () => {
    expect(describeClear(grass, null)).toBe('Rayne Syndicate Tower: not yet');
    expect(describeClear(grass, wren.towers[0]!)).toBe(
      'Rayne Syndicate Tower, normal: 2 times, first seen Sep 20, 2026'
    );
    expect(describeClear(grass, wren.towers[1]!)).toBe(
      'Rayne Syndicate Tower, hard: once, date not seen by the mod'
    );
  });

  it('puts the story and the technology into a line', () => {
    expect(storyLine(wren.story)).toBe(
      '16 of 31, at “Thou Shalt Not Harm Pals”, now “Flawless Victory Fixation”'
    );
    expect(storyLine(board.players[1]!.story)).toBe('0 of 31, not started');
    expect(tierLine(wren.technology)).toBe(
      'tier 34, 90 of 588 unlocked, 3 ancient, 4 + 1 points unspent'
    );
    expect(tierLine(board.players[1]!.technology)).toBe('tier 6, 12 of 588 unlocked');
  });

  it('colours field bosses by the first player who beat them', () => {
    expect(bossColor(board.field_bosses[0]!)).toBe(playerColor(1));
    expect(bossColor(board.field_bosses[1]!)).toBe(nobodyColor);
    expect(describeBoss(board.field_bosses[0]!, board.players)).toBe(
      'Chillet, level 11: beaten by Orrin, Wren'
    );
    expect(describeBoss(board.field_bosses[1]!, board.players)).toBe(
      'Wanted Hunter, level 9: not beaten yet'
    );
    expect(bossLegend(board)).toEqual([
      { index: 1, name: 'Orrin', color: playerColor(1), beaten: 1 },
      { index: 0, name: 'Wren', color: playerColor(0), beaten: 1 }
    ]);
    expect(beatenCount(board)).toBe(1);
    expect(bossMarkersOf(board).map((marker) => [marker.id, marker.beaten])).toEqual([
      ['a', true],
      ['b', false]
    ]);
    expect(playerColor(8)).toBe(playerColor(0));
  });

  it('plots only the players with a level and playtime', () => {
    expect(levelPoints(board.players)).toEqual([{ index: 0, name: 'Wren', hours: 10, level: 34 }]);
  });
});
