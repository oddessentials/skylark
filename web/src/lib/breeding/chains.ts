import { facts } from './facts';
import { childOf } from './rules';

export interface ChainStep {
  mother: string;
  father: string;
  child: string;
}

export interface Chain {
  species: string;
  steps: ChainStep[];
}

export interface Stock {
  species: string;
  genders: Set<'male' | 'female'>;
}

interface Reach {
  generation: number;
  step: ChainStep | null;
}

function canBreed(a: Stock, b: Stock): { mother: string; father: string } | null {
  if (a.genders.has('female') && b.genders.has('male'))
    return { mother: a.species, father: b.species };
  if (b.genders.has('female') && a.genders.has('male'))
    return { mother: b.species, father: a.species };
  return null;
}

export function shortestChains(owned: Stock[], limit = 4): Map<string, Chain> {
  const bred: Set<'male' | 'female'> = new Set(['male', 'female']);
  const reach = new Map<string, Reach>();
  const stock = new Map<string, Stock>();
  for (const entry of owned) {
    const key = entry.species.toLowerCase();
    const known = stock.get(key);
    if (known) {
      for (const gender of entry.genders) known.genders.add(gender);
    } else {
      stock.set(key, { species: entry.species, genders: new Set(entry.genders) });
    }
    reach.set(key, { generation: 0, step: null });
  }
  for (let generation = 1; generation <= limit; generation++) {
    const current = [...stock.values()];
    const found = new Map<string, ChainStep>();
    for (let i = 0; i < current.length; i++) {
      for (let j = i; j < current.length; j++) {
        const roles = canBreed(current[i]!, current[j]!);
        if (!roles) continue;
        const result = childOf(
          { species: roles.mother, gender: 'female' },
          { species: roles.father, gender: 'male' }
        );
        const key = result.child.toLowerCase();
        if (reach.has(key) || found.has(key)) continue;
        found.set(key, { mother: roles.mother, father: roles.father, child: result.child });
      }
    }
    if (found.size === 0) break;
    for (const [key, step] of found) {
      reach.set(key, { generation, step });
      stock.set(key, { species: step.child, genders: bred });
    }
  }
  const chains = new Map<string, Chain>();
  for (const entry of facts.species) {
    const key = entry.id.toLowerCase();
    const known = reach.get(key);
    if (!known || known.generation === 0) continue;
    const steps: ChainStep[] = [];
    const pending = [known.step!];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const step = pending.shift()!;
      if (seen.has(step.child.toLowerCase())) continue;
      seen.add(step.child.toLowerCase());
      steps.push(step);
      for (const parent of [step.mother, step.father]) {
        const parentReach = reach.get(parent.toLowerCase());
        if (parentReach?.step) pending.push(parentReach.step);
      }
    }
    const generationOf = (id: string) => reach.get(id.toLowerCase())?.generation ?? 0;
    steps.sort((a, b) => generationOf(a.child) - generationOf(b.child));
    chains.set(entry.id, { species: entry.id, steps });
  }
  return chains;
}
