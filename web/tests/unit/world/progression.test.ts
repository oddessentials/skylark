import { describe, expect, it } from 'vitest';
import {
  areasTotal,
  bossTechnologyTotal,
  fastTravelTotal,
  fieldBossList,
  parseTowerKey,
  researchOf,
  researchTotal,
  storyQuestOf,
  storyQuests,
  storyTotal,
  technologyOf,
  technologyTotal,
  towerList,
  towerOf
} from '$lib/world/progression';

describe('progression facts', () => {
  it('lists the 13 towers with the faction towers first', () => {
    expect(towerList).toHaveLength(13);
    expect(towerList.filter((tower) => tower.category === 'faction_tower')).toHaveLength(8);
    expect(towerList[0]).toMatchObject({ id: 'GrassBoss', level: 10, hard: true });
    expect(towerOf('kingwhaleboss')?.name).toBe('Panthalus');
    expect(towerOf('WorldTreeBoss')?.category).toBe('world_tree_final');
    expect(towerOf('nope')).toBeNull();
  });

  it('parses the save keys of tower defeats', () => {
    expect(parseTowerKey('GrassBoss_Normal')).toMatchObject({ difficulty: 'normal' });
    expect(parseTowerKey('grassboss_hard')?.tower.id).toBe('GrassBoss');
    expect(parseTowerKey('NoSuch_Normal')).toBeNull();
    expect(parseTowerKey('GrassBoss_Later')).toBeNull();
    expect(parseTowerKey('GrassBoss')).toBeNull();
  });

  it('knows the story the quest manager tracks', () => {
    expect(storyTotal).toBe(31);
    expect(storyQuests).toHaveLength(31);
    expect(storyQuests[0]).toEqual({
      id: 'Main_UnlockFastTravel',
      title: 'Activate Great Eagle Statue',
      stage: 0
    });
    expect(storyQuests[30]!.id).toBe('Main_DefeatWorldTreeDragon');
    expect(storyQuestOf('main_unlockfasttravel')?.stage).toBe(0);
    expect(storyQuestOf('Main_UnlockPalBox')).toBeNull();
  });

  it('knows the technologies, the research and the places', () => {
    expect(technologyTotal).toBe(588);
    expect(bossTechnologyTotal).toBe(51);
    expect(technologyOf('workbench')).toEqual({
      id: 'Workbench',
      name: 'Primitive Workbench',
      level: 1,
      boss: false
    });
    expect(technologyOf('WingGlider')).toMatchObject({ level: 80, boss: true });
    expect(researchTotal).toBe(168);
    expect(researchOf('mining1')?.requiredWork).toBe(50000);
    expect(fieldBossList).toHaveLength(123);
    expect(fieldBossList.filter((boss) => boss.kind === 'wanted')).toHaveLength(33);
    expect(fastTravelTotal).toBe(174);
    expect(areasTotal).toBe(123);
  });
});
