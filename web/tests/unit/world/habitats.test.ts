import { describe, expect, it } from 'vitest';
import {
  decodeRanges,
  describeWays,
  habitatGrid,
  habitatOf,
  habitatWays,
  runsOf,
  wayLabels
} from '$lib/world/habitats';
import { pals } from '$lib/world/pals.json';

describe('habitat facts', () => {
  it('decodes cell ranges', () => {
    expect(decodeRanges('')).toEqual([]);
    expect(decodeRanges('7')).toEqual([7]);
    expect(decodeRanges('3-5,9,12-13')).toEqual([3, 4, 5, 9, 12, 13]);
    expect(() => decodeRanges('5-3')).toThrow();
  });

  it('turns cells into horizontal runs that stop at the row edge', () => {
    const size = habitatGrid;
    expect(runsOf([size - 1, size, size + 1, 3 * size + 4], size)).toEqual([
      { row: 0, from: size - 1, to: size - 1 },
      { row: 1, from: 0, to: 1 },
      { row: 3, from: 4, to: 4 }
    ]);
  });

  it('knows every Palpedia entry, matched without regard to case', () => {
    for (const entry of pals) {
      const habitat = habitatOf(entry.id.toLowerCase());
      expect(habitat, entry.id).not.toBeNull();
      expect(habitat!.id).toBe(entry.id);
      for (const way of habitat!.ways) expect(habitatWays).toContain(way);
    }
    expect(habitatOf(null)).toBeNull();
    expect(habitatOf('NotAPal')).toBeNull();
  });

  it('places Lamball in the wild on the Palpagos map', () => {
    const lamball = habitatOf('SheepBall')!;
    expect(lamball.ways).toContain('wild');
    expect(lamball.nightOnly).toBe(false);
    const cells = lamball.maps.MainMap!;
    expect(cells.both.length + cells.day.length + cells.night.length).toBeGreaterThan(0);
    for (const cell of [...cells.both, ...cells.day, ...cells.night]) {
      expect(cell).toBeGreaterThanOrEqual(0);
      expect(cell).toBeLessThan(habitatGrid * habitatGrid);
    }
    expect(lamball.levels).not.toBeNull();
    expect(lamball.levels![0]).toBeLessThanOrEqual(lamball.levels![1]);
  });

  it('describes how a Pal is obtained in words', () => {
    for (const way of habitatWays) expect(wayLabels[way]).toBeTruthy();
    expect(describeWays(habitatOf('SheepBall')!)).toMatch(/^in the wild/);
    const astralym = habitatOf('WorldTreeDragon')!;
    expect(astralym.ways).toEqual([]);
    expect(astralym.maps).toEqual({});
    expect(describeWays(astralym)).toBe('');
  });
});
