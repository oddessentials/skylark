import { enumValue, need } from '../game.mjs';
import { compareText, round } from '../output.mjs';
import { BLUEPRINTS, DATA_ASSETS, TABLES, TEXTS } from './sources.mjs';

export const FALLBACK_CHILD = 'SheepBall';
export const MEAN_OFFSET = -0.5;
export const MAX_RANK_BONUS = 10;
export const ALPHA_PREFIX = 'BOSS_';
export const NORMAL_EGG_FAMILY = 'Normal';

export const CHILD_RULE_SOURCE =
  'UPalCombiMonsterParameter::FindChildCharacterID and UPalDatabaseCharacterParameter::FindNearestCombiRank in PalServer-Win64-Shipping.exe, Steam build 25247047';

export const RUNTIME = {
  read_from:
    'UPalGameSetting fields of the running dedicated server, read with a UE4SS Lua probe on 2026-09-28, Steam build 25247047',
  mutation: {
    rate: 0.01,
    rank_coefficient: 0.5,
    rank_diff_penalty: 0.4,
    random_coefficient: 0.1,
    min_talent: 90,
    initial_rank: 3
  }
};

const CAKE_IDS = ['Cake', 'Cake02', 'Cake03', 'Cake04', 'Cake05'];
const EGG_ITEM = /^PalEgg_([A-Za-z]+)(?:_0(\d))?$/;

function gender(value) {
  const name = enumValue(value);
  if (name === 'None') return null;
  return name.toLowerCase();
}

function classDefaults(game) {
  const pkg = game.asset(BLUEPRINTS.gameSetting);
  const index = pkg.findExport('Default__BP_PalGameSetting_C');
  if (!index) throw new Error(`${BLUEPRINTS.gameSetting} has no class default object`);
  return pkg.properties(index);
}

function eggFamilies(defaults) {
  const families = {};
  for (const [element, id] of need(defaults.PalEggMapObjectIdMap, 'PalEggMapObjectIdMap')) {
    const object = need(id.Key, 'egg map object id');
    families[enumValue(element)] = object === 'PalEgg' ? `PalEgg_${NORMAL_EGG_FAMILY}` : object;
  }
  families.WorldTree = need(defaults.PalEggMapObjectId_WorldTree?.Key, 'world tree egg');
  families.Mutation = need(defaults.PalEggMapObjectId_Mutation?.Key, 'mutation egg');
  return families;
}

function eggSizes(defaults) {
  return need(defaults.PalEggRankInfoArray, 'PalEggRankInfoArray').map((info) => ({
    max_rarity: need(info.PalRarity, 'egg PalRarity'),
    scale: round(need(info.EggScale, 'egg scale'), 4),
    hatch_divisor: need(info.HatchingSpeedDivisionRate, 'egg hatching rate')
  }));
}

export function eggSizeOf(rarity, sizes) {
  const index = sizes.findIndex((size) => rarity <= size.max_rarity);
  return (index === -1 ? sizes.length : index) + 1;
}

function eggOf(row, families, sizes) {
  if (!row) return null;
  const element = enumValue(row.ElementType1);
  const family = families[element === 'None' ? NORMAL_EGG_FAMILY : element];
  if (!family) return null;
  return `${family}_0${eggSizeOf(need(row.Rarity, 'Rarity'), sizes)}`;
}

function eggKinds(game, families) {
  const familyOf = new Map(
    Object.entries(families).map(([element, id]) => [id.replace(/^PalEgg_/, ''), element])
  );
  const kinds = [];
  for (const [id] of game.dataTable(TABLES.items).rows) {
    const match = EGG_ITEM.exec(id);
    if (!match) continue;
    kinds.push({
      id,
      name: need(game.lookupText([TEXTS.itemNames], `ITEM_NAME_${id}`), `English name of ${id}`),
      family: familyOf.get(match[1]) ?? match[1],
      size: match[2] ? Number(match[2]) : null
    });
  }
  return kinds.sort((a, b) => compareText(a.id, b.id));
}

function tribeId(species, value) {
  const tribe = enumValue(value);
  return species.entryForTribe(tribe)?.id ?? tribe;
}

function uniqueRows(game, species) {
  const rows = [];
  for (const [rowName, row] of game.dataTable(TABLES.uniqueCombinations).rows) {
    const child = need(row.ChildCharacterID, `${rowName} child`);
    rows.push({
      parent_a: tribeId(species, row.ParentTribeA),
      gender_a: gender(row.ParentGenderA),
      parent_b: tribeId(species, row.ParentTribeB),
      gender_b: gender(row.ParentGenderB),
      child: species.entryForCharacter(child)?.id ?? child
    });
  }
  return rows;
}

function poolRows(species, uniqueChildren) {
  const pool = [];
  for (const [rowName, row] of species.monsters.rows) {
    if (row.IsBoss === true || row.IgnoreCombi === true) continue;
    if (uniqueChildren.has(rowName.toLowerCase())) continue;
    pool.push({ rowName, row });
  }
  return pool;
}

