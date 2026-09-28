import { describe, expect, it } from 'vitest';
import type { GuildPalpediaEntry, PalpediaEntry } from '$lib/api/types';
import { describeTile, howToGet, noSource, onTheMap, tileOf, tilesOf } from '$lib/ui/palpedia';
import { habitatRuns } from '$lib/ui/map';

const lamball: PalpediaEntry = {
  species: 'SheepBall',
  caught: true,
  captures: 5,
  ways: ['wild', 'egg', 'caged'],
  night_only: false,
  levels: [1, 9]
};

const nightFox: PalpediaEntry = {
  species: 'NightFox',
  caught: false,
  captures: 0,
  ways: ['wild', 'egg'],
  night_only: true,
  levels: [3, 8]
};

const astralym: PalpediaEntry = {
  species: 'WorldTreeDragon',
  caught: false,
  captures: 0,
  ways: [],
  night_only: false,
  levels: null
};

describe('the Palpedia tiles', () => {
  it('puts the ways to obtain a species into words', () => {
    expect(howToGet(lamball)).toBe('in the wild, from wild eggs, caged at camps, level 1 to 9');
    expect(howToGet(nightFox)).toBe('in the wild at night, from wild eggs, level 3 to 8');
    expect(howToGet({ ways: ['raid', 'bred'], night_only: false, levels: null })).toBe(
      'from raid eggs, by breeding'
    );
    expect(howToGet(astralym)).toBe(noSource);
  });

  it('links the species with a habitat to the map', () => {
    expect(onTheMap(lamball)).toBe(true);
    expect(onTheMap({ ways: ['alpha', 'boss'] })).toBe(true);
    expect(onTheMap({ ways: ['fished'] })).toBe(false);
    expect(tileOf(lamball).mapHref).toBe('/map?species=SheepBall');
    expect(tileOf(astralym).mapHref).toBeNull();
  });

  it('names and numbers every tile from the world facts', () => {
    const tiles = tilesOf([lamball, nightFox, astralym]);
    expect(tiles.map((tile) => [tile.number, tile.name])).toEqual([
      ['#001', 'Lamball'],
      ['#024', 'Nox'],
      ['#204', 'Astralym']
    ]);
    expect(tiles[0]!.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(tiles[0]!.holders).toEqual([]);
    const shared: GuildPalpediaEntry = { ...lamball, holders: [0, 2] };
    expect(tileOf(shared).holders).toEqual([0, 2]);
  });

  it('describes a tile for its tooltip', () => {
    expect(describeTile(tileOf(lamball))).toBe('#001 Lamball: caught, 5 captured');
    expect(describeTile(tileOf({ ...lamball, captures: 0 }))).toBe('#001 Lamball: caught');
    expect(describeTile(tileOf({ ...lamball, holders: [0, 1] }), ['Wren', 'Orrin'])).toBe(
      '#001 Lamball: caught by Wren, Orrin, 5 captured'
    );
    expect(describeTile(tileOf(nightFox))).toBe(
      '#024 Nox: missing, in the wild at night, from wild eggs, level 3 to 8'
    );
  });

  it('draws habitat cells as horizontal runs in map units', () => {
    const runs = habitatRuns({ both: [0, 1, 2], day: [], night: [101] }, 100);
    expect(runs).toEqual([
      { x: 0, y: 0, w: 30, h: 10, period: 'both' },
      { x: 10, y: 10, w: 10, h: 10, period: 'night' }
    ]);
    expect(habitatRuns(undefined, 100)).toEqual([]);
  });
});
