import { battles } from './bosses.json';
import { levels, max_level } from './exp.json';
import { research } from './lab.json';
import { boss_markers, fast_travel, watchtowers } from './landmarks.json';
import { main, story } from './quests.json';
import { regions } from './regions.json';
import { technologies } from './technology.json';

export type TowerCategory =
  'faction_tower' | 'world_tree_middle' | 'world_tree_final' | 'king_whale';
export type Difficulty = 'normal' | 'hard';

export interface TowerFact {
  id: string;
  name: string;
  category: TowerCategory;
  level: number;
  hard: boolean;
}

export interface TechnologyFact {
  id: string;
  name: string;
  level: number;
  boss: boolean;
}

export interface QuestFact {
  id: string;
  title: string;
  stage: number;
}

export interface ResearchFact {
  id: string;
  name: string;
  requiredWork: number;
}

export interface FieldBossFact {
  spawner: string;
  name: string;
  title: string | null;
  species: string | null;
  kind: 'field_boss' | 'wanted';
  level: number;
  x: number;
  y: number;
  map: 'MainMap' | 'Tree';
}

const hiddenName = /^[?？]+$/;

export const towerList: TowerFact[] = battles
  .filter((battle) => battle.category !== null)
  .map((battle) => {
    const normal = battle.difficulties[0]!;
    const name = battle.name && !hiddenName.test(battle.name) ? battle.name : null;
    return {
      id: battle.boss_type,
      name: name ?? normal.species_name ?? normal.name ?? battle.boss_type,
      category: battle.category as TowerCategory,
      level: normal.level ?? 0,
      hard: battle.difficulties.some((entry) => entry.difficulty === 'Hard')
    };
  });

const towerById = new Map(towerList.map((tower) => [tower.id.toLowerCase(), tower]));

export function towerOf(id: string): TowerFact | null {
  return towerById.get(id.toLowerCase()) ?? null;
}

export function parseTowerKey(key: string): { tower: TowerFact; difficulty: Difficulty } | null {
  const at = key.lastIndexOf('_');
  if (at === -1) return null;
  const tower = towerOf(key.slice(0, at));
  const suffix = key.slice(at + 1).toLowerCase();
  if (!tower || (suffix !== 'normal' && suffix !== 'hard')) return null;
  return { tower, difficulty: suffix };
}

export const technologyList: TechnologyFact[] = technologies.map((entry) => ({
  id: entry.id,
  name: entry.name,
  level: entry.level,
  boss: entry.boss
}));
const technologyById = new Map(technologyList.map((entry) => [entry.id.toLowerCase(), entry]));
export const technologyTotal = technologyList.length;
export const bossTechnologyTotal = technologyList.filter((entry) => entry.boss).length;

export function technologyOf(id: string): TechnologyFact | null {
  return technologyById.get(id.toLowerCase()) ?? null;
}

export const storyQuests: QuestFact[] = main
  .filter((quest): quest is typeof quest & { stage: number } => quest.stage !== null)
  .map((quest) => ({ id: quest.id, title: quest.title, stage: quest.stage }))
  .sort((a, b) => a.stage - b.stage);
const questById = new Map(storyQuests.map((quest) => [quest.id.toLowerCase(), quest]));
export const storyTotal: number = story;

export function storyQuestOf(id: string): QuestFact | null {
  return questById.get(id.toLowerCase()) ?? null;
}

export const researchList: ResearchFact[] = research.map((entry) => ({
  id: entry.id,
  name: entry.name,
  requiredWork: entry.required_work
}));
const researchById = new Map(researchList.map((entry) => [entry.id.toLowerCase(), entry]));
export const researchTotal = researchList.length;

export function researchOf(id: string): ResearchFact | null {
  return researchById.get(id.toLowerCase()) ?? null;
}

export const fieldBossList: FieldBossFact[] = boss_markers
  .filter((marker) => marker.kind === 'field_boss' || marker.kind === 'wanted')
  .map((marker) => ({
    spawner: marker.spawner,
    name: marker.name ?? marker.character ?? marker.spawner,
    title: marker.title ?? null,
    species: marker.species ?? null,
    kind: marker.kind as 'field_boss' | 'wanted',
    level: marker.level ?? 0,
    x: marker.position[0]!,
    y: marker.position[1]!,
    map: marker.map as 'MainMap' | 'Tree'
  }));

export const fastTravelTotal = fast_travel.length + watchtowers.length;
export const areasTotal = regions.length;
export const levelCap: number = max_level;
export const expLevels = levels.map((entry) => ({ level: entry.level, total: entry.total }));
export const worldTreeMap = 'Tree';
