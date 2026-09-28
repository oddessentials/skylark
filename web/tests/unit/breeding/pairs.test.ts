import { describe, expect, it } from 'vitest';
import {
  breedableTargets,
  pairingsFor,
  passiveSets,
  shortestChains,
  type OwnedPal
} from '$lib/breeding';

const owned: OwnedPal[] = [
  { id: 'a', species: 'SheepBall', gender: 'female', passives: ['Rare', 'Noukin'] },
  { id: 'b', species: 'SheepBall', gender: 'male', passives: ['Noukin'] },
  { id: 'c', species: 'SheepBall', gender: 'male', passives: ['PAL_ALLAttack_up2', 'Legend'] },
  { id: 'd', species: 'PinkCat', gender: 'male', passives: ['Rare'] },
  { id: 'e', species: 'Anubis', gender: 'male', passives: [] },
  { id: 'f', species: 'LazyDragon', gender: 'female', passives: [] },
  { id: 'g', species: 'ElecCat', gender: 'male', passives: [] },
  { id: 'h', species: 'Kitsunebi', gender: null, passives: [] }
];

describe('the pairs that make a species', () => {
  it('lists every female and male pair whose child is the target, most shared passives first', () => {
    const pairs = pairingsFor('SheepBall', owned);
    expect(pairs.map((pair) => [pair.mother.id, pair.father.id])).toEqual([
      ['a', 'b'],
      ['a', 'c']
    ]);
    expect(pairs[0]).toMatchObject({ shared: ['Noukin'], distinct: ['Rare', 'Noukin'] });
    expect(pairs[1]).toMatchObject({
      shared: [],
      distinct: ['Rare', 'Noukin', 'PAL_ALLAttack_up2', 'Legend']
    });
    expect(pairs[0]!.result).toMatchObject({ child: 'SheepBall', via: 'rank' });
  });

  it('finds unique children and rank children alike', () => {
    expect(pairingsFor('LazyDragon_Electric', owned).map((pair) => pair.father.id)).toEqual(['g']);
    expect(pairingsFor('HoodGhost', owned).map((pair) => pair.result.tied)).toEqual([
      ['BlackPuppy', 'HoodGhost']
    ]);
    expect(pairingsFor('BlackPuppy', owned)).toEqual([]);
    expect(pairingsFor('Kitsunebi', owned)).toEqual([]);
  });

  it('counts how many pairs make each species', () => {
    const targets = breedableTargets(owned);
    expect(targets.get('SheepBall')).toBe(2);
    expect(targets.get('DreamDemon')).toBe(1);
    expect(targets.get('LazyDragon_Electric')).toBe(1);
    expect(targets.has('Kitsunebi')).toBe(false);
  });

  it('separates shared from distinct passives without caring about case', () => {
    expect(
      passiveSets(
        { id: '1', species: 'x', gender: 'female', passives: ['rare', 'Noukin'] },
        { id: '2', species: 'x', gender: 'male', passives: ['Rare', 'Legend'] }
      )
    ).toEqual({ shared: ['rare'], distinct: ['rare', 'Noukin', 'Legend'] });
  });
});

describe('the shortest chains to a species nobody owns', () => {
  it('needs a female and a male to start', () => {
    expect(shortestChains([{ species: 'SheepBall', genders: new Set(['male']) }]).size).toBe(0);
  });

  it('reaches a unique child in one step and its children after', () => {
    const chains = shortestChains([
      { species: 'LazyDragon', genders: new Set(['female']) },
      { species: 'ElecCat', genders: new Set(['male']) }
    ]);
    expect(chains.get('LazyDragon_Electric')?.steps).toEqual([
      { mother: 'LazyDragon', father: 'ElecCat', child: 'LazyDragon_Electric' }
    ]);
    expect(chains.has('LazyDragon')).toBe(false);
    for (const chain of chains.values()) {
      expect(chain.steps.at(-1)?.child).toBe(chain.species);
      const known = new Set(['lazydragon', 'eleccat']);
      for (const step of chain.steps) {
        expect(known.has(step.mother.toLowerCase()), step.mother).toBe(true);
        expect(known.has(step.father.toLowerCase()), step.father).toBe(true);
        known.add(step.child.toLowerCase());
      }
    }
    const twoSteps = [...chains.values()].filter((chain) => chain.steps.length === 2);
    expect(twoSteps.length).toBeGreaterThan(0);
  });
});