function cakes(game) {
  const pkg = game.asset(DATA_ASSETS.breedingItemEffects);
  const effects = new Map();
  for (const [key, value] of need(pkg.properties(1).ItemEffectMap, 'ItemEffectMap')) {
    effects.set(need(key.Key, 'cake id'), value);
  }
  return CAKE_IDS.map((id) => {
    const effect = effects.get(id);
    return {
      id,
      name: need(game.lookupText([TEXTS.itemNames], `ITEM_NAME_${id}`), `English name of ${id}`),
      talent_bonus:
        effect && effect.TalentBonusMax > 0 ? [effect.TalentBonusMin, effect.TalentBonusMax] : null,
      mutation_rate_bonus_percent: effect?.MutationRateBonusPercent ?? 0,
      rank_bonus: effect?.CombiRankBonus ?? 0,
      breed_count: effect?.BreedCount ?? 1,
      inherit_all_active_skills: effect?.bInheritAllActiveSkills === true,
      passive_inherit_count_override: effect?.PassiveInheritCountOverride ?? 0
    };
  });
}

function passives(game) {
  const rows = [];
  for (const [id, row] of game.dataTable(TABLES.passiveSkills).rows) {
    const name =
      game.lookupText([TEXTS.skillNames], row.OverrideNameTextId) ??
      game.lookupText([TEXTS.skillNames], `PASSIVE_${id}`);
    if (!name || name === 'en Text') continue;
    rows.push({
      id,
      name,
      rank: need(row.Rank, `${id} rank`),
      random_add: row.AddPal === true,
      weight: need(row.LotteryWeight, `${id} weight`)
    });
  }
  return rows;
}

export function buildBreeding(game, species, gameVersion) {
  const defaults = classDefaults(game);
  const families = eggFamilies(defaults);
  const sizes = eggSizes(defaults);
  const unique = uniqueRows(game, species);
  const uniqueChildren = new Set();
  for (const row of game.dataTable(TABLES.uniqueCombinations).rows.values()) {
    uniqueChildren.add(String(row.ChildCharacterID).toLowerCase());
  }
  const pool = poolRows(species, uniqueChildren);
  const firstAtRank = new Map();
  for (const { rowName, row } of pool) {
    if (!firstAtRank.has(row.CombiRank)) firstAtRank.set(row.CombiRank, rowName);
  }
  const entries = species.entries.map((entry) => {
    const row = entry.row;
    const inPool = firstAtRank.get(row.CombiRank) === entry.id;
    if (!inPool && pool.some((candidate) => candidate.rowName === entry.id)) {
      throw new Error(`${entry.id} shares rank ${row.CombiRank} with an earlier pool row`);
    }
    return {
      id: entry.id,
      rank: need(row.CombiRank, `${entry.id} CombiRank`),
      priority: need(row.CombiDuplicatePriority, `${entry.id} CombiDuplicatePriority`),
      ignore_combi: row.IgnoreCombi === true,
      in_pool: inPool,
      male_probability: need(row.MaleProbability, `${entry.id} MaleProbability`),
      egg: eggOf(row, families, sizes),
      alpha_egg: eggOf(species.monster(`${ALPHA_PREFIX}${entry.id}`), families, sizes)
    };
  });
  const speedByTemperature = {};
  for (const [temperature, rate] of need(
    defaults.PalEggHatchingSpeedRateByTemperature,
    'PalEggHatchingSpeedRateByTemperature'
  )) {
    speedByTemperature[temperature] = rate;
  }
  return {
    game_version: gameVersion,
    sources: [
      TABLES.monsters,
      TABLES.uniqueCombinations,
      TABLES.passiveSkills,
      TABLES.items,
      TEXTS.itemNames,
      TEXTS.skillNames,
      BLUEPRINTS.gameSetting,
      DATA_ASSETS.breedingItemEffects,
      CHILD_RULE_SOURCE,
      RUNTIME.read_from
    ],
    child_rule: {
      read_from: CHILD_RULE_SOURCE,
      fallback: FALLBACK_CHILD,
      mean_offset: MEAN_OFFSET,
      max_rank_bonus: MAX_RANK_BONUS
    },
    species: entries,
    unique,
    inheritance: {
      read_from: `${BLUEPRINTS.gameSetting} class defaults; mutation: ${RUNTIME.read_from}`,
      talent_num: need(defaults.Combi_TalentInheritNum, 'Combi_TalentInheritNum'),
      passive_num: need(defaults.Combi_PassiveInheritNum, 'Combi_PassiveInheritNum'),
      passive_random_add_num: need(defaults.Combi_PassiveRandomAddNum, 'Combi_PassiveRandomAddNum'),
      boss_rate: round(need(defaults.Combi_BossPalRate, 'Combi_BossPalRate'), 6),
      mutation: RUNTIME.mutation
    },
    cakes: cakes(game),
    passives: passives(game),
    eggs: {
      families,
      sizes,
      kinds: eggKinds(game, families),
      hatching_speed_by_temperature: speedByTemperature
    }
  };
}
