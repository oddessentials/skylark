import { describe, expect, it } from 'vitest';
import {
  breedingSpecies,
  canPair,
  childOf,
  eggKind,
  facts,
  nearestInPool,
  passiveFact,
  targetRank,
  uniqueChild
} from '$lib/breeding';

const female = (species: string) => ({ species, gender: 'female' as const });
const male = (species: string) => ({ species, gender: 'male' as const });

describe('the breeding facts', () => {
  it('carry the game version and the pool read from the game', () => {
    expect(facts.gameVersion).toBe('1.0.5.102999');
    expect(facts.species).toHaveLength(288);
    expect(facts.species.filter((entry) => entry.inPool)).toHaveLength(183);
    expect(facts.unique).toHaveLength(258);
    expect(facts.fallbackChild).toBe('SheepBall');
    expect(breedingSpecies('sheepball')?.rank).toBe(3050);
    expect(breedingSpecies('JetDragon')).toMatchObject({ inPool: false, ignoreCombi: true });
    expect(breedingSpecies('Nope')).toBeNull();
  });

  it('name passives and egg kinds', () => {
    expect(passiveFact('Rare')).toMatchObject({ name: 'Lucky', rank: 4, randomAdd: false });
    expect(passiveFact('pal_sanity_down_2')?.name).toBe('Workaholic');
    expect(passiveFact('Unknown')).toBeNull();
    expect(eggKind('PalEgg_Dragon_05')?.name).toBe('Huge Dragon Egg');
    expect(breedingSpecies('SheepBall')?.egg).toBe('PalEgg_Normal_01');
  });
});

describe('the target rank', () => {
  it('is the mean of the parents, rounded up on a half, plus the cake bonus', () => {
    expect(targetRank(3050, 3050)).toBe(3050);
    expect(targetRank(1760, 1770)).toBe(1765);
    expect(targetRank(1, 2)).toBe(2);
    expect(targetRank(1, 4)).toBe(3);
    expect(targetRank(10, 10, 4)).toBe(14);
    expect(targetRank(10, 10, 99)).toBe(20);
    expect(targetRank(10, 10, -5)).toBe(10);
  });
});

describe('the child of a pair', () => {
  it('comes from a unique row first, whichever way round the parents are', () => {
    expect(childOf(female('LazyDragon'), male('ElecCat'))).toMatchObject({
      child: 'LazyDragon_Electric',
      via: 'unique'
    });
    expect(childOf(female('ElecCat'), male('LazyDragon')).child).toBe('LazyDragon_Electric');
    expect(uniqueChild(male('CatMage'), female('FoxMage'))).toBe('FoxMage_Dark');
    expect(uniqueChild(male('FoxMage'), female('CatMage'))).toBe('CatMage_Fire');
    expect(uniqueChild(female('CatMage'), male('FoxMage'))).toBe('CatMage_Fire');
    expect(uniqueChild(female('SheepBall'), male('PinkCat'))).toBeNull();
  });

  it('breeds a species with itself when the game lists a self row', () => {
    expect(childOf(female('JetDragon'), male('JetDragon'))).toMatchObject({
      child: 'JetDragon',
      via: 'unique'
    });
    expect(childOf(female('SheepBall'), male('SheepBall'))).toMatchObject({
      child: 'SheepBall',
      via: 'rank',
      target: 3050,
      tied: []
    });
  });

  it('picks the pool species nearest the mean rank', () => {
    expect(childOf(female('ChickenPal'), male('Boar'))).toMatchObject({
      child: 'BluePlatypus',
      via: 'rank',
      target: 2980,
      tied: []
    });
  });

  it('gives a tie to the higher rank, as the game does through the duplicate priority', () => {
    expect(childOf(female('SheepBall'), male('Anubis'))).toEqual({
      child: 'HoodGhost',
      via: 'rank',
      target: 1765,
      tied: ['BlackPuppy', 'HoodGhost']
    });
    expect(childOf(female('SheepBall'), male('PinkCat')).child).toBe('DreamDemon');
    expect(childOf(female('Kitsunebi'), male('Penguin')).child).toBe('BluePlatypus');
    const tie = nearestInPool(1765);
    expect(tie.child).toBe('HoodGhost');
    expect(tie.tied).toEqual(['BlackPuppy', 'HoodGhost']);
  });

  it('never picks a species outside the pool', () => {
    for (let target = 0; target <= 3100; target += 5) {
      const { child } = nearestInPool(target);
      expect(breedingSpecies(child)?.inPool, `${target}`).toBe(true);
    }
    const lowest = facts.species
      .filter((entry) => entry.inPool)
      .reduce((best, entry) => (entry.rank < best.rank ? entry : best));
    expect(nearestInPool(0).child).toBe(lowest.id);
    expect(nearestInPool(9999).child).toBe('ChickenPal');
  });

  it('falls back to Lamball with an empty pool', () => {
    const empty = { ...facts, species: [], unique: [] };
    expect(childOf(female('SheepBall'), male('PinkCat'), 0, empty)).toEqual({
      child: 'SheepBall',
      via: 'fallback',
      target: 0,
      tied: []
    });
  });

  it('needs a female and a male', () => {
    expect(canPair(female('SheepBall'), male('PinkCat'))).toBe(true);
    expect(canPair(female('SheepBall'), female('PinkCat'))).toBe(false);
    expect(canPair({ species: 'SheepBall', gender: null }, male('PinkCat'))).toBe(false);
  });
});
