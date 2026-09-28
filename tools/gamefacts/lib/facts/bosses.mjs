import { enumValue, need } from '../game.mjs';
import { compareText } from '../output.mjs';
import { BLUEPRINTS, TABLES, TEXTS } from './sources.mjs';

const TOWER_CATEGORIES = {
  BP_PalBossTower_C: 'faction_tower',
  BP_PalBossTower_MiddleBoss_C: 'world_tree_middle',
  BP_PalBossTower_LastBoss_C: 'world_tree_final',
  BP_PalBossTower_KingWhale_C: 'king_whale'
};
const CATEGORY_ORDER = ['faction_tower', 'world_tree_middle', 'world_tree_final', 'king_whale'];

function managerDefaults(game) {
  const pkg = game.asset(BLUEPRINTS.bossBattleManager);
  const index = pkg.findExport('Default__BP_PalBossBattleManager_C');
  if (!index) throw new Error('BP_PalBossBattleManager has no class default object');
  return pkg.properties(index);
}

function combatant(species, characterId) {
  const entry = species.entryForCharacter(characterId);
  return {
    character: characterId,
    species: entry ? entry.id : null,
    species_name: entry ? species.speciesName(entry) : null,
    name: species.palName(characterId),
    title: species.title(characterId)
  };
}

export function buildBosses(game, species, towers, gameVersion) {
  const defaults = managerDefaults(game);
  const towerByType = new Map(towers.map((tower) => [tower.boss_type, tower]));
  const battles = [];
  for (const [bossTypeValue, info] of need(defaults.BossInfoMap, 'BossInfoMap')) {
    const bossType = enumValue(bossTypeValue);
    const tower = towerByType.get(bossType) ?? null;
    const difficulties = need(info.DifficultyParameter, `${bossType}.DifficultyParameter`).map(
      ([difficultyValue, parameter]) => {
        const difficulty = enumValue(difficultyValue);
        const characterId = need(parameter.PalID?.Key, `${bossType} ${difficulty} PalID`);
        const condition = enumValue(parameter.HardUnlockCondition);
        return {
          difficulty,
          defeat_flag_key: `${bossType}_${difficulty}`,
          ...combatant(species, characterId),
          level: parameter.Level,
          time_limit_seconds: parameter.BattleTimeLimit,
          unlock_condition: condition.endsWith('_MAX') ? null : condition
        };
      }
    );
    battles.push({
      boss_type: bossType,
      enum: `EPalBossType::${bossType}`,
      category: tower ? (TOWER_CATEGORIES[tower.class] ?? null) : null,
      name: game.lookupText([TEXTS.ui], `BOSS_BATTLE_NAME_${bossType}`),
      field_boss: info.bIsFieldBoss === true,
      tower: tower ? { position: tower.position, map: tower.map, display: tower.display } : null,
      difficulties
    });
  }
  battles.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.difficulties[0].level - b.difficulties[0].level ||
      compareText(a.boss_type, b.boss_type)
  );

  const raidTable = game.dataTable(TABLES.raidBosses);
  const raids = [];
  for (const [id, row] of raidTable.rows) {
    const info = need(row.InfoList?.[0], `${id}.InfoList`);
    const characterId = need(info.PalID?.Key, `${id} PalID`);
    raids.push({ id, ...combatant(species, characterId), level: info.Level });
  }

  return {
    game_version: gameVersion,
    sources: [BLUEPRINTS.bossBattleManager, TABLES.raidBosses, TABLES.monsters, TEXTS.ui],
    defeat_flag_key_format: '{EPalBossType}_{EPalBossBattleDifficulty}',
    hard_unlock_trigger: enumValue(need(defaults.HardUnlockTiggerBoss, 'HardUnlockTiggerBoss')),
    battles,
    raids
  };
}
