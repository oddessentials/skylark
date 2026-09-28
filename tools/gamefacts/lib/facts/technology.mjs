import { enumValue, need } from '../game.mjs';
import { classDefaults } from './breeding.mjs';
import { englishText, itemName, mapObjectName, noneToNull, resolveTags } from './richtext.mjs';
import { BLUEPRINTS, TABLES, TEXTS } from './sources.mjs';

const DESCRIPTION_TEXTS = [
  TEXTS.technologyDescriptions,
  TEXTS.buildObjectDescriptions,
  TEXTS.itemDescriptions
];
const NO_DESCRIPTION = '-';

function buildCategoryName(game, type) {
  return englishText(game, TEXTS.buildObjectCategories, `CATEGORY_TYPE_A_${type}`) ?? type;
}

function itemCategoryName(game, type) {
  return (
    englishText(game, TEXTS.ui, `COMMON_EQUIPMENT_CATEGORY_${type}`) ??
    englishText(game, TEXTS.ui, `COMMON_INVENTORY_CATEGORY_${type}`) ??
    type
  );
}

function descriptionOf(game, species, row, id) {
  const key = noneToNull(row.Description);
  if (!key) return null;
  const raw = DESCRIPTION_TEXTS.map((table) => englishText(game, table, key)).find(Boolean);
  if (!raw || raw === NO_DESCRIPTION) return null;
  return resolveTags(game, raw, `description of technology ${id}`, species);
}

function unlocksOf(game, row, builds, items, categories) {
  const unlocks = [];
  for (const objectId of row.UnlockBuildObjects ?? []) {
    const object = builds.row(objectId);
    const type = object ? enumValue(need(object.TypeA, `${objectId} TypeA`)) : null;
    if (type && !categories.build[type]) categories.build[type] = buildCategoryName(game, type);
    unlocks.push({
      kind: 'build',
      id: objectId,
      name: mapObjectName(game, objectId) ?? objectId,
      type
    });
  }
  for (const itemId of row.UnlockItemRecipes ?? []) {
    const item = items.row(itemId);
    const type = item ? enumValue(need(item.TypeA, `${itemId} TypeA`)) : null;
    if (type && !categories.item[type]) categories.item[type] = itemCategoryName(game, type);
    unlocks.push({ kind: 'item', id: itemId, name: itemName(game, itemId) ?? itemId, type });
  }
  return unlocks;
}

export function buildTechnology(game, species, gameVersion) {
  const defaults = classDefaults(game);
  const builds = game.dataTable(TABLES.buildObjects);
  const items = game.dataTable(TABLES.items);
  const categories = { build: {}, item: {} };
  const technologies = [];
  for (const [id, row] of game.dataTable(TABLES.technologies).rows) {
    const name = resolveTags(
      game,
      need(englishText(game, TEXTS.technologyNames, row.Name), `English name of technology ${id}`),
      `technology ${id}`,
      species
    );
    const unlocks = unlocksOf(game, row, builds, items, categories);
    if (unlocks.length === 0) throw new Error(`technology ${id} unlocks nothing`);
    const tower = enumValue(need(row.RequireDefeatTowerBoss, `${id} RequireDefeatTowerBoss`));
    technologies.push({
      id,
      name,
      description: descriptionOf(game, species, row, id),
      level: need(row.LevelCap, `${id} LevelCap`),
      cost: need(row.Cost, `${id} Cost`),
      boss: row.IsBossTechnology === true,
      requires: {
        tower: tower === 'None' ? null : tower,
        technology: noneToNull(row.RequireTechnology),
        research: noneToNull(row.RequireResearchId)
      },
      category: { kind: unlocks[0].kind, type: unlocks[0].type },
      unlocks
    });
  }
  if (technologies.length === 0) throw new Error('no technologies found');
  const defaultUnlocked = need(defaults.DefaultUnlockTechnology, 'DefaultUnlockTechnology');
  return {
    game_version: gameVersion,
    sources: [
      TABLES.technologies,
      TABLES.buildObjects,
      TABLES.items,
      TABLES.mapObjects,
      BLUEPRINTS.gameSetting,
      `${TEXTS.technologyNames} (en)`,
      `${TEXTS.technologyDescriptions} (en)`,
      `${TEXTS.buildObjectDescriptions} (en)`,
      `${TEXTS.itemDescriptions} (en)`,
      `${TEXTS.buildObjectCategories} (en)`,
      `${TEXTS.ui} (en)`
    ],
    level_cap: need(defaults.CharacterMaxLevel, 'CharacterMaxLevel'),
    points_per_level: need(defaults.technologyPointPerLevel, 'technologyPointPerLevel'),
    fast_travel_points: need(
      defaults.TechnologyPoint_UnlockFastTravel,
      'TechnologyPoint_UnlockFastTravel'
    ),
    default_unlocked: defaultUnlocked.map((handle) => need(handle.Key, 'DefaultUnlockTechnology')),
    categories,
    technologies
  };
}
