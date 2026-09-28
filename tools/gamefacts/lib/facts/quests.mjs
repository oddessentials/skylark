import { enumValue, need } from '../game.mjs';
import { englishText, noneToNull, resolveTags } from './richtext.mjs';
import { BLUEPRINTS, TABLES, TEXTS } from './sources.mjs';

const MAIN = 'Main';

function managerDefaults(game) {
  const pkg = game.asset(BLUEPRINTS.questManager);
  const index = pkg.findExport('Default__BP_PalQuestManager_C');
  if (!index) throw new Error(`${BLUEPRINTS.questManager} has no class default object`);
  return pkg.properties(index);
}

function questDefaults(game, row, id) {
  const asset = String(need(row.QuestData, `${id} QuestData`)).split('.')[0];
  const pkg = game.asset(asset);
  const index = pkg.findExport(`Default__${asset.split('/').pop()}_C`);
  return index ? pkg.properties(index) : null;
}

export function buildQuests(game, species, gameVersion) {
  const manager = managerDefaults(game);
  const stages = new Map(
    need(manager.ForceTrackingQuestMap, 'ForceTrackingQuestMap').map(([id, index]) => [id, index])
  );
  const main = [];
  for (const [id, row] of game.dataTable(TABLES.quests).rows) {
    if (enumValue(need(row.QuestType, `${id} QuestType`)) !== MAIN) continue;
    const defaults = questDefaults(game, row, id);
    const titleKey = noneToNull(defaults?.QuestTitleMsgId);
    if (!titleKey) continue;
    main.push({
      id,
      title: resolveTags(
        game,
        need(englishText(game, TEXTS.ui, titleKey), `English title of quest ${id}`),
        `quest ${id}`,
        species
      ),
      stage: stages.get(id) ?? null,
      next: (defaults.AutoOrderQuests ?? []).map(String),
      order: main.length
    });
  }
  main.sort((a, b) => (a.stage ?? Infinity) - (b.stage ?? Infinity) || a.order - b.order);
  for (const quest of main) delete quest.order;
  const towers = {};
  for (const [bossValue, settings] of manager.QuestSettingsPerBossDefeat ?? []) {
    towers[enumValue(bossValue)] = (settings.AutoCompleteQuests ?? []).map((quest) =>
      need(quest.QuestId, 'AutoCompleteQuests QuestId')
    );
  }
  if (stages.size === 0 || main.length === 0) throw new Error('no main quests found');
  return {
    game_version: gameVersion,
    sources: [
      TABLES.quests,
      `${TEXTS.ui} (en)`,
      BLUEPRINTS.questManager,
      '/Game/Pal/Blueprint/Quest/MainQuest/BP_MainQuest_* class defaults'
    ],
    story: stages.size,
    initial: need(manager.InitialOrderQuestIdArray, 'InitialOrderQuestIdArray').map(String),
    completed_by_tower: towers,
    main
  };
}
