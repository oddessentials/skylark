import { need } from '../game.mjs';
import { TABLES, TEXTS } from './sources.mjs';

const TAG = /<([A-Za-z]+) id=\|([^|]*)\|[^>]*\/>/g;
export const PLACEHOLDER = 'en Text';

function nameKey(override, prefix, id) {
  return override && override !== 'None' ? override : `${prefix}${id}`;
}

export function englishText(game, assetPath, key) {
  const text = game.lookupText([assetPath], key);
  return text && text !== PLACEHOLDER ? text : null;
}

export function itemName(game, id) {
  const row = game.dataTable(TABLES.items).row(id);
  return englishText(game, TEXTS.itemNames, nameKey(row?.OverrideName, 'ITEM_NAME_', id));
}

export function mapObjectName(game, id) {
  const row = game.dataTable(TABLES.mapObjects).row(id);
  return englishText(
    game,
    TEXTS.mapObjectNames,
    nameKey(row?.OverrideNameMsgID, 'MAPOBJECT_NAME_', id)
  );
}

function tagText(game, species, tag, id) {
  switch (tag.toLowerCase()) {
    case 'itemname':
      return itemName(game, id);
    case 'mapobjectname':
      return mapObjectName(game, id);
    case 'uicommon':
      return englishText(game, TEXTS.ui, id);
    case 'charactername':
      return species ? (species.palName(id) ?? species.humanName(id)) : null;
    case 'img':
    case 'keyguideicon':
      return '';
  }
  return undefined;
}

export function resolveTags(game, text, what, species = null) {
  return text
    .replace(TAG, (_, tag, id) => {
      const resolved = tagText(game, species, tag, id);
      if (resolved === undefined) {
        throw new Error(`${what} uses the rich text tag ${tag}, which the extractor does not know`);
      }
      return need(resolved, `${what}: ${tag} ${id}`);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function noneToNull(value) {
  return value === undefined || value === null || value === 'None' ? null : value;
}
