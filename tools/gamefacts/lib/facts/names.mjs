import { need } from '../game.mjs';
import { compareText } from '../output.mjs';
import { TABLES, TEXTS } from './sources.mjs';

const TAG = /<([A-Za-z]+) id=\|([^|]*)\|\/>/g;
const BUILD_OBJECT = /^BP_BuildObject_/;
const PLACEHOLDER = 'en Text';

function nameKey(override, prefix, id) {
  return override && override !== 'None' ? override : `${prefix}${id}`;
}

function englishText(game, assetPath, key) {
  const text = game.lookupText([assetPath], key);
  return text && text !== PLACEHOLDER ? text : null;
}

function itemName(game, id) {
  const row = game.dataTable(TABLES.items).row(id);
  return englishText(game, TEXTS.itemNames, nameKey(row?.OverrideName, 'ITEM_NAME_', id));
}

function mapObjectName(game, id) {
  const row = game.dataTable(TABLES.mapObjects).row(id);
  return englishText(
    game,
    TEXTS.mapObjectNames,
    nameKey(row?.OverrideNameMsgID, 'MAPOBJECT_NAME_', id)
  );
}

function tagText(game, tag, id) {
  switch (tag.toLowerCase()) {
    case 'itemname':
      return itemName(game, id);
    case 'mapobjectname':
      return mapObjectName(game, id);
  }
  throw new Error(
    `a technology name uses the rich text tag ${tag}, which the extractor does not know`
  );
}

function resolveTags(game, text, what) {
  return text
    .replace(TAG, (_, tag, id) => need(tagText(game, tag, id), `${what}: ${tag} ${id}`))
    .trim();
}

function byId(a, b) {
  return compareText(a.id, b.id);
}

export function buildNames(game, species, gameVersion) {
  const technologies = [];
  for (const [id, row] of game.dataTable(TABLES.technologies).rows) {
    const text = need(
      englishText(game, TEXTS.technologyNames, row.Name),
      `English name of technology ${id}`
    );
    technologies.push({ id, name: resolveTags(game, text, `technology ${id}`) });
  }
  const structures = [];
  for (const [id, row] of game.dataTable(TABLES.mapObjects).rows) {
    if (!BUILD_OBJECT.test(String(row.BlueprintClassName))) continue;
    const name = mapObjectName(game, id);
    if (name) structures.push({ id, name });
  }
  const humans = [];
  for (const id of species.humans.rows.keys()) {
    const name = species.humanName(id);
    if (name && name !== PLACEHOLDER) humans.push({ id, name });
  }
  if (technologies.length === 0) throw new Error('no technologies found');
  if (structures.length === 0) throw new Error('no buildable structures found');
  if (humans.length === 0) throw new Error('no human names found');
  return {
    game_version: gameVersion,
    sources: [
      TABLES.technologies,
      TABLES.mapObjects,
      TABLES.items,
      TABLES.humans,
      `${TEXTS.technologyNames} (en)`,
      `${TEXTS.itemNames} (en)`,
      `${TEXTS.mapObjectNames} (en)`,
      `${TEXTS.humanNames} (en)`,
      `${TEXTS.uniqueNpcNames} (en)`
    ],
    technologies: technologies.sort(byId),
    structures: structures.sort(byId),
    humans: humans.sort(byId)
  };
}
